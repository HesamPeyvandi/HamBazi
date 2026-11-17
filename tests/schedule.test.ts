import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { saveSchedule, getSchedule } from '@/server/owner/schedule';
import { createBlock } from '@/server/owner/blocks';
import { generateSlots } from '@/db/slot-generator';
import { tehranParts, tehranWallToUtc, toJalali } from '@/lib/i18n/jalali';
import { resetDb } from './helpers';

let owner: { id: string; role: 'venue_manager' }, stranger: { id: string; role: 'venue_manager' }, venueId: string, futsal: string, volley: string;
const day = (n: number, off = 0) => ({ weekday: n, enabled: true, open: 600 + off, close: 840 + off }); // 10:00–14:00
const week = (on: number[], open = 600, close = 840) => Array.from({ length: 7 }, (_, w) => ({ weekday: w, enabled: on.includes(w), open, close }));
const local = (d: Date) => { const p = tehranParts(d); return { dow: p.weekdayJs, hm: p.h * 60 + p.mi }; };

beforeAll(async () => {
  await resetDb();
  const [o] = await db().insert(schema.users).values({ phoneE164: '+989000000021', role: 'venue_manager' }).returning();
  const [x] = await db().insert(schema.users).values({ phoneE164: '+989000000022', role: 'venue_manager' }).returning();
  owner = { id: o.id, role: 'venue_manager' }; stranger = { id: x.id, role: 'venue_manager' };
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan' }).returning();
  const [s1] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  const [s2] = await db().insert(schema.sports).values({ key: 'volleyball', nameFa: 'والیبال', defaultCapacity: 12, skillCategories: [] }).returning();
  futsal = s1.id; volley = s2.id;
  const [v] = await db().insert(schema.venues).values({ ownerUserId: o.id, cityId: c.id, slug: 'a', name: 'الف', address: 'x', neighborhood: 'm', status: 'published' }).returning();
  venueId = v.id;
  await db().insert(schema.venueManagers).values({ venueId, userId: o.id, role: 'owner' });
  await db().insert(schema.venueSports).values([{ venueId, sportId: futsal, pricePerSlot: 200000, maxCapacity: 20 }, { venueId, sportId: volley, pricePerSlot: 150000, maxCapacity: 20 }]);
});
afterAll(async () => { await sqlClient().end(); });

describe('owner weekly schedule', () => {
  it('generates 60-minute slots only on the chosen weekdays and hours', async () => {
    const r = await saveSchedule(owner, venueId, futsal, { slotMinutes: 60, days: week([0, 2]) }); // Sunday + Tuesday 10–14
    expect(r.created).toBeGreaterThanOrEqual(4 * 3); // ≥3 such days in 14 days × 4 slots
    const slots = await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId));
    expect(slots.every((s) => [0, 2].includes(local(s.startsAt).dow) && local(s.startsAt).hm >= 600 && local(s.endsAt).hm <= 840 && s.endsAt.getTime() - s.startsAt.getTime() === 3600_000 && s.price === 200000)).toBe(true);
    expect((await getSchedule(owner, venueId, futsal)).length).toBe(2);
    expect((await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0].scheduleSet).toBe(true);
  });
  it('re-saving with other hours rebuilds free slots but keeps booked ones', async () => {
    const [b] = await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId)).limit(1);
    await db().update(schema.timeSlots).set({ status: 'booked' }).where(eq(schema.timeSlots.id, b.id));
    await saveSchedule(owner, venueId, futsal, { slotMinutes: 90, days: week([0], 660, 840) }); // Sunday 11:00–14:00, 90 min → 2 slots/day
    const slots = await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId));
    expect(slots.find((s) => s.id === b.id)?.status).toBe('booked');
    const open = slots.filter((s) => s.status === 'open');
    expect(open.every((s) => local(s.startsAt).dow === 0 && s.endsAt.getTime() - s.startsAt.getTime() === 90 * 60_000)).toBe(true);
    expect(open.length).toBeGreaterThanOrEqual(4);
  });
  it('is topped up automatically as days pass (idempotent generator)', async () => {
    const n = (await db().select().from(schema.timeSlots)).length;
    expect(await generateSlots(db(), venueId, 14)).toBe(0);
    expect((await db().select().from(schema.timeSlots)).length).toBe(n);
    await db().delete(schema.timeSlots).where(and(eq(schema.timeSlots.venueId, venueId), eq(schema.timeSlots.status, 'open')));
    expect(await generateSlots(db(), venueId, 14)).toBeGreaterThanOrEqual(4); // a "new day" re-creates the missing ones
  });
  it('standing reservations stay closed and unselectable, including for newly generated slots', async () => {
    await saveSchedule(owner, venueId, futsal, { slotMinutes: 60, days: week([0], 600, 840) });
    const p = tehranParts(new Date()); const j = toJalali(new Date());
    const to = toJalali(tehranWallToUtc(p.y, p.m, p.d + 60, 12, 0));
    await createBlock(owner, venueId, { title: 'مجموعه نمونه', weekday: 0, startMinute: 600, endMinute: 720, from: { jy: j.jy, jm: j.jm, jd: j.jd }, to: { jy: to.jy, jm: to.jm, jd: to.jd } });
    await saveSchedule(owner, venueId, futsal, { slotMinutes: 60, days: week([0], 600, 840) }); // regenerate: block must re-close 10–12
    const slots = await db().select().from(schema.timeSlots).where(and(eq(schema.timeSlots.venueId, venueId), eq(schema.timeSlots.status, 'open')));
    expect(slots.every((s) => local(s.startsAt).hm >= 720)).toBe(true); // nothing open inside 10–12
    expect((await db().select().from(schema.timeSlots).where(and(eq(schema.timeSlots.venueId, venueId), eq(schema.timeSlots.status, 'closed')))).length).toBeGreaterThan(0);
  });
  it('rejects bad input, other-sport overlap (one hall) and strangers', async () => {
    await expect(saveSchedule(owner, venueId, futsal, { slotMinutes: 45 + 1, days: week([1]) })).rejects.toThrow();
    await expect(saveSchedule(owner, venueId, futsal, { slotMinutes: 120, days: week([1], 600, 660) })).rejects.toThrow(/کوتاه/);
    await expect(saveSchedule(owner, venueId, futsal, { slotMinutes: 60, days: [day(1, 300), ...week([])].slice(0, 7).map((d, i) => (i === 0 ? { ...d, open: 700, close: 650 } : d)) })).rejects.toThrow(/بعد از/);
    await expect(saveSchedule(owner, venueId, volley, { slotMinutes: 60, days: week([0], 660, 780) })).rejects.toThrow(/همپوشانی/); // futsal uses Sunday 10–14
    await expect(saveSchedule(stranger, venueId, futsal, { slotMinutes: 60, days: week([1]) })).rejects.toMatchObject({ code: 'not_found' });
    await saveSchedule(owner, venueId, volley, { slotMinutes: 60, days: week([0], 840, 1200) }); // after futsal's window: fine
  });
});
