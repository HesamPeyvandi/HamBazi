'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { JALALI_MONTHS, JALALI_WEEKDAYS, jalaliMonthLength, jalaliToUtc, toJalali } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';

const pad = (n: number) => String(n).padStart(2, '0');
function parse(v?: string) {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { jy: +m[1], jm: +m[2], jd: +m[3] } : null;
}

/** Jalali date picker. Submits an ASCII "YYYY-MM-DD" Jalali value; displays Persian digits and month names. */
export function JalaliDatePicker({ name, defaultValue, placeholder = 'همه تاریخ‌ها', label, minToday = true }:
  { name: string; defaultValue?: string; placeholder?: string; label: string; minToday?: boolean }) {
  const [value, setValue] = useState(parse(defaultValue));
  const today = useMemo(() => toJalali(new Date()), []);
  const [view, setView] = useState({ jy: value?.jy ?? today.jy, jm: value?.jm ?? today.jm });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const len = jalaliMonthLength(view.jy, view.jm);
  const offset = toJalali(jalaliToUtc(view.jy, view.jm, 1, 12, 0)).weekdayIndex;
  const move = (d: number) => setView((v) => {
    let jm = v.jm + d, jy = v.jy;
    if (jm > 12) { jm = 1; jy++; } if (jm < 1) { jm = 12; jy--; }
    return { jy, jm };
  });
  const isPast = (jd: number) => minToday && (view.jy < today.jy || (view.jy === today.jy && (view.jm < today.jm || (view.jm === today.jm && jd < today.jd))));
  const text = value ? toFa(`${value.jd} ${JALALI_MONTHS[value.jm - 1]} ${value.jy}`) : placeholder;

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value ? `${value.jy}-${pad(value.jm)}-${pad(value.jd)}` : ''} />
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-start">
        <span className="min-w-0">
          <span className="block text-[0.7rem] text-ink-500">{label}</span>
          <span className={`block truncate text-sm font-semibold ${value ? 'text-ink-900' : 'text-ink-500'}`}>{text}</span>
        </span>
        <CalendarDays className="h-5 w-5 shrink-0 text-ink-500" aria-hidden />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="انتخاب تاریخ" className="absolute start-0 top-full z-50 mt-2 w-[19rem] rounded-2xl border border-line bg-white p-3 text-ink-900 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => move(-1)} aria-label="ماه قبل" className="grid h-9 w-9 place-items-center rounded-full hover:bg-page"><ChevronRight className="h-4 w-4" /></button>
            <span className="font-bold">{toFa(`${JALALI_MONTHS[view.jm - 1]} ${view.jy}`)}</span>
            <button type="button" onClick={() => move(1)} aria-label="ماه بعد" className="grid h-9 w-9 place-items-center rounded-full hover:bg-page"><ChevronLeft className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[0.7rem] text-ink-500">
            {JALALI_WEEKDAYS.map((w) => <span key={w} className="py-1">{w[0]}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
            {Array.from({ length: offset }).map((_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: len }, (_, i) => i + 1).map((jd) => {
              const sel = value && value.jy === view.jy && value.jm === view.jm && value.jd === jd;
              const isToday = today.jy === view.jy && today.jm === view.jm && today.jd === jd;
              return (
                <button key={jd} type="button" disabled={isPast(jd)} aria-pressed={!!sel}
                  onClick={() => { setValue({ jy: view.jy, jm: view.jm, jd }); setOpen(false); }}
                  className={`mx-auto grid h-9 w-9 place-items-center rounded-full disabled:text-ink-400/50 disabled:cursor-not-allowed
                    ${sel ? 'bg-brand-600 text-white font-bold' : isToday ? 'ring-1 ring-brand-600 hover:bg-brand-50' : 'hover:bg-brand-50'}`}>
                  {toFa(jd)}
                </button>
              );
            })}
          </div>
          {value && (
            <button type="button" onClick={() => { setValue(null); setOpen(false); }} className="mt-2 flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900">
              <X className="h-3 w-3" aria-hidden /> پاک کردن تاریخ
            </button>
          )}
        </div>
      )}
    </div>
  );
}
