import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { DemoBanner } from '@/components/layout/DemoBanner';
import { BottomNav } from '@/components/layout/NavLinks';
import { currentUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: { default: 'هم‌بازی — رزرو سالن ورزشی و پیدا کردن هم‌بازی', template: '%s | هم‌بازی' },
  description: 'رزرو آسان سالن‌های ورزشی، پیدا کردن هم‌بازی و پرداخت مطمئن؛ همه در یک پلتفرم.',
};
export const viewport: Viewport = { themeColor: '#03352f', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="fa" dir="rtl">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-3">پرش به محتوای اصلی</a>
        <DemoBanner />
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <BottomNav loggedIn={!!user} />
      </body>
    </html>
  );
}
