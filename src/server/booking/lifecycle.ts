/**
 * Lifecycle rules: expiry of holds, session deadlines, cancellations, completion.
 * Every function runs inside a caller-provided transaction and is idempotent.
 * LOCK ORDER (to avoid deadlocks): time_slots row -> open_sessions row -> everything else.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { cancelOpenIntents, notify, notifyManagers, refundIntent, releaseSlot, succeededIntents, type Reservation, type Tx } from './core';
import { refundPercentFor, hoursUntil } from './money';

export type SessionRow = typeof schema.openSessions.$inferSelect;

export async function lockSlot(tx: Tx, slotId: string) {
  const [slot] = await tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.id, slotId)).for('update');
  return slot;
}
/** Locks slot then session (consistent order). Returns null when the session does not exist. */
export async function lockSession(tx: Tx, sessionId: string) {
  const [pre] = await tx.select({ slotId: schema.openSessions.slotId }).from(schema.openSessions).where(eq(schema.openSessions.id, sessionId));
  if (!pre) return null;
  await lockSlot(tx, pre.slotId);
  const [s] = await tx.select().from(schema.openSessions).where(eq(schema.openSessions.id, sessionId)).for('update');
  return s ?? null;
}

const inc = sql`${schema.reservations.version} + 1`;

export async function expireFullReservation(tx: Tx, r: Reservation) {
  await tx.update(schema.reservations).set({ status: 'expired', updatedAt: new Date(), version: inc })
    .where(and(eq(schema.reservations.id, r.id), eq(schema.reservations.status, 'awaiting_payment')));
  await cancelOpenIntents(tx, r.id);
  await releaseSlot(tx, r.slotId);
  await notify(tx, r.hostUserId, 'reservation_expired', 'مهلت پرداخت رزرو تمام شد', 'سانس دوباره آزاد شد. می‌توانید دوباره رزرو کنید.', '/reservations');
}

/** Expires stale holds on one slot. Call with the slot already locked. */
export async function expireStaleForSlot(tx: Tx, slotId: string, now = new Date()) {
  const stale = await tx.select({ r: schema.reservations }).from(schema.slotClaims)
    .innerJoin(schema.reservations, eq(schema.reservations.id, schema.slotClaims.reservationId))
    .where(and(eq(schema.slotClaims.slotId, slotId), eq(schema.slotClaims.status, 'held'), lt(schema.slotClaims.holdExpiresAt, now)));
  for (const { r } of stale) {
    if (r.mode === 'full') {
      if (r.status === 'awaiting_payment') await expireFullReservation(tx, r);
    } else {
      const [s] = await tx.select().from(schema.openSessions).where(eq(schema.openSessions.reservationId, r.id));
      if (s) await processSession(tx, s.id, now);
    }
  }
}

export interface CancelOpts { by: 'player' | 'venue' | 'system' | 'admin'; reason: string; status: 'cancelled' | 'expired'; hostRefundPercent?: number }

/** Cancels a whole open session: releases the slot, refunds every confirmed participant (simulated), notifies everyone. */
export async function cancelSessionInternal(tx: Tx, s: SessionRow, o: CancelOpts) {
  const parts = await tx.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, s.id));
  let refunded = 0;
  for (const p of parts) {
    if (p.status === 'pending_payment') {
      await cancelOpenIntents(tx, s.reservationId, p.id);
      await tx.update(schema.sessionParticipants).set({ status: 'expired', holdExpiresAt: null }).where(eq(schema.sessionParticipants.id, p.id));
    } else if (p.status === 'confirmed') {
      const pct = p.isHost && o.hostRefundPercent != null ? o.hostRefundPercent : 100;
      for (const i of await succeededIntents(tx, s.reservationId, p.id)) if (await refundIntent(tx, i, pct, o.reason)) refunded++;
      await tx.update(schema.sessionParticipants).set({ status: 'removed', holdExpiresAt: null }).where(eq(schema.sessionParticipants.id, p.id));
    }
  }
  await tx.update(schema.openSessions).set({ status: o.status, cancelReason: o.reason, version: sql`${schema.openSessions.version} + 1` }).where(eq(schema.openSessions.id, s.id));
  await tx.update(schema.reservations).set({ status: refunded ? 'refunded' : o.status, cancelReason: o.reason, cancelledBy: o.by, updatedAt: new Date(), version: inc })
    .where(eq(schema.reservations.id, s.reservationId));
  await releaseSlot(tx, s.slotId);

  const why: Record<string, string> = {
    target_not_met: 'ظرفیت سانس تا مهلت تعیین‌شده تکمیل نشد.', host_unpaid: 'میزبان در مهلت مقرر هزینهٔ خود را پرداخت نکرد.',
    host_cancelled: 'میزبان سانس را لغو کرد.', venue_cancelled: 'سالن این سانس را لغو کرد.',
  };
  for (const p of parts.filter((x) => x.status === 'confirmed' || x.status === 'pending_payment')) {
    await notify(tx, p.userId, 'session_cancelled', 'سانس لغو شد', `${why[o.reason] ?? 'سانس لغو شد.'}${refunded ? ' مبلغ پرداختی (شبیه‌سازی‌شده) بازگردانده شد.' : ''}`, `/sessions/${s.id}`);
  }
  await notifyManagers(tx, s.venueId, 'session_cancelled', 'یک سانس باز لغو شد', why[o.reason] ?? '', '/owner/reservations');
}

