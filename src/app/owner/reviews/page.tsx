import Link from 'next/link';
import { desc, eq, inArray } from 'drizzle-orm';
import { requireRole } from '@/server/auth/rbac';
import { db, schema } from '@/db/client';
import { EmptyState, Stars } from '@/components/ui/misc';
import { formatJalaliShort } from '@/lib/i18n/jalali';

export const metadata = { title: 'نظرات سالن' };

export default async function OwnerReviews() {
  const u = await requireRole(['venue_manager', 'admin']);
  const mine = u.role === 'admin' ? undefined : inArray(schema.venueReviews.venueId, db().select({ id: schema.venueManagers.venueId }).from(schema.venueManagers).where(eq(schema.venueManagers.userId, u.id)));
  const rows = await db().select({ r: schema.venueReviews, venue: schema.venues.name, name: schema.users.displayName }).from(schema.venueReviews)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.venueReviews.venueId)).innerJoin(schema.users, eq(schema.users.id, schema.venueReviews.userId)).where(mine).orderBy(desc(schema.venueReviews.createdAt)).limit(100);
  return (
    <div className="container-page max-w-3xl py-8"><div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">نظرات سالن</h1><Link href="/owner" className="text-sm font-bold text-brand-600">پنل مالک</Link></div>
      <div className="mt-5">{rows.length === 0 ? <EmptyState title="هنوز نظری ثبت نشده است" /> : (
        <ul className="space-y-3">{rows.map(({ r, venue, name }) => (
          <li key={r.id} className="card p-4"><div className="flex items-center justify-between gap-2"><p className="font-bold">{venue} <span className="font-normal text-ink-500">· {name || 'کاربر'} · {formatJalaliShort(r.createdAt)}</span></p><Stars value={r.rating} /></div>
            {r.comment && <p className="mt-2 text-sm leading-7 text-ink-700">{r.comment}</p>}</li>))}</ul>)}</div></div>
  );
}
