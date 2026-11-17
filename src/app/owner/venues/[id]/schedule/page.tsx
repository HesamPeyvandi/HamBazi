import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/server/auth/rbac';
import { getOwnerVenue } from '@/server/owner/venues';
import { getSchedule, SLOT_DURATIONS } from '@/server/owner/schedule';
import { DomainError } from '@/server/booking/errors';
import { saveScheduleAction } from '@/server/owner/actions';
import { getSportsList } from '@/server/venues/queries';
import { toFa } from '@/lib/i18n/digits';
import { JALALI_WEEKDAYS } from '@/lib/i18n/jalali';
import { SubmitButton } from '@/components/ui/SubmitButton';

export const metadata = { title: 'برنامهٔ هفتگی سانس‌ها' };
const UUID = /^[0-9a-f-]{36}$/i;
// Jalali week starts on Saturday; stored value is the JS/Postgres weekday (0 = Sunday).
const WEEK = JALALI_WEEKDAYS.map((label, i) => ({ label, dow: (i + 6) % 7 }));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const OPENS = Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30); // 06:00 … 23:30
const CLOSES = Array.from({ length: 36 }, (_, i) => 6 * 60 + 30 + i * 30); // 06:30 … 24:00

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string; ok?: string; n?: string; err?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await requireRole(['venue_manager', 'admin']);
  const d = await getOwnerVenue(u, id).catch((e) => { if (e instanceof DomainError) notFound(); throw e; });
  const q = await searchParams;
  const sports = await getSportsList();
  const mine = d.sports.map((s) => ({ ...s, name: sports.find((x) => x.id === s.sportId)?.nameFa ?? '' }));
  const cur = mine.find((s) => s.sportId === q.sport) ?? mine[0];
  if (!cur) notFound();
  const rows = await getSchedule(u, id, cur.sportId);
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  const minutes = rows[0]?.slotMinutes ?? ((SLOT_DURATIONS as readonly number[]).includes(cur.slotMinutes) ? cur.slotMinutes : 90);
  const action = saveScheduleAction.bind(null, id, cur.sportId);
  return (
    <div className="container-page max-w-3xl py-8">
      <nav className="mb-3 text-sm text-ink-500"><Link href={`/owner/venues/${id}`}>{d.venue.name}</Link> › <Link href={`/owner/venues/${id}/slots`}>سانس‌ها</Link> › برنامهٔ هفتگی</nav>
      <h1 className="text-2xl font-extrabold">برنامهٔ هفتگی سانس‌ها</h1>
      <p className="mt-2 text-sm text-ink-500">فقط یک‌بار تعیین کنید هر روز هفته از چه ساعتی تا چه ساعتی سالن باز است و هر سانس چند دقیقه است. سانس‌ها تا ۱۴ روز آینده خودکار ساخته و هر روز تمدید می‌شوند؛ دیگر لازم نیست هر هفته سانس بسازید. زمان‌هایی که برای رزرو دائمی ثبت کرده‌اید خودکار بسته می‌ماند و قابل انتخاب نیست.</p>
      {q.ok && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">برنامه ذخیره شد ({toFa(q.n ?? 0)} سانس جدید ساخته شد).</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      {mine.length > 1 && <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="ورزش">{mine.map((s) => <Link key={s.sportId} href={`/owner/venues/${id}/schedule?sport=${s.sportId}`} role="tab" aria-selected={s.sportId === cur.sportId} className={s.sportId === cur.sportId ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>{s.name}</Link>)}</div>}
      <form action={action} className="card mt-5 space-y-4 p-6" key={cur.sportId}>
        <h2 className="section-title">{cur.name}</h2>
        <div className="max-w-xs"><label className="label" htmlFor="slotMinutes">مدت هر سانس</label>
          <select id="slotMinutes" name="slotMinutes" defaultValue={minutes} className="field">{SLOT_DURATIONS.map((m) => <option key={m} value={m}>{toFa(m)} دقیقه</option>)}</select></div>
        <fieldset><legend className="label">روزها و ساعت‌های فعالیت</legend>
          <ul className="divide-y divide-line">{WEEK.map((w) => { const r = byDay.get(w.dow); return (
            <li key={w.dow} className="flex flex-wrap items-center gap-3 py-3">
              <label className="flex min-w-28 items-center gap-2 font-semibold"><input type="checkbox" name={`on${w.dow}`} defaultChecked={!!r} className="h-5 w-5 accent-brand-600" />{w.label}</label>
              <div className="flex flex-1 flex-wrap items-center gap-2 text-sm"><span>از</span>
                <select name={`open${w.dow}`} defaultValue={hhmm(r?.openMinute ?? 16 * 60)} aria-label={`${w.label}: ساعت شروع`} className="field w-28">{OPENS.map((m) => <option key={m} value={hhmm(m)}>{toFa(hhmm(m))}</option>)}</select><span>تا</span>
                <select name={`close${w.dow}`} defaultValue={hhmm(r?.closeMinute ?? 23 * 60)} aria-label={`${w.label}: ساعت پایان`} className="field w-28">{CLOSES.map((m) => <option key={m} value={hhmm(m)}>{toFa(hhmm(m))}</option>)}</select></div>
            </li>); })}</ul></fieldset>
        <p className="help">روزی که تیک نخورده تعطیل است. ساعت‌ها به وقت تهران است. اگر ساعت‌ها را عوض کنید، سانس‌های آزاد آینده دوباره ساخته می‌شوند؛ سانس‌های رزروشده یا در حال رزرو هرگز تغییر نمی‌کنند.</p>
        <SubmitButton className="btn btn-primary">ذخیرهٔ برنامه</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-ink-500">رزرو ثابت یک مجموعه؟ از <Link className="font-bold text-brand-600" href={`/owner/venues/${id}/blocks`}>رزروهای دائمی</Link> استفاده کنید. برای یک سانس مقطعی هم می‌توانید در <Link className="font-bold text-brand-600" href={`/owner/venues/${id}/slots`}>مدیریت سانس‌ها</Link> دستی بسازید.</p>
    </div>
  );
}
