import { randomBytes } from 'node:crypto';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { cancelOpenIntents, notify, refundIntent, succeededIntents, type Tx } from './core';
import { E } from './errors';
import { acquireSlot, loadBookable, policies } from './hold';
import { createIntent } from './intents';
import { splitShare } from './money';
import { lockSession, playerRefundPercent, processSession, sweepDue } from './lifecycle';
import { clearWaitlist, offerFreedSeats, waitlistInfo } from './waitlist';
import { recordReliability } from '@/server/trust/reliability';

export interface CreateSessionInput {
  slotId: string; targetCount: number; // number of players (host included). The per-person share is computed by the server.
  skillMin?: number; skillMax?: number; joinDeadline?: Date; visibility?: 'public' | 'invite_only'; description?: string;
}
const ACTIVE = ['collecting', 'confirmed'] as const;
const bump = sql`${schema.openSessions.version} + 1`;

async function userOvr(tx: Tx, userId: string, sportId: string) {
  const [p] = await tx.select().from(schema.playerSportProfiles)
    .where(and(eq(schema.playerSportProfiles.userId, userId), eq(schema.playerSportProfiles.sportId, sportId)));
  return p?.ovr ?? 50;
}
export async function settleStale(sessionId: string) { await db().transaction((tx) => processSession(tx, sessionId)); }

export async function createOpenSession(hostUserId: string, i: CreateSessionInput, now = new Date()) {
  return db().transaction(async (tx) => {
    const { slot, venue, venueSport } = await loadBookable(tx, i.slotId);
    if (!venueSport) throw E.notFound();
    const skillMin = i.skillMin ?? 0, skillMax = i.skillMax ?? 99;
    if (!Number.isInteger(i.targetCount) || i.targetCount < 2) throw E.invalid('تعداد بازیکنان باید حداقل ۲ نفر باشد.');
    if (i.targetCount > venueSport.maxCapacity) throw E.invalid(`تعداد بازیکنان نمی‌تواند از ظرفیت سالن (${venueSport.maxCapacity}) بیشتر باشد.`);
    const share = splitShare(slot.price, i.targetCount); // never trusted from the client
    if (skillMin < 0 || skillMax > 99 || skillMin > skillMax) throw E.invalid('بازهٔ مهارت معتبر نیست.');
    const deadline = i.joinDeadline ?? new Date(slot.startsAt.getTime() - 24 * 3_600_000);
    if (deadline <= now || deadline >= slot.startsAt) throw E.invalid('مهلت پیوستن باید در آینده و قبل از شروع سانس باشد.');
    const { fee, cancel } = await policies(tx);
    const [r] = await tx.insert(schema.reservations).values({
      hostUserId, venueId: venue.id, slotId: slot.id, sportId: slot.sportId, mode: 'open_session', paymentArrangement: 'split', status: 'awaiting_payment',
      policyVersion: cancel.version, policySnapshot: { tiers: cancel.tiers }, feeSnapshot: fee, baseAmount: slot.price, feeAmount: 0, totalAmount: slot.price, venuePayable: slot.price,
    }).returning();
    const { holdExpiresAt } = await acquireSlot(tx, slot.id, r.id, now);
    await tx.update(schema.reservations).set({ holdExpiresAt }).where(eq(schema.reservations.id, r.id));
    const [s] = await tx.insert(schema.openSessions).values({
      reservationId: r.id, hostUserId, venueId: venue.id, slotId: slot.id, sportId: slot.sportId, targetCount: i.targetCount, minToConfirm: i.targetCount,
      skillMin, skillMax, pricePerParticipant: share, joinDeadline: deadline, visibility: i.visibility ?? 'public',
      inviteToken: randomBytes(12).toString('base64url'), description: (i.description ?? '').slice(0, 500),
    }).returning();
    const [p] = await tx.insert(schema.sessionParticipants).values({ sessionId: s.id, userId: hostUserId, isHost: true, status: 'pending_payment', holdExpiresAt, amount: share }).returning();
    const intent = await createIntent(tx, { reservationId: r.id, payerUserId: hostUserId, participantId: p.id, base: share, feeRule: fee, venuePayable: share });
    return { sessionId: s.id, reservationId: r.id, intentId: intent.id, holdExpiresAt, inviteToken: s.inviteToken, share };
  });
}

