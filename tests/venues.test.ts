import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema, sqlClient } from '@/db/client';
import { searchVenues, getVenueBySlug, slotsForDay } from '@/server/venues/queries';
import { tehranParts, toJalali, tehranWallToUtc } from '@/lib/i18n/jalali';
import { resetDb } from './helpers';

let ownerId: string, semnan: string, tehran: string, futsal: string, volley: string;
beforeAll(async () => {
  await resetDb();
  const [o] = await db().insert(schema.users).values({ phoneE164: '+989000000002', role: 'venue_manager' }).returning();
  ownerId = o.id;
  [{ id: semnan }, { id: tehran }] = await db().insert(schema.cities).values([{ nameFa: 'سمنان', slug: 'semnan' }, { nameFa: 'تهران', slug: 'tehran' }]).returning();
  [{ id: futsal }, { id: volley }] = await db().insert(schema.sports).values([
    { key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] },
    { key: 'volleyball', nameFa: 'والیبال', defaultCapacity: 12, skillCategories: [] }]).returning();
  const mk = async (slug: string, name: string, cityId: string, status: 'published' | 'pending' | 'draft', price: number, sport: string, rating: string, fac: string[]) => {
    const [v] = await db().insert(schema.venues).values({ ownerUserId: ownerId, cityId, slug, name, address: `آدرس ${name}`, neighborhood: 'محله', status, ratingAvg: rating, ratingCount: 3 }).returning();
    await db().insert(schema.venueSports).values({ venueId: v.id, sportId: sport, pricePerSlot: price, maxCapacity: 20 });
    if (fac.length) await db().insert(schema.venueFacilities).values(fac.map((facilityKey) => ({ venueId: v.id, facilityKey })));
    return v;
  };
  const a = await mk('a', 'سالن الف', semnan, 'published', 200000, futsal, '4.50', ['parking', 'shower']);
  await mk('b', 'سالن ب', semnan, 'published', 400000, volley, '3.80', ['parking']);
  await mk('c', 'سالن پ', semnan, 'pending', 100000, futsal, '5.00', []);
  await mk('d', 'سالن ت', semnan, 'draft', 100000, futsal, '5.00', []);
  await mk('e', 'سالن تهرانی', tehran, 'published', 250000, futsal, '4.00', []);
  const t = tehranParts(new Date());
  const base = tehranWallToUtc(t.y, t.m, t.d + 1, 19, 0);
  await db().insert(schema.timeSlots).values([
    { venueId: a.id, sportId: futsal, startsAt: base, endsAt: new Date(base.getTime() + 5400000), price: 200000 },
    { venueId: a.id, sportId: futsal, startsAt: new Date(base.getTime() + 5400000), endsAt: new Date(base.getTime() + 10800000), price: 200000, status: 'booked' },
  ]);
});
afterAll(async () => { await sqlClient().end(); });

