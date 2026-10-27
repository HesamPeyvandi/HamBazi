import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export function Footer() {
  return (
    <footer className="mt-16 bg-brand-950 pb-24 text-white/80 lg:pb-0">
      <div className="container-page grid gap-8 py-10 md:grid-cols-3">
        <div>
          <Logo dark size="sm" />
          <p className="mt-3 max-w-xs text-sm leading-7">رزرو سالن‌های ورزشی، پیدا کردن هم‌بازی و پرداخت آسان؛ همه در یک پلتفرم.</p>
        </div>
        <nav aria-label="پیوندهای مفید" className="text-sm">
          <p className="mb-3 font-bold text-white">دسترسی سریع</p>
          <ul className="space-y-2">
            <li><Link href="/venues" className="hover:text-white">سالن‌های ورزشی</Link></li>
            <li><Link href="/sessions" className="hover:text-white">سانس‌های باز</Link></li>
            <li><Link href="/teams" className="hover:text-white">تیم‌ها و گروه‌ها</Link></li>
          </ul>
        </nav>
        <nav aria-label="قوانین" className="text-sm">
          <p className="mb-3 font-bold text-white">قوانین</p>
          <ul className="space-y-2">
            <li><Link href="/terms" className="hover:text-white">شرایط استفاده</Link></li>
            <li><Link href="/privacy" className="hover:text-white">حریم خصوصی</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">© هم‌بازی — همهٔ حقوق محفوظ است.</div>
    </footer>
  );
}
