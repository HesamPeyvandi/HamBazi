import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listReports, REPORT_REASONS } from '@/server/trust/reports';
import { resolveReportAction } from '@/server/trust/actions';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';

export const metadata = { title: 'گزارش‌های تخلف' };
const TYPE_FA: Record<string, string> = { user: 'بازیکن', venue: 'سالن', session: 'سانس' };
const HREF = (t: string, id: string) => (t === 'user' ? `/players/${id}` : t === 'session' ? `/sessions/${id}` : '/venues');

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireRole(['admin']);
  const rows = await listReports(u, 'open');
  const q = await searchParams;
  return (
    <div className="container-page max-w-3xl py-8"><div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">گزارش‌های تخلف</h1><Link href="/admin/venues" className="text-sm font-bold text-brand-600">تأیید سالن‌ها</Link></div>
      {q.ok && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">تصمیم ثبت شد.</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mt-5">{rows.length === 0 ? <EmptyState title="گزارش بازی نیست" /> : (
        <ul className="space-y-4">{rows.map(({ r, reporter }) => (
          <li key={r.id} className="card p-5"><p className="font-bold">{TYPE_FA[r.targetType]} · {REPORT_REASONS[r.reason] ?? r.reason}</p>
            <p className="text-sm text-ink-500">گزارش‌دهنده: {reporter || 'کاربر'} · {formatJalaliDateTime(r.createdAt)} · <Link className="text-brand-600" href={HREF(r.targetType, r.targetId)}>مشاهدهٔ مورد گزارش‌شده</Link></p>
            {r.details && <p className="mt-2 text-sm leading-7">{r.details}</p>}
            <form className="mt-3 space-y-2"><label className="label" htmlFor={`n-${r.id}`}>توضیح تصمیم</label><input id={`n-${r.id}`} name="note" className="field" />
              {r.targetType === 'user' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="suspend" className="checkbox" />تعلیق حساب کاربر (نشست‌هایش بسته می‌شود)</label>}
              <div className="flex gap-2"><button formAction={resolveReportAction.bind(null, r.id, 'resolved')} className="btn btn-primary">رسیدگی شد</button><button formAction={resolveReportAction.bind(null, r.id, 'dismissed')} className="btn btn-ghost">رد گزارش</button></div></form></li>))}</ul>)}</div></div>
  );
}
