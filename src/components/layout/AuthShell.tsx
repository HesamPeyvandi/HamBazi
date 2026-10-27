import { Logo } from '@/components/ui/Logo';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative isolate bg-gradient-to-b from-brand-900 to-brand-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/img/hall-c.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover opacity-15" />
      <div className="container-page flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center py-10 lg:py-16">
        <div className="mb-6 text-center"><Logo dark size="lg" /><p className="mt-1 text-sm text-white/80">با هم، بازی کنیم</p></div>
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1 mb-6 text-sm text-ink-500">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
