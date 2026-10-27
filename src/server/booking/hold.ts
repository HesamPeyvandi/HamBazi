import { and, eq } from 'drizzle-orm';
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
