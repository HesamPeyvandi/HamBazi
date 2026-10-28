import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listUsers } from '@/server/admin';
import { setUserStatusAction } from '@/server/admin/actions';
import { AdminNav } from '@/components/layout/AdminNav';
import { EmptyState } from '@/components/ui/misc';
import { formatPhoneDisplay } from '@/lib/i18n/phone';
import { formatJalaliShort } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'مدیریت کاربران' };
const ROLE: Record<string, string> = { player: 'بازیکن', venue_manager: 'مالک سالن', admin: 'ادمین' };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string; ok?: string; err?: string }> }) {
  const a = await requireRole(['admin']);
  const q = await searchParams;
  const { rows, total, page, pages } = await listUsers(a, { text: q.q, role: q.role, status: q.status, page: Number(q.page) || 1 });
  const qs = (p: number) => `?${new URLSearchParams({ ...(q.q ? { q: q.q } : {}), ...(q.role ? { role: q.role } : {}), ...(q.status ? { status: q.status } : {}), page: String(p) })}`;
  return (
    <div className="container-page max-w-4xl py-8"><h1 className="mb-4 text-2xl font-extrabold">کاربران</h1><AdminNav current="/admin/users" />
      {q.ok && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">انجام شد.</p>}
      {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <form className="flex flex-wrap items-end gap-2" role="search"><div className="min-w-48 flex-1"><label className="label" htmlFor="uq">نام یا شماره</label><input id="uq" name="q" defaultValue={q.q ?? ''} className="field" /></div>
        <div><label className="label" htmlFor="ur">نقش</label><select id="ur" name="role" defaultValue={q.role ?? ''} className="field"><option value="">همه</option>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="us">وضعیت</label><select id="us" name="status" defaultValue={q.status ?? ''} className="field"><option value="">همه</option><option value="active">فعال</option><option value="suspended">تعلیق</option></select></div>
        <button className="btn btn-primary">جستجو</button></form>
      <p className="help mt-3">{toFa(total)} کاربر</p>
      <div className="mt-2">{rows.length === 0 ? <EmptyState title="کاربری پیدا نشد" /> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold">{r.name || 'بدون نام'} <span className="pill pill-info ms-1">{ROLE[r.role]}</span>{r.status === 'suspended' && <span className="pill pill-danger ms-1">تعلیق</span>}</p>
            <p className="text-sm text-ink-500"><bdi>{formatPhoneDisplay(r.phone)}</bdi> · عضویت {formatJalaliShort(r.createdAt)}</p></div>
            {r.role !== 'admin' && r.id !== a.id && (
              <form className="flex items-center gap-2"><label className="sr-only" htmlFor={`n-${r.id}`}>توضیح</label><input id={`n-${r.id}`} name="note" placeholder="توضیح (اختیاری)" className="field !w-40" />
                {r.status === 'active' ? <button formAction={setUserStatusAction.bind(null, r.id, 'suspended')} className="btn btn-danger btn-sm">تعلیق</button> : <button formAction={setUserStatusAction.bind(null, r.id, 'active')} className="btn btn-primary btn-sm">فعال‌سازی</button>}</form>)}</li>))}</ul>)}</div>
      {pages > 1 && <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="صفحه‌بندی">{page > 1 && <Link className="font-bold text-brand-600" href={qs(page - 1)}>قبلی</Link>}<span>صفحهٔ {toFa(page)} از {toFa(pages)}</span>{page < pages && <Link className="font-bold text-brand-600" href={qs(page + 1)}>بعدی</Link>}</nav>}
    </div>
  );
}