describe('venue discovery (database-backed)', () => {
  it('only published venues are public, filtered by city', async () => {
    const r = await searchVenues({ citySlug: 'semnan' });
    expect(r.items.map((i) => i.slug).sort()).toEqual(['a', 'b']);
    expect(r.total).toBe(2);
  });
  it('filters by sport, price range, facilities and rating', async () => {
    expect((await searchVenues({ citySlug: 'semnan', sports: ['volleyball'] })).items.map((i) => i.slug)).toEqual(['b']);
    expect((await searchVenues({ citySlug: 'semnan', priceMin: 300000 })).items.map((i) => i.slug)).toEqual(['b']);
    expect((await searchVenues({ citySlug: 'semnan', priceMax: 250000 })).items.map((i) => i.slug)).toEqual(['a']);
    expect((await searchVenues({ citySlug: 'semnan', facilities: ['parking', 'shower'] })).items.map((i) => i.slug)).toEqual(['a']);
    expect((await searchVenues({ citySlug: 'semnan', minRating: 4 })).items.map((i) => i.slug)).toEqual(['a']);
  });
  it('searches by name and treats LIKE wildcards literally', async () => {
    expect((await searchVenues({ citySlug: 'semnan', q: 'الف' })).items.map((i) => i.slug)).toEqual(['a']);
    expect((await searchVenues({ q: '%' })).items).toHaveLength(0);
    expect((await searchVenues({ q: "'; DROP TABLE venues;--" })).items).toHaveLength(0);
    expect((await sqlClient()`select count(*)::int n from venues`)[0].n).toBe(5);
  });
  it('sorts by price', async () => {
    expect((await searchVenues({ citySlug: 'semnan', sort: 'price_desc' })).items.map((i) => i.slug)).toEqual(['b', 'a']);
    expect((await searchVenues({ citySlug: 'semnan', sort: 'price_asc' })).items.map((i) => i.slug)).toEqual(['a', 'b']);
  });
  it('availability filter uses open slots on the Jalali date and hour in Tehran time', async () => {
    const t = tehranParts(new Date());
    const j = toJalali(tehranWallToUtc(t.y, t.m, t.d + 1, 12, 0));
    const date = { jy: j.jy, jm: j.jm, jd: j.jd };
    expect((await searchVenues({ citySlug: 'semnan', date })).items.map((i) => i.slug)).toEqual(['a']);
    expect((await searchVenues({ citySlug: 'semnan', date, hour: 19 })).items.map((i) => i.slug)).toEqual(['a']);
    expect((await searchVenues({ citySlug: 'semnan', date, hour: 10 })).items).toHaveLength(0);
    const today = toJalali(new Date());
    expect((await searchVenues({ citySlug: 'semnan', date: { jy: today.jy, jm: today.jm, jd: today.jd } })).items).toHaveLength(0);
  });
  it('the card lists only open future slots', async () => {
    const r = await searchVenues({ citySlug: 'semnan', facilities: ['shower'] });
    expect(r.items[0].slots).toHaveLength(1);
  });
  it('venue details expose published venues only', async () => {
    expect(await getVenueBySlug('a')).not.toBeNull();
    expect(await getVenueBySlug('c')).toBeNull(); // pending
    expect(await getVenueBySlug('d')).toBeNull(); // draft
    expect(await getVenueBySlug('missing')).toBeNull();
  });
  it('paginates', async () => {
    const r = await searchVenues({ citySlug: 'semnan', page: 2 });
    expect(r.items).toHaveLength(0);
    expect(r.total).toBe(2);
  });
  it('slotsForDay returns the slots of one Tehran day, ordered', async () => {
    const t = tehranParts(new Date());
    const j = toJalali(tehranWallToUtc(t.y, t.m, t.d + 1, 12, 0));
    const v = await getVenueBySlug('a');
    const s = await slotsForDay(v!.venue.id, { jy: j.jy, jm: j.jm, jd: j.jd });
    expect(s).toHaveLength(2);
    expect(s[0].startsAt.getTime()).toBeLessThan(s[1].startsAt.getTime());
  });
});

describe('slot integrity', () => {
  it('overlapping slots for the same venue are rejected by the database', async () => {
    const [v] = await db().select().from(schema.venues).limit(1);
    const t = new Date(Date.now() + 10 * 86400_000);
    await db().insert(schema.timeSlots).values({ venueId: v.id, sportId: futsal, startsAt: t, endsAt: new Date(t.getTime() + 5400000), price: 1000 });
    await expect(db().insert(schema.timeSlots).values({ venueId: v.id, sportId: volley,
      startsAt: new Date(t.getTime() + 60000), endsAt: new Date(t.getTime() + 6000000), price: 1000 })).rejects.toThrow();
  });
  it('audit log is append-only', async () => {
    await db().insert(schema.auditLogs).values({ action: 'x', entity: 'y' });
    await expect(sqlClient()`UPDATE audit_logs SET action = 'z'`).rejects.toThrow(/append-only/);
    await expect(sqlClient()`DELETE FROM audit_logs`).rejects.toThrow(/append-only/);
  });
});
