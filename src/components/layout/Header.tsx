import Link from 'next/link';
import { Bell, MessageCircle, Search } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/misc';
import { DesktopNav } from './NavLinks';
import { currentUser } from '@/server/auth/session';
import { unreadCount, unreadChatCount } from '@/server/booking/notifications';
import { toFa } from '@/lib/i18n/digits';

export async function Header() {
  const user = await currentUser();
  const [unread, unreadChat] = user ? await Promise.all([unreadCount(user.id), unreadChatCount(user.id)]) : [0, 0];
  return (
    <header className="sticky top-0 z-50 bg-brand-900 text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="هم‌بازی — صفحهٔ اصلی"><Logo dark /></Link>
          <DesktopNav />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/venues" aria-label="جستجوی سالن" className="hidden sm:grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><Search className="h-5 w-5" aria-hidden /></Link>
          {user ? (
            <>
              <Link href="/chat" aria-label={unreadChat ? `گفت‌وگوها (${toFa(unreadChat)} خوانده‌نشده)` : 'گفت‌وگوها'} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><MessageCircle className="h-5 w-5" aria-hidden />{unreadChat > 0 && <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-bold text-brand-950">{toFa(unreadChat)}</span>}</Link>
              <Link href="/notifications" aria-label={unread ? `اعلان‌ها (${toFa(unread)} خوانده‌نشده)` : 'اعلان‌ها'} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><Bell className="h-5 w-5" aria-hidden />{unread > 0 && <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-bold text-brand-950">{toFa(unread)}</span>}</Link>
              <Link href="/owner" className="hidden rounded-full px-3 py-1.5 text-sm text-white/85 hover:bg-white/10 md:block">{user.role === 'player' ? 'سالن دارید؟' : 'پنل مالک'}</Link>
              <Link href="/profile" aria-label="پروفایل من" className="rounded-full ring-2 ring-white/20"><Avatar src={user.avatarUrl} name={user.displayName || 'کاربر'} size={36} /></Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-sm border border-white/40 text-white hover:bg-white/10">ورود</Link>
              <Link href="/register" className="btn btn-sm bg-accent text-brand-950 hover:brightness-95">ثبت‌نام</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
