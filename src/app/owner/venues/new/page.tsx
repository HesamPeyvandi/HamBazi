import { requireRole } from '@/server/auth/rbac';
import { getCities, getSportsList } from '@/server/venues/queries';
import { createVenueAction } from '@/server/owner/actions';
import { VenueForm } from '@/components/owner/VenueForm';

export const metadata = { title: 'ثبت سالن جدید' };

export default async function NewVenue({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireRole(['venue_manager', 'admin']);
  const [cities, sports] = await Promise.all([getCities(), getSportsList()]);
  const { err } = await searchParams;
  return (
    <div className="container-page max-w-3xl py-8"><h1 className="mb-2 text-2xl font-extrabold">ثبت سالن جدید</h1>
      <p className="mb-5 text-sm text-ink-500">پس از ثبت اطلاعات، عکس‌ها را اضافه کنید و برای تأیید ارسال نمایید.</p>
      {err && <p role="alert" className="mb-4 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{err}</p>}
      <div className="card p-6"><VenueForm action={createVenueAction.bind(null, sports.map((s) => s.id))} cities={cities} sports={sports} submitLabel="ثبت سالن" /></div></div>
  );
}
