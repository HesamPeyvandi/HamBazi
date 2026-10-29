import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { notify, type Tx } from '@/server/booking/core';
import { DomainError, E } from '@/server/booking/errors';
import { RATING_WINDOW_DAYS } from './attendance';
import { computeOvr, levelFor, type PeerScores } from './skill';

const DAY = 86_400_000;
export interface PeerInput { targetId: string; scores: Record<string, number>; comment?: string }

/** Everything the rating page needs; null when the user may not rate this game. */
export async function getRateContext(userId: string, reservationId: string, now = new Date()) {
  const d = db();
  const [g] = await d.select({ r: schema.reservations, venue: schema.venues, sport: schema.sports, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt })
    .from(schema.reservations).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).innerJoin(schema.sports, eq(schema.sports.id, schema.reservations.sportId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId)).where(eq(schema.reservations.id, reservationId));
  if (!g || g.startsAt > now) return null;
  const expired = g.endsAt.getTime() + RATING_WINDOW_DAYS * DAY < now.getTime();
  let attended = false; let sessionId: string | null = null;
  let peers: { userId: string; name: string }[] = [];
  if (g.r.mode === 'full') attended = g.r.hostUserId === userId && g.r.attendance === 'attended';
  else {
    const [s] = await d.select().from(schema.openSessions).where(eq(schema.openSessions.reservationId, reservationId));
    if (!s) return null;
    sessionId = s.id;
    const ps = await d.select({ userId: schema.sessionParticipants.userId, name: schema.users.displayName, status: schema.sessionParticipants.status })
      .from(schema.sessionParticipants).innerJoin(schema.users, eq(schema.users.id, schema.sessionParticipants.userId)).where(and(eq(schema.sessionParticipants.sessionId, s.id), eq(schema.sessionParticipants.status, 'attended')));
    attended = ps.some((p) => p.userId === userId);
    peers = ps.filter((p) => p.userId !== userId).map((p) => ({ userId: p.userId, name: p.name }));
  }
  if (!attended) return null;
  const rated = sessionId ? await d.select({ t: schema.playerReviews.targetId }).from(schema.playerReviews).where(and(eq(schema.playerReviews.sessionId, sessionId), eq(schema.playerReviews.raterId, userId))) : [];
  const [venueReview] = await d.select().from(schema.venueReviews).where(and(eq(schema.venueReviews.reservationId, reservationId), eq(schema.venueReviews.userId, userId)));
  return { game: g, sessionId, expired, peers: peers.map((p) => ({ ...p, rated: rated.some((r) => r.t === p.userId) })), venueReviewed: !!venueReview, categories: g.sport.skillCategories as { key: string; nameFa: string }[] };
}

async function applyPeerScores(tx: Tx, targetId: string, sportId: string, categories: { key: string }[], scores: Record<string, number>) {
  const [p] = await tx.select().from(schema.playerSportProfiles).where(and(eq(schema.playerSportProfiles.userId, targetId), eq(schema.playerSportProfiles.sportId, sportId))).for('update');
  const peer: PeerScores = { ...(p?.peerScores ?? {}) };
  for (const c of categories) { const cur = peer[c.key] ?? { sum: 0, n: 0 }; peer[c.key] = { sum: cur.sum + scores[c.key] * 10, n: cur.n + 1 }; }
  const self = p?.selfScores ?? {};
  const ovr = computeOvr(categories.map((c) => c.key), self, peer);
  await tx.insert(schema.playerSportProfiles).values({ userId: targetId, sportId, selfScores: self, peerScores: peer, peerCount: (p?.peerCount ?? 0) + 1, ovr, level: levelFor(ovr) })
    .onConflictDoUpdate({ target: [schema.playerSportProfiles.userId, schema.playerSportProfiles.sportId], set: { peerScores: peer, peerCount: (p?.peerCount ?? 0) + 1, ovr, level: levelFor(ovr), updatedAt: new Date() } });
}

