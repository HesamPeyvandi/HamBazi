import Link from 'next/link';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { listOpenSessions } from '@/server/booking/sessions';
import { getSportsList } from '@/server/venues/queries';
import { EmptyState } from '@/components/ui/misc';
import { formatToman, toFa } from '@/lib/i18n/digits';
import { formatJalaliWithWeekday, formatTime, formatJalaliDateTime } from '@/lib/i18n/jalali';
import { SESSION_STATUS } from '@/lib/labels';

export const metadata = { title: 'سانس‌های باز' };

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ sport?: string; q?: string }> }) {
  const sp = await searchParams;
  const sports = await getSportsList();
  const sportId = sports.find((s) => s.key === sp.sport)?.id;
  const items = await listOpenSessions({ sportId, q: sp.q?.slice(0, 60) });
  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-extrabold">سانس‌های باز</h1>
      <p className="mt-1 text-ink-500">به بازی‌های باز بپیوندید و هم‌بازی پیدا کنید.</p>
      <form className="mt-5 flex flex-wrap gap-3" role="search">
        <select name="sport" defaultValue={sp.sport ?? ''} aria-label="ورزش" className="field !w-auto"><option value="">همهٔ ورزش‌ها</option>{sports.map((s) => <option key={s.key} value={s.key}>{s.nameFa}</option>)}</select>
        <input name="q" defaultValue={sp.q ?? ''} placeholder="نام سالن" aria-label="نام سالن" className="field !w-auto" />
        <button className="btn btn-primary">فیلتر</button>
      </form>
      <div className="mt-6">{items.length === 0 ? <EmptyState title="سانس بازی پیدا نشد" text="می‌توانید خودتان یک سانس باز بسازید." action={<Link href="/venues" className="btn btn-primary">انتخاب سالن</Link>} /> : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((x) => {
          const pct = Math.min(100, Math.round((x.confirmed / x.s.targetCount) * 100));
          return (
            <li key={x.s.id}><Link href={`/sessions/${x.s.id}`} className="card block p-5 hover:border-brand-600">
              <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-extrabold">{x.sportName} — {x.venueName}</h2><span className={`pill ${SESSION_STATUS[x.s.status].cls}`}>{SESSION_STATUS[x.s.status].label}</span></div>
              <p className="mt-2 flex items-center gap-1 text-sm text-ink-500"><CalendarDays className="h-4 w-4" aria-hidden />{formatJalaliWithWeekday(x.startsAt)}، {formatTime(x.startsAt)}</p>
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-500"><MapPin className="h-4 w-4" aria-hidden />{x.neighborhood}</p>
              <div className="mt-4"><div className="flex justify-between text-sm"><span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />{toFa(x.confirmed)} از {toFa(x.s.targetCount)} نفر</span><span className="font-bold text-brand-700">{formatToman(x.s.pricePerParticipant)}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-page" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="تکمیل ظرفیت"><div className="h-full bg-brand-600" style={{ width: `${pct}%` }} /></div></div>
              <p className="help mt-3">حداقل برای قطعی شدن: {toFa(x.s.minToConfirm)} نفر · مهلت پیوستن: {formatJalaliDateTime(x.s.joinDeadline)}</p>
            </Link></li>);
        })}</ul>)}</div>
    </div>
  );
}
