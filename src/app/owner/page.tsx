import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { listOwnerVenues } from '@/server/owner/venues';
import { becomeManagerAction } from '@/server/owner/actions';
import { ownerStats } from '@/server/owner/stats';
import { RevenueChart } from '@/components/owner/RevenueChart';
import { formatToman, toFa } from '@/lib/i18n/digits';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'پنل مالک سالن' };
const ST: Record<string, [string, string]> = { draft: ['پیش‌نویس', 'pill-warn'], pending: ['در انتظار تأیید', 'pill-info'], published: ['منتشرشده', 'pill-green'], suspended: ['تعلیق', 'pill-danger'] };

const RES_ST: Record<string, string> = { confirmed: 'تأیید‌شده', completed: 'انجام‌شده', cancelled: 'لغو‌شده', refunded: 'بازگشت وجه' };
const RANGES = [7, 30, 90];

export default async function OwnerHome({ searchParams }: { searchParams: Promise<{ venue?: string; days?: string }> }) {
  const q = await searchParams;
  const u = await requireUser('/owner');
  if (u.role === 'player') return (
    <div className="container-page max-w-xl py-10"><EmptyState title="سالن ورزشی دارید؟" text="با فعال‌سازی پنل مالک می‌توانید سالن خود را ثبت کنید و سانس‌ها را مدیریت کنید."
      action={<form action={becomeManagerAction}><button className="btn btn-primary">فعال‌سازی پنل مالک</button></form>} /></div>);
  const venues = await listOwnerVenues(u);
  const days = RANGES.includes(Number(q.days)) ? Number(q.days) : 30;
  const venueId = venues.find((v) => v.id === q.venue)?.id ?? null;
  const stats = venues.length ? await ownerStats(u, venueId, days) : null;
  return (
    <div className="container-page max-w-5xl py-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">پنل مالک سالن</h1>
        <div className="flex flex-wrap gap-2"><Link href="/owner/reservations" className="btn btn-outline btn-sm">رزروها</Link><Link href="/owner/attendance" className="btn btn-outline btn-sm">حضور و غیاب</Link><Link href="/owner/reviews" className="btn btn-outline btn-sm">نظرات</Link>{u.role === 'admin' && <><Link href="/admin" className="btn btn-outline btn-sm">پنل ادمین</Link></>}<Link href="/owner/venues/new" className="btn btn-primary btn-sm">ثبت سالن جدید</Link></div></div>
      {stats && (
        <section className="mt-6" aria-labelledby="stats-t">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="stats-t" className="section-title">آمار و درآمد</h2>
            <form className="flex flex-wrap items-center gap-2" aria-label="فیلتر آمار">
              <label className="sr-only" htmlFor="f-venue">سالن</label>
              <select id="f-venue" name="venue" defaultValue={venueId ?? ''} className="field !w-auto"><option value="">همهٔ سالن‌ها</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              <label className="sr-only" htmlFor="f-days">بازه</label>
              <select id="f-days" name="days" defaultValue={String(days)} className="field !w-auto">{RANGES.map((d) => <option key={d} value={d}>{toFa(d)} روز گذشته</option>)}</select>
              <button className="btn btn-outline btn-sm">اعمال</button></form></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {([['درآمد سالن', formatToman(stats.revenue)], ['رزروهای قطعی', toFa(stats.bookings)], ['پرشدگی سانس‌ها', `${toFa(stats.occupancyPct)}٪`], ['امتیاز سالن', stats.ratingCount ? `${toFa(stats.avgRating.toFixed(1).replace('.', '٫'))} (${toFa(stats.ratingCount)} نظر)` : 'بدون نظر']] as const).map(([k, v]) => (
              <div key={k} className="card p-4"><dt className="text-sm text-ink-500">{k}</dt><dd className="mt-1 text-xl font-extrabold" data-stat={k}>{v}</dd></div>))}
          </dl>
          <p className="help mt-2">درآمد = سهم سالن از رزروهای قطعی در این بازه (کارمزد پلتفرم جدا است). لغوها: {toFa(stats.cancelled)}.</p>
          <div className="card mt-4 p-5"><RevenueChart series={stats.series} /></div>
          <h3 className="mt-6 font-bold">آخرین رزروها</h3>
          {stats.recent.length === 0 ? <p className="mt-2 text-sm text-ink-500">هنوز رزروی ثبت نشده است.</p> : (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white">{stats.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><b>{r.host || 'کاربر'}</b> · {r.venue} · {formatJalaliDateTime(r.startsAt)}</span><span className="flex items-center gap-2"><span className="pill pill-info">{RES_ST[r.status] ?? r.status}</span><span className="font-bold">{formatToman(r.amount)}</span></span></li>))}</ul>)}
        </section>)}
      <div className="mt-8"><h2 className="section-title mb-3">سالن‌های من</h2>{venues.length === 0 ? <EmptyState title="هنوز سالنی ثبت نکرده‌اید" action={<Link href="/owner/venues/new" className="btn btn-primary">ثبت اولین سالن</Link>} /> : (
        <ul className="space-y-3">{venues.map((v) => (
          <li key={v.id}><Link href={`/owner/venues/${v.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-brand-600"><div><p className="font-bold">{v.name}</p><p className="text-sm text-ink-500">{v.address}</p></div><span className={`pill ${ST[v.status][1]}`}>{ST[v.status][0]}</span></Link></li>))}</ul>)}</div>
    </div>
  );
}
