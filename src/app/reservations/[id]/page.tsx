import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { getMyReservation } from '@/server/booking/reservations';
import { playerRefundPercent } from '@/server/booking/lifecycle';
import { cancelReservationAction } from '@/server/booking/actions';
import { formatToman, toFa } from '@/lib/i18n/digits';
import { formatJalaliWithWeekday, formatTime, formatJalaliDateTime } from '@/lib/i18n/jalali';
import { PAY_STATUS, REFUND_REASON, RES_STATUS } from '@/lib/labels';

export const metadata = { title: 'جزئیات رزرو' };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function ReservationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; pct?: string; err?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await requireUser(`/reservations/${id}`);
  const d = await getMyReservation(u.id, id);
  if (!d) notFound();
  const q = await searchParams;
  const { r } = d;
  const st = RES_STATUS[r.status];
  const pct = playerRefundPercent(r, d.startsAt);
  const payable = ['awaiting_payment', 'confirmed'].includes(r.status) && d.endsAt > new Date();
  const pendingIntent = d.intents.find((i) => i.status === 'created');
  return (
    <div className="container-page max-w-2xl py-8">
      {q.ok === 'paid' && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 font-semibold text-brand-700">پرداخت (شبیه‌سازی‌شده) انجام شد و رزرو شما تأیید شد.</p>}
      {q.ok === 'cancelled' && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 font-semibold text-brand-700">رزرو لغو شد. {Number(q.pct) > 0 ? `بازگشت وجه شبیه‌سازی‌شده: ${toFa(q.pct!)}٪` : ''}</p>}
      {q.err && <p role="alert" className="mb-4 rounded-xl bg-danger-bg p-3 text-danger-fg">{q.err}</p>}
      <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">{d.venueName}</h1><span className={`pill ${st.cls}`}>{st.label}</span></div>
      <section className="card mt-4 p-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-500">ورزش</dt><dd className="font-bold">{d.sportName}</dd></div>
          <div><dt className="text-ink-500">زمان</dt><dd className="font-bold">{formatJalaliWithWeekday(d.startsAt)}، {formatTime(d.startsAt)} تا {formatTime(d.endsAt)}</dd></div>
          <div><dt className="text-ink-500">آدرس</dt><dd className="font-bold">{d.address}</dd></div>
          <div><dt className="text-ink-500">نوع رزرو</dt><dd className="font-bold">{r.mode === 'full' ? 'رزرو کامل سالن' : 'سانس باز'}</dd></div>
          <div><dt className="text-ink-500">مبلغ</dt><dd className="font-bold">{formatToman(r.totalAmount)}</dd></div>
          <div><dt className="text-ink-500">نسخهٔ سیاست لغو</dt><dd className="font-bold">{toFa(r.policyVersion)}</dd></div>
        </dl>
        {d.sessionId && <Link href={`/sessions/${d.sessionId}`} className="btn btn-outline mt-4">مشاهدهٔ سانس باز</Link>}
      </section>
      {d.intents.length > 0 && (
        <section className="card mt-5 p-6"><h2 className="section-title mb-3">پرداخت‌ها (شبیه‌سازی‌شده)</h2>
          <ul className="space-y-2 text-sm">{d.intents.map((i) => { const rf = d.refunds.find((x) => x.intentId === i.id); return (
            <li key={i.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-page p-3"><span>{formatToman(i.amount)} — {PAY_STATUS[i.status]}</span>
              {rf && <span className="text-info-fg">بازگشت {toFa(rf.percent)}٪ ({formatToman(rf.amount)}) · {REFUND_REASON[rf.reason] ?? rf.reason} · {formatJalaliDateTime(rf.createdAt)}</span>}</li>); })}</ul></section>)}
      {pendingIntent && r.status === 'awaiting_payment' && <Link href={`/pay/${pendingIntent.id}`} className="btn btn-primary mt-5 w-full">ادامه به پرداخت</Link>}
      {payable && r.mode === 'full' && (
        <form action={cancelReservationAction.bind(null, r.id)} className="mt-5">
          <p className="mb-2 text-sm text-ink-500">{r.status === 'confirmed' ? `در صورت لغو همین حالا، ${toFa(pct)}٪ مبلغ (شبیه‌سازی‌شده) بازگردانده می‌شود.` : 'لغو در این مرحله بدون هزینه است.'} <Link className="font-bold text-brand-600" href="/cancellation-policy">سیاست لغو</Link></p>
          <button className="btn btn-danger w-full">لغو رزرو</button></form>)}
    </div>
  );
}
