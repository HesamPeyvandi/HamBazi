import { identityColor } from '@/lib/ui/identity-color';
import Link from 'next/link';
import { Star, ChevronRight, ChevronLeft } from 'lucide-react';
import { formatDecimal, formatNumber, toFa } from '@/lib/i18n/digits';

export function Rating({ value, count, size = 'sm' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex items-center gap-1 font-bold" aria-label={`امتیاز ${formatDecimal(value)} از ۵`}>
      <Star className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} fill="#f5b50a" stroke="#f5b50a" aria-hidden />
      <span>{formatDecimal(value)}</span>
      {count != null && <span className="font-normal text-ink-500 text-xs">({formatNumber(count)})</span>}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${toFa(value)} از ۵ ستاره`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="h-4 w-4" fill={i <= value ? '#f5b50a' : 'none'} stroke={i <= value ? '#f5b50a' : '#cbd5e1'} aria-hidden />
      ))}
    </span>
  );
}

export function Avatar({ src, name, size = 40, seed }: { src?: string | null; name: string; size?: number; seed?: string }) {
  const c = identityColor(seed || name || '؟');
  const initials = (name || '؟').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('‌');
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" width={size} height={size} className="rounded-full object-cover bg-brand-50" style={{ width: size, height: size }} loading="lazy" />
    : <span className="inline-flex items-center justify-center rounded-full font-bold" style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: c.bg, color: c.fg }} aria-hidden>{initials}</span>;
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="صفحه‌بندی" className="mt-8 flex items-center justify-center gap-2">
      {page > 1 && <Link href={hrefFor(page - 1)} className="btn btn-ghost btn-sm" aria-label="صفحهٔ قبل"><ChevronRight className="h-4 w-4" aria-hidden /></Link>}
      {nums.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && nums[i - 1] !== p - 1 && <span aria-hidden className="text-ink-400">…</span>}
          <Link href={hrefFor(p)} aria-current={p === page ? 'page' : undefined}
            className={`btn btn-sm min-w-9 ${p === page ? 'btn-primary' : 'btn-ghost'}`}>{toFa(p)}</Link>
        </span>
      ))}
      {page < pages && <Link href={hrefFor(page + 1)} className="btn btn-ghost btn-sm" aria-label="صفحهٔ بعد"><ChevronLeft className="h-4 w-4" aria-hidden /></Link>}
    </nav>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-lg font-bold">{title}</p>
      {text && <p className="mt-2 text-ink-500">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Player rating badge: Latin digits only (like a game card), soft diagonal stripes on the green disc, number and label tucked together at the centre. */
export function OvrBadge({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span role="img" aria-label={`OVR ${value}`} dir="ltr"
      className={`grid h-14 w-14 shrink-0 place-content-center rounded-full bg-brand-600 text-center text-white shadow-inner ring-2 ring-brand-100 ${className}`}
      style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.13) 0 3px, transparent 3px 7px)', fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif' }}>
      <span aria-hidden className="block text-[1.2rem] font-extrabold leading-none tabular-nums">{value}</span>
      <span aria-hidden className="mt-0.5 block text-[0.58rem] font-bold leading-none tracking-wider opacity-90">OVR</span>
    </span>
  );
}
