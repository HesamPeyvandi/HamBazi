'use client';
import { useEffect } from 'react';

/**
 * Product decision: no page zoom. The viewport meta covers phones; on desktop this blocks Ctrl/Cmd + wheel, Ctrl/Cmd + (+ - 0)
 * and the Safari pinch gesture. Zooming from the browser menu cannot be intercepted by a web page.
 */
export function ZoomLock() {
  useEffect(() => {
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0', 'Add', 'Subtract'].includes(e.key)) e.preventDefault(); };
    const gesture = (e: Event) => e.preventDefault();
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    document.addEventListener('gesturestart', gesture);
    return () => { window.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key); document.removeEventListener('gesturestart', gesture); };
  }, []);
  return null;
}
