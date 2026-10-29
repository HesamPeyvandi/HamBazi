/** Stable colour per user (like Telegram): same id => same colour everywhere. Pure, no randomness. */
const PALETTE = [
  { bg: '#fde2e2', fg: '#b42318', name: '#c0392b' }, { bg: '#ffe9cc', fg: '#b45309', name: '#c2680a' },
  { bg: '#fef3c7', fg: '#8a6a00', name: '#a37a00' }, { bg: '#dcfce7', fg: '#15803d', name: '#1b8a43' },
  { bg: '#ccfbf1', fg: '#0f766e', name: '#12877d' }, { bg: '#dbeafe', fg: '#1d4ed8', name: '#2563c9' },
  { bg: '#e0e7ff', fg: '#4338ca', name: '#4f46c8' }, { bg: '#f3e8ff', fg: '#7e22ce', name: '#8b2fc9' },
  { bg: '#fce7f3', fg: '#be185d', name: '#c42a73' }, { bg: '#e2e8f0', fg: '#334155', name: '#475569' },
] as const;
export function identityColor(seed: string) {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return PALETTE[h % PALETTE.length];
}
