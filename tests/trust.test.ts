import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { createOpenSession, joinSession, leaveSession } from '@/server/booking/sessions';
import { cancelReservationByPlayer, createFullReservation, cancelReservationByVenue } from '@/server/booking/reservations';
import { simulatePay } from '@/server/booking/settle';
import { DomainError } from '@/server/booking/errors';
import { computeScore, getReliability } from '@/server/trust/reliability';
import { blendCategory, computeOvr } from '@/server/trust/skill';
import { listAttendanceTasks, markAttendance } from '@/server/trust/attendance';
import { getRateContext, pendingRatings, submitPeerReviews, submitVenueReview } from '@/server/trust/ratings';
import { createReport, listReports, resolveReport } from '@/server/trust/reports';
import { getPublicProfile } from '@/server/trust/profile';
import type { Actor } from '@/server/owner/venues';

let ownerA: Actor, ownerB: Actor, admin: Actor, venueId: string, sportId: string, n = 0;
const H = 3_600_000;
const CATS = ['shooting', 'passing'];
async function mkUser(role: 'player' | 'venue_manager' | 'admin' = 'player') {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98910${String(1000000 + ++n)}`, role, displayName: `بازیکن ${n} نمونه` }).returning();
  await db().insert(schema.playerSportProfiles).values({ userId: u.id, sportId, selfScores: { shooting: 50, passing: 50 }, ovr: 50 }).onConflictDoNothing();
  return u.id;
}
async function code(p: Promise<unknown>) { const e = await p.then(() => null, (x) => x); return e instanceof DomainError ? e.code : e ? 'other:' + (e as Error).message : 'ok'; }
async function slot(hours: number) {
  const s = new Date(Date.now() + hours * H);
  return (await db().insert(schema.timeSlots).values({ venueId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price: 200000 }).returning())[0];
}
/** Moves the game into the past so attendance/rating rules apply. */
async function startedAgo(slotId: string, hoursAgo = 3) {
  await sqlClient()`UPDATE time_slots SET starts_at = now() - ${hoursAgo + ' hours'}::interval, ends_at = now() - ${(hoursAgo - 1.5) + ' hours'}::interval WHERE id = ${slotId}`;
}
/** confirmed session with host + `extra` paid participants. */
async function session(extra: number) {
  const host = await mkUser(); const sl = await slot(72);
  const s = await createOpenSession(host, { slotId: sl.id, targetCount: 6, minToConfirm: 2, pricePerParticipant: 100000, joinDeadline: new Date(Date.now() + 24 * H) });
  await simulatePay(host, s.intentId);
  const players = [host];
  for (let i = 0; i < extra; i++) { const u = await mkUser(); const j = await joinSession(u, s.sessionId); await simulatePay(u, j.intentId); players.push(u); }
  return { host, players, slot: sl, sessionId: s.sessionId, reservationId: s.reservationId };
}

beforeAll(async () => {
  await resetDb();
  const [city] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning();
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: CATS.map((key) => ({ key, nameFa: key })) }).returning();
  sportId = sp.id;
  const oa = await mkUser('venue_manager'), ob = await mkUser('venue_manager'), ad = await mkUser('admin');
  ownerA = { id: oa, role: 'venue_manager' }; ownerB = { id: ob, role: 'venue_manager' }; admin = { id: ad, role: 'admin' };
  const [v] = await db().insert(schema.venues).values({ ownerUserId: oa, cityId: city.id, slug: 'v', name: 'سالن', address: 'x', status: 'published', ratingAvg: '4.00', ratingCount: 1 }).returning();
  venueId = v.id;
  await db().insert(schema.venueSports).values({ venueId, sportId, pricePerSlot: 200000, maxCapacity: 12 });
  await db().insert(schema.venueManagers).values({ venueId, userId: oa, role: 'owner' });
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, notifications, reliability_events, venue_reliability_events, player_reviews, reports, venue_reviews RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
  await sqlClient()`UPDATE player_sport_profiles SET peer_scores = '{}', peer_count = 0, ovr = 50`;
});
afterAll(async () => { await sqlClient().end(); });

describe('score rules', () => {
  it('reliability: starts 100, caps at 100, -5 late cancel, -15 no-show, floor 0', () => {
    expect(computeScore([])).toBe(100);
    expect(computeScore([{ delta: 1 }, { delta: 1 }])).toBe(100);
    expect(computeScore([{ delta: -15 }, { delta: 1 }, { delta: -5 }])).toBe(81);
    expect(computeScore(Array.from({ length: 10 }, () => ({ delta: -15 })))).toBe(0);
    expect(computeScore([{ delta: -15 }, { delta: 1 }, { delta: 1 }])).toBe(87);
  });
  it('skill blend: self weighs 3, each peer 1; more peers shift the score', () => {
    expect(blendCategory(50, undefined)).toBe(50);
    expect(blendCategory(50, { sum: 90, n: 1 })).toBe(60);
    expect(blendCategory(50, { sum: 900, n: 10 })).toBeCloseTo(80.77, 1);
    expect(computeOvr(['a', 'b'], { a: 40, b: 60 }, {})).toBe(50);
    expect(computeOvr(['a'], { a: 99 }, { a: { sum: 1000, n: 10 } })).toBe(99); // 99.8 is capped at 99
  });
});

describe('reliability from cancellations', () => {
  it('late leave (<24h) costs -5; early leave is free; venue cancellation hits the venue not the player', async () => {
    const early = await session(1);
    expect((await leaveSession(early.players[1], early.sessionId)).refundPercent).toBe(100);
    expect((await getReliability(early.players[1])).score).toBe(100);
    const host = await mkUser(); const sl = await slot(10);
    const s = await createOpenSession(host, { slotId: sl.id, targetCount: 4, minToConfirm: 2, pricePerParticipant: 100000, joinDeadline: new Date(Date.now() + 2 * H) });
    await simulatePay(host, s.intentId);
    const u = await mkUser(); const j = await joinSession(u, s.sessionId); await simulatePay(u, j.intentId);
    expect((await leaveSession(u, s.sessionId)).refundPercent).toBe(50);
    expect((await getReliability(u))).toMatchObject({ score: 95, lateCancel: 1 });
    await cancelReservationByPlayer(host, s.reservationId);
    expect((await getReliability(host)).score).toBe(95);
    const g = await mkUser(); const full = await createFullReservation(g, (await slot(100)).id); await simulatePay(g, full.intentId);
    await cancelReservationByVenue(ownerA, full.reservationId);
    expect((await getReliability(g)).score).toBe(100);
    expect(await db().select().from(schema.venueReliabilityEvents)).toHaveLength(1);
  });
});

describe('attendance (venue staff)', () => {
  it('only after start, only own venue, only real participants; correction replaces the mark', async () => {
    const g = await session(2);
    expect(await code(markAttendance(ownerA, g.reservationId, g.players[1], 'attended'))).toBe('invalid'); // not started
    await startedAgo(g.slot.id);
    expect(await code(markAttendance(ownerB, g.reservationId, g.players[1], 'attended'))).toBe('not_found');
    expect(await code(markAttendance(ownerA, g.reservationId, await mkUser(), 'attended'))).toBe('not_found');
    await markAttendance(ownerA, g.reservationId, g.players[1], 'no_show');
    expect((await getReliability(g.players[1])).score).toBe(85);
    await markAttendance(ownerA, g.reservationId, g.players[1], 'attended'); // correction
    expect(await getReliability(g.players[1])).toMatchObject({ score: 100, attended: 1, noShow: 0, attendanceRate: 100 });
    const st = (await db().select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.userId, g.players[1])))[0].status;
    expect(st).toBe('attended');
    const tasks = await listAttendanceTasks(ownerA);
    expect(tasks).toHaveLength(1); expect(tasks[0].players).toHaveLength(3);
    expect((await listAttendanceTasks(ownerB))).toHaveLength(0);
    const notes = await db().select().from(schema.notifications).where(eq(schema.notifications.userId, g.players[1]));
    expect(notes.some((x) => x.type === 'rate_game')).toBe(true);
  });
  it('cancelled games and full-mode hosts', async () => {
    const h = await mkUser(); const sl = await slot(80);
    const r = await createFullReservation(h, sl.id); await simulatePay(h, r.intentId);
    await startedAgo(sl.id);
    await markAttendance(ownerA, r.reservationId, h, 'attended');
    expect((await db().select().from(schema.reservations).where(eq(schema.reservations.id, r.reservationId)))[0].attendance).toBe('attended');
    const c = await mkUser(); const sl2 = await slot(100); const r2 = await createFullReservation(c, sl2.id); await simulatePay(c, r2.intentId);
    await cancelReservationByPlayer(c, r2.reservationId); await startedAgo(sl2.id, 8);
    expect(await code(markAttendance(ownerA, r2.reservationId, c, 'attended'))).toBe('bad_state');
  });
  it('window: marks older than 14 days are refused', async () => {
    const g = await session(1); await startedAgo(g.slot.id, 24 * 15);
    expect(await code(markAttendance(ownerA, g.reservationId, g.players[1], 'attended'))).toBe('invalid');
  });
});

describe('peer ratings and venue reviews', () => {
  it('only attended players can rate attended co-players; not self; once; updates OVR by the documented formula', async () => {
    const g = await session(2); await startedAgo(g.slot.id);
    const [a, b, c] = g.players;
    expect(await code(submitPeerReviews(a, g.reservationId, [{ targetId: b, scores: { shooting: 9, passing: 9 } }]))).toBe('forbidden'); // nobody marked yet
    await markAttendance(ownerA, g.reservationId, a, 'attended'); await markAttendance(ownerA, g.reservationId, b, 'attended'); await markAttendance(ownerA, g.reservationId, c, 'no_show');
    expect(await code(submitPeerReviews(c, g.reservationId, [{ targetId: a, scores: { shooting: 9, passing: 9 } }]))).toBe('forbidden'); // no-show cannot rate
    expect(await code(submitPeerReviews(a, g.reservationId, [{ targetId: a, scores: { shooting: 9, passing: 9 } }]))).toBe('invalid');
    expect(await code(submitPeerReviews(a, g.reservationId, [{ targetId: c, scores: { shooting: 9, passing: 9 } }]))).toBe('invalid'); // c did not attend
    expect(await code(submitPeerReviews(a, g.reservationId, [{ targetId: b, scores: { shooting: 11, passing: 9 } }]))).toBe('invalid');
    expect(await code(submitPeerReviews(a, g.reservationId, [{ targetId: b, scores: { shooting: 9 } }]))).toBe('invalid');
    await submitPeerReviews(a, g.reservationId, [{ targetId: b, scores: { shooting: 9, passing: 9 }, comment: 'پاس‌های عالی' }]);
    expect(await code(submitPeerReviews(a, g.reservationId, [{ targetId: b, scores: { shooting: 9, passing: 9 } }]))).toBe('already_rated');
    const p = (await db().select().from(schema.playerSportProfiles).where(eq(schema.playerSportProfiles.userId, b)))[0];
    expect(p.ovr).toBe(60); expect(p.peerCount).toBe(1); expect(p.peerScores.shooting).toEqual({ sum: 90, n: 1 });
    const pub = await getPublicProfile(a, b);
    expect(pub && !pub.hidden && pub.comments[0].text).toBe('پاس‌های عالی');
    expect(pub && !pub.hidden && pub.sports[0].categories[0].value).toBe(60);
    await expect(db().insert(schema.playerReviews).values({ sessionId: g.sessionId, raterId: a, targetId: a, sportId, scores: {} })).rejects.toThrow();
  });
  it('venue review: attended only, once, recomputes venue rating, window enforced, shows up as pending until done', async () => {
    const g = await session(1); await startedAgo(g.slot.id);
    const [a, b] = g.players;
    await markAttendance(ownerA, g.reservationId, a, 'attended'); await markAttendance(ownerA, g.reservationId, b, 'no_show');
    expect((await pendingRatings(a)).map((x) => x.rid)).toEqual([g.reservationId]);
    expect(await pendingRatings(b)).toHaveLength(0);
    expect(await code(submitVenueReview(b, g.reservationId, 5, 'x'))).toBe('forbidden');
    expect(await code(submitVenueReview(a, g.reservationId, 6, 'x'))).toBe('invalid');
    await submitVenueReview(a, g.reservationId, 5, 'عالی بود');
    expect(await code(submitVenueReview(a, g.reservationId, 5, 'دوباره'))).toBe('already_rated');
    const v = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
    expect(v.ratingCount).toBe(1); expect(Number(v.ratingAvg)).toBe(5);
    expect(await pendingRatings(a)).toHaveLength(0);
    const owners = await db().select().from(schema.notifications).where(eq(schema.notifications.userId, ownerA.id));
    expect(owners.some((x) => x.type === 'venue_review')).toBe(true);
  });
  it('rating window expires after 14 days', async () => {
    const g = await session(1); await startedAgo(g.slot.id); await markAttendance(ownerA, g.reservationId, g.players[1], 'attended');
    const future = new Date(Date.now() + 20 * 86400_000);
    expect(await getRateContext(g.players[1], g.reservationId, future)).toMatchObject({ expired: true });
    expect(await code(submitVenueReview(g.players[1], g.reservationId, 4, '', future))).toBe('invalid');
  });
});

describe('reports and public profile privacy', () => {
  it('create validates, dedupes, rate-limits; only admin resolves; suspension revokes sessions', async () => {
    const a = await mkUser(), b = await mkUser();
    expect(await code(createReport(a, 'user', a, 'abuse', ''))).toBe('invalid');
    expect(await code(createReport(a, 'user', b, 'nonsense', ''))).toBe('invalid');
    expect(await code(createReport(a, 'user', '00000000-0000-4000-8000-000000000000', 'abuse', ''))).toBe('not_found');
    const r = await createReport(a, 'user', b, 'abuse', 'توهین کرد');
    expect(await code(createReport(a, 'user', b, 'abuse', 'دوباره'))).toBe('duplicate');
    expect(await code(listReports({ id: a, role: 'player' }))).toBe('forbidden');
    expect(await code(resolveReport({ id: a, role: 'player' }, r.id, 'resolved', ''))).toBe('forbidden');
    await db().insert(schema.userSessions).values({ userId: b, tokenHash: 'h' + n, expiresAt: new Date(Date.now() + H) });
    await resolveReport(admin, r.id, 'resolved', 'تعلیق شد', true);
    expect((await db().select().from(schema.users).where(eq(schema.users.id, b)))[0].status).toBe('suspended');
    expect((await db().select().from(schema.userSessions).where(eq(schema.userSessions.userId, b)))[0].revokedAt).not.toBeNull();
    expect(await code(resolveReport(admin, r.id, 'dismissed', ''))).toBe('bad_state');
    expect(await getPublicProfile(a, b)).toBeNull(); // suspended users are not public
    expect((await db().select().from(schema.notifications).where(eq(schema.notifications.userId, a))).some((x) => x.type === 'report_update')).toBe(true);
    const many = await mkUser();
    for (let i = 0; i < 5; i++) await createReport(many, 'user', await mkUser(), 'other', String(i));
    await db().update(schema.reports).set({ status: 'dismissed' }).where(eq(schema.reports.reporterId, many));
    expect(await code(createReport(many, 'user', a, 'abuse', ''))).toBe('rate_limited');
  });
  it('public profile hides details when privacy is off, never exposes the phone number', async () => {
    const a = await mkUser(), b = await mkUser();
    await db().insert(schema.userProfiles).values({ userId: b, bio: 'سلام', privacy: { showProfile: false, showHistory: false } });
    const hidden = await getPublicProfile(a, b);
    expect(hidden).toMatchObject({ hidden: true }); expect(JSON.stringify(hidden)).not.toContain('+98');
    expect(await getPublicProfile(b, b)).toMatchObject({ hidden: false, own: true });
    await db().update(schema.userProfiles).set({ privacy: { showProfile: true, showHistory: false } }).where(eq(schema.userProfiles.userId, b));
    const pub = await getPublicProfile(a, b);
    expect(pub && !pub.hidden && pub.comments).toEqual([]); expect(JSON.stringify(pub)).not.toContain('+98');
  });
});
