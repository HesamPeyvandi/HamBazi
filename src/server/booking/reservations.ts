import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { cancelOpenIntents, notify, notifyManagers, refundIntent, releaseSlot, succeededIntents, type Reservation, type Tx } from './core';
import { E } from './errors';
import { acquireSlot, loadBookable, policies } from './hold';
import { createIntent } from './intents';
import { cancelSessionInternal, lockSlot, lockSession, playerRefundPercent, processSession, sweepDue } from './lifecycle';
import { calcFee } from './money';

const bump = sql`${schema.reservations.version} + 1`;

/** Full-venue reservation with a server-enforced hold + the payment intent the host must complete. */
export async function createFullReservation(hostUserId: string, slotId: string) {
  return db().transaction(async (tx) => {
    const { slot, venue, venueSport } = await loadBookable(tx, slotId);
    if (!venueSport) throw E.notFound();
    const { fee, cancel } = await policies(tx);
    const feeAmount = calcFee(slot.price, fee);
    const [r] = await tx.insert(schema.reservations).values({
      hostUserId, venueId: venue.id, slotId, sportId: slot.sportId, mode: 'full', paymentArrangement: 'single', status: 'awaiting_payment',
      policyVersion: cancel.version, policySnapshot: { tiers: cancel.tiers }, feeSnapshot: fee,
      baseAmount: slot.price, feeAmount, totalAmount: slot.price + feeAmount, venuePayable: slot.price,
    }).returning();
    const { holdExpiresAt } = await acquireSlot(tx, slotId, r.id);
    await tx.update(schema.reservations).set({ holdExpiresAt }).where(eq(schema.reservations.id, r.id));
    const intent = await createIntent(tx, { reservationId: r.id, payerUserId: hostUserId, base: slot.price, feeRule: fee, venuePayable: slot.price });
    return { reservationId: r.id, intentId: intent.id, holdExpiresAt };
  });
}

/** Player cancels own reservation. Refund % comes from the policy snapshot stored at booking time. */
export async function cancelReservationByPlayer(userId: string, reservationId: string, now = new Date()) {
  return db().transaction(async (tx) => {
    const [pre] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId));
    if (!pre || pre.hostUserId !== userId) throw E.notFound();
    if (pre.mode === 'open_session') {
      const [s] = await tx.select({ id: schema.openSessions.id }).from(schema.openSessions).where(eq(schema.openSessions.reservationId, pre.id));
      const locked = s && (await lockSession(tx, s.id));
      if (!locked || ['cancelled', 'expired', 'completed'].includes(locked.status)) throw E.badState();
      const [slot] = await tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.id, pre.slotId));
      const pct = playerRefundPercent(pre, slot.startsAt, now);
      await cancelSessionInternal(tx, locked, { by: 'player', reason: 'host_cancelled', status: 'cancelled', hostRefundPercent: pct });
      return { refundPercent: pct };
    }
    await lockSlot(tx, pre.slotId);
    const [r] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId)).for('update');
    if (!['awaiting_payment', 'confirmed'].includes(r.status)) throw E.badState();
    const [slot] = await tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.id, r.slotId));
    const pct = r.status === 'confirmed' ? playerRefundPercent(r, slot.startsAt, now) : 0;
    await finishCancel(tx, r, 'player', 'player_cancelled', pct);
    await notifyManagers(tx, r.venueId, 'reservation_cancelled', 'رزرو توسط بازیکن لغو شد', '', '/owner/reservations');
    return { refundPercent: pct };
  });
}

/** Venue cancels: always 100% refund. */
export async function cancelReservationByVenue(actor: { id: string; role: string }, reservationId: string) {
  return db().transaction(async (tx) => {
    const [pre] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId));
    if (!pre) throw E.notFound();
    const allowed = actor.role === 'admin' || (await tx.select().from(schema.venueManagers)
      .where(and(eq(schema.venueManagers.venueId, pre.venueId), eq(schema.venueManagers.userId, actor.id)))).length > 0;
    if (!allowed) throw E.notFound(); // do not reveal existence
    if (pre.mode === 'open_session') {
      const [s] = await tx.select({ id: schema.openSessions.id }).from(schema.openSessions).where(eq(schema.openSessions.reservationId, pre.id));
      const locked = s && (await lockSession(tx, s.id));
      if (!locked || ['cancelled', 'expired', 'completed'].includes(locked.status)) throw E.badState();
      await cancelSessionInternal(tx, locked, { by: 'venue', reason: 'venue_cancelled', status: 'cancelled' });
    } else {
      await lockSlot(tx, pre.slotId);
      const [r] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId)).for('update');
      if (!['awaiting_payment', 'confirmed'].includes(r.status)) throw E.badState();
      await finishCancel(tx, r, actor.role === 'admin' ? 'admin' : 'venue', 'venue_cancelled', 100);
      await notify(tx, r.hostUserId, 'reservation_cancelled', 'رزرو توسط سالن لغو شد', 'مبلغ پرداختی (شبیه‌سازی‌شده) به‌طور کامل بازگردانده شد.', `/reservations/${r.id}`);
    }
    await audit(actor.id, 'reservation.venue_cancel', 'reservation', reservationId, {});
  });
}

async function finishCancel(tx: Tx, r: Reservation, by: 'player' | 'venue' | 'admin', reason: string, pct: number) {
  await cancelOpenIntents(tx, r.id);
  let refunded = 0;
  for (const i of await succeededIntents(tx, r.id)) if (await refundIntent(tx, i, pct, reason)) refunded++;
  await tx.update(schema.reservations).set({ status: refunded ? 'refunded' : 'cancelled', cancelReason: reason, cancelledBy: by, updatedAt: new Date(), version: bump })
    .where(eq(schema.reservations.id, r.id));
  await releaseSlot(tx, r.slotId);
}

export async function listMyReservations(userId: string) {
  void sweepDue(20).catch(() => {});
  return db().select({ r: schema.reservations, venueName: schema.venues.name, venueSlug: schema.venues.slug, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt, sportName: schema.sports.nameFa })
    .from(schema.reservations)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId))
    .innerJoin(schema.sports, eq(schema.sports.id, schema.reservations.sportId))
    .where(eq(schema.reservations.hostUserId, userId)).orderBy(desc(schema.timeSlots.startsAt));
}

/** Detail is visible to the host only (and venue managers through the owner area). Always evaluates expiry first. */
export async function getMyReservation(userId: string, reservationId: string) {
  const d = db();
  const [pre] = await d.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId));
  if (!pre || pre.hostUserId !== userId) return null;
  await d.transaction(async (tx) => { await lockSlot(tx, pre.slotId); const { expireStaleForSlot } = await import('./lifecycle'); await expireStaleForSlot(tx, pre.slotId); });
  const [row] = await d.select({ r: schema.reservations, venueName: schema.venues.name, venueSlug: schema.venues.slug, address: schema.venues.address, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt, sportName: schema.sports.nameFa })
    .from(schema.reservations).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId)).innerJoin(schema.sports, eq(schema.sports.id, schema.reservations.sportId))
    .where(eq(schema.reservations.id, reservationId));
  const intents = await d.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.reservationId, reservationId));
  const refunds = intents.length ? await d.select().from(schema.refunds).where(sql`${schema.refunds.intentId} IN ${intents.map((i) => i.id)}`) : [];
  const [sess] = await d.select({ id: schema.openSessions.id }).from(schema.openSessions).where(eq(schema.openSessions.reservationId, reservationId));
  return { ...row, intents, refunds, sessionId: sess?.id ?? null };
}
export { processSession };
