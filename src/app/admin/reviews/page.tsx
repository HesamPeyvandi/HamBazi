import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listReviewsAdmin } from '@/server/admin/oversight';
import { setReviewHiddenAction } from '@/server/admin/actions';
import { AdminNav } from '@/components/layout/AdminNav';
import { EmptyState, Pagination, Stars } from '@/components/ui/misc';
import { formatJalaliShort } from '@/lib/i18n/jalali';

export const metadata = { title: 'نظارت بر نظرات' };
export const dynamic = 'force-dynamic';

export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ hidden?: string; page?: string; ok?: string; err?: string }> }) {
  const u = await requireRole(['admin']); const q = await searchParams;
  const hidden = q.hidden === '1'; const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const data = await listReviewsAdmin(u, { hidden, page });
  const href = (p: number) => `/admin/reviews?${hidden ? 'hidden=1&' : ''}page=${p}`;
  return (
    <div className="container-page max-w-4xl py-8"><h1 className="mb-4 text-2xl font-extrabold">نظارت بر نظرات سالن‌ها</h1><AdminNav current="/admin/reviews" />
      {q.ok && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">انجام شد؛ امتیاز سالن دوباره محاسبه شد.</p>}
      {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mb-3 flex gap-2 text-sm">
        <Link href="/admin/reviews" className={`rounded-full px-4 py-1.5 font-bold ${!hidden ? 'bg-ink-900 text-white' : 'border border-line bg-white'}`}>نمایان</Link>
        <Link href="/admin/reviews?hidden=1" className={`rounded-full px-4 py-1.5 font-bold ${hidden ? 'bg-ink-900 text-white' : 'border border-line bg-white'}`}>پنهان‌شده</Link></div>
      {data.rows.length === 0 ? <EmptyState title="نظری نیست" /> : (
        <ul className="space-y-3">{data.rows.map(({ r, venue, name }) => (
          <li key={r.id} className="card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{venue} <span className="text-sm font-normal text-ink-500">· {name || 'کاربر'} · {formatJalaliShort(r.createdAt)}</span></p><Stars value={r.rating} /></div>
            {r.comment && <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-7">{r.comment}</p>}
            <form action={setReviewHiddenAction.bind(null, r.id, !hidden)} className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1"><label className="label" htmlFor={`n-${r.id}`}>توضیح (برای لاگ)</label><input id={`n-${r.id}`} name="note" className="field" maxLength={300} /></div>
              <button className={`btn btn-sm ${hidden ? 'btn-outline' : 'btn-danger'}`}>{hidden ? 'بازگردانی نظر' : 'پنهان‌کردن نظر'}</button></form></li>))}</ul>)}
      <div className="mt-4"><Pagination page={data.page} total={data.total} pageSize={15} hrefFor={href} /></div>
    </div>
  );
}
