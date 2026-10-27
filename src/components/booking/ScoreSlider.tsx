'use client';
import { useState } from 'react';
import { toFa } from '@/lib/i18n/digits';

export function ScoreSlider({ id, name, label }: { id: string; name: string; label: string }) {
  const [v, setV] = useState(6);
  return (
    <div className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="range" min={1} max={10} step={1} value={v} onChange={(e) => setV(+e.target.value)} className="w-full accent-[#02834a]" aria-valuetext={`${toFa(v)} از ${toFa(10)}`} />
      <output className="text-center font-bold">{toFa(v)}</output>
    </div>
  );
}
