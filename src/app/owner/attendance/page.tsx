import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { listAttendanceTasks } from '@/server/trust/attendance';
import { markAttendanceAction } from '@/server/trust/actions';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';

export const metadata = { title: 'حضور و غیاب' };
const ST: Record<string, [string, string]> = { confirmed: ['ثبت نشده', 'pill-warn'], attended: ['حاضر', 'pill-green'], no_show: ['غایب', 'pill-danger'] };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireRole(['venue_manager', 'admin']);
  const tasks = await listAttendanceTasks(u);
  const q = await searchParams;
  return (
    <div className="container-page max-w-3xl py-8"><div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">حضور و غیاب</h1><Link href="/owner" className="text-sm font-bold text-brand-600">پنل مالک</Link></div>
      <p className="mt-1 text-sm text-ink-500">بازی‌های ۱۴ روز اخیر. با ثبت «حاضر» بازیکن می‌تواند به هم‌بازی‌ها و سالن امتیاز بدهد؛ «غایب» امتیاز تعهد او را کم می‌کند. اشتباه را می‌توانید اصلاح کنید.</p>
      {q.ok && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">ثبت شد.</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mt-5">{tasks.length === 0 ? <EmptyState title="بازی‌ای برای ثبت حضور نیست" /> : (
        <ul className="space-y-4">{tasks.map((t) => (
          <li key={t.r.id} className="card p-5"><p className="font-bold">{t.venueName} — {t.sportName}</p><p className="text-sm text-ink-500">{formatJalaliDateTime(t.startsAt)} · {t.r.mode === 'full' ? 'رزرو کامل' : 'سانس باز'}</p>
            <ul className="mt-3 divide-y divide-line">{t.players.map((p) => { const s = ST[p.status] ?? ST.confirmed; return (
              <li key={p.userId} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1 font-semibold">{p.name || 'کاربر'}</span><span className={`pill ${s[1]}`}>{s[0]}</span>
                <form action={markAttendanceAction.bind(null, t.r.id, p.userId, 'attended')}><button className="btn btn-outline btn-sm" disabled={p.status === 'attended'}>حاضر</button></form>
                <form action={markAttendanceAction.bind(null, t.r.id, p.userId, 'no_show')}><button className="btn btn-danger btn-sm" disabled={p.status === 'no_show'}>غایب</button></form></li>); })}</ul></li>))}</ul>)}</div></div>
  );
}
