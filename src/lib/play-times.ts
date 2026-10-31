/** Preferred play times: several can be chosen. Stored comma-separated in `user_profiles.preferred_time` (single legacy values stay valid). */
export const PLAY_TIMES = [['morning', 'صبح'], ['afternoon', 'ظهر و عصر'], ['evening', 'عصر و شب'], ['night', 'آخر شب']] as const;
const KEYS: readonly string[] = PLAY_TIMES.map(([k]) => k);
export const PLAY_TIME_LABEL: Record<string, string> = Object.fromEntries(PLAY_TIMES);

export function parseTimes(v: string | null | undefined): string[] {
  return (v ?? '').split(',').map((x) => x.trim()).filter((x) => KEYS.includes(x)).filter((x, i, a) => a.indexOf(x) === i);
}
/** Keeps only valid keys in canonical order; null when nothing is chosen. */
export function serializeTimes(values: readonly string[]): string | null {
  const set = new Set(values);
  const out = KEYS.filter((k) => set.has(k));
  return out.length ? out.join(',') : null;
}
export function timesLabel(v: string | null | undefined): string {
  return parseTimes(v).map((k) => PLAY_TIME_LABEL[k]).join('، ');
}
