import { describe, it, expect } from 'vitest';
import { parseVenueParams } from '@/server/venues/params';

describe('venue query params (untrusted input)', () => {
  it('defaults to Semnan, popular sort, page 1, list view', () => {
    const { filters, view } = parseVenueParams({});
    expect(filters).toMatchObject({ citySlug: 'semnan', sort: 'popular', page: 1 });
    expect(view).toBe('list');
  });
  it('accepts Persian digits for prices and rejects garbage', () => {
    expect(parseVenueParams({ min: '۲۰۰٬۰۰۰', max: '۵۰۰۰۰۰' }).filters).toMatchObject({ priceMin: 200000, priceMax: 500000 });
    expect(parseVenueParams({ min: 'abc', max: '-5' }).filters.priceMin).toBeUndefined();
  });
  it('validates Jalali dates and hours', () => {
    expect(parseVenueParams({ date: '1404-07-25' }).filters.date).toEqual({ jy: 1404, jm: 7, jd: 25 });
    expect(parseVenueParams({ date: '1404-12-30' }).filters.date).toBeUndefined(); // 1404 is not leap
    expect(parseVenueParams({ date: '1403-12-30' }).filters.date).toBeDefined();
    expect(parseVenueParams({ date: 'x' }).filters.date).toBeUndefined();
    expect(parseVenueParams({ hour: '19' }).filters.hour).toBe(19);
    expect(parseVenueParams({ hour: '99' }).filters.hour).toBeUndefined();
  });
  it('whitelists sports, facilities, sort and city slug', () => {
    const f = parseVenueParams({ sport: ['futsal', 'x'], fac: ['parking', "'; --"], sort: 'evil', city: 'a b!' }).filters;
    expect(f.sports).toEqual(['futsal']);
    expect(f.facilities).toEqual(['parking']);
    expect(f.sort).toBe('popular');
    expect(f.citySlug).toBe('semnan');
  });
  it('bounds paging', () => {
    expect(parseVenueParams({ page: '0' }).filters.page).toBe(1);
    expect(parseVenueParams({ page: '999999' }).filters.page).toBe(1);
    expect(parseVenueParams({ page: '3' }).filters.page).toBe(3);
  });
});
