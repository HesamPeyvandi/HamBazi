'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Fills exactly the space between the site header and the bottom nav, and locks the page scroll while a room is open
 * (only the message list scrolls). Measured, not hard-coded, so the demo banner / offline banner / iOS bars cannot cause a page scroll.
 */
export function ChatShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current; if (!el) return;
      const nav = document.querySelector<HTMLElement>('nav[aria-label="منوی پایین"]');
      const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setH(Math.max(320, Math.floor(vh - el.getBoundingClientRect().top - navH)));
    };
    fit();
    window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); };
  }, []);
  useEffect(() => {
    const root = document.documentElement; const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = prev; };
  }, []);
  return <div ref={ref} style={h ? { height: h } : { height: '70vh' }} className="container-page flex max-w-3xl flex-col py-3">{children}</div>;
}
