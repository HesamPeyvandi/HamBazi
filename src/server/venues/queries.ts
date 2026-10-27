import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { jalaliToUtc, tehranParts, tehranWallToUtc } from '@/lib/i18n/jalali';

export const PAGE_SIZE = 8;
export type VenueSort = 'popular' | 'rating' | 'price_asc' | 'price_desc';

export interface VenueFilters {
  citySlug?: string;
  q?: string;
  sports?: string[];       // sport keys
  priceMin?: number;
  priceMax?: number;
  facilities?: string[];
  minRating?: number;
  date?: { jy: number; jm: number; jd: number }; // Jalali date (Tehran)
  hour?: number;           // start hour in Tehran time
  sort?: VenueSort;
  page?: number;
}

export interface VenueCard {
  id: string; slug: string; name: string; neighborhood: string; address: string; cityName: string;
  ratingAvg: number; ratingCount: number; images: string[]; sports: { key: string; nameFa: string }[];
  fromPrice: number; facilities: string[]; slots: { id: string; startsAt: Date; price: number }[];
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

/** Start/end (UTC) of a Jalali calendar day in Tehran. */
export function dayRange(d: { jy: number; jm: number; jd: number }) {
  const start = jalaliToUtc(d.jy, d.jm, d.jd, 0, 0);
  const t = tehranParts(start);
  const next = tehranWallToUtc(t.y, t.m, t.d + 1, 0, 0);
  return { start, end: next };
}

export async function searchVenues(f: VenueFilters) {
  const d = db();
  const conds: SQL[] = [eq(schema.venues.status, 'published')];

  if (f.citySlug) conds.push(sql`${schema.venues.cityId} IN (SELECT id FROM cities WHERE slug = ${f.citySlug})`);
  if (f.q?.trim()) {
    const like = `%${escapeLike(f.q.trim().slice(0, 80))}%`;
    conds.push(or(ilike(schema.venues.name, like), ilike(schema.venues.address, like), ilike(schema.venues.neighborhood, like))!);
  }
  if (f.sports?.length) {
    conds.push(sql`EXISTS (SELECT 1 FROM venue_sports vs JOIN sports s ON s.id = vs.sport_id
      WHERE vs.venue_id = ${schema.venues.id} AND s.key IN ${f.sports})`);
  }
  if (f.priceMin != null || f.priceMax != null) {
    conds.push(sql`EXISTS (SELECT 1 FROM venue_sports vs WHERE vs.venue_id = ${schema.venues.id}
      AND vs.price_per_slot >= ${f.priceMin ?? 0} AND vs.price_per_slot <= ${f.priceMax ?? 2_000_000_000})`);
  }
  for (const fac of f.facilities ?? []) {
    conds.push(sql`EXISTS (SELECT 1 FROM venue_facilities vf WHERE vf.venue_id = ${schema.venues.id} AND vf.facility_key = ${fac})`);
  }
  if (f.minRating) conds.push(gte(schema.venues.ratingAvg, String(f.minRating)));
  if (f.date || f.hour != null) {
    const range = f.date ? dayRange(f.date) : { start: new Date(), end: new Date(Date.now() + 365 * 86400_000) };
    const hourCond = f.hour != null
      ? sql` AND extract(hour from ts.starts_at AT TIME ZONE 'Asia/Tehran') = ${f.hour}` : sql``;
    conds.push(sql`EXISTS (SELECT 1 FROM time_slots ts WHERE ts.venue_id = ${schema.venues.id} AND ts.status = 'open'
      AND ts.starts_at > now() AND ts.starts_at >= ${range.start.toISOString()}::timestamptz
      AND ts.starts_at < ${range.end.toISOString()}::timestamptz${hourCond})`);
  }
  const where = and(...conds);

  const minPrice = sql<number>`(SELECT min(price_per_slot) FROM venue_sports WHERE venue_id = ${schema.venues.id})`;
  const order = {
    popular: [desc(schema.venues.ratingCount), desc(schema.venues.ratingAvg)],
    rating: [desc(schema.venues.ratingAvg), desc(schema.venues.ratingCount)],
    price_asc: [asc(minPrice)], price_desc: [desc(minPrice)],
  }[f.sort ?? 'popular'];

  const page = Math.max(1, f.page ?? 1);
  const [{ total }] = await d.select({ total: sql<number>`count(*)::int` }).from(schema.venues).where(where);
  const rows = await d.select().from(schema.venues).where(where).orderBy(...order, asc(schema.venues.name))
    .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);

  const items = await hydrate(rows.map((r) => r.id), f);
  const byId = new Map(items.map((i) => [i.id, i]));
  return { items: rows.map((r) => byId.get(r.id)!).filter(Boolean), total, page, pageSize: PAGE_SIZE };
}

