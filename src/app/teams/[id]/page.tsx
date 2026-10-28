import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crown, MapPin, Users } from 'lucide-react';
import { currentUser } from '@/server/auth/session';
import { getTeam, getTeamByInviteToken, suggestPlayers, JOIN_MODES, type JoinMode } from '@/server/teams';
import {
  cancelRequestAction, decideRequestAction, disbandTeamAction, invitePlayerAction, joinTeamAction, leaveTeamAction, regenerateInviteAction,
  removeMemberAction, requestJoinAction, transferCaptainAction, updateTeamAction,
} from '@/server/teams/actions';
import { env } from '@/server/env';
import { Avatar } from '@/components/ui/misc';
import { toFa } from '@/lib/i18n/digits';

const UUID = /^[0-9a-f-]{36}$/i;
const OK: Record<string, string> = { created: 'تیم ساخته شد.', joined: 'به تیم پیوستید.', requested: 'درخواست شما برای کاپیتان ارسال شد.', cancelled: 'درخواست لغو شد.', approved: 'عضو جدید پذیرفته شد.', rejected: 'درخواست رد شد.', removed: 'عضو حذف شد.', transferred: 'کاپیتانی منتقل شد.', regenerated: 'لینک دعوت جدید ساخته شد.', saved: 'تغییرات ذخیره شد.', invited: 'دعوت ارسال شد.' };