export async function joinSession(userId: string, sessionId: string, opts: { inviteToken?: string } = {}, now = new Date()) {
  await settleStale(sessionId); // commit time-based effects before judging the join
  return db().transaction(async (tx) => {
    const s = await lockSession(tx, sessionId);
    if (!s) throw E.notFound();
    if (!ACTIVE.includes(s.status as never)) throw E.badState();
    if (s.visibility === 'invite_only' && opts.inviteToken !== s.inviteToken && s.hostUserId !== userId) throw E.invite();
    if (now >= s.joinDeadline) throw E.deadline();
    const parts = await tx.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, s.id));
    const host = parts.find((p) => p.isHost);
    if (!host || host.status !== 'confirmed') throw E.badState();
    const mine = parts.find((p) => p.userId === userId);
    if (mine && ['pending_payment', 'confirmed', 'attended'].includes(mine.status)) throw E.alreadyJoined();
    const taken = parts.filter((p) => p.status === 'confirmed' || (p.status === 'pending_payment' && p.holdExpiresAt && p.holdExpiresAt > now)).length;
    if (taken >= s.targetCount) throw E.full();
    const ovr = await userOvr(tx, userId, s.sportId);
    if (ovr < s.skillMin || ovr > s.skillMax) throw E.skill();
    const [res] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, s.reservationId));
    const hold = new Date(now.getTime() + (await import('./policy').then((m) => m.holdMinutes())) * 60_000);
    let participantId: string;
    if (mine) { // previously left/expired: reuse the unique row
      await tx.update(schema.sessionParticipants).set({ status: 'pending_payment', holdExpiresAt: hold, amount: s.pricePerParticipant, joinedAt: now }).where(eq(schema.sessionParticipants.id, mine.id));
      participantId = mine.id;
    } else {
      const [p] = await tx.insert(schema.sessionParticipants).values({ sessionId: s.id, userId, status: 'pending_payment', holdExpiresAt: hold, amount: s.pricePerParticipant }).returning();
      participantId = p.id;
    }
    const intent = await createIntent(tx, { reservationId: res.id, payerUserId: userId, participantId, base: s.pricePerParticipant, feeRule: res.feeSnapshot, venuePayable: s.pricePerParticipant });
    await clearWaitlist(tx, s.id, userId); // joined => no longer waiting
    return { intentId: intent.id, holdExpiresAt: hold, participantId };
  });
}

/** A non-host participant leaves; refund follows the cancellation policy snapshot. Host must cancel the session instead. */
export async function leaveSession(userId: string, sessionId: string, now = new Date()) {
  return db().transaction(async (tx) => {
    const s = await lockSession(tx, sessionId);
    if (!s || !ACTIVE.includes(s.status as never)) throw E.badState();
    const [p] = await tx.select().from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, s.id), eq(schema.sessionParticipants.userId, userId)));
    if (!p || p.isHost || !['pending_payment', 'confirmed'].includes(p.status)) throw E.badState();
    const [res] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, s.reservationId));
    const [slot] = await tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.id, s.slotId));
    let pct = 0;
    if (p.status === 'pending_payment') await cancelOpenIntents(tx, res.id, p.id);
    else {
      pct = playerRefundPercent(res, slot.startsAt, now);
      for (const i of await succeededIntents(tx, res.id, p.id)) await refundIntent(tx, i, pct, 'participant_left');
      if (pct < 100) await recordReliability(tx, userId, res.id, 'late_cancel');
    }
    await tx.update(schema.sessionParticipants).set({ status: 'left', holdExpiresAt: null }).where(eq(schema.sessionParticipants.id, p.id));
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, s.id), eq(schema.sessionParticipants.status, 'confirmed')));
    if (s.status === 'confirmed' && n < s.minToConfirm && now < s.joinDeadline) await tx.update(schema.openSessions).set({ status: 'collecting', version: bump }).where(eq(schema.openSessions.id, s.id));
    await offerFreedSeats(tx, s.id, now);
    await notify(tx, s.hostUserId, 'participant_left', 'یکی از بازیکنان از سانس خارج شد', '', `/sessions/${s.id}`);
    return { refundPercent: pct };
  });
}

export async function updateSessionDetails(hostUserId: string, sessionId: string, d: { description?: string; visibility?: 'public' | 'invite_only' }) {
  const set: Partial<typeof schema.openSessions.$inferInsert> = {};
  if (d.description !== undefined) set.description = d.description.slice(0, 500);
  if (d.visibility) set.visibility = d.visibility;
  const r = await db().update(schema.openSessions).set(set).where(and(eq(schema.openSessions.id, sessionId), eq(schema.openSessions.hostUserId, hostUserId), inArray(schema.openSessions.status, [...ACTIVE]))).returning({ id: schema.openSessions.id });
  if (!r.length) throw E.notFound();
}

/* ------------------------------ queries ------------------------------ */
export interface SessionFilters { sportId?: string; cityId?: string; from?: Date; to?: Date; ovr?: number; q?: string }

