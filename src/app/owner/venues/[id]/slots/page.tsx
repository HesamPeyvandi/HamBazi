import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/server/auth/rbac';
import { getOwnerVenue, listOwnerSlots } from '@/server/owner/venues';
import { DomainError } from '@/server/booking/errors';
import { createSlotsAction, deleteSlotAction, toggleSlotAction } from '@/server/owner/actions';
import { getSportsList } from '@/server/venues/queries';
import { formatNumber, toFa } from '@/lib/i18n/digits';
import { JALALI_MONTHS, JALALI_WEEKDAYS, formatJalaliWithWeekday, formatTime, tehranParts, toJalali } from '@/lib/i18n/jalali';

export const metadata = { title: 'مدیریت سانس‌ها' };
const UUID = /^[0-9a-f-]{36}$/i;
const ST: Record<string, [string, string]> = { open: ['باز', 'pill-green'], closed: ['بسته', 'pill-warn'], held: ['در حال رزرو', 'pill-info'], booked: ['رزرو شده', 'pill-danger'] };

export default async function SlotsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; skipped?: string; err?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await requireRole(['venue_manager', 'admin']);
  const d = await getOwnerVenue(u, id).catch((e) => { if (e instanceof DomainError) notFound(); throw e; });
  const [slots, sports] = await Promise.all([listOwnerSlots(u, id), getSportsList()]);
  const q = await searchParams;
  const days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(new Date().getTime() + i * 86400_000); const p = tehranParts(dt); const j = toJalali(dt); return { key: `${p.y}-${p.m}-${p.d}`, label: `${JALALI_WEEKDAYS[j.weekdayIndex]} ${toFa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}` }; });
  const mine = d.sports.map((s) => ({ ...s, name: sports.find((x) => x.id === s.sportId)?.nameFa ?? '' }));
  return (
    <div className="container-page max-w-3xl py-8">
      <nav className="mb-3 text-sm text-ink-500"><Link href={`/owner/venues/${id}`}>{d.venue.name}</Link> › سانس‌ها</nav>
      <h1 className="text-2xl font-extrabold">مدیریت سانس‌ها</h1>
      {d.venue.status !== 'published' ? <p className="card mt-4 p-5">سانس‌ها پس از تأیید سالن قابل ایجاد هستند.</p> : (<>
        {q.ok && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">{toFa(q.ok)} سانس ایجاد شد{q.skipped && q.skipped !== '0' ? ` (${toFa(q.skipped)} مورد تکراری/همپوشان یا گذشته نادیده گرفته شد)` : ''}.</p>}
        {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
        <form action={createSlotsAction.bind(null, id)} className="card mt-5 space-y-4 p-6">
          <h2 className="section-title">ایجاد سانس</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div><label className="label" htmlFor="sportId">ورزش</label><select id="sportId" name="sportId" className="field">{mine.map((s) => <option key={s.sportId} value={s.sportId}>{s.name} — {toFa(s.slotMinutes)} دقیقه</option>)}</select></div>
            <div><label className="label" htmlFor="start">شروع از</label><select id="start" name="start" defaultValue="17:00" className="field">{Array.from({ length: 16 }, (_, i) => i + 8).map((h) => <option key={h} value={`${h}:00`}>{toFa(String(h).padStart(2, '0'))}:۰۰</option>)}</select></div>
            <div><label className="label" htmlFor="endHour">پایان تا</label><select id="endHour" name="endHour" defaultValue="23" className="field">{Array.from({ length: 16 }, (_, i) => i + 9).map((h) => <option key={h} value={h}>{toFa(String(h).padStart(2, '0'))}:۰۰</option>)}</select></div>
            <div><label className="label" htmlFor="price">قیمت (اختیاری)</label><input id="price" name="price" inputMode="numeric" placeholder="پیش‌فرض سالن" className="field" /></div>
          </div>
          <fieldset><legend className="label">روزها</legend><div className="flex flex-wrap gap-2">{days.map((x) => (
            <label key={x.key} className="flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm"><input type="checkbox" name="day" value={x.key} className="checkbox" />{x.label}</label>))}</div></fieldset>
          <p className="help">سانس‌ها پشت‌سرهم و به‌اندازهٔ مدت هر سانس در بازهٔ انتخابی ساخته می‌شوند. سانس همپوشان ساخته نمی‌شود.</p>
          <button className="btn btn-primary">ایجاد سانس‌ها</button>
        </form></>)}
      <section className="card mt-6 p-6"><h2 className="section-title mb-3">سانس‌های پیش‌رو</h2>
        {slots.length === 0 ? <p className="text-sm text-ink-500">سانسی ثبت نشده است.</p> : (
          <ul className="divide-y divide-line">{slots.map(({ slot: s, sportName }) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1"><p className="font-bold">{formatJalaliWithWeekday(s.startsAt)}، {formatTime(s.startsAt)} تا {formatTime(s.endsAt)}</p><p className="text-ink-500">{sportName} · {formatNumber(s.price)} تومان</p></div>
              <span className={`pill ${ST[s.status][1]}`}>{ST[s.status][0]}</span>
              {(s.status === 'open' || s.status === 'closed') && <>
                <form action={toggleSlotAction.bind(null, id, s.id, s.status === 'closed')}><button className="btn btn-ghost btn-sm">{s.status === 'open' ? 'بستن' : 'باز کردن'}</button></form>
                <form action={deleteSlotAction.bind(null, id, s.id)}><button className="btn btn-danger btn-sm">حذف</button></form></>}
            </li>))}</ul>)}</section>
    </div>
  );
}
