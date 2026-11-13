'use client';
import { useEffect, useMemo, useRef } from 'react';

/** Debounced callback: runs `fn` once, `wait` ms after the LAST call. The latest `fn` is always used; pending call is cancelled on unmount. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, wait = 400) {
  const latest = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { latest.current = fn; });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return useMemo(() => {
    const call = (...args: A) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { timer.current = null; latest.current(...args); }, wait); };
    call.cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
    return call;
  }, [wait]);
}
