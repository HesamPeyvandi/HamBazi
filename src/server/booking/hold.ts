import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { schema } from '@/db/client';
import type { Tx } from './core';
import { E } from './errors';
import { expireStaleForSlot, lockSlot } from './lifecycle';
import { activeCancellationPolicy, activeFeePolicy, holdMinutes } from './policy';

export const MIN_LEAD_MINUTES = 30;

/**
 * Atomically takes the slot: locks the row, expires stale holds, verifies availability, inserts the claim.
 * The partial unique index on slot_claims is the final guard even if this logic had a bug.
 */
export async function acquireSlot(tx: Tx, slotId: string, reservationId: string, now = new Date()) {
  const slot = await lockSlot(tx, slotId);
  if (!slot) throw E.notFound();
  await expireStaleForSlot(tx, slotId, now);
  const [fresh] = await tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.id, slotId));
  if (fresh.status !== 'open') throw E.slotUnavailable();
  if (fresh.startsAt.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) throw E.tooLate();
  const holdExpiresAt = new Date(now.getTime() + (await holdMinutes()) * 60_000);
  await tx.insert(schema.slotClaims).values({ slotId, reservationId, status: 'held', holdExpiresAt });
  await tx.update(schema.timeSlots).set({ status: 'held', version: fresh.version + 1 }).where(eq(schema.timeSlots.id, slotId));
  return { slot: fresh, holdExpiresAt };
}

export async function loadBookable(tx: Tx, slotId: string) {
  const [row] = await tx.select({ slot: schema.timeSlots, venue: schema.venues }).from(schema.timeSlots)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.timeSlots.venueId)).where(eq(schema.timeSlots.id, slotId));
  if (!row || row.venue.status !== 'published') throw E.notFound();
  const [vs] = await tx.select().from(schema.venueSports).where(and(eq(schema.venueSports.venueId, row.venue.id), eq(schema.venueSports.sportId, row.slot.sportId)));
  return { ...row, venueSport: vs };
}
export async function policies(tx: Tx) {
  const [fee, cancel] = await Promise.all([activeFeePolicy(tx), activeCancellationPolicy(tx)]);
  return { fee, cancel };
}

export const MAX_ACTIVE_HOLDS = 3;
/** A user may hold only a few unpaid slots at once, so nobody can block every slot of a venue for 15 minutes at a time. */
export async function assertHoldCap(tx: Tx, userId: string, now = new Date()) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.reservations)
    .where(and(eq(schema.reservations.hostUserId, userId), eq(schema.reservations.status, 'awaiting_payment'), gt(schema.reservations.holdExpiresAt, now)));
  if (n >= MAX_ACTIVE_HOLDS) throw E.invalid('چند رزرو پرداخت‌نشده دارید. ابتدا آن‌ها را پرداخت یا لغو کنید و سپس دوباره تلاش کنید.');
}

/**
 * Idempotency safety net for double submits (slow network + a second tap/click).
 * If this user already holds this slot (same mode) and still owes a payment, the existing reservation + open intent is returned
 * instead of failing with "slot no longer available". The slot row lock serialises concurrent duplicates: the loser waits for
 * the winner to commit and then finds its hold here.
 */
export async function findExistingHold(tx: Tx, userId: string, slotId: string, mode: 'full' | 'open_session', now = new Date()) {
  await lockSlot(tx, slotId);
  const [r] = await tx.select().from(schema.reservations).where(and(
    eq(schema.reservations.hostUserId, userId), eq(schema.reservations.slotId, slotId), eq(schema.reservations.mode, mode),
    eq(schema.reservations.status, 'awaiting_payment'), gt(schema.reservations.holdExpiresAt, now)));
  if (!r) return null;
  const [intent] = await tx.select().from(schema.paymentIntents).where(and(
    eq(schema.paymentIntents.reservationId, r.id), eq(schema.paymentIntents.payerUserId, userId), eq(schema.paymentIntents.status, 'created')))
    .orderBy(desc(schema.paymentIntents.createdAt)).limit(1);
  return intent ? { reservation: r, intent } : null;
}
