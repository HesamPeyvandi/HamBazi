import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';

export const metadata = { title: 'صفحه پیدا نشد' };
export default function NotFound() {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <LogoMark className="mx-auto h-16 w-16" color="#02834a" />
        <h1 className="mt-4 text-3xl font-extrabold">صفحه‌ای که دنبالش بودید پیدا نشد</h1>
        <p className="mt-2 text-ink-500">ممکن است آدرس اشتباه باشد یا صفحه حذف شده باشد.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn btn-primary">بازگشت به خانه</Link>
          <Link href="/venues" className="btn btn-outline">دیدن سالن‌ها</Link>
        </div>
      </div>
    </div>
  );
}
