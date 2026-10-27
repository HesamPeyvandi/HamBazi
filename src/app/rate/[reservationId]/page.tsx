import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { getRateContext } from '@/server/trust/ratings';
import { submitPeerReviewsAction, submitVenueReviewAction } from '@/server/trust/actions';
import { Avatar } from '@/components/ui/misc';
import { ScoreSlider } from '@/components/booking/ScoreSlider';
import { formatJalaliWithWeekday } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'امتیازدهی بعد از بازی' };
const UUID = /^[0-9a-f-]{36}$/i;
const OK: Record<string, string> = { peers: 'امتیازها ثبت شد. ممنون!', venue: 'نظر شما دربارهٔ سالن ثبت شد. ممنون!' };

export default async function RatePage({ params, searchParams }: { params: Promise<{ reservationId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { reservationId } = await params;
  if (!UUID.test(reservationId)) notFound();
  const u = await requireUser(`/rate/${reservationId}`);
  const ctx = await getRateContext(u.id, reservationId);
  if (!ctx) notFound();
  const q = await searchParams;
  const open = ctx.peers.filter((p) => !p.rated);
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="text-2xl font-extrabold">بازی چطور بود؟</h1>
      <p className="mt-1 text-ink-500">{ctx.game.sport.nameFa} — {ctx.game.venue.name} · {formatJalaliWithWeekday(ctx.game.startsAt)}</p>
      {q.ok && OK[q.ok] && <p role="status" className="mt-4 rounded-xl bg-brand-50 p-3 font-semibold text-brand-700">{OK[q.ok]}</p>}
      {q.err && <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-danger-fg">{q.err}</p>}
      {ctx.expired && <p className="mt-4 rounded-xl bg-warn-bg p-3 text-warn-fg">مهلت امتیازدهی این بازی تمام شده است.</p>}

      {ctx.sessionId && !ctx.expired && (
        <section className="card mt-5 p-6" aria-labelledby="p-t"><h2 id="p-t" className="section-title mb-1">امتیاز به هم‌بازی‌ها</h2>
          <p className="help mb-4">هر مهارت از ۱ تا ۱۰. نظر شما فقط یک تخمین است و روی مهارت نمایش‌داده‌شدهٔ بازیکن اثر می‌گذارد (امتیاز تعهد به این نظر ربطی ندارد).</p>
          {ctx.peers.length === 0 ? <p className="text-sm text-ink-500">هم‌بازی دیگری با حضور تأییدشده برای امتیاز دادن نیست.</p> : open.length === 0 ? <p className="text-sm text-ink-500">به همهٔ هم‌بازی‌ها امتیاز داده‌اید.</p> : (
            <form action={submitPeerReviewsAction.bind(null, reservationId)} className="space-y-5">
              {open.map((p) => (
                <fieldset key={p.userId} className="rounded-2xl border border-line p-4">
                  <legend className="flex items-center gap-2 px-2 font-bold"><Avatar name={p.name || 'کاربر'} size={28} />{p.name || 'کاربر'}</legend>
                  <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name={`rate_${p.userId}`} className="checkbox" />به این بازیکن امتیاز می‌دهم</label>
                  <div className="space-y-2">{ctx.categories.map((c) => (
                    <ScoreSlider key={c.key} id={`s_${p.userId}_${c.key}`} name={`s_${p.userId}_${c.key}`} label={c.nameFa} />))}</div>
                  <label className="label mt-3" htmlFor={`comment_${p.userId}`}>نظر (اختیاری)</label><textarea id={`comment_${p.userId}`} name={`comment_${p.userId}`} maxLength={300} rows={2} className="field" />
                </fieldset>))}
              <button className="btn btn-primary w-full">ثبت امتیازها</button></form>)}
        </section>)}

      {!ctx.expired && (
        <section className="card mt-5 p-6" aria-labelledby="v-t"><h2 id="v-t" className="section-title mb-3">نظر دربارهٔ {ctx.game.venue.name}</h2>
          {ctx.venueReviewed ? <p className="text-sm text-ink-500">برای این بازی نظر داده‌اید.</p> : (
            <form action={submitVenueReviewAction.bind(null, reservationId)} className="space-y-3">
              <fieldset><legend className="label">امتیاز سالن</legend>
                <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-xl border border-line px-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"><input type="radio" name="rating" value={n} required className="sr-only" />{toFa(n)} ★</label>)}</div></fieldset>
              <div><label className="label" htmlFor="comment">نظر شما</label><textarea id="comment" name="comment" rows={3} maxLength={600} className="field" /></div>
              <button className="btn btn-primary w-full">ثبت نظر</button></form>)}
        </section>)}
      <p className="mt-6 text-sm"><Link href="/reservations" className="font-bold text-brand-600">بازگشت به رزروهای من</Link> · <Link href={`/report?type=venue&id=${ctx.game.venue.id}`} className="text-ink-500">گزارش مشکل سالن</Link></p>
    </div>
  );
}
