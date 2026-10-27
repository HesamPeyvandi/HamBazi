import { RefreshCw, Check, SlidersHorizontal } from 'lucide-react';
import { FILTER_FACILITIES, FACILITIES } from '@/lib/facilities';
import type { VenueFilters } from '@/server/venues/queries';

export function FilterForm({ f, cities, sports, view, sort, dateRaw }: {
  f: VenueFilters; cities: { slug: string; nameFa: string }[]; sports: { key: string; nameFa: string }[];
  view: string; sort: string; dateRaw?: string;
}) {
  return (
    <form action="/venues" method="get" className="card p-5 text-sm" aria-label="فیلتر جستجو">
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="sort" value={sort} />
      {f.q && <input type="hidden" name="q" value={f.q} />}
      {dateRaw && <input type="hidden" name="date" value={dateRaw} />}
      {f.hour != null && <input type="hidden" name="hour" value={f.hour} />}
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold"><SlidersHorizontal className="h-5 w-5 text-brand-600" aria-hidden />فیلتر جستجو</h2>

      <label className="label" htmlFor="f-city">شهر</label>
      <select id="f-city" name="city" defaultValue={f.citySlug} className="field">
        {cities.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
      </select>

      <fieldset className="mt-5"><legend className="label">ورزش</legend>
        {sports.map((s) => (
          <label key={s.key} className="flex min-h-9 items-center gap-2"><input type="checkbox" name="sport" value={s.key} defaultChecked={f.sports?.includes(s.key)} className="checkbox" />{s.nameFa}</label>
        ))}
      </fieldset>

      <fieldset className="mt-5"><legend className="label">محدودهٔ قیمت (تومان / سانس)</legend>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="help" htmlFor="f-min">از</label><input id="f-min" name="min" inputMode="numeric" defaultValue={f.priceMin ?? ''} placeholder="۲۰۰,۰۰۰" className="field !min-h-11" dir="ltr" /></div>
          <div><label className="help" htmlFor="f-max">تا</label><input id="f-max" name="max" inputMode="numeric" defaultValue={f.priceMax ?? ''} placeholder="۵۰۰,۰۰۰" className="field !min-h-11" dir="ltr" /></div>
        </div>
      </fieldset>

      <fieldset className="mt-5"><legend className="label">امکانات سالن</legend>
        {FILTER_FACILITIES.map((k) => (
          <label key={k} className="flex min-h-9 items-center gap-2"><input type="checkbox" name="fac" value={k} defaultChecked={f.facilities?.includes(k)} className="checkbox" />{FACILITIES[k]}</label>
        ))}
      </fieldset>

      <fieldset className="mt-5"><legend className="label">امتیاز سالن</legend>
        {[{ v: '', t: 'همه' }, { v: '4', t: '۴ به بالا' }, { v: '3', t: '۳ به بالا' }].map((o) => (
          <label key={o.v} className="flex min-h-9 items-center gap-2"><input type="radio" name="rating" value={o.v} defaultChecked={(f.minRating ? String(f.minRating) : '') === o.v} className="checkbox" />{o.t}</label>
        ))}
      </fieldset>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button type="submit" className="btn btn-primary btn-sm"><Check className="h-4 w-4" aria-hidden />اعمال فیلترها</button>
        <a href={`/venues?city=${f.citySlug}&view=${view}`} className="btn btn-ghost btn-sm"><RefreshCw className="h-4 w-4" aria-hidden />پاک کردن</a>
      </div>
    </form>
  );
}
