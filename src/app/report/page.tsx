import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { createReportAction } from '@/server/trust/actions';
import { REPORT_REASONS } from '@/server/trust/reports';

export const metadata = { title: 'گزارش تخلف' };
const UUID = /^[0-9a-f-]{36}$/i;
const TYPE_FA: Record<string, string> = { user: 'بازیکن', venue: 'سالن', session: 'سانس' };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; err?: string; done?: string }> }) {
  const q = await searchParams;
  if (q.done) return <div className="container-page max-w-xl py-10"><div className="card p-8 text-center"><h1 className="text-xl font-extrabold">گزارش شما ثبت شد</h1><p className="mt-2 text-ink-500">تیم پشتیبانی آن را بررسی می‌کند و نتیجه را اعلان می‌دهیم.</p><Link href="/" className="btn btn-primary mt-5">بازگشت</Link></div></div>;
  if (!q.type || !(q.type in TYPE_FA) || !q.id || !UUID.test(q.id)) redirect('/');
  await requireUser(`/report?type=${q.type}&id=${q.id}`);
  return (
    <div className="container-page max-w-xl py-8"><h1 className="text-2xl font-extrabold">گزارش {TYPE_FA[q.type]}</h1>
      <p className="mt-1 text-sm text-ink-500">گزارش‌ها توسط مدیر سامانه بررسی می‌شود. لطفاً فقط موارد واقعی را گزارش دهید.</p>
      {q.err && <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <form action={createReportAction.bind(null, q.type, q.id)} className="card mt-5 space-y-4 p-6">
        <div><label className="label" htmlFor="reason">دلیل</label><select id="reason" name="reason" className="field" required>{Object.entries(REPORT_REASONS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div><label className="label" htmlFor="details">توضیحات</label><textarea id="details" name="details" rows={5} maxLength={1000} className="field" /></div>
        <button className="btn btn-primary w-full">ثبت گزارش</button></form></div>
  );
}
