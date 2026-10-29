import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listReservationsAdmin, listSessionsAdmin } from '@/server/admin/oversight';
import { adminCancelReservationAction } from '@/server/admin/actions';
import { AdminNav } from '@/components/layout/AdminNav';
import { EmptyState, Pagination } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { formatToman, toFa } from '@/lib/i18n/digits';
import { RES_STATUS, SESSION_STATUS } from '@/lib/labels';

export const metadata = { title: 'نظارت بر سانس‌ها و رزروها' };
export const dynamic = 'force-dynamic';

export default async function AdminSessions({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; page?: string; ok?: string; err?: string }> }) {
  const u = await requireRole(['admin']); const q = await searchParams;
  const view = q.view === 'reservations' ? 'reservations' : 'sessions'; const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const href = (over: Record<string, string | number | undefined>) => { const p = new URLSearchParams(); const b = { view, status: q.status, ...over }; for (const [k, v] of Object.entries(b)) if (v) p.set(k, String(v)); return `/admin/sessions?${p}`; };
  const data = view === 'sessions' ? await listSessionsAdmin(u, { status: q.status, page }) : await listReservationsAdmin(u, { status: q.status, page });
  const statuses = view === 'sessions' ? SESSION_STATUS : RES_STATUS;
  return (
    <div className="container-page max-w-5xl py-8"><h1 className="mb-4 text-2xl font-extrabold">نظارت بر سانس‌ها و رزروها</h1><AdminNav current="/admin/sessions" />
      {q.ok && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">انجام شد.</p>}
      {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {(['sessions', 'reservations'] as const).map((v) => <Link key={v} href={`/admin/sessions?view=${v}`} className={`rounded-full px-4 py-1.5 font-bold ${view === v ? 'bg-ink-900 text-white' : 'border border-line bg-white'}`}>{v === 'sessions' ? 'سانس‌های باز' : 'همهٔ رزروها'}</Link>)}
        <span className="mx-2 text-ink-300">|</span>
        <Link href={href({ status: undefined, page: 1 })} className={`rounded-full px-3 py-1.5 ${!q.status ? 'bg-brand-600 text-white' : 'border border-line bg-white'}`}>همه</Link>
        {Object.entries(statuses).map(([k, s]) => <Link key={k} href={href({ status: k, page: 1 })} className={`rounded-full px-3 py-1.5 ${q.status === k ? 'bg-brand-600 text-white' : 'border border-line bg-white'}`}>{s.label}</Link>)}
      </div>
      {data.rows.length === 0 ? <EmptyState title="موردی پیدا نشد" /> : view === 'sessions' ? (
        <ul className="space-y-2">{(data as Awaited<ReturnType<typeof listSessionsAdmin>>).rows.map((x) => (
          <li key={x.s.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-0 flex-1"><p className="font-bold"><Link className="hover:text-brand-600" href={`/sessions/${x.s.id}`}>{x.sport} · {x.venue}</Link></p>
              <p className="text-ink-500">{formatJalaliDateTime(x.startsAt)} · میزبان: {x.host || 'کاربر'} · {toFa(x.confirmed)} از {toFa(x.s.targetCount)} · سهم {formatToman(x.s.pricePerParticipant)}{x.waiting > 0 ? ` · ${toFa(x.waiting)} در لیست انتظار` : ''}</p></div>
            <span className={`pill ${SESSION_STATUS[x.s.status].cls}`}>{SESSION_STATUS[x.s.status].label}</span></li>))}</ul>
      ) : (
        <ul className="space-y-2">{(data as Awaited<ReturnType<typeof listReservationsAdmin>>).rows.map((x) => (
          <li key={x.r.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-0 flex-1"><p className="font-bold">{x.venue} · {x.r.mode === 'full' ? 'رزرو کامل' : 'سانس باز'}</p><p className="text-ink-500">{formatJalaliDateTime(x.startsAt)} · میزبان: {x.host || 'کاربر'} · مبلغ {formatToman(x.r.totalAmount)}</p></div>
            <span className={`pill ${RES_STATUS[x.r.status].cls}`}>{RES_STATUS[x.r.status].label}</span>
            {['awaiting_payment', 'confirmed'].includes(x.r.status) && <form action={adminCancelReservationAction.bind(null, x.r.id)}><button className="btn btn-danger btn-sm">لغو توسط مدیر</button></form>}</li>))}</ul>)}
      <div className="mt-4"><Pagination page={data.page} total={data.total} pageSize={15} hrefFor={(p) => href({ page: p })} /></div>
    </div>
  );
}
