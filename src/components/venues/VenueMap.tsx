'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Navigation, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { navApps } from '@/lib/geo';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const PIN = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 1C9 1 2 8 2 17c0 12 16 28 16 28s16-16 16-28C34 8 27 1 18 1z" fill="#02834a" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="17" r="6.5" fill="#fff"/></svg>';

/** Read-only map with one marker. Leaflet is loaded in the browser only; if tiles cannot load the marker and the nav buttons still work. */
export function VenueMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import('leaflet').Map | undefined; let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !el.current) return;
      map = L.map(el.current, { center: [lat, lng], zoom: 15, scrollWheelZoom: false, attributionControl: false });
      L.control.attribution({ prefix: false }).addTo(map);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([lat, lng], { title: name, keyboard: false, icon: L.divIcon({ html: PIN, className: '', iconSize: [36, 46], iconAnchor: [18, 45] }) }).addTo(map);
    })();
    return () => { dead = true; map?.remove(); };
  }, [lat, lng, name]);
  return <div ref={el} role="region" aria-label={`نقشهٔ موقعیت ${name}`} className="z-0 h-64 w-full overflow-hidden rounded-xl border border-line bg-brand-50 sm:h-80" dir="ltr" />;
}

/** "Route me there": lets the visitor pick the app (Neshan, Balad, Waze, Google Maps) or copy the coordinates. */
export function NavChooser({ lat, lng }: { lat: number; lng: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  async function copy() {
    const t = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable (http) */ }
  }
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)} aria-haspopup="dialog"><Navigation className="h-4 w-4" aria-hidden />مسیریابی</button>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-end bg-black/40 sm:place-items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="انتخاب برنامهٔ مسیریابی" className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold">مسیریابی با…</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="بستن" className="grid h-8 w-8 place-items-center rounded-full hover:bg-page"><X className="h-4 w-4" aria-hidden /></button></div>
            <ul className="space-y-2">
              {navApps(lat, lng).map((a) => (
                <li key={a.key}><a href={a.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-brand-600 hover:bg-brand-50">
                  <span className="font-bold">{a.label}</span><span className="text-xs text-ink-500">{a.hint}</span></a></li>))}
            </ul>
            <button type="button" onClick={copy} className="btn btn-ghost mt-3 w-full"><Copy className="h-4 w-4" aria-hidden />{copied ? 'مختصات کپی شد' : 'کپی مختصات'}</button>
          </div>
        </div>)}
    </>
  );
}
