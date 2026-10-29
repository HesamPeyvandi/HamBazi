import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { DomainError, E } from './errors';
import { lockSession } from './lifecycle';
import { notify, recordEvent, type Tx } from './core';

export const MAX_WAITING = 20;
const ACTIVE = ['collecting', 'confirmed'];
const fa = (n: number) => n.toLocaleString('fa-IR');

/** Seats currently taken: confirmed players + payers whose hold is still running. */
async function taken(tx: Tx, sessionId: string, now: Date) {
  const rows = await tx.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId));
  return rows.filter((p) => p.status === 'confirmed' || (p.status === 'pending_payment' && p.holdExpiresAt && p.holdExpiresAt > now)).length;
}

/** Only for a FULL session that is still open for joining. Same eligibility as joining (invite link, skill range). */
export async function joinWaitlist(userId: string, sessionId: string, opts: { inviteToken?: string } = {}, now = new Date()) {
  return db().transaction(async (tx) => {
    const s = await lockSession(tx, sessionId);
    if (!s) throw E.notFound();
    if (!ACTIVE.includes(s.status)) throw E.badState();
    if (s.visibility === 'invite_only' && opts.inviteToken !== s.inviteToken && s.hostUserId !== userId) throw E.invite();
    if (now >= s.joinDeadline) throw E.deadline();
    const [mine] = await tx.select().from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, s.id), eq(schema.sessionParticipants.userId, userId)));
    if (mine && ['pending_payment', 'confirmed', 'attended'].includes(mine.status)) throw E.alreadyJoined();
    if ((await taken(tx, s.id, now)) < s.targetCount) throw new DomainError('not_full', 'این سانس هنوز جای خالی دارد؛ مستقیم بپیوندید.');
    const [p] = await tx.select().from(schema.playerSportProfiles).where(and(eq(schema.playerSportProfiles.userId, userId), eq(schema.playerSportProfiles.sportId, s.sportId)));
    const ovr = p?.ovr ?? 50;
    if (ovr < s.skillMin || ovr > s.skillMax) throw E.skill();
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sessionWaitlist).where(eq(schema.sessionWaitlist.sessionId, s.id));
    if (n >= MAX_WAITING) throw new DomainError('waitlist_full', `لیست انتظار این سانس تکمیل است (حداکثر ${fa(MAX_WAITING)} نفر).`);
    const r = await tx.insert(schema.sessionWaitlist).values({ sessionId: s.id, userId }).onConflictDoNothing().returning();
    if (!r.length) throw new DomainError('already_waiting', 'شما قبلاً در لیست انتظار این سانس هستید.');
    return { position: n + 1 };
  });
}

export async function leaveWaitlist(userId: string, sessionId: string) {
  await db().delete(schema.sessionWaitlist).where(and(eq(schema.sessionWaitlist.sessionId, sessionId), eq(schema.sessionWaitlist.userId, userId)));
}

export async function waitlistInfo(userId: string | null, sessionId: string) {
  const rows = await db().select().from(schema.sessionWaitlist).where(eq(schema.sessionWaitlist.sessionId, sessionId)).orderBy(asc(schema.sessionWaitlist.createdAt));
  const idx = userId ? rows.findIndex((r) => r.userId === userId) : -1;
  return { count: rows.length, position: idx >= 0 ? idx + 1 : null, notified: idx >= 0 && !!rows[idx].notifiedAt };
}

/** Called inside the transaction that freed a seat: tells the first waiters (one per free seat) that they may join now. */
export async function offerFreedSeats(tx: Tx, sessionId: string, now = new Date()) {
  const [s] = await tx.select().from(schema.openSessions).where(eq(schema.openSessions.id, sessionId));
  if (!s || !ACTIVE.includes(s.status) || now >= s.joinDeadline) return 0;
  const free = s.targetCount - (await taken(tx, sessionId, now));
  if (free <= 0) return 0;
  const waiting = await tx.select().from(schema.sessionWaitlist).where(and(eq(schema.sessionWaitlist.sessionId, sessionId), isNull(schema.sessionWaitlist.notifiedAt)))
    .orderBy(asc(schema.sessionWaitlist.createdAt)).limit(free);
  for (const w of waiting) {
    await tx.update(schema.sessionWaitlist).set({ notifiedAt: now }).where(and(eq(schema.sessionWaitlist.sessionId, sessionId), eq(schema.sessionWaitlist.userId, w.userId)));
    await notify(tx, w.userId, 'waitlist_spot', 'جای خالی شد!', 'در سانسی که منتظرش بودید جایی خالی شد؛ هرچه زودتر بپیوندید.', `/sessions/${sessionId}`);
  }
  return waiting.length;
}

export async function clearWaitlist(tx: Tx, sessionId: string, userId?: string) {
  await tx.delete(schema.sessionWaitlist).where(userId ? and(eq(schema.sessionWaitlist.sessionId, sessionId), eq(schema.sessionWaitlist.userId, userId)) : eq(schema.sessionWaitlist.sessionId, sessionId));
}

/**
 * A replacement has just paid for a seat. The earliest player who left late (partial refund) and has not been compensated yet
 * gets the rest of their money back, as a separate top-up row (the original refund row is never edited).
 */
export async function topUpReplacedLeaver(tx: Tx, sessionId: string, replacementUserId: string) {
  const row = await tx.execute<{ intent_id: string; paid: number; refunded: number; user_id: string; mode: 'simulated' | 'live' }>(sql`
    SELECT i.id AS intent_id, i.amount AS paid, r.amount AS refunded, p.user_id, i.mode
    FROM session_participants p
    JOIN open_sessions s ON s.id = p.session_id
    JOIN payment_intents i ON i.participant_id = p.id AND i.reservation_id = s.reservation_id
    JOIN refunds r ON r.intent_id = i.id AND r.reason = 'participant_left' AND r.percent < 100
    LEFT JOIN refund_topups t ON t.intent_id = i.id
    WHERE p.session_id = ${sessionId} AND p.status = 'left' AND p.user_id <> ${replacementUserId} AND t.id IS NULL
    ORDER BY r.created_at ASC LIMIT 1`);
  const x = row[0];
  if (!x) return null;
  const amount = x.paid - x.refunded;
  if (amount <= 0) return null;
  const ins = await tx.insert(schema.refundTopups).values({ intentId: x.intent_id, amount, mode: x.mode, reason: 'replacement_joined' }).onConflictDoNothing().returning();
  if (!ins.length) return null;
  await recordEvent(tx, x.intent_id, 'refunded', 'refunded', { topup: amount, reason: 'replacement_joined', simulated: x.mode === 'simulated' });
  await notify(tx, x.user_id, 'refund_topup', 'بازگشت وجه شما تکمیل شد', 'چون جای شما را بازیکن دیگری گرفت، مابه‌التفاوت مبلغ هم (شبیه‌سازی‌شده) بازگردانده شد.', '/reservations');
  return ins[0];
}
