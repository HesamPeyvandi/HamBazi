import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/server/auth/rbac';
import { getOwnerVenue } from '@/server/owner/venues';
import { listBlocks } from '@/server/owner/blocks';
import { DomainError } from '@/server/booking/errors';
import { cancelBlockAction, createBlockAction, updateBlockAction } from '@/server/owner/actions';
import { toFa } from '@/lib/i18n/digits';
import { JALALI_MONTHS, JALALI_WEEKDAYS, toJalali } from '@/lib/i18n/jalali';
import { SubmitButton } from '@/components/ui/SubmitButton';

export const metadata = { title: 'رزروهای دائمی' };
const UUID = /^[0-9a-f-]{36}$/i;
// Jalali week starts on Saturday; the stored value is the JS/Postgres weekday (0 = Sunday).
const WEEK = JALALI_WEEKDAYS.map((label, i) => ({ label, dow: (i + 6) % 7 }));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const jOf = (iso: string) => toJalali(new Date(`${iso}T12:00:00+03:30`));
const fmtDate = (iso: string) => { const j = jOf(iso); return toFa(`${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`); };
const MSG: Record<string, string> = { created: 'رزرو دائمی ثبت شد', updated: 'رزرو دائمی ویرایش شد', cancelled: 'رزرو دائمی لغو شد' };

function DateSelects({ prefix, jy, jm, jd, label }: { prefix: string; jy: number; jm: number; jd: number; label: string }) {
  return (
    <fieldset><legend className="label">{label}</legend>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select name={`${prefix}d`} defaultValue={jd} aria-label={`${label}: روز`} className="field">{Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{toFa(d)}</option>)}</select>
        <select name={`${prefix}m`} defaultValue={jm} aria-label={`${label}: ماه`} className="field">{JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select name={`${prefix}y`} defaultValue={jy} aria-label={`${label}: سال`} className="field">{[jy - 1, jy, jy + 1, jy + 2].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y} value={y}>{toFa(y)}</option>)}</select>
      </div></fieldset>
  );
}