/** Peer skill ratings for attended co-players of the same open session. One review per (session, rater, target). */
export async function submitPeerReviews(raterId: string, reservationId: string, items: PeerInput[], now = new Date()) {
  const ctx = await getRateContext(raterId, reservationId, now);
  if (!ctx || !ctx.sessionId) throw E.forbidden();
  if (ctx.expired) throw E.invalid('مهلت امتیازدهی این بازی تمام شده است.');
  if (items.length === 0) throw E.invalid('حداقل یک بازیکن را امتیاز دهید.');
  const cats = ctx.categories;
  return db().transaction(async (tx) => {
    for (const it of items) {
      if (it.targetId === raterId) throw E.invalid('امتیاز دادن به خودتان ممکن نیست.');
      const peer = ctx.peers.find((p) => p.userId === it.targetId);
      if (!peer) throw E.invalid('این بازیکن در این بازی حاضر نبوده است.');
      if (peer.rated) throw new DomainError('already_rated', 'قبلاً به این بازیکن امتیاز داده‌اید.');
      for (const c of cats) { const v = it.scores[c.key]; if (!Number.isInteger(v) || v < 1 || v > 10) throw E.invalid('هر مهارت باید عددی از ۱ تا ۱۰ باشد.'); }
      const comment = (it.comment ?? '').trim().slice(0, 300);
      const ins = await tx.insert(schema.playerReviews).values({ sessionId: ctx.sessionId!, raterId, targetId: it.targetId, sportId: ctx.game.r.sportId, scores: it.scores, comment }).onConflictDoNothing().returning({ id: schema.playerReviews.id });
      if (!ins.length) throw new DomainError('already_rated', 'قبلاً به این بازیکن امتیاز داده‌اید.');
      await applyPeerScores(tx, it.targetId, ctx.game.r.sportId, cats, it.scores);
      await notify(tx, it.targetId, 'peer_rated', 'یک هم‌بازی به شما امتیاز داد', 'مهارت شما به‌روزرسانی شد.', `/players/${it.targetId}`);
    }
    return { rated: items.length };
  });
}

/** Public rating = all reviews that moderation has not hidden. */
export async function recomputeVenueRating(tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, venueId: string) {
  await tx.execute(sql`UPDATE venues SET rating_avg = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM venue_reviews WHERE venue_id = ${venueId} AND hidden_at IS NULL), 0),
    rating_count = (SELECT count(*) FROM venue_reviews WHERE venue_id = ${venueId} AND hidden_at IS NULL) WHERE id = ${venueId}`);
}

/** Venue review for a game the user actually attended. Recomputes the venue's public rating from all reviews. */
export async function submitVenueReview(userId: string, reservationId: string, rating: number, comment: string, now = new Date()) {
  const ctx = await getRateContext(userId, reservationId, now);
  if (!ctx) throw E.forbidden();
  if (ctx.expired) throw E.invalid('مهلت امتیازدهی این بازی تمام شده است.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw E.invalid('امتیاز سالن باید از ۱ تا ۵ باشد.');
  return db().transaction(async (tx) => {
    const ins = await tx.insert(schema.venueReviews).values({ venueId: ctx.game.venue.id, userId, reservationId, sessionId: ctx.sessionId, rating, comment: comment.trim().slice(0, 600) }).onConflictDoNothing().returning({ id: schema.venueReviews.id });
    if (!ins.length) throw new DomainError('already_rated', 'قبلاً برای این بازی نظر داده‌اید.');
    await recomputeVenueRating(tx, ctx.game.venue.id);
    const mgr = await tx.select({ id: schema.venueManagers.userId }).from(schema.venueManagers).where(eq(schema.venueManagers.venueId, ctx.game.venue.id));
    for (const m of mgr) await notify(tx, m.id, 'venue_review', 'نظر جدید دربارهٔ سالن', '', '/owner/reviews');
  });
}

/** Games waiting for the user's rating (attended, not expired, something left to rate). */
export async function pendingRatings(userId: string, now = new Date()) {
  const rows = await db().select({ rid: schema.reservations.id, venue: schema.venues.name, startsAt: schema.timeSlots.startsAt }).from(schema.reservations)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId))
    .where(and(sql`${schema.timeSlots.startsAt} <= ${now.toISOString()}::timestamptz`, sql`${schema.timeSlots.endsAt} + interval '${sql.raw(String(RATING_WINDOW_DAYS))} days' > ${now.toISOString()}::timestamptz`, inArray(schema.reservations.status, ['confirmed', 'completed']),
      sql`(${schema.reservations.id} IN (SELECT o.reservation_id FROM open_sessions o JOIN session_participants p ON p.session_id = o.id WHERE p.user_id = ${userId} AND p.status = 'attended')
        OR (${schema.reservations.hostUserId} = ${userId} AND ${schema.reservations.attendance} = 'attended'))`,
      sql`NOT EXISTS (SELECT 1 FROM venue_reviews v WHERE v.reservation_id = ${schema.reservations.id} AND v.user_id = ${userId})`));
  return rows;
}
