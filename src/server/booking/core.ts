import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { refundAmount } from './money';

export type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Reservation = typeof schema.reservations.$inferSelect;
export type Intent = typeof schema.paymentIntents.$inferSelect;

export async function notify(tx: Tx, userId: string, type: string, title: string, body = '', link?: string) {
  await tx.insert(schema.notifications).values({ userId, type, title, body, link });
}
export async function notifyManagers(tx: Tx, venueId: string, type: string, title: string, body = '', link?: string) {
  const rows = await tx.select({ id: schema.venueManagers.userId }).from(schema.venueManagers).where(eq(schema.venueManagers.venueId, venueId));
  for (const r of rows) await notify(tx, r.id, type, title, body, link);
}

export async function recordEvent(tx: Tx, intentId: string, from: string | null, to: string, payload?: unknown) {
  await tx.insert(schema.paymentEvents).values({ intentId, fromStatus: from, toStatus: to, payload: payload as never });
}

/** Releases active claims and re-opens the slot (if it is still in the future). */
export async function releaseSlot(tx: Tx, slotId: string) {
  await tx.update(schema.slotClaims).set({ status: 'released' })
    .where(and(eq(schema.slotClaims.slotId, slotId), inArray(schema.slotClaims.status, ['held', 'confirmed'])));
  await tx.update(schema.timeSlots).set({ status: 'open', version: sqlInc() })
    .where(and(eq(schema.timeSlots.id, slotId), inArray(schema.timeSlots.status, ['held', 'booked'])));
}
const sqlInc = () => sql`${schema.timeSlots.version} + 1`;

/** Cancels payment attempts that were never completed. */
export async function cancelOpenIntents(tx: Tx, reservationId: string, participantId?: string) {
  const conds = [eq(schema.paymentIntents.reservationId, reservationId), eq(schema.paymentIntents.status, 'created')];
  if (participantId) conds.push(eq(schema.paymentIntents.participantId, participantId));
  const rows = await tx.update(schema.paymentIntents).set({ status: 'cancelled', updatedAt: new Date() }).where(and(...conds)).returning();
  for (const r of rows) await recordEvent(tx, r.id, 'created', 'cancelled', { reason: 'abandoned' });
}

/**
 * Records a refund for one succeeded payment (one refund per payment, enforced by a unique constraint).
 * Simulated payments => a simulated state change only; nothing real is moved.
 */
export async function refundIntent(tx: Tx, intent: Intent, percent: number, reason: string) {
  if (percent <= 0 || intent.status !== 'succeeded') return null;
  const amount = refundAmount(intent.amount, percent);
  const [ref] = await tx.insert(schema.refunds).values({ intentId: intent.id, amount, percent, mode: intent.mode, reason, status: 'succeeded' })
    .onConflictDoNothing().returning();
  if (!ref) return null;
  await tx.update(schema.paymentIntents).set({ status: 'refunded', updatedAt: new Date() }).where(eq(schema.paymentIntents.id, intent.id));
  await recordEvent(tx, intent.id, 'succeeded', 'refunded', { amount, percent, reason, simulated: intent.mode === 'simulated' });
  return ref;
}

export async function succeededIntents(tx: Tx, reservationId: string, participantId?: string) {
  const conds = [eq(schema.paymentIntents.reservationId, reservationId), eq(schema.paymentIntents.status, 'succeeded')];
  if (participantId) conds.push(eq(schema.paymentIntents.participantId, participantId));
  return tx.select().from(schema.paymentIntents).where(and(...conds));
}
