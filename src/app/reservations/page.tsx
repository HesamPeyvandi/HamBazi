import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { listMyReservations } from '@/server/booking/reservations';
import { listMySessions } from '@/server/booking/sessions';
import { EmptyState } from '@/components/ui/misc';
import { formatToman } from '@/lib/i18n/digits';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { RES_STATUS, SESSION_STATUS } from '@/lib/labels';

export const metadata = { title: 'رزروهای من' };

export default async function MyReservations() {
  const u = await requireUser('/reservations');
  const [rs, ss] = await Promise.all([listMyReservations(u.id), listMySessions(u.id)]);
  const hostedResIds = new Set(rs.filter((x) => x.r.mode === 'open_session').map((x) => x.r.id));
  void hostedResIds;
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-extrabold">رزروهای من</h1>
      <section className="mt-6" aria-labelledby="r-t"><h2 id="r-t" className="section-title mb-3">رزروها</h2>
        {rs.length === 0 ? <EmptyState title="هنوز رزروی ندارید" action={<Link className="btn btn-primary" href="/venues">پیدا کردن سالن</Link>} /> : (
          <ul className="space-y-3">{rs.map((x) => (
            <li key={x.r.id}><Link href={`/reservations/${x.r.id}`} className="card block p-4 hover:border-brand-600">
              <div className="flex items-center justify-between gap-2"><p className="font-bold">{x.venueName} — {x.sportName}</p><span className={`pill ${RES_STATUS[x.r.status].cls}`}>{RES_STATUS[x.r.status].label}</span></div>
              <p className="mt-1 text-sm text-ink-500">{formatJalaliDateTime(x.startsAt)} · {x.r.mode === 'full' ? 'رزرو کامل' : 'سانس باز (میزبان)'} · {formatToman(x.r.totalAmount)}</p>
            </Link></li>))}</ul>)}
      </section>
      <section className="mt-8" aria-labelledby="s-t"><h2 id="s-t" className="section-title mb-3">سانس‌هایی که در آن‌ها هستم</h2>
        {ss.length === 0 ? <p className="text-ink-500">به سانسی نپیوسته‌اید.</p> : (
          <ul className="space-y-3">{ss.map((x) => (
            <li key={x.s.id}><Link href={`/sessions/${x.s.id}`} className="card block p-4 hover:border-brand-600">
              <div className="flex items-center justify-between gap-2"><p className="font-bold">{x.venueName} — {x.sportName}{x.isHost ? ' (میزبان)' : ''}</p><span className={`pill ${SESSION_STATUS[x.s.status].cls}`}>{SESSION_STATUS[x.s.status].label}</span></div>
              <p className="mt-1 text-sm text-ink-500">{formatJalaliDateTime(x.startsAt)}</p></Link></li>))}</ul>)}
      </section>
    </div>
  );
}
