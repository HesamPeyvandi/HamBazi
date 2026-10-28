import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listAudit } from '@/server/admin';
import { AdminNav } from '@/components/layout/AdminNav';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'لاگ تغییرات' };
export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const a = await requireRole(['admin']);
  const q = await searchParams;
  const { rows, total, page, pages } = await listAudit(a, { action: q.action, page: Number(q.page) || 1 });
  const href = (p: number) => `?${new URLSearchParams({ ...(q.action ? { action: q.action } : {}), page: String(p) })}`;
  return (
    <div className="container-page max-w-4xl py-8"><h1 className="mb-4 text-2xl font-extrabold">لاگ تغییرات</h1><AdminNav current="/admin/audit" />
      <form className="flex items-end gap-2" role="search"><div><label className="label" htmlFor="aa">پیشوند عمل (مثلاً user. یا venue.)</label><input id="aa" name="action" defaultValue={q.action ?? ''} className="field" dir="ltr" /></div><button className="btn btn-outline">فیلتر</button></form>
      <p className="help mt-3">{toFa(total)} رکورد (فقط‌افزودنی؛ قابل ویرایش یا حذف نیست)</p>
      {rows.length === 0 ? <EmptyState title="رکوردی نیست" /> : (
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white">{rows.map((r) => (
          <li key={r.id} className="p-3 text-sm"><p><code dir="ltr" className="rounded bg-page px-1.5 py-0.5 font-mono text-xs">{r.action}</code> <span className="text-ink-500">· {r.actor || 'سیستم'} · {formatJalaliDateTime(r.createdAt)}</span></p>
            {r.diff != null && <pre dir="ltr" className="mt-1 overflow-x-auto rounded-lg bg-page p-2 text-xs">{JSON.stringify(r.diff).slice(0, 300)}</pre>}</li>))}</ul>)}
      {pages > 1 && <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="صفحه‌بندی">{page > 1 && <Link className="font-bold text-brand-600" href={href(page - 1)}>قبلی</Link>}<span>صفحهٔ {toFa(page)} از {toFa(pages)}</span>{page < pages && <Link className="font-bold text-brand-600" href={href(page + 1)}>بعدی</Link>}</nav>}
    </div>
  );
}
