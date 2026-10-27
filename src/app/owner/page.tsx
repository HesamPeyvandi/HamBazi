import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { listOwnerVenues } from '@/server/owner/venues';
import { becomeManagerAction } from '@/server/owner/actions';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'پنل مالک سالن' };
const ST: Record<string, [string, string]> = { draft: ['پیش‌نویس', 'pill-warn'], pending: ['در انتظار تأیید', 'pill-info'], published: ['منتشرشده', 'pill-green'], suspended: ['تعلیق', 'pill-danger'] };

export default async function OwnerHome() {
  const u = await requireUser('/owner');
  if (u.role === 'player') return (
    <div className="container-page max-w-xl py-10"><EmptyState title="سالن ورزشی دارید؟" text="با فعال‌سازی پنل مالک می‌توانید سالن خود را ثبت کنید و سانس‌ها را مدیریت کنید."
      action={<form action={becomeManagerAction}><button className="btn btn-primary">فعال‌سازی پنل مالک</button></form>} /></div>);
  const venues = await listOwnerVenues(u);
  return (
    <div className="container-page max-w-3xl py-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">پنل مالک سالن</h1>
        <div className="flex gap-2"><Link href="/owner/reservations" className="btn btn-outline btn-sm">رزروها</Link>{u.role === 'admin' && <Link href="/admin/venues" className="btn btn-outline btn-sm">تأیید سالن‌ها</Link>}<Link href="/owner/venues/new" className="btn btn-primary btn-sm">ثبت سالن جدید</Link></div></div>
      <div className="mt-6">{venues.length === 0 ? <EmptyState title="هنوز سالنی ثبت نکرده‌اید" action={<Link href="/owner/venues/new" className="btn btn-primary">ثبت اولین سالن</Link>} /> : (
        <ul className="space-y-3">{venues.map((v) => (
          <li key={v.id}><Link href={`/owner/venues/${v.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-brand-600"><div><p className="font-bold">{v.name}</p><p className="text-sm text-ink-500">{v.address}</p></div><span className={`pill ${ST[v.status][1]}`}>{ST[v.status][0]}</span></Link></li>))}</ul>)}</div>
    </div>
  );
}