/** Applies every time-based rule to one session. Safe to call any time. */
export async function processSession(tx: Tx, sessionId: string, now = new Date()) {
  const s = await lockSession(tx, sessionId);
  if (!s || ['cancelled', 'expired', 'completed'].includes(s.status)) return;

  // 1. abandoned payment holds
  const stale = await tx.select().from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, s.id),
    eq(schema.sessionParticipants.status, 'pending_payment'), lt(schema.sessionParticipants.holdExpiresAt, now)));
  for (const p of stale) {
    await cancelOpenIntents(tx, s.reservationId, p.id);
    await tx.update(schema.sessionParticipants).set({ status: 'expired', holdExpiresAt: null }).where(eq(schema.sessionParticipants.id, p.id));
  }
  // 2. host never paid => session never opens
  if (s.status === 'collecting' && stale.some((p) => p.isHost)) {
    return cancelSessionInternal(tx, s, { by: 'system', reason: 'host_unpaid', status: 'expired' });
  }
  // 3. deadline reached without hitting the minimum
  if (s.status === 'collecting' && now >= s.joinDeadline) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sessionParticipants)
      .where(and(eq(schema.sessionParticipants.sessionId, s.id), eq(schema.sessionParticipants.status, 'confirmed')));
    if (n < s.minToConfirm) return cancelSessionInternal(tx, s, { by: 'system', reason: 'target_not_met', status: 'cancelled' });
  }
  // 4. finished
  if (s.status === 'confirmed') {
    const [slot] = await tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.id, s.slotId));
    if (slot && slot.endsAt <= now) {
      await tx.update(schema.openSessions).set({ status: 'completed' }).where(eq(schema.openSessions.id, s.id));
      await tx.update(schema.reservations).set({ status: 'completed', updatedAt: new Date(), version: inc }).where(eq(schema.reservations.id, s.reservationId));
    }
  }
}

/** Refund percent a player would get if they cancelled right now (uses the policy snapshot stored on the reservation). */
export function playerRefundPercent(r: Pick<Reservation, 'policySnapshot'>, slotStart: Date, now = new Date()) {
  return refundPercentFor(r.policySnapshot.tiers, hoursUntil(slotStart, now));
}

/**
 * Backstop sweeper (daily cron + opportunistic calls). Correctness never depends on it:
 * every read/write path evaluates expiry transactionally itself.
 */
export async function sweepDue(limit = 100) {
  const d = db();
  const now = new Date();
  const slots = await d.selectDistinct({ id: schema.slotClaims.slotId }).from(schema.slotClaims)
    .where(and(eq(schema.slotClaims.status, 'held'), lt(schema.slotClaims.holdExpiresAt, now))).limit(limit);
  for (const { id } of slots) {
    await d.transaction(async (tx) => { await lockSlot(tx, id); await expireStaleForSlot(tx, id, now); });
  }
  const sess = await d.execute<{ id: string }>(sql`
    SELECT s.id FROM open_sessions s JOIN time_slots t ON t.id = s.slot_id
    WHERE s.status IN ('collecting','confirmed') AND (
      (s.status = 'collecting' AND s.join_deadline < now()) OR t.ends_at < now() OR EXISTS (
        SELECT 1 FROM session_participants p WHERE p.session_id = s.id AND p.status = 'pending_payment' AND p.hold_expires_at < now()))
    LIMIT ${limit}`);
  for (const { id } of sess) await d.transaction((tx) => processSession(tx, id, now));
  const done = await d.execute<{ id: string }>(sql`
    UPDATE reservations r SET status = 'completed', updated_at = now(), version = r.version + 1
    FROM time_slots t WHERE t.id = r.slot_id AND r.mode = 'full' AND r.status = 'confirmed' AND t.ends_at < now() RETURNING r.id`);
  return { expiredSlots: slots.length, sessionsProcessed: sess.length, reservationsCompleted: done.length };
}
