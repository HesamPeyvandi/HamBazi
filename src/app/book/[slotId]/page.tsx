import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { CalendarDays, Clock, Users, Info } from 'lucide-react';
import { db, schema } from '@/db/client';
import { requireUser } from '@/server/auth/rbac';
import { activeFeePolicy } from '@/server/booking/policy';
import { calcFee } from '@/server/booking/money';
import { reserveFullAction } from '@/server/booking/actions';
import { SessionForm } from '@/components/booking/SessionForm';
import { formatToman, toFa } from '@/lib/i18n/digits';
import { formatJalaliWithWeekday, formatTime } from '@/lib/i18n/jalali';

export const metadata = { title: 'رزرو سانس' };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function BookPage({ params, searchParams }: { params: Promise<{ slotId: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slotId } = await params;
  if (!UUID.test(slotId)) notFound();
  await requireUser(`/book/${slotId}`);
  const { err } = await searchParams;
  const [row] = await db().select({ slot: schema.timeSlots, venue: schema.venues, sport: schema.sports }).from(schema.timeSlots)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.timeSlots.venueId)).innerJoin(schema.sports, eq(schema.sports.id, schema.timeSlots.sportId))
    .where(eq(schema.timeSlots.id, slotId));
  if (!row || row.venue.status !== 'published') notFound();
  const [vs] = await db().select().from(schema.venueSports).where(and(eq(schema.venueSports.venueId, row.venue.id), eq(schema.venueSports.sportId, row.slot.sportId)));
  const fee = await activeFeePolicy(db() as never);
  const { slot, venue, sport } = row;
  const bookable = slot.status === 'open' && slot.startsAt.getTime() > new Date().getTime() + 30 * 60_000;
  const feeAmt = calcFee(slot.price, fee);
  return (
    <div className="container-page max-w-3xl py-8">
      <nav aria-label="مسیر" className="mb-4 text-sm text-ink-500"><Link href="/venues">سالن‌ها</Link> › <Link href={`/venues/${venue.slug}`}>{venue.name}</Link> › رزرو</nav>
      <h1 className="text-2xl font-extrabold">رزرو {sport.nameFa} — {venue.name}</h1>
      <ul className="mt-4 flex flex-wrap gap-4 text-sm text-ink-700">
        <li className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden />{formatJalaliWithWeekday(slot.startsAt)}</li>
        <li className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden />{formatTime(slot.startsAt)} تا {formatTime(slot.endsAt)}</li>
        <li className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />ظرفیت سالن: {toFa(vs?.maxCapacity ?? 0)} نفر</li>
      </ul>
      {err && <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{err}</p>}
      {!bookable ? <p className="card mt-6 p-6 text-ink-700">این سانس دیگر قابل رزرو نیست. <Link className="font-bold text-brand-600" href={`/venues/${venue.slug}`}>بازگشت به سالن</Link></p> : (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className="card p-6" aria-labelledby="full-t">
            <h2 id="full-t" className="section-title mb-3">رزرو کامل سالن</h2>
            <p className="text-sm leading-7 text-ink-700">کل سالن را برای گروه خودتان رزرو کنید و هزینه را یک‌جا بپردازید.</p>
            <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt>هزینهٔ سانس</dt><dd>{formatToman(slot.price)}</dd></div>
              <div className="flex justify-between"><dt>کارمزد خدمات</dt><dd>{formatToman(feeAmt)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold"><dt>مبلغ قابل پرداخت</dt><dd>{formatToman(slot.price + feeAmt)}</dd></div></dl>
            <form action={reserveFullAction.bind(null, slot.id)} className="mt-5"><button className="btn btn-primary w-full">رزرو و ادامه به پرداخت</button></form>
          </section>
          <section className="card p-6" aria-labelledby="open-t" id="open">
            <h2 id="open-t" className="section-title mb-3">ایجاد سانس باز</h2>
            <p className="mb-4 text-sm leading-7 text-ink-700">هزینه بین بازیکنان تقسیم می‌شود. بازیکنان دیگر به سانس شما می‌پیوندند و سهم خود را می‌پردازند.</p>
            <SessionForm slotId={slot.id} slotPrice={slot.price} maxCapacity={vs?.maxCapacity ?? 10} defaultTarget={sport.defaultCapacity} feeBp={fee.percentBp} feeMin={fee.minToman} />
          </section>
        </div>
      )}
      <p className="mt-6 flex items-start gap-2 text-sm text-ink-500"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />پس از شروع رزرو، سانس {toFa(15)} دقیقه برای شما نگه داشته می‌شود. <Link href="/cancellation-policy" className="font-bold text-brand-600">سیاست لغو و بازگشت وجه</Link></p>
    </div>
  );
}
