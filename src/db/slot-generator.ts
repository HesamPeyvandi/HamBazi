import { and, eq } from 'drizzle-orm';
import { db, schema } from './client';
import { applyBlocks } from './blocks-sql';
import { tehranParts, tehranWallToUtc } from '../lib/i18n/jalali';

/** How many days ahead slots are kept generated. */
export const HORIZON_DAYS = 14;
/** Demo default: 16:00–23:30 with 90-minute slots = 16:00, 17:30, 19:00, 20:30, 22:00. */
const DEMO_OPEN = 16 * 60, DEMO_SLOT = 90, DEMO_COUNT = 5;

type Exec = ReturnType<typeof db>;

/** Creates the future slots described by the venue's weekly schedule (idempotent; never touches existing slots), then re-applies standing reservations. */
export async function generateSlots(x: Exec, venueId: string | null, days = HORIZON_DAYS): Promise<number> {
  const where = venueId ? eq(schema.venueSchedules.venueId, venueId) : undefined;
  const rows = await x.select({ venueId: schema.venueSchedules.venueId, sportId: schema.venueSchedules.sportId, weekday: schema.venueSchedules.weekday, open: schema.venueSchedules.openMinute, close: schema.venueSchedules.closeMinute, minutes: schema.venueSchedules.slotMinutes, price: schema.venueSports.pricePerSlot })
    .from(schema.venueSchedules)
    .innerJoin(schema.venueSports, and(eq(schema.venueSports.venueId, schema.venueSchedules.venueId), eq(schema.venueSports.sportId, schema.venueSchedules.sportId)))
    .innerJoin(schema.venues, and(eq(schema.venues.id, schema.venueSchedules.venueId), eq(schema.venues.status, 'published')))
    .where(where);
  if (rows.length === 0) return 0;
  const t0 = tehranParts(new Date()); const now = Date.now();
  const values: (typeof schema.timeSlots.$inferInsert)[] = [];
  for (let day = 0; day < days; day++) {
    const base = new Date(Date.UTC(t0.y, t0.m - 1, t0.d + day));
    const wd = base.getUTCDay();
    for (const r of rows) {
      if (r.weekday !== wd) continue;
      for (let m = r.open; m + r.minutes <= r.close; m += r.minutes) {
        const startsAt = tehranWallToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), Math.floor(m / 60), m % 60);
        if (startsAt.getTime() <= now) continue;
        values.push({ venueId: r.venueId, sportId: r.sportId, startsAt, endsAt: new Date(startsAt.getTime() + r.minutes * 60_000), price: r.price, auto: true });
      }
    }
  }
  let added = 0;
  for (let i = 0; i < values.length; i += 500) {
    // DO NOTHING (no target) also skips rows that would overlap an existing slot (exclusion constraint)
    const res = await x.insert(schema.timeSlots).values(values.slice(i, i + 500)).onConflictDoNothing().returning({ id: schema.timeSlots.id });
    added += res.length;
  }
  for (const id of new Set(rows.map((r) => r.venueId))) await applyBlocks(x, id);
  return added;
}

/**
 * DEMO only: gives a published venue that has no schedule yet a default weekly schedule (every day, 16:00–23:30, 90 min),
 * split between its sports so the hall is never double-booked. Runs once per venue (schedule_set); owners can change it afterwards.
 */
export async function ensureDemoSchedule(x: Exec, venueId: string): Promise<boolean> {
  const [v] = await x.select({ set: schema.venues.scheduleSet, status: schema.venues.status }).from(schema.venues).where(eq(schema.venues.id, venueId));
  if (!v || v.set || v.status !== 'published') return false;
  const sports = await x.select({ sportId: schema.venueSports.sportId }).from(schema.venueSports).where(eq(schema.venueSports.venueId, venueId)).orderBy(schema.venueSports.sportId);
  if (sports.length === 0) return false;
  const rows: (typeof schema.venueSchedules.$inferInsert)[] = [];
  let cursor = 0;
  sports.forEach((s, i) => {
    const count = Math.floor(DEMO_COUNT / sports.length) + (i < DEMO_COUNT % sports.length ? 1 : 0);
    if (count === 0) return;
    for (let wd = 0; wd < 7; wd++) rows.push({ venueId, sportId: s.sportId, weekday: wd, openMinute: DEMO_OPEN + cursor * DEMO_SLOT, closeMinute: DEMO_OPEN + (cursor + count) * DEMO_SLOT, slotMinutes: DEMO_SLOT });
    cursor += count;
  });
  await x.insert(schema.venueSchedules).values(rows).onConflictDoNothing();
  await x.update(schema.venues).set({ scheduleSet: true }).where(eq(schema.venues.id, venueId));
  return true;
}

/** Demo default schedules (if requested) + slot generation for one venue or all. */
export async function ensureSlots(venueId: string | null, opts: { demoDefaults: boolean }): Promise<number> {
  const x = db();
  if (opts.demoDefaults) {
    const ids = venueId ? [venueId] : (await x.select({ id: schema.venues.id }).from(schema.venues).where(and(eq(schema.venues.status, 'published'), eq(schema.venues.scheduleSet, false)))).map((r) => r.id);
    for (const id of ids) await ensureDemoSchedule(x, id);
  }
  return generateSlots(x, venueId);
}
