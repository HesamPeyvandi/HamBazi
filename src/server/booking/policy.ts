import { desc, lte } from 'drizzle-orm';
import { schema } from '@/db/client';
import type { Tx } from './core';
import { getSetting } from '../settings';

export async function activeFeePolicy(tx: Tx) {
  const [p] = await tx.select().from(schema.feePolicies).where(lte(schema.feePolicies.activeFrom, new Date())).orderBy(desc(schema.feePolicies.activeFrom)).limit(1);
  return p ? { percentBp: p.percentBp, minToman: p.minToman, payer: p.payer } : { percentBp: 500, minToman: 5000, payer: 'player' };
}
export async function activeCancellationPolicy(tx: Tx) {
  const [p] = await tx.select().from(schema.cancellationPolicies).where(lte(schema.cancellationPolicies.activeFrom, new Date())).orderBy(desc(schema.cancellationPolicies.version)).limit(1);
  if (!p) throw new Error('No cancellation policy configured');
  return p;
}
export const holdMinutes = () => getSetting('hold_minutes');