async function hydrate(ids: string[], f?: VenueFilters): Promise<VenueCard[]> {
  if (!ids.length) return [];
  const d = db();
  const [venues, images, sportRows, facs, cities] = await Promise.all([
    d.select().from(schema.venues).where(inArray(schema.venues.id, ids)),
    d.select().from(schema.venueImages).where(inArray(schema.venueImages.venueId, ids)).orderBy(asc(schema.venueImages.sort)),
    d.select({ venueId: schema.venueSports.venueId, price: schema.venueSports.pricePerSlot, key: schema.sports.key, nameFa: schema.sports.nameFa })
      .from(schema.venueSports).innerJoin(schema.sports, eq(schema.sports.id, schema.venueSports.sportId))
      .where(inArray(schema.venueSports.venueId, ids)),
    d.select().from(schema.venueFacilities).where(inArray(schema.venueFacilities.venueId, ids)),
    d.select().from(schema.cities),
  ]);
  const range = f?.date ? dayRange(f.date) : { start: new Date(), end: new Date(Date.now() + 14 * 86400_000) };
  const slotRows = await d.select().from(schema.timeSlots).where(and(inArray(schema.timeSlots.venueId, ids),
    eq(schema.timeSlots.status, 'open'), gte(schema.timeSlots.startsAt, new Date(Math.max(Date.now(), range.start.getTime()))),
    sql`${schema.timeSlots.startsAt} < ${range.end.toISOString()}::timestamptz`)).orderBy(asc(schema.timeSlots.startsAt));
  const cityName = new Map(cities.map((c) => [c.id, c.nameFa]));

  return venues.map((v) => {
    const sp = sportRows.filter((s) => s.venueId === v.id);
    return {
      id: v.id, slug: v.slug, name: v.name, neighborhood: v.neighborhood, address: v.address,
      cityName: cityName.get(v.cityId) ?? '', ratingAvg: Number(v.ratingAvg), ratingCount: v.ratingCount,
      images: images.filter((i) => i.venueId === v.id).map((i) => i.storageKey),
      sports: sp.map((s) => ({ key: s.key, nameFa: s.nameFa })),
      fromPrice: Math.min(...sp.map((s) => s.price)),
      facilities: facs.filter((x) => x.venueId === v.id).map((x) => x.facilityKey),
      slots: slotRows.filter((s) => s.venueId === v.id).slice(0, 3).map((s) => ({ id: s.id, startsAt: s.startsAt, price: s.price })),
    };
  });
}

export async function featuredVenues(citySlug: string, limit = 4) {
  const r = await searchVenues({ citySlug, sort: 'popular', page: 1 });
  return r.items.slice(0, limit);
}

export async function getVenueBySlug(slug: string) {
  const d = db();
  const [v] = await d.select().from(schema.venues).where(and(eq(schema.venues.slug, slug), eq(schema.venues.status, 'published'))).limit(1);
  if (!v) return null;
  const [card] = await hydrate([v.id]);
  const [sports, reviews, city] = await Promise.all([
    d.select({ key: schema.sports.key, nameFa: schema.sports.nameFa, price: schema.venueSports.pricePerSlot, capacity: schema.venueSports.maxCapacity, minutes: schema.venueSports.slotMinutes })
      .from(schema.venueSports).innerJoin(schema.sports, eq(schema.sports.id, schema.venueSports.sportId)).where(eq(schema.venueSports.venueId, v.id)),
    d.select({ id: schema.venueReviews.id, rating: schema.venueReviews.rating, comment: schema.venueReviews.comment, createdAt: schema.venueReviews.createdAt,
      name: schema.users.displayName, avatar: schema.users.avatarUrl })
      .from(schema.venueReviews).innerJoin(schema.users, eq(schema.users.id, schema.venueReviews.userId))
      .where(eq(schema.venueReviews.venueId, v.id)).orderBy(desc(schema.venueReviews.createdAt)).limit(20),
    d.select().from(schema.cities).where(eq(schema.cities.id, v.cityId)).limit(1),
  ]);
  const dist = [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: reviews.filter((r) => r.rating === s).length }));
  return { venue: v, card, sports, reviews, ratingDistribution: dist, cityName: city[0]?.nameFa ?? '' };
}

export async function slotsForDay(venueId: string, day: { jy: number; jm: number; jd: number }) {
  const r = dayRange(day);
  return db().select().from(schema.timeSlots).where(and(eq(schema.timeSlots.venueId, venueId),
    gte(schema.timeSlots.startsAt, r.start), sql`${schema.timeSlots.startsAt} < ${r.end.toISOString()}::timestamptz`))
    .orderBy(asc(schema.timeSlots.startsAt));
}

export async function getCities() {
  return db().select().from(schema.cities).orderBy(desc(schema.cities.isDefault), asc(schema.cities.nameFa));
}
export async function getSportsList() {
  return db().select().from(schema.sports).where(eq(schema.sports.active, true));
}
