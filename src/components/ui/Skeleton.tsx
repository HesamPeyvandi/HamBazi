import type { CSSProperties } from 'react';

/** Loading placeholders (shimmer defined in globals.css as `.skel`). Pure server components: no JS, no layout shift. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skel ${className}`} style={style} aria-hidden="true" />;
}
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? '60%' : '100%' }} />)}
    </div>
  );
}
/** Wrapper: announces "loading" to assistive tech once, hides the decorative blocks. */
export function SkeletonPage({ children, label = 'در حال بارگذاری…', narrow = false }: { children: React.ReactNode; label?: string; narrow?: boolean }) {
  return (
    <div className={`container-page py-6 ${narrow ? 'max-w-2xl' : ''}`} role="status" aria-busy="true" aria-live="polite" data-testid="skeleton">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
export function SkeletonHeading({ sub = true }: { sub?: boolean }) {
  return <div className="mb-5 space-y-2"><Skeleton className="h-7 w-48" />{sub && <Skeleton className="h-4 w-72 max-w-full" />}</div>;
}
export function SkeletonCard({ image = true }: { image?: boolean }) {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      {image && <Skeleton className="aspect-[16/10] w-full !rounded-none" />}
      <div className="space-y-3 p-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3.5 w-1/2" /><div className="flex gap-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-16" /></div></div>
    </div>
  );
}
export function SkeletonGrid({ count = 6, image = true }: { count?: number; image?: boolean }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: count }, (_, i) => <SkeletonCard key={i} image={image} />)}</div>;
}
export function SkeletonRow() {
  return (
    <div className="card flex items-center gap-3 p-4" aria-hidden="true">
      <Skeleton className="h-11 w-11 shrink-0 !rounded-full" />
      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
      <Skeleton className="h-8 w-16" />
    </div>
  );
}
export function SkeletonList({ count = 5 }: { count?: number }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, i) => <SkeletonRow key={i} />)}</div>;
}
export function SkeletonFilters() {
  return <div className="mb-5 flex flex-wrap gap-3" aria-hidden="true"><Skeleton className="h-12 w-40" /><Skeleton className="h-12 w-56" /><Skeleton className="h-12 w-24" /></div>;
}
export function SkeletonDetail() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]" aria-hidden="true">
      <div className="space-y-5"><Skeleton className="aspect-[16/9] w-full" /><Skeleton className="h-7 w-2/3" /><SkeletonText lines={4} /></div>
      <div className="card space-y-4 p-5"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-11 w-full" /></div>
    </div>
  );
}
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="card space-y-5 p-5" aria-hidden="true">
      {Array.from({ length: fields }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-12 w-full" /></div>)}
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden="true">{Array.from({ length: count }, (_, i) => <div key={i} className="card space-y-2 p-4"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-7 w-24" /></div>)}</div>;
}
