'use client';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

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
