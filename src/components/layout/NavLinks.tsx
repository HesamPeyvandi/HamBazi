'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, CalendarDays, User, Users } from 'lucide-react';

const ITEMS = [
  { href: '/', label: 'خانه', icon: Home, match: (p: string) => p === '/' },
  { href: '/venues', label: 'سالن‌ها', icon: LayoutGrid, match: (p: string) => p.startsWith('/venues') },
  { href: '/sessions', label: 'سانس‌های باز', icon: CalendarDays, match: (p: string) => p.startsWith('/sessions') },
  { href: '/teams', label: 'تیم‌ها و گروه‌ها', icon: Users, match: (p: string) => p.startsWith('/teams') },
];

export function DesktopNav() {
  const p = usePathname();
  return (
    <nav aria-label="منوی اصلی" className="hidden lg:flex items-center gap-8">
      {ITEMS.map((i) => {
        const active = i.match(p);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}
            className={`relative py-5 text-[0.95rem] font-medium transition-colors ${active ? 'text-accent' : 'text-white/85 hover:text-white'}`}>
            {i.label}
            {active && <span className="absolute inset-x-0 bottom-2 h-0.5 rounded bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ loggedIn }: { loggedIn: boolean }) {
  const p = usePathname();
  const items = [
    ITEMS[0], ITEMS[1], ITEMS[2],
    { href: loggedIn ? '/profile' : '/login', label: loggedIn ? 'پروفایل' : 'ورود', icon: User, match: (x: string) => x.startsWith('/profile') || x.startsWith('/login') },
  ];
  return (
    <nav aria-label="منوی پایین" className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((i) => {
          const active = i.match(p);
          const Icon = i.icon;
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? 'page' : undefined}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold ${active ? 'text-brand-600' : 'text-ink-500'}`}>
                <Icon className="h-6 w-6" aria-hidden />
                {i.label}
                <span className={`h-0.5 w-6 rounded ${active ? 'bg-brand-600' : 'bg-transparent'}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
