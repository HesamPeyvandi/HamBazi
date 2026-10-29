import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/server/auth/rbac';
import { getOwnerVenue, listStaff } from '@/server/owner/venues';
import { DomainError } from '@/server/booking/errors';
import { getCities, getSportsList } from '@/server/venues/queries';
import { addStaffAction, removeStaffAction, removeImageAction, submitReviewAction, updateVenueAction, uploadImageAction } from '@/server/owner/actions';
import { VenueForm } from '@/components/owner/VenueForm';
import { publicUrl } from '@/server/storage';
import { formatPhoneDisplay } from '@/lib/i18n/phone';

export const metadata = { title: 'ویرایش سالن' };
const UUID = /^[0-9a-f-]{36}$/i;
const OK: Record<string, string> = { created: 'سالن ثبت شد. عکس اضافه کنید و برای تأیید ارسال کنید.', saved: 'تغییرات ذخیره شد.', image: 'عکس اضافه شد.', image_removed: 'عکس حذف شد.', submitted: 'سالن برای تأیید ارسال شد.', staff_added: 'کارمند اضافه شد.', staff_removed: 'کارمند حذف شد.' };
const ST: Record<string, string> = { draft: 'پیش‌نویس', pending: 'در انتظار تأیید مدیر سامانه', published: 'منتشرشده', suspended: 'تعلیق‌شده' };

export default async function EditVenue({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await requireRole(['venue_manager', 'admin']);
  const d = await getOwnerVenue(u, id).catch((e) => { if (e instanceof DomainError) notFound(); throw e; });
  const [cities, sports] = await Promise.all([getCities(), getSportsList()]);
  const q = await searchParams;
  const v = d.venue;
  const staff = d.isOwner ? await listStaff(u, id) : [];
  return (
    <div className="container-page max-w-3xl py-8">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-extrabold">{v.name}</h1><span className="pill pill-info">{ST[v.status]}</span></div>
      {q.ok && OK[q.ok] && <p role="status" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">{OK[q.ok]}</p>}
      {q.err && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {v.status === 'published' && <><Link href={`/owner/venues/${v.id}/slots`} className="btn btn-primary btn-sm">مدیریت سانس‌ها</Link><Link href={`/venues/${v.slug}`} className="btn btn-outline btn-sm">مشاهدهٔ صفحهٔ عمومی</Link></>}
        {d.isOwner && v.status === 'draft' && <form action={submitReviewAction.bind(null, v.id)}><button className="btn btn-primary btn-sm">ارسال برای تأیید</button></form>}
      </div>
      {!d.isOwner && <p className="mt-4 rounded-xl bg-page p-3 text-sm text-ink-500">شما کارمند این سالن هستید و فقط به سانس‌ها، رزروها و حضور و غیاب دسترسی دارید.</p>}
      {d.isOwner && (<>
      <section className="card mt-5 p-6" aria-labelledby="img-t"><h2 id="img-t" className="section-title mb-3">عکس‌ها</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{d.images.map((im) => (
          <li key={im.id} className="overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicUrl(im.storageKey)} alt="" className="aspect-video w-full object-cover" />
            <form action={removeImageAction.bind(null, v.id, im.id)}><button className="btn btn-ghost btn-sm w-full rounded-none">حذف</button></form></li>))}</ul>
        {d.images.length === 0 && <p className="text-sm text-ink-500">هنوز عکسی اضافه نشده است.</p>}
        <form action={uploadImageAction.bind(null, v.id)} className="mt-4 flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="image">افزودن عکس (JPG/PNG/WebP، حداکثر ۴ مگابایت)</label><input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="field" /></div>
          <button className="btn btn-outline">آپلود</button></form></section>
      <section className="card mt-5 p-6" aria-labelledby="info-t"><h2 id="info-t" className="section-title mb-4">اطلاعات سالن</h2>
        <VenueForm action={updateVenueAction.bind(null, v.id, sports.map((s) => s.id))} cities={cities} sports={sports} submitLabel="ذخیرهٔ تغییرات"
          defaults={{ name: v.name, cityId: v.cityId, address: v.address, neighborhood: v.neighborhood, description: v.description, surface: v.surface ?? '', openHours: v.openHours ?? '', rules: v.rules, facilities: d.facilities, sports: d.sports }} /></section>
      <section className="card mt-5 p-6" aria-labelledby="staff-t"><h2 id="staff-t" className="section-title mb-3">کارمندان سالن</h2>
        <ul className="divide-y divide-line">{staff.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{m.name || 'کاربر'} <span className="text-ink-500" dir="ltr">{formatPhoneDisplay(m.phone)}</span> · {m.role === 'owner' ? 'مالک' : 'کارمند'}</span>
            {m.role === 'staff' && <form action={removeStaffAction.bind(null, v.id, m.userId)}><button className="btn btn-ghost btn-sm">حذف</button></form>}</li>))}</ul>
        <form action={addStaffAction.bind(null, v.id)} className="mt-4 flex flex-wrap items-end gap-3"><div><label className="label" htmlFor="staff-phone">شمارهٔ موبایل کارمند (باید قبلاً در همبازی ثبت‌نام کرده باشد)</label><input id="staff-phone" name="phone" inputMode="tel" dir="ltr" required className="field" placeholder="09123456789" /></div><button className="btn btn-outline">افزودن</button></form>
        <p className="mt-2 text-xs text-ink-500">کارمند می‌تواند سانس‌ها، رزروها و حضور و غیاب را مدیریت کند؛ اما ویرایش اطلاعات سالن، عکس‌ها و مدیریت کارمندان فقط با مالک است.</p></section>
      </>)}
    </div>
  );
}
