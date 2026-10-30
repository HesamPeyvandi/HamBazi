'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, WifiOff } from 'lucide-react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/** Registers the service worker (production only) and shows an offline banner. */
export function PwaRegister() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* optional enhancement */ });
    }
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync); window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-warn-bg px-4 py-1.5 text-xs font-semibold text-warn-fg">
      <WifiOff className="h-4 w-4" aria-hidden />اتصال اینترنت قطع است؛ تا وصل شدن دوباره، بعضی بخش‌ها کار نمی‌کنند.
    </div>
  );
}

const noop = () => () => {};
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Install the app" button: Chromium prompt when available; a short hint for iOS Safari; hidden when already installed. */
export function InstallButton({ className = '' }: { className?: string }) {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const [hint, setHint] = useState(false);
  const standalone = useSyncExternalStore(noop, isStandalone, () => true); // server: hidden
  const ios = useSyncExternalStore(noop, isIos, () => false);
  useEffect(() => {
    const before = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const done = () => { setInstalledNow(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', done); };
  }, []);
  if (standalone || installedNow || (!evt && !ios)) return null;
  return (
    <div className={className}>
      <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:underline"
        onClick={async () => { if (evt) { await evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); } else setHint((h) => !h); }}>
        <Download className="h-4 w-4" aria-hidden />نصب هم‌بازی روی گوشی
      </button>
      {hint && <p className="mt-2 max-w-xs text-xs leading-6 text-white/70">در Safari دکمهٔ «اشتراک‌گذاری» را بزنید و «Add to Home Screen» را انتخاب کنید.</p>}
    </div>
  );
}
