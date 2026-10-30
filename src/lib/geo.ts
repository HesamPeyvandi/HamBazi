/** Iran bounding box (generous): rejects obviously wrong coordinates such as swapped lat/lng. */
export const IRAN_BOUNDS = { latMin: 24, latMax: 40.5, lngMin: 43.5, lngMax: 64 } as const;
export const DEFAULT_CENTER = { lat: 35.5769, lng: 53.392 }; // Semnan

export function validCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= IRAN_BOUNDS.latMin && lat <= IRAN_BOUNDS.latMax && lng >= IRAN_BOUNDS.lngMin && lng <= IRAN_BOUNDS.lngMax;
}

export interface NavApp { key: string; label: string; href: string; hint: string }
const f = (n: number) => n.toFixed(6);

/** Deep links that open the routing app (installed app via universal link, otherwise its website). */
export function navApps(lat: number, lng: number): NavApp[] {
  const ll = `${f(lat)},${f(lng)}`;
  return [
    { key: 'neshan', label: 'نشان', hint: 'مکان در نشان باز می‌شود', href: `https://nshn.ir/?lat=${f(lat)}&lng=${f(lng)}` },
    { key: 'balad', label: 'بلد', hint: 'مسیریابی در بلد', href: `https://balad.ir/route?destination=${ll}` },
    { key: 'waze', label: 'ویز', hint: 'مسیریابی در Waze', href: `https://waze.com/ul?ll=${ll}&navigate=yes` },
    { key: 'google', label: 'گوگل مپ', hint: 'مسیریابی در Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving` },
  ];
}
