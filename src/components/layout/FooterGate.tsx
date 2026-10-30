'use client';
import { usePathname } from 'next/navigation';

/** The footer is hidden inside an open chat room (the room fills the screen like a messenger). */
export function FooterGate({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  if (/^\/chat\/[0-9a-f-]{36}\/?$/i.test(p)) return null;
  return <>{children}</>;
}