export default async function BlocksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; n?: string; err?: string; edit?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await requireRole(['venue_manager', 'admin']);
  const d = await getOwnerVenue(u, id).catch((e) => { if (e instanceof DomainError) notFound(); throw e; });
  const rows = await listBlocks(u, id);
  const q = await searchParams;
  const editing = q.edit && UUID.test(q.edit) ? rows.find((r) => r.b.id === q.edit && r.b.active)?.b : undefined;
  const now = toJalali(new Date());
  const f = editing ? jOf(editing.fromDate) : now;
  const t = editing ? jOf(editing.toDate) : toJalali(new Date(new Date().getTime() + 90 * 86400_000));
  const starts = Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30); // 06:00 … 23:30
  const ends = Array.from({ length: 36 }, (_, i) => 6 * 60 + 30 + i * 30); // 06:30 … 24:00
  const action = editing ? updateBlockAction.bind(null, id, editing.id) : createBlockAction.bind(null, id);
  return (
    <div className="container-page max-w-3xl py-8">
      <nav className="mb-3 text-sm text-ink-500"><Link href={`/owner/venues/${id}`}>{d.venue.name}</Link> › <Link href={`/owner/venues/${id}/slots`}>سانس‌ها</Link> › رزروهای دائمی</nav>
      <h1 className="text-2xl font-extrabold">رزروهای دائمی (هفتگی)</h1>
      <p className="mt-2 text-sm text-ink-500">وقتی مجموعه‌ای در یک روز و ساعت مشخص هر هفته سالن را رزرو کرده، آن را اینجا ثبت کنید. سانس‌های آن بازه برای عموم بسته می‌شود و قابل رزرو نیست؛ سانس‌هایی که بعداً ساخته شوند هم خودکار بسته می‌مانند.</p>
      {q.ok && MSG[q.ok] && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">{MSG[q.ok]}{q.ok === 'cancelled' ? ` (${toFa(q.n ?? 0)} سانس دوباره باز شد)` : ` (${toFa(q.n ?? 0)} سانس موجود بسته شد)`}.</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}

      <form action={action} className="card mt-5 space-y-4 p-6" key={editing?.id ?? 'new'}>
        <h2 className="section-title">{editing ? 'ویرایش رزرو دائمی' : 'ثبت رزرو دائمی'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="title">نام مجموعه / گروه</label><input id="title" name="title" required minLength={2} maxLength={80} defaultValue={editing?.title ?? ''} placeholder="مثلاً باشگاه فوتسال نمونه" className="field" /></div>
          <div><label className="label" htmlFor="weekday">روز هفته</label><select id="weekday" name="weekday" defaultValue={editing?.weekday ?? 0} className="field">{WEEK.map((w) => <option key={w.dow} value={w.dow}>هر {w.label}</option>)}</select></div>
          <div><label className="label" htmlFor="start">از ساعت</label><select id="start" name="start" defaultValue={hhmm(editing?.startMinute ?? 600)} className="field">{starts.map((m) => <option key={m} value={hhmm(m)}>{toFa(hhmm(m))}</option>)}</select></div>
          <div><label className="label" htmlFor="end">تا ساعت</label><select id="end" name="end" defaultValue={hhmm(editing?.endMinute ?? 720)} className="field">{ends.map((m) => <option key={m} value={hhmm(m)}>{toFa(hhmm(m))}</option>)}</select></div>
          <DateSelects prefix="from" jy={f.jy} jm={f.jm} jd={f.jd} label="از تاریخ" />
          <DateSelects prefix="to" jy={t.jy} jm={t.jm} jd={t.jd} label="تا تاریخ" />
        </div>
        <div><label className="label" htmlFor="note">یادداشت (اختیاری)</label><input id="note" name="note" maxLength={300} defaultValue={editing?.note ?? ''} placeholder="مثلاً شمارهٔ تماس مسئول مجموعه" className="field" /></div>
        <p className="help">روزهای هفته بر اساس تقویم شمسی و ساعت تهران است. اگر در این بازه سانس رزروشده‌ای وجود داشته باشد، ثبت انجام نمی‌شود تا رزرو کاربران به‌هم نخورد.</p>
        <div className="flex flex-wrap gap-2"><SubmitButton className="btn btn-primary">{editing ? 'ذخیرهٔ تغییرات' : 'ثبت رزرو دائمی'}</SubmitButton>{editing && <Link href={`/owner/venues/${id}/blocks`} className="btn btn-ghost">انصراف</Link>}</div>
      </form>

      <section className="card mt-6 p-6" aria-labelledby="bl"><h2 id="bl" className="section-title mb-3">رزروهای ثبت‌شده</h2>
        {rows.length === 0 ? <p className="text-sm text-ink-500">هنوز رزرو دائمی ثبت نشده است.</p> : (
          <ul className="divide-y divide-line">{rows.map(({ b, closedSlots }) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{b.title}</p>
                <p className="text-ink-500">هر {JALALI_WEEKDAYS[(b.weekday + 1) % 7]}، {toFa(hhmm(b.startMinute))} تا {toFa(hhmm(b.endMinute))} · {fmtDate(b.fromDate)} تا {fmtDate(b.toDate)}</p>
                {b.note && <p className="text-ink-500">{b.note}</p>}
                {b.active && <p className="text-ink-500">{toFa(closedSlots)} سانس پیش‌رو بسته شده</p>}
              </div>
              {b.active ? <>
                <span className="pill pill-info">فعال</span>
                <Link href={`/owner/venues/${id}/blocks?edit=${b.id}`} className="btn btn-ghost btn-sm">ویرایش</Link>
                <form action={cancelBlockAction.bind(null, id, b.id)}><SubmitButton className="btn btn-danger btn-sm">لغو</SubmitButton></form></>
                : <span className="pill pill-warn">لغو شده</span>}
            </li>))}</ul>)}</section>
    </div>
  );
}
