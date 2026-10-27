import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { notify, notifyManagers, recordEvent } from './core';
import { DomainError, E } from './errors';
import { expireStaleForSlot, lockSession, lockSlot, processSession } from './lifecycle';

type Result = { ok: true; already: boolean; reservationId: string; sessionId?: string } | { ok: false; error: DomainError };

/**
 * Completes a SIMULATED payment. Idempotent (double click / replay = no second effect).
 * Only the payer can settle their own intent; hold expiry is evaluated transactionally right here.
 */
export async function simulatePay(userId: string, intentId: string, now = new Date()): Promise<{ already: boolean; reservationId: string; sessionId?: string }> {
  const out: Result = await db().transaction(async (tx): Promise<Result> => {
    const [pre] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId));
    if (!pre || pre.payerUserId !== userId) throw E.notFound();
    if (pre.mode !== 'simulated') throw E.paymentsDisabled();
    const [res0] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, pre.reservationId));
    let sess = res0.mode === 'open_session' ? (await tx.select().from(schema.openSessions).where(eq(schema.openSessions.reservationId, res0.id)))[0] : undefined;
    // lock order: slot -> session -> intent
    if (sess) await lockSession(tx, sess.id); else await lockSlot(tx, res0.slotId);
    const [locked] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId)).for('update');
    if (locked.status === 'succeeded') return { ok: true, already: true, reservationId: res0.id, sessionId: sess?.id };
    if (locked.status !== 'created') return { ok: false, error: E.badState() };
    if (sess) await processSession(tx, sess.id, now); else await expireStaleForSlot(tx, res0.slotId, now);
    const [fresh] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId));
    if (fresh.status !== 'created') return { ok: false, error: E.holdExpired() }; // expiry committed above
    await tx.update(schema.paymentIntents).set({ status: 'succeeded', providerRef: `sim_${fresh.id.slice(0, 8)}`, updatedAt: now }).where(eq(schema.paymentIntents.id, intentId));
    await recordEvent(tx, intentId, 'created', 'succeeded', { simulated: true, amount: fresh.amount });

    if (!sess) {
      await tx.update(schema.reservations).set({ status: 'confirmed', holdExpiresAt: null, updatedAt: now, version: sql`${schema.reservations.version} + 1` }).where(eq(schema.reservations.id, res0.id));
      await tx.update(schema.slotClaims).set({ status: 'confirmed', holdExpiresAt: null }).where(and(eq(schema.slotClaims.reservationId, res0.id), eq(schema.slotClaims.status, 'held')));
      await tx.update(schema.timeSlots).set({ status: 'booked', version: sql`${schema.timeSlots.version} + 1` }).where(eq(schema.timeSlots.id, res0.slotId));
      await notify(tx, res0.hostUserId, 'reservation_confirmed', 'رزرو شما تأیید شد', 'پرداخت شبیه‌سازی‌شده با موفقیت ثبت شد.', `/reservations/${res0.id}`);
      await notifyManagers(tx, res0.venueId, 'reservation_new', 'رزرو جدید', 'یک رزرو جدید ثبت شد.', '/owner/reservations');
      return { ok: true, already: false, reservationId: res0.id };
    }
    const [p] = await tx.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.id, fresh.participantId!));
    await tx.update(schema.sessionParticipants).set({ status: 'confirmed', holdExpiresAt: null }).where(eq(schema.sessionParticipants.id, p.id));
    if (p.isHost) {
      await tx.update(schema.reservations).set({ status: 'confirmed', holdExpiresAt: null, updatedAt: now, version: sql`${schema.reservations.version} + 1` }).where(eq(schema.reservations.id, res0.id));
      await tx.update(schema.slotClaims).set({ status: 'confirmed', holdExpiresAt: null }).where(and(eq(schema.slotClaims.reservationId, res0.id), eq(schema.slotClaims.status, 'held')));
      await tx.update(schema.timeSlots).set({ status: 'booked', version: sql`${schema.timeSlots.version} + 1` }).where(eq(schema.timeSlots.id, res0.slotId));
      await notify(tx, res0.hostUserId, 'session_published', 'سانس باز شما منتشر شد', 'لینک دعوت را برای دوستانتان بفرستید.', `/sessions/${sess.id}`);
      await notifyManagers(tx, res0.venueId, 'reservation_new', 'سانس باز جدید', 'یک سانس باز برای سالن شما ایجاد شد.', '/owner/reservations');
    } else {
      await notify(tx, sess.hostUserId, 'participant_joined', 'بازیکن جدید به سانس پیوست', '', `/sessions/${sess.id}`);
    }
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, sess.id), eq(schema.sessionParticipants.status, 'confirmed')));
    [sess] = await tx.select().from(schema.openSessions).where(eq(schema.openSessions.id, sess.id));
    if (sess.status === 'collecting' && n >= sess.minToConfirm) {
      await tx.update(schema.openSessions).set({ status: 'confirmed', version: sql`${schema.openSessions.version} + 1` }).where(eq(schema.openSessions.id, sess.id));
      const all = await tx.select().from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, sess.id), eq(schema.sessionParticipants.status, 'confirmed')));
      for (const a of all) await notify(tx, a.userId, 'session_confirmed', 'سانس قطعی شد', 'به حداقل نفرات رسیدیم؛ سانس برگزار می‌شود.', `/sessions/${sess.id}`);
    }
    return { ok: true, already: false, reservationId: res0.id, sessionId: sess.id };
  });
  if (!out.ok) throw out.error;
  return out;
}

export async function getIntentForPayer(userId: string, intentId: string) {
  const [row] = await db().select({ i: schema.paymentIntents, r: schema.reservations, venueName: schema.venues.name, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt })
    .from(schema.paymentIntents).innerJoin(schema.reservations, eq(schema.reservations.id, schema.paymentIntents.reservationId))
    .innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId))
    .where(and(eq(schema.paymentIntents.id, intentId), eq(schema.paymentIntents.payerUserId, userId)));
  return row ?? null;
}
