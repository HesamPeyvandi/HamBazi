'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toFa } from '@/lib/i18n/digits';

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const n = images.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  return (
    <div className="min-w-0">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-brand-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={`${alt} — تصویر ${toFa(i + 1)}`} className="h-full w-full object-cover" />
        {n > 1 && (<>
          <button type="button" onClick={() => go(1)} aria-label="تصویر بعد" className="absolute start-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(-1)} aria-label="تصویر قبل" className="absolute end-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow"><ChevronRight className="h-5 w-5" /></button>
          <span className="absolute end-3 bottom-3 rounded-lg bg-black/55 px-2 py-0.5 text-xs text-white">{toFa(i + 1)} / {toFa(n)}</span>
        </>)}
      </div>
      {n > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="تصاویر سالن">
          {images.map((src, k) => (
            <li key={src + k} className="shrink-0">
              <button type="button" onClick={() => setI(k)} aria-label={`نمایش تصویر ${toFa(k + 1)}`} aria-current={k === i}
                className={`block h-16 w-24 overflow-hidden rounded-lg border-2 ${k === i ? 'border-brand-600' : 'border-transparent'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
