import { normalizeDigits, toFa } from './digits';

/** Iranian mobile prefixes: 90..99 after the leading 9 (e.g. 912, 935, 990, 999). */
const MOBILE_RE = /^9\d{9}$/;

/**
 * Normalize any common Iranian mobile format to canonical "+989xxxxxxxxx".
 * Accepts fa/ar digits, spaces/dashes, leading 0, 98, +98, 0098. Returns null if invalid.
 */
export function normalizeIranMobile(input: string): string | null {
  let s = normalizeDigits(input).replace(/[\s\-().‎‏]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0098')) s = s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0')) s = s.slice(1);
  if (!MOBILE_RE.test(s)) return null;
  return '+98' + s;
}

/** "+989123456789" -> "۰۹۱۲ ۳۴۵ ۶۷۸۹" (display only, own phone only) */
export function formatPhoneDisplay(e164: string): string {
  const local = '0' + e164.slice(3);
  return toFa(`${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`);
}

/** Masked form for logs and any non-owner context. */
export function maskPhone(e164: string): string {
  return e164.slice(0, 6) + '****' + e164.slice(-2);
}
