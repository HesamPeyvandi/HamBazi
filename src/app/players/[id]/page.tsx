import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flag, MapPin, ShieldCheck, Trophy } from 'lucide-react';
import { currentUser } from '@/server/auth/session';
import { getPublicProfile } from '@/server/trust/profile';
import { Avatar } from '@/components/ui/misc';
import { toFa } from '@/lib/i18n/digits';
import { formatJalaliShort } from '@/lib/i18n/jalali';

const UUID = /^[0-9a-f-]{36}$/i;
const LEVEL: Record<string, string> = { beginner: 'مبتدی', intermediate: 'متوسط', pro: 'حرفه‌ای' };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const p = UUID.test(id) ? await getPublicProfile(null, id) : null;
  return { title: p ? p.name || 'پروفایل بازیکن' : 'بازیکن پیدا نشد' };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await currentUser();
  const p = await getPublicProfile(viewer?.id ?? null, id);
  if (!p) notFound();
  if (p.hidden) return (
    <div className="container-page max-w-2xl py-8"><section className="card p-8 text-center"><div className="mx-auto w-fit"><Avatar src={p.avatar} name={p.name || 'کاربر'} size={88} /></div>
      <h1 className="mt-3 text-xl font-extrabold">{p.name || 'کاربر'}</h1><p className="mt-2 text-ink-500">این بازیکن پروفایل خود را خصوصی کرده است.</p></section></div>);
  const rel = p.reliability;
  return (
    <div className="container-page max-w-3xl py-8">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-l from-brand-800 to-brand-950 p-6 text-white"><div className="flex items-center gap-4">
          <Avatar src={p.avatar} name={p.name || 'کاربر'} size={88} />
          <div className="min-w-0"><h1 className="truncate text-2xl font-extrabold">{p.name || 'کاربر'}</h1>
            {p.city && <p className="mt-1 flex items-center gap-1 text-sm text-white/80"><MapPin className="h-4 w-4" aria-hidden />{p.city}</p>}</div>
          {p.own ? <Link href="/profile/edit" className="btn btn-sm ms-auto bg-white/15 text-white hover:bg-white/25">ویرایش</Link>
            : <Link href={`/report?type=user&id=${p.id}`} className="btn btn-sm ms-auto bg-white/15 text-white hover:bg-white/25"><Flag className="h-4 w-4" aria-hidden />گزارش</Link>}
        </div></div>
        {p.bio && <p className="border-b border-line p-5 text-ink-700">{p.bio}</p>}
        <dl className="grid grid-cols-3 gap-3 p-5 text-center">
          <div className="rounded-xl bg-page p-4"><dt className="flex items-center justify-center gap-1 text-sm text-ink-500"><Trophy className="h-4 w-4" aria-hidden />بازی‌ها</dt><dd className="text-2xl font-extrabold">{toFa(rel.games)}</dd></div>
          <div className="rounded-xl bg-page p-4"><dt className="flex items-center justify-center gap-1 text-sm text-ink-500"><ShieldCheck className="h-4 w-4" aria-hidden />امتیاز تعهد</dt><dd className="text-2xl font-extrabold">{toFa(rel.score)}</dd></div>
          <div className="rounded-xl bg-page p-4"><dt className="text-sm text-ink-500">درصد حضور</dt><dd className="text-2xl font-extrabold">{rel.attendanceRate == null ? '—' : `${toFa(rel.attendanceRate)}٪`}</dd></div>
        </dl>
      </section>
      {p.sports.map((s) => (
        <section key={s.key} className="card mt-5 p-6" aria-labelledby={`s-${s.key}`}>
          <div className="mb-4 flex flex-wrap items-center gap-3"><h2 id={`s-${s.key}`} className="section-title">مهارت‌های {s.nameFa}</h2><span className="pill pill-green">سطح {LEVEL[s.level]}</span>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-center text-[0.65rem] font-bold leading-tight text-white ms-auto" aria-label={`OVR ${toFa(s.ovr)}`}>OVR<br /><span className="text-base">{toFa(s.ovr)}</span></span></div>
          <ul className="space-y-3">{s.categories.map((c) => (
            <li key={c.key} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm"><span>{c.nameFa}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-page"><span className="block h-full rounded-full bg-gradient-to-l from-brand-600 to-accent" style={{ width: `${c.value}%` }} /></span><span className="font-bold">{toFa(c.value)}</span></li>))}</ul>
          <p className="help mt-4">{s.peerCount > 0 ? `بر اساس خودارزیابی و ${toFa(s.peerCount)} نظر هم‌بازی (تخمین)` : 'فعلاً فقط بر اساس خودارزیابی است (تخمین).'}</p>
        </section>))}
      {p.showHistory && (
        <section className="card mt-5 p-6" aria-labelledby="c-t"><h2 id="c-t" className="section-title mb-3">نظر هم‌بازی‌ها</h2>
          {p.comments.length === 0 ? <p className="text-sm text-ink-500">هنوز نظری ثبت نشده است.</p> : (
            <ul className="divide-y divide-line">{p.comments.map((c) => <li key={c.id} className="py-3 text-sm"><p className="font-bold">{c.name} <span className="font-normal text-ink-500">· {formatJalaliShort(c.at)}</span></p><p className="mt-1 leading-7 text-ink-700">{c.text}</p></li>)}</ul>)}</section>)}
    </div>
  );
}
