import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, MapPin, Share2, ShieldCheck } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { currentUser } from '@/server/auth/session';
import { getSessionDetail } from '@/server/booking/sessions';
import { teamsOfUser } from '@/server/teams';
import { inviteTeamToSessionAction } from '@/server/teams/actions';
import { joinSessionAction, leaveSessionAction, updateSessionAction, cancelReservationAction } from '@/server/booking/actions';
import { env } from '@/server/env';
import { Avatar } from '@/components/ui/misc';
import { formatToman, toFa } from '@/lib/i18n/digits';
import { formatJalaliDateTime, formatJalaliWithWeekday, formatTime } from '@/lib/i18n/jalali';
import { PAY_STATUS, SESSION_STATUS } from '@/lib/labels';

const UUID = /^[0-9a-f-]{36}$/i;
const OK: Record<string, string> = { team_invited: 'دعوت برای اعضای تیم ارسال شد.', paid: 'پرداخت (شبیه‌سازی‌شده) انجام شد.', left: 'از سانس خارج شدید.', left_refund: 'از سانس خارج شدید و بازگشت وجه (شبیه‌سازی‌شده) ثبت شد.', updated: 'تغییرات ذخیره شد.' };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; ok?: string; err?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const q = await searchParams;
  const user = await currentUser();
  const d = await getSessionDetail(id, user?.id ?? null, q.t);
  if (!d) notFound();
  const { session: s, venue } = d;
  const st = SESSION_STATUS[s.status];
  const active = s.status === 'collecting' || s.status === 'confirmed';
  const full = d.confirmedCount >= s.targetCount;
  const canJoin = active && !d.isMember && !full && s.joinDeadline > new Date();
  const invite = d.isHost && s.inviteToken ? `${env().appUrl.replace(/\/$/, '')}/sessions/join/${s.inviteToken}` : null;
  const myTeams = d.isHost && user ? (await teamsOfUser(user.id)).filter((x) => x.sportId === s.sportId) : [];
  const hostRes = d.isHost ? await db().select().from(schema.reservations).where(eq(schema.reservations.id, s.reservationId)) : [];
  return (
    <div className="container-page max-w-3xl py-8">
      {q.ok && OK[q.ok] && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 font-semibold text-brand-700">{OK[q.ok]}</p>}
      {q.err && <p role="alert" className="mb-4 rounded-xl bg-danger-bg p-3 text-danger-fg">{q.err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-extrabold">{d.sportName} — {venue.name}</h1><span className={`pill ${st.cls}`}>{st.label}</span></div>
      <ul className="mt-3 space-y-1 text-sm text-ink-700">
        <li className="flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden />{formatJalaliWithWeekday(d.startsAt)}، {formatTime(d.startsAt)} تا {formatTime(d.endsAt)}</li>
        <li className="flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden /><Link className="text-brand-600" href={`/venues/${venue.slug}`}>{venue.address}</Link></li>
      </ul>
      {s.description && <p className="card mt-4 p-4 text-sm leading-7">{s.description}</p>}
      <section className="card mt-5 p-6" aria-labelledby="cap-t">
        <h2 id="cap-t" className="section-title mb-3">ظرفیت و هزینه</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-page p-3"><dt className="text-ink-500">تأییدشده</dt><dd className="text-xl font-extrabold">{toFa(d.confirmedCount)}</dd></div>
          <div className="rounded-xl bg-page p-3"><dt className="text-ink-500">تعداد بازیکنان</dt><dd className="text-xl font-extrabold">{toFa(s.targetCount)}</dd></div>
          <div className="rounded-xl bg-page p-3"><dt className="text-ink-500">سهم هر نفر</dt><dd className="text-base font-extrabold">{formatToman(s.pricePerParticipant)}</dd></div>
        </dl>
        <p className="help mt-3">مهلت پیوستن: {formatJalaliDateTime(s.joinDeadline)}. اگر تا آن زمان ظرفیت تکمیل نشود، سانس لغو و مبلغ پرداختی‌ها بازگردانده می‌شود. سطح مهارت مجاز: {toFa(s.skillMin)} تا {toFa(s.skillMax)}.</p>
        {s.cancelReason && <p className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">این سانس لغو شده است.</p>}
      </section>
      <section className="card mt-5 p-6" aria-labelledby="players-t">
        <h2 id="players-t" className="section-title mb-3">بازیکنان</h2>
        <ul className="divide-y divide-line">{d.participants.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 py-3"><Avatar src={p.avatar} name={p.name || 'کاربر'} size={40} />
            <div className="min-w-0"><p className="font-bold"><Link href={`/players/${p.userId}`} className="hover:text-brand-600">{p.name || 'کاربر'}</Link>{p.isHost && <span className="pill pill-green ms-2">میزبان</span>}</p><p className="text-xs text-ink-500">OVR {toFa(p.ovr)}</p></div>
            {p.payment !== undefined && <span className="pill pill-info ms-auto">{PAY_STATUS[p.payment ?? 'created'] ?? '—'}</span>}</li>))}</ul>
      </section>
      <div className="mt-5 space-y-3">
        {canJoin && (user ? <form action={joinSessionAction.bind(null, s.id, q.t)}><button className="btn btn-primary w-full">پیوستن و پرداخت سهم ({formatToman(s.pricePerParticipant)})</button></form>
          : <Link className="btn btn-primary w-full" href={`/login?next=${encodeURIComponent(`/sessions/${s.id}${q.t ? `?t=${q.t}` : ''}`)}`}>ورود برای پیوستن</Link>)}
        {d.myStatus === 'pending_payment' && !d.isHost && <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-fg">پرداخت شما هنوز تکمیل نشده است. دوباره «پیوستن» را بزنید.</p>}
        {d.myStatus === 'confirmed' && !d.isHost && active && <form action={leaveSessionAction.bind(null, s.id)}><button className="btn btn-ghost w-full">خروج از سانس (طبق سیاست لغو)</button></form>}
        {full && !d.isMember && active && <p className="rounded-xl bg-page p-3 text-center text-ink-700">ظرفیت این سانس تکمیل است.</p>}
      </div>
      {d.isHost && (
        <section className="card mt-5 p-6" aria-labelledby="host-t"><h2 id="host-t" className="section-title mb-3">مدیریت سانس (میزبان)</h2>
          {active && myTeams.length > 0 && <form action={inviteTeamToSessionAction.bind(null, s.id)} className="mb-4 flex flex-wrap items-end gap-2"><div className="min-w-48 flex-1"><label className="label" htmlFor="teamId">دعوت اعضای تیم من</label><select id="teamId" name="teamId" className="field">{myTeams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><button className="btn btn-outline">ارسال دعوت به تیم</button></form>}
          {invite && <div className="mb-4"><p className="label flex items-center gap-1"><Share2 className="h-4 w-4" aria-hidden />لینک دعوت</p><input readOnly value={invite} dir="ltr" className="field text-sm" aria-label="لینک دعوت" /></div>}
          {active && <form action={updateSessionAction.bind(null, s.id)} className="space-y-3">
            <div><label className="label" htmlFor="description">توضیحات</label><textarea id="description" name="description" rows={3} maxLength={500} defaultValue={s.description} className="field" /></div>
            <div><label className="label" htmlFor="visibility">نمایش</label><select id="visibility" name="visibility" defaultValue={s.visibility} className="field"><option value="public">عمومی</option><option value="invite_only">فقط با لینک</option></select></div>
            <button className="btn btn-outline w-full">ذخیرهٔ تغییرات</button></form>}
          {active && hostRes[0] && <form action={cancelReservationAction.bind(null, hostRes[0].id)} className="mt-4"><p className="help mb-2">با لغو سانس، سهم بقیهٔ بازیکنان کامل و سهم شما طبق سیاست لغو بازگردانده می‌شود (شبیه‌سازی‌شده).</p><button className="btn btn-danger w-full">لغو کل سانس</button></form>}
        </section>)}
      <p className="mt-6 flex flex-wrap items-center gap-3 text-sm text-ink-500"><ShieldCheck className="h-4 w-4" aria-hidden /><Link href="/cancellation-policy" className="font-bold text-brand-600">سیاست لغو و بازگشت وجه</Link><Link href={`/report?type=session&id=${s.id}`}>گزارش این سانس</Link></p>
    </div>
  );
}
