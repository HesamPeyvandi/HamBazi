import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema, sqlClient } from '@/db/client';
import { extendDemoSlots } from '@/db/demo-slots';
import { resetDb } from './helpers';

let venueId: string;
beforeAll(async () => {
  await resetDb();
  const [o] = await db().insert(schema.users).values({ phoneE164: '+989000000009', role: 'venue_manager' }).returning();
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan' }).returning();
  const [s] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  const [v] = await db().insert(schema.venues).values({ ownerUserId: o.id, cityId: c.id, slug: 'a', name: 'الف', address: 'x', neighborhood: 'm', status: 'published' }).returning();
  const [d] = await db().insert(schema.venues).values({ ownerUserId: o.id, cityId: c.id, slug: 'd', name: 'پیش‌نویس', address: 'x', neighborhood: 'm', status: 'draft' }).returning();
  venueId = v.id;
  await db().insert(schema.venueSports).values([{ venueId: v.id, sportId: s.id, pricePerSlot: 200000, maxCapacity: 20 }, { venueId: d.id, sportId: s.id, pricePerSlot: 100000, maxCapacity: 20 }]);
});
afterAll(async () => { await sqlClient().end(); });

describe('extendDemoSlots', () => {
  it('adds future slots for published venues only, and is idempotent', async () => {
    const first = await extendDemoSlots(5);
    expect(first).toBeGreaterThan(10);
    const rows = await db().select().from(schema.timeSlots);
    expect(rows.every((r) => r.venueId === venueId && r.startsAt.getTime() >= Date.now() - 1000)).toBe(true);
    expect(rows.some((r) => r.price === 230000)).toBe(true); // evening surcharge
    expect(await extendDemoSlots(5)).toBe(0);
    expect((await db().select().from(schema.timeSlots)).length).toBe(rows.length);
  });
  it('never touches existing (e.g. booked) slots', async () => {
    const [one] = await db().select().from(schema.timeSlots).limit(1);
    await db().update(schema.timeSlots).set({ status: 'booked' }).where((await import('drizzle-orm')).eq(schema.timeSlots.id, one.id));
    await extendDemoSlots(8);
    const [after] = await db().select().from(schema.timeSlots).where((await import('drizzle-orm')).eq(schema.timeSlots.id, one.id));
    expect(after.status).toBe('booked');
  });
});
