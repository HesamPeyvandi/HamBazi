'use client';
import { useEffect, useState } from 'react';
import { toFa } from '@/lib/i18n/digits';

export function Countdown({ until }: { until: string }) {
  const end = new Date(until).getTime();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => { const t = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000))); t(); const id = setInterval(t, 1000); return () => clearInterval(id); }, [end]);
  if (left == null) return <span>—</span>;
  const m = Math.floor(left / 60), s = left % 60;
  return <time dateTime={until} role="timer" aria-live="off" className={`font-extrabold tabular-nums ${left < 120 ? 'text-danger-fg' : ''}`}>{left === 0 ? 'مهلت تمام شد' : `${toFa(String(m).padStart(2, '0'))}:${toFa(String(s).padStart(2, '0'))}`}</time>;
}
