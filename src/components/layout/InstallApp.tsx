'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Download, MoreVertical, Share, X, Zap, Smartphone, Wifi } from 'lucide-react';

/**
 * "Install the web app" experience for people who use the site in a browser.
 *  - Popup shortly after opening the site (only where installing is possible: one click on Chromium, steps on iOS),
 *    with a "don't show again" option (localStorage). Closing without the option hides it for the rest of the session.
 *  - A permanent entry in the footer for every browser visitor (installed/standalone users never see either).
 * The browser's `beforeinstallprompt` event is captured once at module level so every component shares it.
 */
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
export type InstallKind = 'prompt' | 'ios' | 'manual' | 'none';

const HIDE_KEY = 'hb_install_hide';   // "don't show again" (localStorage)
const SESSION_KEY = 'hb_install_seen'; // closed once in this session (sessionStorage)

let deferred: InstallEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

function store(kind: 'local' | 'session') {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; } // blocked storage must never break the page
}
const read = (k: 'local' | 'session', key: string) => { try { return store(k)?.getItem(key) ?? null; } catch { return null; } };
const write = (k: 'local' | 'session', key: string, v: string) => { try { store(k)?.setItem(key, v); } catch { /* ignore */ } };

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const kindNow = (): InstallKind => (isStandalone() || installed ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'manual');
// useSyncExternalStore needs a stable primitive snapshot: the kind string.
const useKind = () => useSyncExternalStore(subscribe, kindNow, () => 'none' as InstallKind);

/** Mount once in the root layout: captures the install event and renders the popup. */
export function InstallManager() {
  useEffect(() => {
    const before = (e: Event) => { e.preventDefault(); deferred = e as InstallEvent; emit(); };
    const done = () => { installed = true; deferred = null; write('local', HIDE_KEY, '1'); emit(); };
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', done); };
  }, []);
  return <InstallPopup />;
}

async function install(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  await e.prompt();
  const choice = await e.userChoice.catch(() => null);
  deferred = null; // the browser allows one prompt per event
  if (choice?.outcome === 'accepted') { installed = true; write('local', HIDE_KEY, '1'); }
  emit();
  return choice?.outcome === 'accepted';
}

function InstallPopup() {
  const kind = useKind();
  const [open, setOpen] = useState(false);
  const eligible = kind === 'prompt' || kind === 'ios'; // popups only where there is something to offer
  useEffect(() => {
    if (!eligible || read('local', HIDE_KEY) === '1' || read('session', SESSION_KEY) === '1') return;
    const t = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [eligible]);
  if (!open || !eligible) return null;
  return <InstallDialog kind={kind} withOptOut onClose={(optOut) => { write('session', SESSION_KEY, '1'); if (optOut) write('local', HIDE_KEY, '1'); setOpen(false); }} />;
}

export function InstallDialog({ kind, withOptOut = false, onClose }: { kind: InstallKind; withOptOut?: boolean; onClose: (optOut: boolean) => void }) {
  const [optOut, setOptOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const latest = useRef({ optOut, onClose });
  useEffect(() => { latest.current = { optOut, onClose }; });
  const close = () => onClose(optOut);
  useEffect(() => { // mount only: move focus into the dialog, close on Esc, give focus back afterwards
    const prev = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') latest.current.onClose(latest.current.optOut); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={close} aria-label="بستن" className="absolute start-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-page"><X className="h-5 w-5" aria-hidden /></button>
        <div className="flex items-center gap-4">
          <Image src="/icons/icon-192.png" alt="" width={64} height={64} className="h-16 w-16 rounded-2xl shadow" />
          <div>
            <h2 id="install-title" className="text-lg font-extrabold">نصب وب‌اپ هم‌بازی</h2>
            <p className="text-sm text-ink-500">مثل یک برنامهٔ واقعی، بدون نیاز به فروشگاه.</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-ink-700">
          <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-brand-600" aria-hidden />دسترسی سریع از صفحهٔ اصلی گوشی یا رایانه</li>
          <li className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-brand-600" aria-hidden />تمام‌صفحه و بدون نوار مرورگر</li>
          <li className="flex items-center gap-2"><Wifi className="h-4 w-4 text-brand-600" aria-hidden />حجم بسیار کم و بارگذاری سریع‌تر</li>
        </ul>
        {kind === 'prompt' ? (
          <button ref={primary} type="button" disabled={busy} className="btn btn-primary mt-5 w-full"
            onClick={async () => { setBusy(true); const ok = await install(); setBusy(false); if (ok) onClose(true); else if (!deferred) close(); }}>
            <Download className="h-5 w-5" aria-hidden />نصب هم‌بازی
          </button>
        ) : (
          <div className="mt-5 rounded-2xl bg-brand-50 p-4 text-sm leading-7 text-ink-700">
            {kind === 'ios' ? (
              <ol className="list-decimal space-y-1 ps-5">
                <li>در Safari دکمهٔ <Share className="inline h-4 w-4 align-text-bottom" aria-label="اشتراک‌گذاری" /> را بزنید.</li>
                <li>گزینهٔ «Add to Home Screen» را انتخاب کنید.</li>
                <li>روی «Add» بزنید.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1 ps-5">
                <li>منوی مرورگر <MoreVertical className="inline h-4 w-4 align-text-bottom" aria-label="منو" /> را باز کنید.</li>
                <li>«Install app» یا «Add to Home screen» را بزنید.</li>
              </ol>
            )}
            <button ref={primary} type="button" className="btn btn-primary mt-3 w-full" onClick={close}>متوجه شدم</button>
          </div>
        )}
        {withOptOut && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />دیگر به من نمایش نده
            </label>
            <button type="button" className="text-sm font-semibold text-ink-500 hover:text-ink-900" onClick={close}>الان نه</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Footer entry: always visible to browser visitors (hidden once the app is installed or when running as the app). */
export function InstallButton({ className = '' }: { className?: string }) {
  const kind = useKind();
  const [open, setOpen] = useState(false);
  if (kind === 'none') return null;
  return (
    <div className={className}>
      <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:underline"
        onClick={async () => { if (kind === 'prompt') { await install(); } else setOpen(true); }}>
        <Download className="h-4 w-4" aria-hidden />نصب وب‌اپ هم‌بازی
      </button>
      {open && <InstallDialog kind={kind} onClose={() => setOpen(false)} />}
    </div>
  );
}
