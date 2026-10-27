import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { listNotifications, unreadCount } from '@/server/booking/notifications';
import { markNotificationsReadAction } from '@/server/booking/actions';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'اعلان‌ها' };

export default async function NotificationsPage() {
  const u = await requireUser('/notifications');
  const [items, unread] = await Promise.all([listNotifications(u.id), unreadCount(u.id)]);
  return (
    <div className="container-page max-w-2xl py-8">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">اعلان‌ها</h1>
        {unread > 0 && <form action={markNotificationsReadAction}><button className="btn btn-ghost btn-sm">علامت‌گذاری همه به‌عنوان خوانده‌شده ({toFa(unread)})</button></form>}</div>
      <div className="mt-5">{items.length === 0 ? <EmptyState title="اعلانی ندارید" /> : (
        <ul className="space-y-2">{items.map((n) => {
          const inner = (<><div className="flex items-start justify-between gap-3"><p className={n.readAt ? 'font-semibold' : 'font-extrabold'}>{!n.readAt && <span className="me-2 inline-block h-2 w-2 rounded-full bg-brand-600" aria-label="خوانده‌نشده" />}{n.title}</p><time className="shrink-0 text-xs text-ink-500">{formatJalaliDateTime(n.createdAt)}</time></div>{n.body && <p className="mt-1 text-sm text-ink-700">{n.body}</p>}</>);
          return <li key={n.id}>{n.link ? <Link href={n.link} className="card block p-4 hover:border-brand-600">{inner}</Link> : <div className="card p-4">{inner}</div>}</li>;
        })}</ul>)}</div>
    </div>
  );
}
