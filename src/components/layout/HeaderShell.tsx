'use client';
import { usePathname } from 'next/navigation';

/** On pages that open with a photo hero (home, venues list) the header floats transparently over the hero photo; everywhere else it is the solid sticky bar. */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const home = path === '/' || path === '/venues'; // pages that start with a photo hero
  if (home) {
    // zero-height wrapper: the header overlays the hero without pushing it down (and stays under the demo banner)
    return <div className="relative z-50 h-0"><header className="absolute inset-x-0 top-0 bg-transparent text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">{children}</header></div>;
  }
  return <header className="sticky top-0 z-50 bg-brand-900 text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">{children}</header>;
}
