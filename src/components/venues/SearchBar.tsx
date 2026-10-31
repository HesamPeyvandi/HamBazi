import { MapPin, Trophy, Clock, Search, ChevronDown } from 'lucide-react';
import { JalaliDatePicker } from '@/components/forms/JalaliDatePicker';
import { toFa } from '@/lib/i18n/digits';

export const HOURS = [16, 17, 19, 20, 22];
export const HOUR_OPTIONS = [16, 17, 19, 20, 21, 22];

/** One field: small caption on top, then ONE row holding value + chevron + icon, so icon, text and chevron share a horizontal line. */
function Cell({ caption, icon, chevron, children }: { caption: string; icon: React.ReactNode; chevron?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 flex-col justify-center rounded-xl border border-line bg-white px-3 py-1.5 sm:rounded-none sm:border-0 sm:border-e sm:last:border-e-0">
      <span className="block text-[0.7rem] leading-4 text-ink-500">{caption}</span>
      <span className="flex items-center gap-2">
        {children}
        {chevron && <ChevronDown className="pointer-events-none h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
        <span className="shrink-0 text-ink-500">{icon}</span>
      </span>
    </div>
  );
}
const SELECT = 'h-7 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-sm font-semibold leading-7 focus:outline-none';

export function SearchBar({ cities, sports, values }: {
  cities: { slug: string; nameFa: string }[]; sports: { key: string; nameFa: string }[];
  values?: { city?: string; sport?: string; date?: string; hour?: string };
}) {
  return (
    <form action="/venues" method="get" role="search" aria-label="جستجوی سالن"
      className="grid gap-2 rounded-2xl bg-white p-2 text-ink-900 shadow-xl sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:gap-0">
      <Cell caption="شهر" chevron icon={<MapPin className="h-5 w-5" aria-hidden />}>
        <select name="city" aria-label="شهر" defaultValue={values?.city ?? cities[0]?.slug} className={SELECT}>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
        </select>
      </Cell>
      <Cell caption="ورزش" chevron icon={<Trophy className="h-5 w-5" aria-hidden />}>
        <select name="sport" aria-label="ورزش" defaultValue={values?.sport ?? ''} className={SELECT}>
          <option value="">همه ورزش‌ها</option>
          {sports.map((s) => <option key={s.key} value={s.key}>{s.nameFa}</option>)}
        </select>
      </Cell>
      <div className="flex min-h-14 flex-col justify-center rounded-xl border border-line bg-white px-3 py-1.5 sm:rounded-none sm:border-0 sm:border-e"><JalaliDatePicker name="date" label="تاریخ" defaultValue={values?.date} /></div>
      <Cell caption="ساعت شروع" chevron icon={<Clock className="h-5 w-5" aria-hidden />}>
        <select name="hour" aria-label="ساعت شروع" defaultValue={values?.hour ?? ''} className={SELECT}>
          <option value="">همه</option>
          {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{toFa(`${String(h).padStart(2, '0')}:00`)}</option>)}
        </select>
      </Cell>
      <button type="submit" className="btn btn-primary min-h-14 sm:col-span-2 lg:col-span-1 lg:ms-2 lg:px-8"><Search className="h-5 w-5" aria-hidden />جستجو</button>
    </form>
  );
}
