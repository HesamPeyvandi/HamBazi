import { toJalaali, toGregorian, isLeapJalaaliYear, jalaaliMonthLength } from 'jalaali-js';
import { toFa } from './digits';

export const TEHRAN_TZ = 'Asia/Tehran';
export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
/** Index 0 = Saturday (شنبه), matching the Iranian week. */
export const JALALI_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TEHRAN_TZ, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
});

export interface WallTime { y: number; m: number; d: number; h: number; mi: number; weekdayJs: number }
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Gregorian wall-clock parts of an instant in Asia/Tehran (maintained tz database, no hardcoded offset). */
export function tehranParts(date: Date): WallTime {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, weekdayJs: WD[p.weekday] };
}

/** Offset (ms) of Asia/Tehran at a given instant. */
function offsetMs(date: Date): number {
  const t = tehranParts(date);
  const asUtc = Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

/** Tehran wall-clock (Gregorian) -> UTC instant. Handles historical DST via the tz database. */
export function tehranWallToUtc(y: number, m: number, d: number, h = 0, mi = 0): Date {
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let guess = new Date(naive - 3.5 * 3600_000);
  for (let i = 0; i < 3; i++) guess = new Date(naive - offsetMs(guess));
  return guess;
}

export interface JalaliDate { jy: number; jm: number; jd: number }

export function toJalali(date: Date): JalaliDate & { h: number; mi: number; weekdayIndex: number } {
  const t = tehranParts(date);
  const { jy, jm, jd } = toJalaali(t.y, t.m, t.d);
  return { jy, jm, jd, h: t.h, mi: t.mi, weekdayIndex: (t.weekdayJs + 1) % 7 };
}

export function jalaliToUtc(jy: number, jm: number, jd: number, h = 0, mi = 0): Date {
  const g = toGregorian(jy, jm, jd);
  return tehranWallToUtc(g.gy, g.gm, g.gd, h, mi);
}

export const isJalaliLeap = (jy: number) => isLeapJalaaliYear(jy);
export const jalaliMonthLength = (jy: number, jm: number) => jalaaliMonthLength(jy, jm);

const pad = (n: number) => String(n).padStart(2, '0');

/** ۱۴۰۴/۰۷/۲۵ */
export function formatJalaliShort(date: Date): string {
  const j = toJalali(date);
  return toFa(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);
}
/** ۲۵ مهر ۱۴۰۴ */
export function formatJalaliLong(date: Date): string {
  const j = toJalali(date);
  return toFa(`${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`);
}
/** جمعه ۲۶ اردیبهشت */
export function formatJalaliWithWeekday(date: Date): string {
  const j = toJalali(date);
  return toFa(`${JALALI_WEEKDAYS[j.weekdayIndex]} ${j.jd} ${JALALI_MONTHS[j.jm - 1]}`);
}
/** ۱۸:۳۰ */
export function formatTime(date: Date): string {
  const t = tehranParts(date);
  return toFa(`${pad(t.h)}:${pad(t.mi)}`);
}
export function formatJalaliDateTime(date: Date): string {
  return `${formatJalaliLong(date)}، ${formatTime(date)}`;
}