export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; t?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const q = await searchParams;
  const user = await currentUser();
  const d = await getTeam(user?.id ?? null, id);
  if (!d) notFound();
  const { team: t } = d;
  const tokenOk = !!q.t && (await getTeamByInviteToken(q.t))?.id === t.id ? q.t : undefined;
  const invite = d.isCaptain ? `${env().appUrl.replace(/\/$/, '')}/teams/join/${t.inviteToken}` : null;
  const sugg = d.isCaptain && !d.full ? await suggestPlayers(user!.id, t.id) : null;
  const next = `/teams/${t.id}${tokenOk ? `?t=${tokenOk}` : ''}`;
  return (
    <div className="container-page max-w-3xl py-8">
      {q.ok && OK[q.ok] && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 font-semibold text-brand-700">{OK[q.ok]}</p>}
      {q.err && <p role="alert" className="mb-4 rounded-xl bg-danger-bg p-3 text-danger-fg">{q.err}</p>}
      <section className="card overflow-hidden"><div className="bg-gradient-to-l from-brand-800 to-brand-950 p-6 text-white">
        <h1 className="text-2xl font-extrabold">{t.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-4 text-sm text-white/80"><span>{d.sportName}</span><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{d.cityName}</span><span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />{toFa(d.members.length)} از {toFa(t.maxMembers)} نفر</span>{d.avgOvr > 0 && <span>میانگین OVR: {toFa(d.avgOvr)}</span>}</p></div>
        <div className="p-6">
          {t.description && <p className="leading-7 text-ink-700">{t.description}</p>}
          <p className="mt-3 text-sm text-ink-500">روش عضوگیری: {JOIN_MODES[t.joinMode as JoinMode]}</p>

          {!d.isMember && (user ? (
            d.full ? <p className="mt-4 rounded-xl bg-warn-bg p-3 text-sm text-warn-fg">ظرفیت این تیم تکمیل شده است.</p>
            : t.joinMode === 'public' || tokenOk ? <form action={joinTeamAction.bind(null, t.id, tokenOk)} className="mt-4"><button className="btn btn-primary w-full">پیوستن به تیم</button></form>
            : t.joinMode === 'request' ? (d.myRequestId
              ? <form action={cancelRequestAction.bind(null, t.id, d.myRequestId)} className="mt-4 flex items-center gap-3"><span className="pill pill-info">درخواست شما در انتظار تأیید است</span><button className="btn btn-ghost btn-sm">لغو درخواست</button></form>
              : <form action={requestJoinAction.bind(null, t.id)} className="mt-4 space-y-2"><label className="label" htmlFor="message">پیام برای کاپیتان (اختیاری)</label><textarea id="message" name="message" rows={2} maxLength={300} className="field" /><button className="btn btn-primary w-full">ارسال درخواست عضویت</button></form>)
            : <p className="mt-4 rounded-xl bg-page p-3 text-sm text-ink-700">این تیم فقط با لینک دعوت عضو می‌پذیرد.</p>
          ) : <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-primary mt-4 w-full">برای پیوستن وارد شوید</Link>)}
        </div></section>

      <section className="card mt-5 p-6" aria-labelledby="mem-t"><h2 id="mem-t" className="section-title mb-4">اعضا</h2>
        <ul className="divide-y divide-line">{d.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3"><Avatar src={m.avatar} name={m.name || 'کاربر'} size={40} />
            <div className="min-w-0 flex-1"><Link href={`/players/${m.userId}`} className="font-bold hover:text-brand-600">{m.name || 'کاربر'}</Link>{m.role === 'captain' && <span className="pill pill-warn ms-2"><Crown className="h-3.5 w-3.5" aria-hidden />کاپیتان</span>}</div>
            {m.ovr != null && <span className="text-sm text-ink-500">OVR <b className="text-ink-900">{toFa(m.ovr)}</b></span>}
            {d.isCaptain && m.role !== 'captain' && (
              <span className="flex gap-2"><form action={transferCaptainAction.bind(null, t.id, m.userId)}><button className="btn btn-outline btn-sm">کاپیتان شود</button></form><form action={removeMemberAction.bind(null, t.id, m.userId)}><button className="btn btn-ghost btn-sm text-danger-fg">حذف</button></form></span>)}
          </li>))}</ul>
        {d.isMember && !d.isCaptain && <form action={leaveTeamAction.bind(null, t.id)} className="mt-4"><button className="btn btn-ghost w-full">خروج از تیم</button></form>}
      </section>

      {d.isCaptain && (<>
        {d.requests.length > 0 && <section className="card mt-5 p-6" aria-labelledby="req-t"><h2 id="req-t" className="section-title mb-4">درخواست‌های عضویت ({toFa(d.requests.length)})</h2>
          <ul className="space-y-3">{d.requests.map(({ r, name }) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3"><div><Link href={`/players/${r.userId}`} className="font-bold hover:text-brand-600">{name || 'کاربر'}</Link>{r.message && <p className="text-sm text-ink-500">{r.message}</p>}</div>
              <span className="flex gap-2"><form action={decideRequestAction.bind(null, t.id, r.id, true)}><button className="btn btn-primary btn-sm">تأیید</button></form><form action={decideRequestAction.bind(null, t.id, r.id, false)}><button className="btn btn-ghost btn-sm">رد</button></form></span></li>))}</ul></section>}

        {sugg && sugg.players.length > 0 && <section className="card mt-5 p-6" aria-labelledby="sug-t"><h2 id="sug-t" className="section-title mb-1">بازیکنان پیشنهادی</h2>
          <p className="help mb-4">بازیکنان همین شهر و ورزش که سطحشان به میانگین تیم ({toFa(sugg.avgOvr)}) نزدیک است. دعوت فقط یک اعلان است و تصمیم با خود بازیکن است.</p>
          <ul className="space-y-3">{sugg.players.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3"><Avatar src={p.avatar} name={p.name} size={36} /><div className="flex-1"><Link href={`/players/${p.id}`} className="font-bold hover:text-brand-600">{p.name}</Link><p className="text-xs text-ink-500">OVR {toFa(p.ovr)} · امتیاز تعهد {toFa(p.reliability)}</p></div>
              <form action={invitePlayerAction.bind(null, t.id, p.id)}><button className="btn btn-outline btn-sm">ارسال دعوت</button></form></li>))}</ul></section>}

        <section className="card mt-5 p-6" aria-labelledby="mgmt-t"><h2 id="mgmt-t" className="section-title mb-4">مدیریت تیم</h2>
          {invite && <div className="mb-4"><label className="label" htmlFor="inv">لینک دعوت</label><input id="inv" readOnly value={invite} dir="ltr" className="field text-sm" />
            <form action={regenerateInviteAction.bind(null, t.id)} className="mt-2"><button className="btn btn-ghost btn-sm">ساخت لینک جدید (لینک قبلی باطل می‌شود)</button></form></div>}
          <form action={updateTeamAction.bind(null, t.id)} className="space-y-3">
            <div><label className="label" htmlFor="description">دربارهٔ تیم</label><textarea id="description" name="description" rows={3} maxLength={400} defaultValue={t.description} className="field" /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="joinMode">روش عضوگیری</label><select id="joinMode" name="joinMode" defaultValue={t.joinMode} className="field">{Object.entries(JOIN_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label" htmlFor="maxMembers">حداکثر اعضا</label><input id="maxMembers" name="maxMembers" type="number" min={d.members.length} max={50} defaultValue={t.maxMembers} className="field" /></div></div>
            <button className="btn btn-outline w-full">ذخیرهٔ تغییرات</button></form>
          <form action={disbandTeamAction.bind(null, t.id)} className="mt-4 border-t border-line pt-4"><p className="help mb-2">با انحلال، تیم از فهرست حذف می‌شود و همهٔ اعضا مطلع می‌شوند.</p><button className="btn btn-danger w-full">انحلال تیم</button></form>
        </section></>)}
    </div>
  );
}
