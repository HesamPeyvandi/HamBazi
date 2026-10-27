import { describe, it, expect } from 'vitest';
import { toFa, normalizeDigits, parseIntInput, formatNumber, formatToman, formatDecimal } from '@/lib/i18n/digits';
import { normalizeIranMobile, formatPhoneDisplay, maskPhone } from '@/lib/i18n/phone';
import {
  toJalali, jalaliToUtc, tehranWallToUtc, formatJalaliShort, formatJalaliLong, formatTime,
  formatJalaliWithWeekday, isJalaliLeap, jalaliMonthLength,
} from '@/lib/i18n/jalali';

describe('digits', () => {
  it('converts to Persian digits', () => expect(toFa('Aa 0123456789')).toBe('Aa ۰۱۲۳۴۵۶۷۸۹'));
  it('normalizes Persian & Arabic-Indic digits', () => {
    expect(normalizeDigits('۰۹۱۲٣٤٥')).toBe('0912345');
    expect(normalizeDigits('۱٬۲۰۰')).toBe('1,200');
  });
  it('parses typed integers in any digit set', () => {
    expect(parseIntInput('۲۸۰٬۰۰۰')).toBe(280000);
    expect(parseIntInput('٢٥٠')).toBe(250);
    expect(parseIntInput('12a')).toBeNull();
  });
  it('formats numbers, toman and decimals', () => {
    expect(formatNumber(1250000)).toBe('۱,۲۵۰,۰۰۰');
    expect(formatToman(280000)).toBe('۲۸۰,۰۰۰ تومان');
    expect(formatDecimal(4.7)).toBe('۴٫۷');
    expect(formatNumber(0)).toBe('۰');
  });
});

describe('phone', () => {
  const canon = '+989123456789';
  it.each(['09123456789', '9123456789', '+989123456789', '00989123456789', '989123456789',
    '۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩', '0912 345 6789', '0912-345-6789'])('normalizes %s', (x) => {
    expect(normalizeIranMobile(x)).toBe(canon);
  });
  it.each(['', '0912345678', '021123456789', '+14155550123', '08123456789', 'abc', '091234567890'])(
    'rejects %s', (x) => expect(normalizeIranMobile(x)).toBeNull());
  it('formats display and mask', () => {
    expect(formatPhoneDisplay(canon)).toBe('۰۹۱۲ ۳۴۵ ۶۷۸۹');
    expect(maskPhone(canon)).toBe('+98912****89');
  });
});

describe('jalali', () => {
  it('converts known dates', () => {
    const d = jalaliToUtc(1404, 7, 25, 12, 0); // 25 Mehr 1404 = 17 Oct 2025
    expect(toJalali(d)).toMatchObject({ jy: 1404, jm: 7, jd: 25, h: 12, mi: 0 });
    expect(formatJalaliShort(d)).toBe('۱۴۰۴/۰۷/۲۵');
    expect(formatJalaliLong(d)).toBe('۲۵ مهر ۱۴۰۴');
    expect(formatTime(d)).toBe('۱۲:۰۰');
  });
  it('Nowruz boundary (1 Farvardin 1404 = 21 March 2025)', () => {
    const d = tehranWallToUtc(2025, 3, 21, 0, 0);
    expect(toJalali(d)).toMatchObject({ jy: 1404, jm: 1, jd: 1 });
    expect(toJalali(new Date(d.getTime() - 60_000))).toMatchObject({ jy: 1403, jm: 12, jd: 30 });
  });
  it('month and year boundaries & leap years', () => {
    expect(jalaliMonthLength(1403, 12)).toBe(30); // 1403 is leap
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(isJalaliLeap(1403)).toBe(true);
    expect(isJalaliLeap(1404)).toBe(false);
    expect(jalaliMonthLength(1404, 6)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
    const end6 = jalaliToUtc(1404, 6, 31, 10, 0);
    const start7 = jalaliToUtc(1404, 7, 1, 10, 0);
    expect(start7.getTime() - end6.getTime()).toBe(86400_000);
  });
  it('late-evening Tehran time stays on the Tehran day (UTC date differs)', () => {
    const d = jalaliToUtc(1404, 7, 25, 23, 30); // 20:00 UTC same day
    expect(toJalali(d)).toMatchObject({ jd: 25, h: 23, mi: 30 });
    const mid = jalaliToUtc(1404, 7, 26, 0, 15);
    expect(toJalali(mid)).toMatchObject({ jd: 26, h: 0, mi: 15 });
  });
  it('uses the tz database: historical DST (summer 2021 = UTC+4:30, winter = +3:30; none since 2022)', () => {
    expect(tehranWallToUtc(2021, 7, 1, 12, 0).toISOString()).toBe('2021-07-01T07:30:00.000Z');
    expect(tehranWallToUtc(2021, 1, 15, 12, 0).toISOString()).toBe('2021-01-15T08:30:00.000Z');
    expect(tehranWallToUtc(2024, 7, 1, 12, 0).toISOString()).toBe('2024-07-01T08:30:00.000Z');
  });
  it('weekday names follow the Iranian week', () => {
    const fri = jalaliToUtc(1404, 7, 25, 12); // Friday
    expect(formatJalaliWithWeekday(fri)).toBe('جمعه ۲۵ مهر');
  });
});
