import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { extendDemoSlots } from '@/db/demo-slots';
import { resetDb } from './helpers';

let venueA: string, draft: string;
beforeAll(async () => {
  await resetDb();
  const [o] = await db().insert(schema.users).values({ phoneE164: '+989000000009', role: 'venue_manager' }).returning();
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan' }).returning();
  const [s1] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  const [s2] = await db().insert(schema.sports).values({ key: 'volleyball', nameFa: 'والیبال', defaultCapacity: 12, skillCategories: [] }).returning();
  const mk = async (slug: string, status: 'published' | 'draft') => (await db().insert(schema.venues).values({ ownerUserId: o.id, cityId: c.id, slug, name: slug, address: 'x', neighborhood: 'm', status }).returning())[0].id;
  venueA = await mk('a', 'published'); draft = await mk('d', 'draft');
  await db().insert(schema.venueSports).values([{ venueId: venueA, sportId: s1.id, pricePerSlot: 200000, maxCapacity: 20 }, { venueId: venueA, sportId: s2.id, pricePerSlot: 150000, maxCapacity: 20 }, { venueId: draft, sportId: s1.id, pricePerSlot: 100000, maxCapacity: 20 }]);
});
afterAll(async () => { await sqlClient().end(); });

describe('demo default weekly schedule + automatic slot generation', () => {
  it('gives published venues a default schedule, fills 14 days, never double-books the hall, ignores drafts', async () => {
    const added = await extendDemoSlots();
    expect(added).toBeGreaterThan(50);
    const slots = await db().select().from(schema.timeSlots);
    expect(slots.every((x) => x.venueId === venueA && x.auto)).toBe(true);
    const days = new Set(slots.map((x) => x.startsAt.toISOString().slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(13); // every day of the next 14 has slots
    const sorted = [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].startsAt.getTime()).toBeGreaterThanOrEqual(sorted[i - 1].endsAt.getTime()); // no overlap
    expect(new Set(slots.map((x) => x.sportId)).size).toBe(2); // both sports share the day
    expect((await db().select().from(schema.venues).where(eq(schema.venues.id, venueA)))[0].scheduleSet).toBe(true);
  });
  it('is idempotent and never touches existing slots', async () => {
    const [one] = await db().select().from(schema.timeSlots).limit(1);
    await db().update(schema.timeSlots).set({ status: 'booked' }).where(eq(schema.timeSlots.id, one.id));
    const n = (await db().select().from(schema.timeSlots)).length;
    expect(await extendDemoSlots()).toBe(0);
    expect((await db().select().from(schema.timeSlots)).length).toBe(n);
    expect((await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.id, one.id)))[0].status).toBe('booked');
  });
});
