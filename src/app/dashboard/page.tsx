import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { listMyReservations } from '@/server/booking/reservations';
import { listMySessions } from '@/server/booking/sessions';
import { listNotifications } from '@/server/booking/notifications';
import { pendingRatings } from '@/server/trust/ratings';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { RES_STATUS } from '@/lib/labels';

export const metadata = { title: 'داشبورد' };

export default async function Dashboard() {
  const u = await requireUser('/dashboard');
  const [rs, ss, ns, rate] = await Promise.all([listMyReservations(u.id), listMySessions(u.id), listNotifications(u.id), pendingRatings(u.id)]);
  const now = new Date();
  const upcoming = rs.filter((x) => x.endsAt > now && ['confirmed', 'awaiting_payment'].includes(x.r.status)).reverse().slice(0, 4);
  const upSessions = ss.filter((x) => x.startsAt > now && x.status !== 'left' && ['collecting', 'confirmed'].includes(x.s.status)).slice(0, 4);
  return (
    <div className="container-page max-w-4xl py-8">
      <h1 className="text-2xl font-extrabold">سلام {u.displayName || 'دوست عزیز'} 👋</h1>
      <div className="mt-5 flex flex-wrap gap-3"><Link className="btn btn-primary" href="/venues">رزرو سالن</Link><Link className="btn btn-outline" href="/sessions">سانس‌های باز</Link><Link className="btn btn-ghost" href="/reservations">همهٔ رزروها</Link></div>
      {rate.length > 0 && <section className="card mt-5 border-brand-600 p-5"><h2 className="section-title mb-3">بازی‌هایی که منتظر امتیاز شما هستند</h2><ul className="space-y-2">{rate.map((x) => <li key={x.rid}><Link className="block rounded-xl bg-brand-50 p-3 text-sm font-bold text-brand-700" href={`/rate/${x.rid}`}>{x.venue} · {formatJalaliDateTime(x.startsAt)}</Link></li>)}</ul></section>}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="card p-5"><h2 className="section-title mb-3">رزروهای پیش‌رو</h2>{upcoming.length === 0 ? <p className="text-sm text-ink-500">رزرو فعالی ندارید.</p> :
          <ul className="space-y-2">{upcoming.map((x) => <li key={x.r.id}><Link href={`/reservations/${x.r.id}`} className="block rounded-xl bg-page p-3 text-sm"><b>{x.venueName}</b> · {formatJalaliDateTime(x.startsAt)} <span className={`pill ${RES_STATUS[x.r.status].cls} ms-1`}>{RES_STATUS[x.r.status].label}</span></Link></li>)}</ul>}</section>
        <section className="card p-5"><h2 className="section-title mb-3">سانس‌های من</h2>{upSessions.length === 0 ? <p className="text-sm text-ink-500">در سانسی عضو نیستید.</p> :
          <ul className="space-y-2">{upSessions.map((x) => <li key={x.s.id}><Link href={`/sessions/${x.s.id}`} className="block rounded-xl bg-page p-3 text-sm"><b>{x.venueName}</b> · {formatJalaliDateTime(x.startsAt)}</Link></li>)}</ul>}</section>
        <section className="card p-5 md:col-span-2"><h2 className="section-title mb-3">آخرین اعلان‌ها</h2>{ns.length === 0 ? <p className="text-sm text-ink-500">اعلانی ندارید.</p> :
          <ul className="space-y-2">{ns.slice(0, 4).map((n) => <li key={n.id} className="rounded-xl bg-page p-3 text-sm"><b>{n.title}</b>{n.body && <span className="text-ink-500"> — {n.body}</span>}</li>)}</ul>}<Link href="/notifications" className="mt-3 inline-block text-sm font-bold text-brand-600">همهٔ اعلان‌ها</Link></section>
      </div>
    </div>
  );
}
