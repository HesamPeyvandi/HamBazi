import { requireRole } from '@/server/auth/rbac';
import { listSupport, TOPICS } from '@/server/support';
import { closeSupportAction } from '@/server/support/actions';
import { AdminNav } from '@/components/layout/AdminNav';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';

export const metadata = { title: 'پیام‌های پشتیبانی' };
export const dynamic = 'force-dynamic';

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireRole(['admin']); const q = await searchParams;
  const rows = await listSupport(u, 'open');
  return (
    <div className="container-page max-w-4xl py-8"><h1 className="mb-4 text-2xl font-extrabold">پیام‌های پشتیبانی</h1><AdminNav current="/admin/support" />
      {q.ok && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">پیام بسته شد.</p>}
      {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      {rows.length === 0 ? <EmptyState title="پیام بازی نیست" /> : (
        <ul className="space-y-3">{rows.map(({ m, name }) => (
          <li key={m.id} className="card p-4"><p className="font-bold">{TOPICS[m.topic] ?? m.topic} <span className="text-sm font-normal text-ink-500">· {name || 'کاربر'} · {formatJalaliDateTime(m.createdAt)}</span></p>
            <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-7">{m.body}</p>
            <form action={closeSupportAction.bind(null, m.id)} className="mt-3"><button className="btn btn-outline btn-sm">بستن پیام</button></form></li>))}</ul>)}
    </div>
  );
}
