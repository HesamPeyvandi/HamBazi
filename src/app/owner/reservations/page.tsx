import { requireRole } from '@/server/auth/rbac';
import { listOwnerReservations } from '@/server/owner/venues';
import { ownerCancelReservationAction } from '@/server/owner/actions';
import { EmptyState } from '@/components/ui/misc';
import { formatToman } from '@/lib/i18n/digits';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { RES_STATUS } from '@/lib/labels';

export const metadata = { title: 'رزروهای سالن' };

export default async function OwnerReservations({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireRole(['venue_manager', 'admin']);
  const rows = await listOwnerReservations(u);
  const q = await searchParams;
  return (
    <div className="container-page max-w-3xl py-8"><h1 className="text-2xl font-extrabold">رزروهای سالن</h1>
      {q.ok && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">رزرو لغو شد و بازگشت کامل وجه (شبیه‌سازی‌شده) ثبت شد.</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mt-5">{rows.length === 0 ? <EmptyState title="رزروی ثبت نشده است" /> : (
        <ul className="space-y-3">{rows.map((x) => (
          <li key={x.r.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-0 flex-1"><p className="font-bold">{x.venueName} — {x.sportName}</p><p className="text-ink-500">{formatJalaliDateTime(x.startsAt)} · میزبان: {x.hostName || 'کاربر'} · {x.r.mode === 'full' ? 'رزرو کامل' : 'سانس باز'} · {formatToman(x.r.venuePayable)}</p></div>
            <span className={`pill ${RES_STATUS[x.r.status].cls}`}>{RES_STATUS[x.r.status].label}</span>
            {['awaiting_payment', 'confirmed'].includes(x.r.status) && <form action={ownerCancelReservationAction.bind(null, x.r.id)}><button className="btn btn-danger btn-sm">لغو توسط سالن</button></form>}
          </li>))}</ul>)}</div></div>
  );
}
