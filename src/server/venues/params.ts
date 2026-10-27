import { z } from 'zod';
import { parseIntInput } from '@/lib/i18n/digits';
import { isValidJalaaliDate } from 'jalaali-js';
import type { VenueFilters, VenueSort } from './queries';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const SPORTS = ['futsal', 'volleyball'];
const FACS = ['parking', 'locker', 'shower', 'ac', 'cafe', 'internet'];
const SORTS: VenueSort[] = ['popular', 'rating', 'price_asc', 'price_desc'];

/** Untrusted query string -> validated filters. Anything invalid is dropped, never thrown. */
export function parseVenueParams(sp: SP): { filters: VenueFilters; view: 'list' | 'grid'; raw: { date?: string } } {
  const num = (v?: string) => { const n = v ? parseIntInput(v) : null; return n != null && n >= 0 && n <= 100_000_000 ? n : undefined; };
  const dateStr = one(sp.date);
  let date: VenueFilters['date'];
  const m = dateStr?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && isValidJalaaliDate(+m[1], +m[2], +m[3])) date = { jy: +m[1], jm: +m[2], jd: +m[3] };
  const hour = one(sp.hour) ? parseIntInput(one(sp.hour)!) : null;
  const sortRaw = one(sp.sort) as VenueSort;
  const rating = num(one(sp.rating));
  const page = num(one(sp.page));
  const sports = many(sp.sport).filter((s) => SPORTS.includes(s));
  const facilities = many(sp.fac).filter((f) => FACS.includes(f));
  return {
    filters: {
      citySlug: z.string().regex(/^[a-z0-9-]{1,40}$/).safeParse(one(sp.city)).data ?? 'semnan',
      q: one(sp.q)?.slice(0, 80) || undefined,
      sports: sports.length ? sports : undefined,
      priceMin: num(one(sp.min)), priceMax: num(one(sp.max)),
      facilities: facilities.length ? facilities : undefined,
      minRating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
      date, hour: hour != null && hour >= 0 && hour <= 23 ? hour : undefined,
      sort: SORTS.includes(sortRaw) ? sortRaw : 'popular',
      page: page && page > 0 && page < 1000 ? page : 1,
    },
    view: one(sp.view) === 'grid' ? 'grid' : 'list',
    raw: { date: date ? dateStr : undefined },
  };
}
