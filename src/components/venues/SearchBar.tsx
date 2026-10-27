import { MapPin, Trophy, Clock, Search, ChevronDown } from 'lucide-react';
import { JalaliDatePicker } from '@/components/forms/JalaliDatePicker';
import { toFa } from '@/lib/i18n/digits';

export const HOURS = [16, 17, 19, 20, 22];
export const HOUR_OPTIONS = [16, 17, 19, 20, 21, 22];

function Cell({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="relative flex min-h-14 items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 sm:border-0 sm:border-e sm:rounded-none sm:last:border-e-0">{children}{icon}</div>;
}

export function SearchBar({ cities, sports, values }: {
  cities: { slug: string; nameFa: string }[]; sports: { key: string; nameFa: string }[];
  values?: { city?: string; sport?: string; date?: string; hour?: string };
}) {
  return (
    <form action="/venues" method="get" role="search" aria-label="جستجوی سالن"
      className="grid gap-2 rounded-2xl bg-white p-2 text-ink-900 shadow-xl sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:gap-0">
      <Cell icon={<MapPin className="h-5 w-5 text-ink-500" aria-hidden />}>
        <label className="min-w-0 flex-1"><span className="block text-[0.7rem] text-ink-500">شهر</span>
          <select name="city" defaultValue={values?.city ?? cities[0]?.slug} className="w-full appearance-none bg-transparent text-sm font-semibold focus:outline-none">
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
          </select></label>
        <ChevronDown className="pointer-events-none absolute end-9 h-4 w-4 text-ink-400" aria-hidden />
      </Cell>
      <Cell icon={<Trophy className="h-5 w-5 text-ink-500" aria-hidden />}>
        <label className="min-w-0 flex-1"><span className="block text-[0.7rem] text-ink-500">ورزش</span>
          <select name="sport" defaultValue={values?.sport ?? ''} className="w-full appearance-none bg-transparent text-sm font-semibold focus:outline-none">
            <option value="">همه ورزش‌ها</option>
            {sports.map((s) => <option key={s.key} value={s.key}>{s.nameFa}</option>)}
          </select></label>
      </Cell>
      <Cell><div className="flex-1"><JalaliDatePicker name="date" label="تاریخ" defaultValue={values?.date} /></div></Cell>
      <Cell icon={<Clock className="h-5 w-5 text-ink-500" aria-hidden />}>
        <label className="min-w-0 flex-1"><span className="block text-[0.7rem] text-ink-500">ساعت شروع</span>
          <select name="hour" defaultValue={values?.hour ?? ''} className="w-full appearance-none bg-transparent text-sm font-semibold focus:outline-none">
            <option value="">همه</option>
            {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{toFa(`${String(h).padStart(2, '0')}:00`)}</option>)}
          </select></label>
      </Cell>
      <button type="submit" className="btn btn-primary min-h-14 sm:col-span-2 lg:col-span-1 lg:ms-2 lg:px-8"><Search className="h-5 w-5" aria-hidden />جستجو</button>
    </form>
  );
}
