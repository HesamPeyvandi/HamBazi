import { requireRole } from '@/server/auth/rbac';
import { listPendingVenues } from '@/server/owner/venues';
import { reviewVenueAction } from '@/server/owner/actions';
import { EmptyState } from '@/components/ui/misc';
import { formatPhoneDisplay } from '@/lib/i18n/phone';

export const metadata = { title: 'تأیید سالن‌ها' };

export default async function AdminVenues({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireRole(['admin']);
  const rows = await listPendingVenues(u);
  const q = await searchParams;
  return (
    <div className="container-page max-w-3xl py-8"><h1 className="text-2xl font-extrabold">سالن‌های در انتظار تأیید</h1>
      {q.ok && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">تصمیم ثبت شد.</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mt-5">{rows.length === 0 ? <EmptyState title="سالنی در انتظار تأیید نیست" /> : (
        <ul className="space-y-4">{rows.map(({ v, owner, phone }) => (
          <li key={v.id} className="card p-5"><p className="text-lg font-extrabold">{v.name}</p><p className="text-sm text-ink-500">{v.address} · مالک: {owner || 'کاربر'} (<bdi>{formatPhoneDisplay(phone)}</bdi>)</p>
            <p className="mt-2 text-sm leading-7">{v.description}</p>
            <form className="mt-3 flex flex-wrap items-end gap-2"><div className="min-w-48 flex-1"><label className="label" htmlFor={`n-${v.id}`}>توضیح (برای رد کردن)</label><input id={`n-${v.id}`} name="note" className="field" /></div>
              <button formAction={reviewVenueAction.bind(null, v.id, 'approve')} className="btn btn-primary">تأیید و انتشار</button>
              <button formAction={reviewVenueAction.bind(null, v.id, 'reject')} className="btn btn-danger">رد / نیاز به اصلاح</button></form></li>))}</ul>)}</div></div>
  );
}
