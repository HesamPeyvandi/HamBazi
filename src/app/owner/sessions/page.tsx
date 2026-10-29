import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listOwnerSessions } from '@/server/owner/venues';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';
import { SESSION_STATUS } from '@/lib/labels';

export const metadata = { title: 'سانس‌های باز سالن' };
export const dynamic = 'force-dynamic';

export default async function OwnerSessions() {
  const u = await requireRole(['venue_manager', 'admin']);
  const rows = await listOwnerSessions(u);
  return (
    <div className="container-page max-w-3xl py-8"><h1 className="text-2xl font-extrabold">سانس‌های باز سالن</h1>
      <p className="mt-1 text-sm text-ink-500">بازی‌های عمومی یا خصوصی که بازیکنان در سالن شما جمع می‌کنند.</p>
      <div className="mt-5">{rows.length === 0 ? <EmptyState title="سانس بازی در پیش نیست" /> : (
        <ul className="space-y-3">{rows.map((x) => (
          <li key={x.s.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-0 flex-1"><p className="font-bold">{x.venueName} — {x.sportName}</p>
              <p className="text-ink-500">{formatJalaliDateTime(x.startsAt)} · میزبان: {x.hostName || 'کاربر'} · {toFa(x.confirmed)} از {toFa(x.s.targetCount)} نفر تأیید‌شده{x.pending > 0 && ` · ${toFa(x.pending)} در انتظار پرداخت`} · حداقل {toFa(x.s.minToConfirm)}</p></div>
            <span className={`pill ${SESSION_STATUS[x.s.status]?.cls ?? ''}`}>{SESSION_STATUS[x.s.status]?.label ?? x.s.status}</span>
            <Link href={`/sessions/${x.s.id}`} className="btn btn-outline btn-sm">مشاهده</Link>
          </li>))}</ul>)}</div></div>
  );
}
