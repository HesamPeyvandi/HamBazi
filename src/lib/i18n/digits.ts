const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** Canonical -> Persian digits. Only for user-visible output. */
export function toFa(value: string | number | bigint): string {
  return String(value).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

/** Persian / Arabic-Indic digits -> ASCII digits. Use on every numeric input. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[٬،]/g, ',')
    .replace(/٫/g, '.');
}

/** Parse a user-typed integer (accepts fa/ar digits and separators). */
export function parseIntInput(input: string): number | null {
  const s = normalizeDigits(input).replace(/[,\s_]/g, '');
  return /^-?\d+$/.test(s) ? Number(s) : null;
}

/** 1250000 -> ۱,۲۵۰,۰۰۰ */
export function formatNumber(n: number): string {
  const sign = n < 0 ? '-' : '';
  const grouped = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return toFa(sign + grouped);
}

/** Toman integer -> "۲۸۰,۰۰۰ تومان". Money is always integer toman. */
export function formatToman(amount: number): string {
  return `${formatNumber(amount)} تومان`;
}

/** Ratings: 4.7 -> ۴٫۷ (Persian decimal separator) */
export function formatDecimal(n: number, digits = 1): string {
  return toFa(n.toFixed(digits)).replace('.', '٫');
}
