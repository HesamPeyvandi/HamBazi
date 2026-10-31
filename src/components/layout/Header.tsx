import Link from 'next/link';
import { Bell, MessageCircle, Search } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/misc';
import { DesktopNav } from './NavLinks';
import { HeaderShell } from './HeaderShell';
import { HeaderIconLink } from './HeaderIconLink';
import { currentUser } from '@/server/auth/session';
import { unreadCount, unreadChatCount } from '@/server/booking/notifications';

export async function Header() {
  const user = await currentUser();
  const [unread, unreadChat] = user ? await Promise.all([unreadCount(user.id), unreadChatCount(user.id)]) : [0, 0];
  return (
    <HeaderShell>
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="هم‌بازی — صفحهٔ اصلی" className="flex items-center"><Logo dark /></Link>
          <DesktopNav />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/venues" aria-label="جستجوی سالن" className="hidden sm:grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><Search className="h-5 w-5" aria-hidden /></Link>
          {user ? (
            <>
              <HeaderIconLink href="/chat" label="گفت‌وگوها" count={unreadChat}><MessageCircle className="h-5 w-5" aria-hidden /></HeaderIconLink>
              <HeaderIconLink href="/notifications" label="اعلان‌ها" count={unread}><Bell className="h-5 w-5" aria-hidden /></HeaderIconLink>
              <Link href="/owner" className="hidden rounded-full px-3 py-1.5 text-sm text-white/85 hover:bg-white/10 md:block">{user.role === 'player' ? 'سالن دارید؟' : 'پنل مالک'}</Link>
              <Link href="/profile" aria-label="پروفایل من" className="rounded-full ring-2 ring-white/20"><Avatar seed={user.id} src={user.avatarUrl} name={user.displayName || 'کاربر'} size={36} /></Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-sm border border-white/40 text-white hover:bg-white/10">ورود</Link>
              <Link href="/register" className="btn btn-sm bg-accent text-brand-950 hover:brightness-95">ثبت‌نام</Link>
            </>
          )}
        </div>
      </div>
    </HeaderShell>
  );
}
