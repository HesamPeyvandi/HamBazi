'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER, validCoord } from '@/lib/geo';
import { TILE_URL } from '@/components/venues/VenueMap';

const PIN = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 1C9 1 2 8 2 17c0 12 16 28 16 28s16-16 16-28C34 8 27 1 18 1z" fill="#02834a" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="17" r="6.5" fill="#fff"/></svg>';

/** Click the map (or drag the pin) to set the venue location. Submits through two hidden inputs: lat, lng. Optional. */
export function LocationPicker({ lat, lng }: { lat?: number | null; lng?: number | null }) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(validCoord(lat, lng) ? { lat: lat as number, lng: lng as number } : null);
  useEffect(() => {
    let map: import('leaflet').Map | undefined; let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !el.current) return;
      const start = pos ?? DEFAULT_CENTER;
      map = L.map(el.current, { center: [start.lat, start.lng], zoom: pos ? 16 : 13, attributionControl: false });
      L.control.attribution({ prefix: false }).addTo(map);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const icon = L.divIcon({ html: PIN, className: '', iconSize: [36, 46], iconAnchor: [18, 45] });
      let marker: import('leaflet').Marker | undefined;
      const place = (p: { lat: number; lng: number }) => {
        if (marker) marker.setLatLng([p.lat, p.lng]);
        else { marker = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(map!); marker.on('dragend', () => { const q = marker!.getLatLng(); setPos({ lat: q.lat, lng: q.lng }); }); }
        setPos({ lat: p.lat, lng: p.lng });
      };
      if (pos) place(pos);
      map.on('click', (e) => place({ lat: e.latlng.lat, lng: e.latlng.lng }));
    })();
    return () => { dead = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; later positions come from the map itself
  }, []);
  return (
    <div>
      <p className="label">موقعیت روی نقشه (اختیاری ولی توصیه می‌شود)</p>
      <div ref={el} role="application" aria-label="انتخاب موقعیت سالن روی نقشه" className="z-0 h-64 w-full overflow-hidden rounded-xl border border-line bg-brand-50" dir="ltr" />
      <input type="hidden" name="lat" value={pos ? pos.lat.toFixed(6) : ''} />
      <input type="hidden" name="lng" value={pos ? pos.lng.toFixed(6) : ''} />
      <p className="help mt-1">{pos ? `موقعیت انتخاب شد (${pos.lat.toFixed(5)}، ${pos.lng.toFixed(5)}). برای تغییر، روی نقشه کلیک کنید یا پین را بکشید.` : 'روی نقشه کلیک کنید تا پین گذاشته شود.'}</p>
    </div>
  );
}
