import Link from 'next/link';
import { Hourglass } from 'lucide-react';
export const metadata = { title: 'به‌زودی' };

const NAMES: Record<string, string> = {
  booking: 'رزرو سالن', notifications: 'اعلان‌ها', sessions: 'سانس‌های باز', teams: 'تیم‌ها و گروه‌ها',
};
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div>
        <Hourglass className="mx-auto h-12 w-12 text-brand-600" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold">{(f && NAMES[f]) || 'این بخش'} به‌زودی فعال می‌شود</h1>
        <p className="mt-2 text-ink-500">در حال ساخت این قسمت هستیم؛ به‌زودی در دسترس خواهد بود.</p>
        <Link href="/venues" className="btn btn-primary mt-6">دیدن سالن‌ها</Link>
      </div>
    </div>
  );
}
