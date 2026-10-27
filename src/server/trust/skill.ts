/** Skill blending (docs/03): per category skill = (w_self*self + sum(peer)) / (w_self + n_peer), w_self = 3. Scores on 0..100 scale. */
export const W_SELF = 3;
export type PeerScores = Record<string, { sum: number; n: number }>;

export function blendCategory(self: number | undefined, peer: { sum: number; n: number } | undefined): number {
  const s = self ?? 50;
  const p = peer ?? { sum: 0, n: 0 };
  return (W_SELF * s + p.sum) / (W_SELF + p.n);
}
export function computeOvr(categories: string[], selfScores: Record<string, number>, peer: PeerScores): number {
  if (!categories.length) return 50;
  const mean = categories.reduce((a, c) => a + blendCategory(selfScores[c], peer[c]), 0) / categories.length;
  return Math.max(0, Math.min(99, Math.round(mean)));
}
export const levelFor = (ovr: number) => (ovr < 45 ? 'beginner' : ovr < 75 ? 'intermediate' : 'pro');
