import Link from 'next/link';
import { Pencil, LogOut, MapPin, Clock, ShieldCheck, Gauge } from 'lucide-react';
import { requireUser } from '@/server/auth/rbac';
import { getProfileData } from '@/server/profile';
import { getPublicProfile } from '@/server/trust/profile';
import { logoutAction } from '@/server/auth/actions';
import { Avatar, OvrBadge } from '@/components/ui/misc';
import { formatPhoneDisplay } from '@/lib/i18n/phone';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'پروفایل من' };
const LEVEL: Record<string, string> = { beginner: 'مبتدی', intermediate: 'متوسط', pro: 'حرفه‌ای' };
const TIME: Record<string, string> = { morning: 'صبح', afternoon: 'ظهر و عصر', evening: 'عصر و شب', night: 'آخر شب' };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser('/profile');
  if (!user.onboardedAt) (await import('next/navigation')).redirect('/onboarding');
  const { profile, skills, city } = await getProfileData(user.id);
  const saved = (await searchParams).saved;
  const pub = await getPublicProfile(user.id, user.id);
  const stats = pub && !pub.hidden ? pub : null;
  const blended = (sport: string, cat: string, fallback: number) => stats?.sports.find((x) => x.key === sport)?.categories.find((c) => c.key === cat)?.value ?? fallback;
  return (
    <div className="container-page max-w-3xl py-8">
      {saved && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">تغییرات ذخیره شد.</p>}
      <section className="card overflow-hidden">
        <div className="relative bg-gradient-to-l from-brand-800 to-brand-950 p-6 text-white">
          <div className="flex items-center gap-4">
            <Avatar seed={user.id} src={user.avatarUrl} name={user.displayName} size={88} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold">{user.displayName}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-white/80">
                {city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{city.nameFa}</span>}
                {profile?.preferredTime && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden />{TIME[profile.preferredTime]}</span>}
              </p>
              <p className="mt-1 text-xs text-white/70">شمارهٔ شما (فقط برای خودتان): <bdi>{formatPhoneDisplay(user.phoneE164)}</bdi></p>
            </div>
            <Link href="/profile/edit" className="btn btn-sm ms-auto bg-white/15 text-white hover:bg-white/25"><Pencil className="h-4 w-4" aria-hidden />ویرایش</Link>
          </div>
        </div>
        {profile?.bio && <p className="border-b border-line p-5 text-ink-700">{profile.bio}</p>}
        <div className="grid grid-cols-2 gap-3 p-5">
          <div className="rounded-xl bg-page p-4"><p className="flex items-center gap-1 text-sm text-ink-500"><Gauge className="h-4 w-4" aria-hidden />تعداد بازی</p><p className="text-2xl font-extrabold">{toFa(stats?.reliability.games ?? 0)}</p></div>
          <div className="rounded-xl bg-page p-4"><p className="flex items-center gap-1 text-sm text-ink-500"><ShieldCheck className="h-4 w-4" aria-hidden />امتیاز تعهد</p>
            <p className="text-2xl font-extrabold">{toFa(stats?.reliability.score ?? 100)}</p></div>
        </div>
      </section>

      {skills.map((s) => (
        <section key={s.sportKey} className="card mt-5 p-6" aria-labelledby={`sk-${s.sportKey}`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 id={`sk-${s.sportKey}`} className="section-title">مهارت‌های {s.nameFa}</h2>
            <span className="pill pill-green">سطح {LEVEL[s.level]}</span>
            <OvrBadge value={s.ovr} className="ms-auto" />
          </div>
          <ul className="space-y-3">
            {s.categories.filter((c) => s.selfScores[c.key] != null).map((c) => (
              <li key={c.key} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span>{c.nameFa}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-page"><span className="block h-full rounded-full bg-gradient-to-l from-brand-600 to-accent" style={{ width: `${blended(s.sportKey, c.key, s.selfScores[c.key])}%` }} /></span>
                <span className="font-bold">{toFa(blended(s.sportKey, c.key, s.selfScores[c.key]))}</span>
              </li>))}
          </ul>
          <p className="help mt-4">این امتیازها ترکیبی از خودارزیابی شما و نظر هم‌بازی‌هاست و یک تخمین است.</p>
          <Link href="/onboarding?next=/profile" className="mt-3 inline-block text-sm font-bold text-brand-600">ویرایش خودارزیابی</Link>
        </section>
      ))}

      <p className="mt-5 flex flex-wrap gap-4 text-sm font-bold text-brand-600"><Link href="/profile/commitment">تعهد و تاریخچه</Link><Link href={`/players/${user.id}`}>مشاهدهٔ پروفایل عمومی من</Link><Link href="/favorites">علاقه‌مندی‌ها</Link><Link href="/chat">گفت‌وگوها</Link><Link href="/settings">تنظیمات</Link><Link href="/help">راهنما و تماس</Link></p>

      <form action={logoutAction} className="mt-6"><button className="btn btn-danger w-full"><LogOut className="h-4 w-4" aria-hidden />خروج از حساب</button></form>
    </div>
  );
}
