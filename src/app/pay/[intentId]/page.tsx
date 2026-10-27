import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { requireUser } from '@/server/auth/rbac';
import { getIntentForPayer, } from '@/server/booking/settle';
import { payAction, cancelReservationAction } from '@/server/booking/actions';
import { settleStale } from '@/server/booking/sessions';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { Countdown } from '@/components/booking/Countdown';
import { formatToman } from '@/lib/i18n/digits';
import { formatJalaliWithWeekday, formatTime } from '@/lib/i18n/jalali';
import { PAY_STATUS } from '@/lib/labels';

export const metadata = { title: 'پرداخت' };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function PayPage({ params, searchParams }: { params: Promise<{ intentId: string }>; searchParams: Promise<{ err?: string }> }) {
  const { intentId } = await params;
  if (!UUID.test(intentId)) notFound();
  const u = await requireUser(`/pay/${intentId}`);
  let row = await getIntentForPayer(u.id, intentId);
  if (!row) notFound();
  // evaluate expiry before showing a countdown
  const [s] = await db().select({ id: schema.openSessions.id }).from(schema.openSessions).where(eq(schema.openSessions.reservationId, row.r.id));
  if (s) { await settleStale(s.id); row = (await getIntentForPayer(u.id, intentId))!; }
  const { i, r } = row;
  if (i.status === 'succeeded') redirect(s ? `/sessions/${s.id}` : `/reservations/${r.id}`);
  let holdUntil: Date | null = null;
  if (i.status === 'created') {
    if (s) { const [p] = await db().select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.id, i.participantId!)); holdUntil = p?.holdExpiresAt ?? null; }
    else holdUntil = r.holdExpiresAt;
  }
  const live = i.status === 'created' && holdUntil && holdUntil.getTime() > new Date().getTime();
  const err = (await searchParams).err;
  return (
    <div className="container-page max-w-xl py-8">
      <h1 className="text-2xl font-extrabold">پرداخت</h1>
      <p className="mt-1 text-ink-500">{row.venueName} — {formatJalaliWithWeekday(row.startsAt)}، {formatTime(row.startsAt)} تا {formatTime(row.endsAt)}</p>
      <div role="note" className="mt-5 flex items-start gap-3 rounded-2xl bg-warn-bg p-4 text-warn-fg"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p className="text-sm font-semibold leading-7">پرداخت شبیه‌سازی‌شده — پولی کسر نمی‌شود. این نسخه فقط برای نمایش و آزمایش است.</p></div>
      {err && <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{err}</p>}
      <section className="card mt-5 p-6">
        <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>{s ? 'سهم شما از هزینه' : 'هزینهٔ سانس'}</dt><dd>{formatToman(i.baseAmount)}</dd></div>
          <div className="flex justify-between"><dt>کارمزد خدمات</dt><dd>{formatToman(i.feeAmount)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-lg font-extrabold"><dt>مبلغ قابل پرداخت</dt><dd>{formatToman(i.amount)}</dd></div></dl>
        {live ? (
          <>
            <p className="mt-4 rounded-xl bg-page p-3 text-center text-sm">زمان باقی‌مانده برای پرداخت: <Countdown until={holdUntil!.toISOString()} /></p>
            <form action={payAction.bind(null, i.id)} className="mt-4"><button className="btn btn-primary w-full">پرداخت (شبیه‌سازی)</button></form>
            {!s && <form action={cancelReservationAction.bind(null, r.id)} className="mt-3"><button className="btn btn-ghost w-full">انصراف و آزاد کردن سانس</button></form>}
          </>
        ) : (
          <div className="mt-4"><p role="status" className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{i.status === 'created' ? 'مهلت پرداخت به پایان رسیده است.' : `وضعیت پرداخت: ${PAY_STATUS[i.status]}`} لطفاً دوباره اقدام کنید.</p>
            <Link href={`/venues`} className="btn btn-outline mt-3 w-full">بازگشت به سالن‌ها</Link></div>
        )}
      </section>
    </div>
  );
}
