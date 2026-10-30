import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, BellOff, Bell } from 'lucide-react';
import { requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { getMessages, isMuted, listBlocked } from '@/server/messaging';
import { blockAction, muteAction } from '@/server/messaging/actions';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { ChatShell } from '@/components/chat/ChatShell';
import { formatJalaliWithWeekday, formatTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'گفت‌وگو' };
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;
const OK: Record<string, string> = { muted: 'اعلان این گفت‌وگو خاموش شد.', unmuted: 'اعلان این گفت‌وگو روشن شد.', blocked: 'کاربر مسدود شد؛ پیام‌های او را نمی‌بینید.', unblocked: 'کاربر از حالت مسدود خارج شد.' };

export default async function ChatRoomPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<{ ok?: string; err?: string; n?: string }> }) {
  const { roomId } = await params; const q = await searchParams;
  const user = await requireUser(`/chat/${roomId}`);
  if (!UUID.test(roomId)) notFound();
  let data;
  try { data = await getMessages(user.id, roomId, { markRead: true }); } catch (e) { if (e instanceof DomainError) notFound(); throw e; }
  const { access } = data;
  const [muted, blocked] = await Promise.all([isMuted(user.id, roomId), listBlocked(user.id, roomId)]);
  const when = access.subtitle ? new Date(access.subtitle) : null;
  return (
    <ChatShell>
      <Link href="/chat" className="mb-1 inline-flex w-fit shrink-0 items-center gap-1 text-sm text-brand-600"><ArrowRight className="h-4 w-4" aria-hidden />همهٔ گفت‌وگوها</Link>
      <header className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-extrabold">{access.title}</h1>
          <p className="text-sm text-ink-500">{toFa(access.memberCount)} عضو{when ? ` · ${formatJalaliWithWeekday(when)}، ${formatTime(when)}` : ''} · <Link className="text-brand-600" href={access.href}>{access.kind === 'session' ? 'صفحهٔ سانس' : 'صفحهٔ تیم'}</Link></p></div>
        <form action={muteAction.bind(null, roomId, !muted)}><button className="btn btn-ghost btn-sm">{muted ? <><Bell className="h-4 w-4" aria-hidden />روشن‌کردن اعلان</> : <><BellOff className="h-4 w-4" aria-hidden />خاموش‌کردن اعلان</>}</button></form>
      </header>
      {q.ok && OK[q.ok] && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">{OK[q.ok]}</p>}
      {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <details className="mb-2 shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold text-ink-700">درباره این گفت‌وگو{blocked.length > 0 ? ` · ${toFa(blocked.length)} مسدودشده` : ''}</summary>
        <p className="help">فقط اعضای این {access.kind === 'session' ? 'سانس' : 'تیم'} این گفت‌وگو را می‌بینند. پیام‌ها متنی هستند و پس از ۹۰ روز پاک می‌شوند. رفتار نامناسب را گزارش دهید.</p>
      {blocked.length > 0 && (
        <section className="mt-3" aria-labelledby="blk"><h2 id="blk" className="mb-2 text-sm font-bold">کاربران مسدودشده در این گفت‌وگو</h2>
          <ul className="space-y-1 text-sm">{blocked.map((b) => <li key={b.userId} className="flex items-center justify-between"><span>{b.name || 'کاربر'}</span>
            <form action={blockAction.bind(null, roomId, b.userId, false)}><button className="text-brand-600">رفع مسدودی</button></form></li>)}</ul></section>)}
      </details>
      <ChatRoom key={q.n ?? 'init'} roomId={roomId} initial={data.messages} hasMoreInitial={data.hasMore} canWrite={access.canWrite} peerReadInitial={data.peerRead} updCursorInitial={new Date().getTime()} />
    </ChatShell>
  );
}
