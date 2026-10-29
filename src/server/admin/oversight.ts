import { desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { E } from '@/server/booking/errors';
import { recomputeVenueRating } from '@/server/trust/ratings';
import { notify } from '@/server/booking/core';
import type { Actor } from '@/server/owner/venues';

const PAGE = 15;
const admin = (a: Actor) => { if (a.role !== 'admin') throw E.forbidden(); };

/** Read-only overview of open sessions (fill state, host, venue). No phone numbers. */
export async function listSessionsAdmin(a: Actor, q: { status?: string; page?: number }) {
  admin(a);
  const where = q.status && ['collecting', 'confirmed', 'cancelled', 'expired', 'completed'].includes(q.status) ? eq(schema.openSessions.status, q.status as 'collecting') : undefined;
  const page = Math.max(1, q.page ?? 1);
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.openSessions).where(where);
  const rows = await db().select({
    s: schema.openSessions, venue: schema.venues.name, host: schema.users.displayName, startsAt: schema.timeSlots.startsAt, sport: schema.sports.nameFa,
    confirmed: sql<number>`(SELECT count(*)::int FROM session_participants p WHERE p.session_id = ${schema.openSessions.id} AND p.status IN ('confirmed','attended'))`,
    waiting: sql<number>`(SELECT count(*)::int FROM session_waitlist w WHERE w.session_id = ${schema.openSessions.id})`,
  }).from(schema.openSessions).innerJoin(schema.venues, eq(schema.venues.id, schema.openSessions.venueId)).innerJoin(schema.users, eq(schema.users.id, schema.openSessions.hostUserId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.openSessions.slotId)).innerJoin(schema.sports, eq(schema.sports.id, schema.openSessions.sportId))
    .where(where).orderBy(desc(schema.timeSlots.startsAt)).limit(PAGE).offset((page - 1) * PAGE);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)) };
}

export async function listReservationsAdmin(a: Actor, q: { status?: string; page?: number }) {
  admin(a);
  const where = q.status && q.status in { pending: 1, awaiting_payment: 1, confirmed: 1, completed: 1, cancelled: 1, expired: 1, refunded: 1 } ? eq(schema.reservations.status, q.status as 'confirmed') : undefined;
  const page = Math.max(1, q.page ?? 1);
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.reservations).where(where);
  const rows = await db().select({ r: schema.reservations, venue: schema.venues.name, host: schema.users.displayName, startsAt: schema.timeSlots.startsAt })
    .from(schema.reservations).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).innerJoin(schema.users, eq(schema.users.id, schema.reservations.hostUserId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId)).where(where).orderBy(desc(schema.timeSlots.startsAt)).limit(PAGE).offset((page - 1) * PAGE);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)) };
}

export async function listReviewsAdmin(a: Actor, q: { hidden?: boolean; page?: number }) {
  admin(a);
  const where = q.hidden ? sql`${schema.venueReviews.hiddenAt} IS NOT NULL` : sql`${schema.venueReviews.hiddenAt} IS NULL`;
  const page = Math.max(1, q.page ?? 1);
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.venueReviews).where(where);
  const rows = await db().select({ r: schema.venueReviews, venue: schema.venues.name, name: schema.users.displayName })
    .from(schema.venueReviews).innerJoin(schema.venues, eq(schema.venues.id, schema.venueReviews.venueId)).innerJoin(schema.users, eq(schema.users.id, schema.venueReviews.userId))
    .where(where).orderBy(desc(schema.venueReviews.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)) };
}

/** Hide (or restore) a venue review. The venue's public rating is recomputed from the visible reviews. Audit-logged; the author is told. */
export async function setReviewHidden(a: Actor, reviewId: string, hide: boolean, note = '') {
  admin(a);
  await db().transaction(async (tx) => {
    const [r] = await tx.select().from(schema.venueReviews).where(eq(schema.venueReviews.id, reviewId)).for('update');
    if (!r) throw E.notFound();
    if (!!r.hiddenAt === hide) throw E.badState();
    await tx.update(schema.venueReviews).set(hide ? { hiddenAt: new Date(), hiddenBy: a.id } : { hiddenAt: null, hiddenBy: null }).where(eq(schema.venueReviews.id, reviewId));
    await recomputeVenueRating(tx, r.venueId);
    if (hide) await notify(tx, r.userId, 'review_hidden', 'نظر شما توسط مدیریت پنهان شد', 'این نظر با قوانین سکو هم‌خوانی نداشت.', '/help');
    await audit(a.id, hide ? 'review.hide' : 'review.restore', 'venue_review', reviewId, { note: note.slice(0, 300), venueId: r.venueId });
  });
}
export const reviewStats = async () => {
  const [r] = await db().select({ hidden: sql<number>`count(*) FILTER (WHERE hidden_at IS NOT NULL)::int`, total: sql<number>`count(*)::int` }).from(schema.venueReviews);
  return r;
};
