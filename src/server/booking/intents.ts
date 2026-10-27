import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@/db/client';
import { env } from '@/server/env';
import { recordEvent, type Tx } from './core';
import { E } from './errors';
import { calcFee, type FeeRule } from './money';

/** Simulated payments exist ONLY outside production; anything else is refused (live gateways arrive in P7). */
export function activePaymentMode(): 'simulated' {
  const e = env();
  if (e.isProduction || e.paymentMode !== 'simulated') throw E.paymentsDisabled();
  return 'simulated';
}

export async function createIntent(tx: Tx, a: { reservationId: string; payerUserId: string; participantId?: string; base: number; feeRule: FeeRule; venuePayable: number }) {
  const mode = activePaymentMode();
  const fee = calcFee(a.base, a.feeRule);
  const [row] = await tx.insert(schema.paymentIntents).values({
    payerUserId: a.payerUserId, reservationId: a.reservationId, participantId: a.participantId,
    baseAmount: a.base, feeAmount: fee, amount: a.base + fee, venuePayable: a.venuePayable,
    mode, provider: 'simulated', status: 'created', idempotencyKey: randomUUID(), feeSnapshot: a.feeRule,
  }).returning();
  await recordEvent(tx, row.id, null, 'created', { amount: row.amount });
  return row;
}

export async function activeIntentFor(tx: Tx, reservationId: string, payerUserId: string) {
  const [i] = await tx.select().from(schema.paymentIntents).where(and(eq(schema.paymentIntents.reservationId, reservationId),
    eq(schema.paymentIntents.payerUserId, payerUserId), inArray(schema.paymentIntents.status, ['created', 'succeeded'])));
  return i;
}
