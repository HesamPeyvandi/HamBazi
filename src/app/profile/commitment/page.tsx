import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { getReliability, DELTAS } from '@/server/trust/reliability';
import { pendingRatings } from '@/server/trust/ratings';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'تعهد و تاریخچهٔ من' };
const LABEL = { attended: 'حضور در بازی', late_cancel: 'لغو دیرهنگام', no_show: 'غیبت' } as const;

export default async function CommitmentPage() {
  const u = await requireUser('/profile/commitment');
  const [r, pending] = await Promise.all([getReliability(u.id), pendingRatings(u.id)]);
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="text-2xl font-extrabold">تعهد و تاریخچهٔ من</h1>
      <section className="card mt-5 p-6"><div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <div className="rounded-xl bg-brand-50 p-4"><p className="text-sm text-ink-500">امتیاز تعهد</p><p className="text-3xl font-extrabold text-brand-700">{toFa(r.score)}</p></div>
        <div className="rounded-xl bg-page p-4"><p className="text-sm text-ink-500">حضور</p><p className="text-2xl font-extrabold">{toFa(r.attended)}</p></div>
        <div className="rounded-xl bg-page p-4"><p className="text-sm text-ink-500">غیبت</p><p className="text-2xl font-extrabold">{toFa(r.noShow)}</p></div>
        <div className="rounded-xl bg-page p-4"><p className="text-sm text-ink-500">لغو دیرهنگام</p><p className="text-2xl font-extrabold">{toFa(r.lateCancel)}</p></div></div>
        <p className="help mt-4">امتیاز از ۱۰۰ شروع می‌شود؛ هر حضور {toFa(1)}+ (حداکثر ۱۰۰)، لغو کمتر از ۲۴ ساعت مانده به بازی {toFa(5)}−، غیبت {toFa(15)}−. مبتدی بودن هرگز جریمه نمی‌شود؛ مهارت و تعهد جدا هستند.</p></section>
      {pending.length > 0 && <section className="card mt-5 p-6"><h2 className="section-title mb-3">منتظر امتیاز شما</h2><ul className="space-y-2">{pending.map((x) => <li key={x.rid}><Link className="block rounded-xl bg-page p-3 text-sm font-bold text-brand-700" href={`/rate/${x.rid}`}>{x.venue} · {formatJalaliDateTime(x.startsAt)}</Link></li>)}</ul></section>}
      <section className="card mt-5 p-6"><h2 className="section-title mb-3">تاریخچه</h2>
        {r.events.length === 0 ? <p className="text-sm text-ink-500">هنوز رویدادی ثبت نشده است.</p> : (
          <ul className="divide-y divide-line">{[...r.events].reverse().map((e) => <li key={e.id} className="flex justify-between py-3 text-sm"><span>{LABEL[e.type as keyof typeof LABEL]} · {formatJalaliDateTime(e.createdAt)}</span><b dir="ltr">{DELTAS[e.type as keyof typeof DELTAS] > 0 ? '+' : '−'}{toFa(Math.abs(e.delta))}</b></li>)}</ul>)}</section>
    </div>
  );
}
