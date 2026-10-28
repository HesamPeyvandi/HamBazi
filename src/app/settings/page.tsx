import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireUser } from '@/server/auth/rbac';
import { SESSION_COOKIE } from '@/server/auth/session';
import { getNotifPrefs, listMySessions, NOTIF_GROUPS } from '@/server/account';
import { revokeOthersAction, revokeSessionAction, saveNotifPrefsAction } from '@/server/account/actions';
import { getProfileData } from '@/server/profile';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'تنظیمات' };
const OK: Record<string, string> = { prefs: 'تنظیمات اعلان ذخیره شد.', session: 'نشست بسته شد.', others: 'همهٔ دستگاه‌های دیگر خارج شدند.' };
function device(ua: string) {
  const os = /Android/i.test(ua) ? 'اندروید' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'ویندوز' : /Mac/i.test(ua) ? 'مک' : /Linux/i.test(ua) ? 'لینوکس' : 'دستگاه ناشناس';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const u = await requireUser('/settings');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const [prefs, sessions, { profile }] = await Promise.all([getNotifPrefs(u.id), listMySessions(u.id, token), getProfileData(u.id)]);
  const q = await searchParams;
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="mb-5 text-3xl font-extrabold">تنظیمات</h1>
      {q.ok && OK[q.ok] && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">{OK[q.ok]}</p>}

      <section className="card p-6" aria-labelledby="n-t"><h2 id="n-t" className="section-title">اعلان‌ها</h2>
        <p className="help mt-2">اعلان‌های مهم (پرداخت، لغو، بازگشت وجه، نتیجهٔ حضور) همیشه برای شما ارسال می‌شوند و قابل خاموش‌کردن نیستند.</p>
        <form action={saveNotifPrefsAction} className="mt-4 space-y-3">
          {(Object.entries(NOTIF_GROUPS) as [keyof typeof NOTIF_GROUPS, (typeof NOTIF_GROUPS)[keyof typeof NOTIF_GROUPS]][]).map(([k, g]) => (
            <label key={k} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input type="checkbox" name={k} defaultChecked={prefs[k]} className="checkbox mt-1" /><span><b>{g.label}</b><span className="block text-sm text-ink-500">{g.hint}</span></span></label>))}
          <button className="btn btn-primary">ذخیرهٔ اعلان‌ها</button></form></section>

      <section className="card mt-5 p-6" aria-labelledby="p-t"><h2 id="p-t" className="section-title">حریم خصوصی</h2>
        <p className="mt-3 text-sm leading-7">نمایش پروفایل: <b>{profile?.privacy.showProfile === false ? 'خصوصی' : 'عمومی'}</b> · نمایش سابقهٔ بازی: <b>{profile?.privacy.showHistory === false ? 'پنهان' : 'قابل‌مشاهده'}</b></p>
        <Link href="/profile/edit" className="mt-2 inline-block text-sm font-bold text-brand-600">تغییر در ویرایش پروفایل</Link></section>

      <section className="card mt-5 p-6" aria-labelledby="s-t"><h2 id="s-t" className="section-title">دستگاه‌های وارد‌شده</h2>
        <ul className="mt-4 divide-y divide-line">{sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><b>{device(s.userAgent)}</b>{s.current && <span className="pill pill-green ms-2">این دستگاه</span>}<span className="block text-ink-500">آخرین فعالیت: {formatJalaliDateTime(s.lastSeenAt)}</span></span>
            {!s.current && <form action={revokeSessionAction.bind(null, s.id)}><button className="btn btn-outline btn-sm">خروج این دستگاه</button></form>}</li>))}</ul>
        {sessions.length > 1 && <form action={revokeOthersAction} className="mt-3"><button className="btn btn-danger btn-sm">خروج از {toFa(sessions.length - 1)} دستگاه دیگر</button></form>}</section>
    </div>
  );
}
