'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toFa } from '@/lib/i18n/digits';

/**
 * Header icon with an unread badge (bell, chat). The layout is NOT re-rendered on client-side navigation, so the server count
 * would stay stale: while the visitor is inside the section the badge is hidden at once, and when they leave it (or arrive) the
 * layout is refreshed so the number is the real one again.
 */
export function HeaderIconLink({ href, label, count, children }: { href: string; label: string; count: number; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const inside = path === href || path.startsWith(href + '/');
  const was = useRef(inside);
  useEffect(() => {
    if (was.current !== inside) router.refresh(); // entered or left the section: fetch fresh counts
    was.current = inside;
  }, [inside, router]);
  const shown = inside ? 0 : count;
  return (
    <Link href={href} aria-label={shown ? `${label} (${toFa(shown)} خوانده‌نشده)` : label} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
      {children}
      {shown > 0 && <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-bold text-brand-950">{toFa(shown)}</span>}
    </Link>
  );
}
