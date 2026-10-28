import { formatToman, toFa } from '@/lib/i18n/digits';
import { formatJalaliShort } from '@/lib/i18n/jalali';

/** Server-rendered bar chart (no client JS). Bars flow with the document direction (RTL). */
export function RevenueChart({ series }: { series: { day: string; revenue: number; bookings: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const total = series.reduce((a, s) => a + s.revenue, 0);
  const label = (d: string) => formatJalaliShort(new Date(`${d}T12:00:00+03:30`));
  return (
    <figure>
      <div role="img" aria-label={`نمودار درآمد ${toFa(series.length)} روز گذشته؛ مجموع ${formatToman(total)}`} className="flex h-40 items-end gap-[2px]">
        {series.map((s) => (
          <div key={s.day} className="group relative flex h-full flex-1 items-end" title={`${label(s.day)} — ${formatToman(s.revenue)}`}>
            <div className={`w-full rounded-t ${s.revenue ? 'bg-gradient-to-t from-brand-600 to-accent' : 'bg-line'}`} style={{ height: `${s.revenue ? Math.max(4, (s.revenue / max) * 100) : 2}%` }} />
          </div>))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-ink-500"><span>{label(series[0].day)}</span><span>{label(series[series.length - 1].day)}</span></figcaption>
    </figure>
  );
}
