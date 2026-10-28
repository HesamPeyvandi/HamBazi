/** All money is integer toman. Rounding rules are documented here and tested. */
export interface FeeRule { percentBp: number; minToman: number; payer?: string }
export interface Tier { minHoursBefore: number; refundPercent: number }

/** Service fee = max(minToman, ceil(base * bp / 10000 to the next 10 toman)). */
export function calcFee(base: number, rule: FeeRule): number {
  if (!Number.isInteger(base) || base < 0) throw new Error('base must be a non-negative integer');
  const pct = Math.ceil((base * rule.percentBp) / (10000 * 10)) * 10;
  return Math.max(rule.minToman, pct);
}

/**
 * Automatic split: every one of `players` pays the same share = slot price / players, rounded UP to the next
 * 1,000 toman so the venue is never underpaid. The (small) rounding surplus stays with the venue and is shown
 * to the user before they commit. The service fee is charged on top, per person.
 */
export function splitShare(slotPrice: number, players: number): number {
  if (!Number.isInteger(players) || players < 2) throw new Error('players must be an integer >= 2');
  return Math.ceil(slotPrice / players / 1000) * 1000;
}

/** Refund percent for a cancellation `hoursBefore` the start. Tiers: first tier whose minHoursBefore <= hoursBefore. After the start => 0. */
export function refundPercentFor(tiers: Tier[], hoursBefore: number): number {
  if (hoursBefore < 0) return 0;
  const sorted = [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  return sorted.find((t) => hoursBefore >= t.minHoursBefore)?.refundPercent ?? 0;
}

export const refundAmount = (paid: number, percent: number) => Math.floor((paid * percent) / 100);
export const hoursUntil = (when: Date, now = new Date()) => (when.getTime() - now.getTime()) / 3_600_000;
