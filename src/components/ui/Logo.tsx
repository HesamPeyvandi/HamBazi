export function LogoMark({ className = 'h-9 w-9', color = 'currentColor' }: { className?: string; color?: string }) {
  // Original mark: two linked loops (people playing together) with a ball-dot above.
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="24" cy="9" r="4.2" fill={color} />
      <path d="M24 20.5c-3.2-5.3-14.5-6.2-15.2 3.8-.7 9.7 9 14.8 15.2 9.2 6.2 5.6 15.9.5 15.2-9.2-.7-10-12-9.1-15.2-3.8Z"
        stroke={color} strokeWidth="5.2" strokeLinejoin="round" />
    </svg>
  );
}
export function Logo({ dark = false, size = 'md' }: { dark?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const mark = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const text = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  return (
    <span className="inline-flex items-center gap-2" dir="rtl">
      <LogoMark className={mark} color={dark ? '#2ee07a' : '#02834a'} />
      <span className={`${text} font-extrabold tracking-tight ${dark ? 'text-white' : 'text-brand-900'}`}>هم‌بازی</span>
    </span>
  );
}