export async function listOpenSessions(f: SessionFilters = {}) {
  void sweepDue(20).catch(() => {});
  const conds = [eq(schema.openSessions.visibility, 'public'), inArray(schema.openSessions.status, [...ACTIVE]), gt(schema.openSessions.joinDeadline, new Date()), eq(schema.venues.status, 'published')];
  if (f.sportId) conds.push(eq(schema.openSessions.sportId, f.sportId));
  if (f.cityId) conds.push(eq(schema.venues.cityId, f.cityId));
  if (f.from) conds.push(sql`${schema.timeSlots.startsAt} >= ${f.from}`);
  if (f.to) conds.push(sql`${schema.timeSlots.startsAt} < ${f.to}`);
  if (f.ovr != null) conds.push(sql`${schema.openSessions.skillMin} <= ${f.ovr} AND ${schema.openSessions.skillMax} >= ${f.ovr}`);
  if (f.q) conds.push(sql`${schema.venues.name} ILIKE ${'%' + f.q.replace(/[%_]/g, '') + '%'}`);
  const confirmed = sql<number>`(SELECT count(*)::int FROM session_participants p WHERE p.session_id = ${schema.openSessions.id} AND p.status = 'confirmed')`;
  return db().select({ s: schema.openSessions, venueName: schema.venues.name, venueSlug: schema.venues.slug, neighborhood: schema.venues.neighborhood, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt, sportName: schema.sports.nameFa, confirmed })
    .from(schema.openSessions).innerJoin(schema.venues, eq(schema.venues.id, schema.openSessions.venueId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.openSessions.slotId)).innerJoin(schema.sports, eq(schema.sports.id, schema.openSessions.sportId))
    .where(and(...conds)).orderBy(asc(schema.timeSlots.startsAt)).limit(60);
}

export async function listMySessions(userId: string) {
  return db().select({ s: schema.openSessions, status: schema.sessionParticipants.status, isHost: schema.sessionParticipants.isHost, venueName: schema.venues.name, startsAt: schema.timeSlots.startsAt, sportName: schema.sports.nameFa })
    .from(schema.sessionParticipants).innerJoin(schema.openSessions, eq(schema.openSessions.id, schema.sessionParticipants.sessionId))
    .innerJoin(schema.venues, eq(schema.venues.id, schema.openSessions.venueId)).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.openSessions.slotId))
    .innerJoin(schema.sports, eq(schema.sports.id, schema.openSessions.sportId))
    .where(and(eq(schema.sessionParticipants.userId, userId), inArray(schema.sessionParticipants.status, ['pending_payment', 'confirmed', 'attended', 'left']))).orderBy(asc(schema.timeSlots.startsAt));
}

/** Session detail. Invite-only sessions need the token (or being a participant). Payment info only for the host. */
export async function getSessionDetail(sessionId: string, viewerId: string | null, token?: string) {
  await settleStale(sessionId);
  const d = db();
  const [row] = await d.select({ s: schema.openSessions, venue: schema.venues, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt, sportName: schema.sports.nameFa })
    .from(schema.openSessions).innerJoin(schema.venues, eq(schema.venues.id, schema.openSessions.venueId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.openSessions.slotId)).innerJoin(schema.sports, eq(schema.sports.id, schema.openSessions.sportId))
    .where(eq(schema.openSessions.id, sessionId));
  if (!row) return null;
  const parts = await d.select({ p: schema.sessionParticipants, name: schema.users.displayName, avatar: schema.users.avatarUrl })
    .from(schema.sessionParticipants).innerJoin(schema.users, eq(schema.users.id, schema.sessionParticipants.userId))
    .where(eq(schema.sessionParticipants.sessionId, sessionId)).orderBy(asc(schema.sessionParticipants.joinedAt));
  const isHost = viewerId === row.s.hostUserId;
  const isMember = parts.some((x) => x.p.userId === viewerId && ['pending_payment', 'confirmed', 'attended'].includes(x.p.status));
  if (row.s.visibility === 'invite_only' && !isHost && !isMember && token !== row.s.inviteToken) return null;
  const ovrs = await d.select().from(schema.playerSportProfiles).where(and(eq(schema.playerSportProfiles.sportId, row.s.sportId), inArray(schema.playerSportProfiles.userId, parts.map((x) => x.p.userId))));
  const ovrBy = new Map(ovrs.map((o) => [o.userId, o.ovr]));
  const intents = isHost ? await d.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.reservationId, row.s.reservationId)) : [];
  const payBy = new Map(intents.map((i) => [i.participantId, i.status]));
  const visible = parts.filter((x) => x.p.status === 'confirmed' || x.p.status === 'attended' || (isHost && x.p.status === 'pending_payment'));
  return {
    session: { ...row.s, inviteToken: isHost ? row.s.inviteToken : undefined }, venue: row.venue, startsAt: row.startsAt, endsAt: row.endsAt, sportName: row.sportName,
    confirmedCount: parts.filter((x) => x.p.status === 'confirmed' || x.p.status === 'attended').length, isHost, isMember,
    waitlist: await waitlistInfo(viewerId, sessionId),
    myStatus: parts.find((x) => x.p.userId === viewerId)?.p.status ?? null,
    participants: visible.map((x) => ({ userId: x.p.userId, name: x.name, avatar: x.avatar, isHost: x.p.isHost, status: x.p.status, ovr: ovrBy.get(x.p.userId) ?? 50, payment: isHost ? (payBy.get(x.p.id) ?? null) : undefined })),
  };
}
export async function getSessionByToken(token: string) {
  const [s] = await db().select({ id: schema.openSessions.id }).from(schema.openSessions).where(eq(schema.openSessions.inviteToken, token));
  return s?.id ?? null;
}
