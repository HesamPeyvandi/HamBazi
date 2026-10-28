import Link from 'next/link';
const ITEMS = [['/admin', 'نمای کلی'], ['/admin/venues', 'سالن‌ها'], ['/admin/users', 'کاربران'], ['/admin/reports', 'گزارش‌ها'], ['/admin/settings', 'تنظیمات'], ['/admin/audit', 'لاگ تغییرات']] as const;
export function AdminNav({ current }: { current: string }) {
  return (
    <nav aria-label="پنل ادمین" className="mb-5 flex flex-wrap gap-2">
      {ITEMS.map(([href, t]) => <Link key={href} href={href} aria-current={current === href ? 'page' : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${current === href ? 'bg-brand-600 text-white' : 'border border-line bg-white text-ink-700 hover:border-brand-600'}`}>{t}</Link>)}
    </nav>
  );
}
