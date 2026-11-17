import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { generateSlots } from '@/db/slot-generator';
import { applyBlocks } from '@/db/blocks-sql';
import { audit } from '@/server/audit';
import { E } from '@/server/booking/errors';
import { assertManages, type Actor } from './venues';

export const SLOT_DURATIONS = [30, 45, 60, 90, 120] as const;
export const scheduleInput = z.object({
  slotMinutes: z.number().int().refine((v) => (SLOT_DURATIONS as readonly number[]).includes(v), 'مدت هر سانس معتبر نیست.'),
  days: z.array(z.object({ weekday: z.number().int().min(0).max(6), enabled: z.boolean(), open: z.number().int().min(0).max(1439), close: z.number().int().min(1).max(1440) })).length(7),
});
export type ScheduleInput = z.input<typeof scheduleInput>;

export async function getSchedule(actor: Actor, venueId: string, sportId: string) {
  await assertManages(actor, venueId);
  return db().select().from(schema.venueSchedules).where(and(eq(schema.venueSchedules.venueId, venueId), eq(schema.venueSchedules.sportId, sportId)));
}

/** Replaces one sport's weekly schedule and regenerates its future automatic slots. Booked/held/hand-closed slots are never touched. */
export async function saveSchedule(actor: Actor, venueId: string, sportId: string, input: ScheduleInput) {
  await assertManages(actor, venueId);
  const r = scheduleInput.safeParse(input);
  if (!r.success) throw E.invalid(r.error.issues[0]?.message ?? 'اطلاعات معتبر نیست.');
  const { slotMinutes, days } = r.data;
  const [vs] = await db().select({ x: schema.venueSports.sportId }).from(schema.venueSports).where(and(eq(schema.venueSports.venueId, venueId), eq(schema.venueSports.sportId, sportId)));
  if (!vs) throw E.notFound();
  const active = days.filter((d) => d.enabled);
  for (const d of active) {
    if (d.close <= d.open) throw E.invalid('ساعت پایان باید بعد از ساعت شروع باشد.');
    if (d.close - d.open < slotMinutes) throw E.invalid('بازهٔ ساعت‌ها از مدت یک سانس کوتاه‌تر است.');
  }
  return db().transaction(async (tx) => {
    // one hall: another sport of this venue must not use the same hours on the same weekday
    const others = await tx.select().from(schema.venueSchedules).where(and(eq(schema.venueSchedules.venueId, venueId), sql`${schema.venueSchedules.sportId} <> ${sportId}`));
    for (const d of active) {
      const clash = others.find((o) => o.weekday === d.weekday && o.openMinute < d.close && o.closeMinute > d.open);
      if (clash) {
        const [sp] = await tx.select({ n: schema.sports.nameFa }).from(schema.sports).where(eq(schema.sports.id, clash.sportId));
        throw E.invalid(`ساعت‌های این روز با برنامهٔ «${sp?.n ?? 'ورزش دیگر'}» در همین سالن همپوشانی دارد (سالن یکی است). ابتدا ساعت‌های آن ورزش را تغییر دهید یا آن روز را برایش تعطیل کنید.`);
      }
    }
    await tx.delete(schema.venueSchedules).where(and(eq(schema.venueSchedules.venueId, venueId), eq(schema.venueSchedules.sportId, sportId)));
    if (active.length) await tx.insert(schema.venueSchedules).values(active.map((d) => ({ venueId, sportId, weekday: d.weekday, openMinute: d.open, closeMinute: d.close, slotMinutes })));
    // drop this sport's future automatic slots that nobody has touched (open, or only closed by a standing reservation) and rebuild them
    await tx.delete(schema.timeSlots).where(and(eq(schema.timeSlots.venueId, venueId), eq(schema.timeSlots.sportId, sportId), eq(schema.timeSlots.auto, true), sql`${schema.timeSlots.startsAt} > now()`,
      sql`(${schema.timeSlots.status} = 'open' OR (${schema.timeSlots.status} = 'closed' AND ${schema.timeSlots.blockId} IS NOT NULL))`));
    await tx.update(schema.venues).set({ scheduleSet: true }).where(eq(schema.venues.id, venueId));
    const created = await generateSlots(tx as unknown as ReturnType<typeof db>, venueId);
    await applyBlocks(tx, venueId);
    await audit(actor.id, 'schedule.save', 'venue', venueId, { sportId, slotMinutes, days: active.length, created });
    return { created };
  });
}
