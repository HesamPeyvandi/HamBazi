import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { E } from '@/server/booking/errors';
import { assertManages, type Actor } from './venues';

export interface OwnerStats {
  days: number;
  revenue: number; bookings: number; cancelled: number; occupancyPct: number; slotsTotal: number; slotsBooked: number; avgRating: number; ratingCount: number;
  series: { day: string; revenue: number; bookings: number }[];
  recent: { id: string; venue: string; startsAt: Date; status: string; amount: number; host: string }[];
}

const PAID = ['confirmed', 'completed'] as const;
const DAY = sql`to_char(${schema.timeSlots.startsAt} AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD')`;

/** Venue ids the actor may see: one specific venue (must be managed) or all managed (admin: all). */
async function scope(actor: Actor, venueId?: string | null): Promise<string[]> {
  if (venueId) { await assertManages(actor, venueId); return [venueId]; }
  const q = actor.role === 'admin'
    ? await db().select({ id: schema.venues.id }).from(schema.venues)
    : await db().select({ id: schema.venueManagers.venueId }).from(schema.venueManagers).where(eq(schema.venueManagers.userId, actor.id));
  return q.map((r) => r.id);
}

/**
 * Owner KPIs over the last `days` days of GAMES (by slot start, Tehran time).
 * Revenue = venue_payable of confirmed/completed reservations (the platform fee is never venue income).
 */
export async function ownerStats(actor: Actor, venueId: string | null | undefined, days = 30): Promise<OwnerStats> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw E.invalid('بازهٔ زمانی معتبر نیست.');
  const ids = await scope(actor, venueId);
  const empty: OwnerStats = { days, revenue: 0, bookings: 0, cancelled: 0, occupancyPct: 0, slotsTotal: 0, slotsBooked: 0, avgRating: 0, ratingCount: 0, series: [], recent: [] };
  if (!ids.length) return empty;
  const to = new Date(); const from = new Date(to.getTime() - days * 86400_000);
  const inRange = and(inArray(schema.reservations.venueId, ids), gte(schema.timeSlots.startsAt, from), lt(schema.timeSlots.startsAt, to));

  const [k] = await db().select({
    revenue: sql<number>`coalesce(sum(${schema.reservations.venuePayable}) filter (where ${schema.reservations.status} in ('confirmed','completed')),0)::int`,
    bookings: sql<number>`count(*) filter (where ${schema.reservations.status} in ('confirmed','completed'))::int`,
    cancelled: sql<number>`count(*) filter (where ${schema.reservations.status} in ('cancelled','refunded','refund_pending'))::int`,
  }).from(schema.reservations).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId)).where(inRange);

  const [o] = await db().select({
    total: sql<number>`count(*) filter (where ${schema.timeSlots.status} <> 'closed')::int`,
    booked: sql<number>`count(*) filter (where ${schema.timeSlots.status} = 'booked')::int`,
  }).from(schema.timeSlots).where(and(inArray(schema.timeSlots.venueId, ids), gte(schema.timeSlots.startsAt, from), lt(schema.timeSlots.startsAt, to)));

  const rows = await db().select({ day: DAY, revenue: sql<number>`sum(${schema.reservations.venuePayable})::int`, bookings: sql<number>`count(*)::int` })
    .from(schema.reservations).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId))
    .where(and(inRange, inArray(schema.reservations.status, [...PAID]))).groupBy(DAY);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const series: OwnerStats['series'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(to.getTime() - i * 86400_000);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d); // YYYY-MM-DD
    series.push({ day: key, revenue: byDay.get(key)?.revenue ?? 0, bookings: byDay.get(key)?.bookings ?? 0 });
  }

  const [rt] = await db().select({ avg: sql<number>`coalesce(sum(${schema.venues.ratingAvg} * ${schema.venues.ratingCount}) / nullif(sum(${schema.venues.ratingCount}),0),0)::float`, n: sql<number>`coalesce(sum(${schema.venues.ratingCount}),0)::int` }).from(schema.venues).where(inArray(schema.venues.id, ids));

  const recent = await db().select({ id: schema.reservations.id, venue: schema.venues.name, startsAt: schema.timeSlots.startsAt, status: schema.reservations.status, amount: schema.reservations.venuePayable, host: schema.users.displayName })
    .from(schema.reservations).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId)).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId))
    .innerJoin(schema.users, eq(schema.users.id, schema.reservations.hostUserId))
    .where(and(inArray(schema.reservations.venueId, ids), inArray(schema.reservations.status, ['confirmed', 'completed', 'cancelled', 'refunded'])))
    .orderBy(desc(schema.reservations.createdAt)).limit(8);

  return { days, revenue: k.revenue, bookings: k.bookings, cancelled: k.cancelled, occupancyPct: o.total ? Math.round((o.booked / o.total) * 100) : 0,
    slotsTotal: o.total, slotsBooked: o.booked, avgRating: Math.round(rt.avg * 10) / 10, ratingCount: rt.n, series, recent };
}
