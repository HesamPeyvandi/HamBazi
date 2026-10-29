import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { requireUser } from '@/server/auth/rbac';
import { listRooms } from '@/server/messaging';
import { EmptyState } from '@/components/ui/misc';
import { formatJalaliShort, formatTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'گفت‌وگوها' };
export const dynamic = 'force-dynamic';

export default async function ChatListPage() {
  const user = await requireUser('/chat');
  const rooms = await listRooms(user.id);
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="mb-1 text-2xl font-extrabold">گفت‌وگوها</h1>
      <p className="mb-5 text-sm text-ink-500">گفت‌وگوی متنی سانس‌هایی که در آن‌ها قطعی شده‌اید و تیم‌هایتان. پیام خصوصی وجود ندارد.</p>
      {rooms.length === 0 ? <EmptyState title="هنوز گفت‌وگویی ندارید" text="وقتی به یک سانس بپیوندید یا عضو تیمی شوید، گفت‌وگوی آن اینجا ظاهر می‌شود." action={<Link href="/sessions" className="btn btn-primary">دیدن سانس‌های باز</Link>} /> : (
        <ul className="card divide-y divide-line">{rooms.map((r) => {
          const t = r.lastMessageAt ? new Date(r.lastMessageAt) : null;
          return (
            <li key={`${r.kind}-${r.refId}`}><Link href={r.href} className="flex items-center gap-3 p-4 hover:bg-page">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><MessageCircle className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-bold">{r.title}</span>
                <span dir="auto" className="block truncate text-sm text-ink-500">{r.lastBody ? `${r.lastSender ? r.lastSender + ': ' : ''}${r.lastBody}` : 'گفت‌وگو را شروع کنید'}</span></span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-ink-500">{t && <span>{formatJalaliShort(t)} {formatTime(t)}</span>}
                {r.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-bold text-brand-950" aria-label={`${toFa(r.unread)} پیام خوانده‌نشده`}>{toFa(r.unread)}</span>}
                {r.muted && <span>بی‌صدا</span>}</span></Link></li>);
        })}</ul>)}
    </div>
  );
}
