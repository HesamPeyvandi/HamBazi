import { env } from '@/server/env';

export function DemoBanner() {
  if (env().appEnv !== 'demo') return null;
  return (
    <div role="status" className="bg-warn-bg px-4 py-1.5 text-center text-xs font-semibold text-warn-fg">
      محیط دمو — اطلاعات این سایت نمونه است و پرداخت‌ها شبیه‌سازی می‌شوند.
    </div>
  );
}
