'use client';
import { useEffect } from 'react';

export const SPLASH_COOKIE = 'hb_splash';
const MIN_VISIBLE_MS = 900;

/** Marks the splash as seen for this browser session (session cookie), then fades it out. The node is only hidden with CSS, never removed by hand: React owns it and removes it itself on the next layout render. */
export function SplashDismiss() {
  useEffect(() => {
    const el = document.getElementById('hb-splash');
    try { document.cookie = `${SPLASH_COOKIE}=1; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch { /* cookies blocked: the splash simply shows on every full load */ }
    if (!el) return;
    const t1 = setTimeout(() => el.classList.add('hb-splash-out'), MIN_VISIBLE_MS);
    return () => clearTimeout(t1);
  }, []);
  return null;
}
