import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { createBlock, updateBlock, cancelBlock, listBlocks } from '@/server/owner/blocks';
import { createSlots, setSlotOpen } from '@/server/owner/venues';
import { extendDemoSlots } from '@/db/demo-slots';
import { slotsForDay } from '@/server/venues/queries';
import { tehranParts, tehranWallToUtc, toJalali } from '@/lib/i18n/jalali';
import { resetDb } from './helpers';

let owner: { id: string; role: 'venue_manager' }, other: { id: string; role: 'venue_manager' }, venueId: string, sportId: string;
// next Sunday (Tehran) at least 2 days ahead
function nextSunday() { const t = tehranParts(new Date()); for (let i = 2; i < 12; i++) { const d = tehranWallToUtc(t.y, t.m, t.d + i, 12, 0); if (tehranParts(d).weekdayJs === 0) return tehranParts(d); } throw new Error('x'); }
const sun = () => nextSunday();
const jal = (y: number, m: number, d: number) => { const j = toJalali(tehranWallToUtc(y, m, d, 12, 0)); return { jy: j.jy, jm: j.jm, jd: j.jd }; };
const addDays = (y: number, m: number, d: number, n: number) => { const p = tehranParts(tehranWallToUtc(y, m, d + n, 12, 0)); return jal(p.y, p.m, p.d); };

beforeAll(async () => {
  await resetDb();
  const [o] = await db().insert(schema.users).values({ phoneE164: '+989000000011', role: 'venue_manager' }).returning();
  const [x] = await db().insert(schema.users).values({ phoneE164: '+989000000012', role: 'venue_manager' }).returning();
  owner = { id: o.id, role: 'venue_manager' }; other = { id: x.id, role: 'venue_manager' };
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan' }).returning();
  const [s] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  sportId = s.id;
  const [v] = await db().insert(schema.venues).values({ ownerUserId: o.id, cityId: c.id, slug: 'a', name: 'الف', address: 'x', neighborhood: 'm', status: 'published' }).returning();
  venueId = v.id;
  await db().insert(schema.venueManagers).values({ venueId, userId: o.id, role: 'owner' });
  await db().insert(schema.venueSports).values({ venueId, sportId, pricePerSlot: 200000, slotMinutes: 60, maxCapacity: 20 });
});
afterAll(async () => { await sqlClient().end(); });

const sunday = (h: number) => { const p = sun(); return tehranWallToUtc(p.y, p.m, p.d, h, 0); };
const sunDay = () => { const p = sun(); return [{ y: p.y, m: p.m, d: p.d }]; };
const input = (extra = {}) => { const p = sun(); return { title: 'باشگاه نمونه', weekday: 0, startMinute: 600, endMinute: 720, from: jal(p.y, p.m, p.d), to: addDays(p.y, p.m, p.d, 21), ...extra }; };
const status = async (h: number) => (await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.startsAt, sunday(h))))[0];

describe('standing weekly reservations', () => {
  let blockId: string;
  it('closes existing open slots inside the window and nothing else', async () => {
    await createSlots(owner, venueId, { sportId, days: sunDay(), startHour: 9, startMin: 0, endHour: 14, price: undefined });
    const r = await createBlock(owner, venueId, input());
    blockId = r.id;
    expect(r.closed).toBe(2); // 10-11 and 11-12
    expect((await status(9)).status).toBe('open'); expect((await status(10)).status).toBe('closed'); expect((await status(11)).blockId).toBe(blockId);
    expect((await status(12)).status).toBe('open');
    const p = sun(); const day = await slotsForDay(venueId, jal(p.y, p.m, p.d));
    // public page shows non-open slots greyed out as taken, with no booking link
    expect(day.find((s) => s.startsAt.getTime() === sunday(10).getTime())?.status).toBe('closed');
    expect(day.find((s) => s.startsAt.getTime() === sunday(9).getTime())?.status).toBe('open');
  });
  it('slots created later inside the window are closed automatically; other weeks inside the range too', async () => {
    const p = sun(); const next = tehranParts(tehranWallToUtc(p.y, p.m, p.d + 7, 12, 0));
    await createSlots(owner, venueId, { sportId, days: [{ y: next.y, m: next.m, d: next.d }], startHour: 9, startMin: 0, endHour: 14 });
    expect((await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.startsAt, tehranWallToUtc(next.y, next.m, next.d, 10, 0))))[0].status).toBe('closed');
    await extendDemoSlots();
    const stillOpenInWindow = (await db().select().from(schema.timeSlots)).filter((s) => { const t = tehranParts(s.startsAt); return t.weekdayJs === 0 && (t.h === 10 || t.h === 11) && s.startsAt < tehranWallToUtc(p.y, p.m, p.d + 14, 0, 0) && s.status === 'open'; });
    expect(stillOpenInWindow).toEqual([]);
  });
  it('owner cannot manually reopen a block slot; others cannot manage the block', async () => {
    const s = await status(10);
    await expect(setSlotOpen(owner, s.id, true)).rejects.toThrow();
    await expect(createBlock(other, venueId, input({ title: 'گروه x' }))).rejects.toMatchObject({ code: 'not_found' });
    await expect(cancelBlock(other, blockId)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('rejects overlap with another block, bad dates and booked conflicts', async () => {
    await expect(createBlock(owner, venueId, input({ title: 'دیگر', startMinute: 660, endMinute: 780 }))).rejects.toThrow(/همپوشانی/);
    const p = sun();
    await expect(createBlock(owner, venueId, input({ from: jal(p.y, p.m, p.d + 1 > 28 ? 1 : p.d), to: addDays(p.y, p.m, p.d, -30) }))).rejects.toThrow();
    await db().update(schema.timeSlots).set({ status: 'booked' }).where(eq(schema.timeSlots.startsAt, sunday(14)));
    await createSlots(owner, venueId, { sportId, days: sunDay(), startHour: 14, startMin: 0, endHour: 15 });
    await db().update(schema.timeSlots).set({ status: 'booked' }).where(eq(schema.timeSlots.startsAt, sunday(14)));
    await expect(createBlock(owner, venueId, input({ title: 'گروه ب', startMinute: 840, endMinute: 900 }))).rejects.toThrow(/رزرو/);
    expect(await db().select().from(schema.recurringBlocks)).toHaveLength(1);
  });
  it('edit moves the window (old slots reopen), cancel reopens everything and keeps history', async () => {
    await updateBlock(owner, blockId, input({ startMinute: 660, endMinute: 720 }));
    expect((await status(10)).status).toBe('open'); expect((await status(11)).status).toBe('closed');
    const r = await cancelBlock(owner, blockId);
    expect(r.reopened).toBeGreaterThanOrEqual(1);
    expect((await status(11)).status).toBe('open');
    const list = await listBlocks(owner, venueId);
    expect(list).toHaveLength(1); expect(list[0].b.active).toBe(false);
    await expect(updateBlock(owner, blockId, input())).rejects.toThrow();
  });
});
