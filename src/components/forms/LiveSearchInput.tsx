'use client';
import { useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/SubmitButton';
import { useDebouncedCallback } from '@/lib/client/debounce';

/**
 * Text filter that updates the page as you type, without a request per keystroke: the URL (`?q=`) is updated 400 ms after
 * the last keystroke, only when the term actually changed (and is empty or at least 2 characters). Other query params
 * are preserved and `page` is reset. It sits inside a normal GET <form>, so Enter / the submit button still work without JS.
 */
export function LiveSearchInput({ name = 'q', defaultValue = '', className = 'field', wait = 400, ...rest }: {
  name?: string; defaultValue?: string; className?: string; wait?: number;
  id?: string; placeholder?: string; 'aria-label'?: string;
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(defaultValue);
  const lastSent = useRef(defaultValue.trim());

  const push = useDebouncedCallback((raw: string) => {
    const term = raw.trim().slice(0, 60);
    if (term === lastSent.current || (term.length === 1)) return; // unchanged, or too short to be useful
    lastSent.current = term;
    const next = new URLSearchParams(sp.toString());
    if (term) next.set(name, term); else next.delete(name);
    next.delete('page');
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }, wait);

  return (
    <span className="relative block">
      <input type="search" name={name} value={value} autoComplete="off" maxLength={60} className={className} {...rest}
        onChange={(e) => { setValue(e.target.value); push(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') push.cancel(); }} />
      {pending && <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-brand-600" aria-hidden><Spinner /></span>}
    </span>
  );
}
