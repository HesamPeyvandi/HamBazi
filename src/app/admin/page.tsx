import Link from 'next/link';
import { requireRole } from '@/server/auth/rbac';
import { adminOverview } from '@/server/admin';
import { AdminNav } from '@/components/layout/AdminNav';
import { formatToman, toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'پنل ادمین' };
export default async function AdminHome() {
  const u = await requireRole(['admin']);
  const o = await adminOverview(u);
  const cards: [string, string, string?][] = [
    ['کاربران', toFa(o.users.users), `${toFa(o.users.managers)} مالک · ${toFa(o.users.suspended)} تعلیق`],
    ['سالن‌های منتشرشده', toFa(o.venues.published), `${toFa(o.venues.pending)} در انتظار تأیید`],
    ['رزروهای قطعی', toFa(o.reservations.confirmed)],
    ['حجم پرداخت (شبیه‌سازی)', formatToman(o.reservations.gmv)],
    ['کارمزد پلتفرم', formatToman(o.reservations.fees)],
    ['گزارش‌های باز', toFa(o.openReports)],
  ];
  return (
    <div className="container-page max-w-4xl py-8"><h1 className="mb-4 text-2xl font-extrabold">پنل ادمین</h1><AdminNav current="/admin" />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">{cards.map(([k, v, s]) => (
        <div key={k} className="card p-4"><dt className="text-sm text-ink-500">{k}</dt><dd className="mt-1 text-xl font-extrabold">{v}</dd>{s && <p className="text-xs text-ink-500">{s}</p>}</div>))}</dl>
      {(o.venues.pending > 0 || o.openReports > 0) && <p className="mt-5 text-sm">نیازمند اقدام: {o.venues.pending > 0 && <Link className="font-bold text-brand-600" href="/admin/venues">{toFa(o.venues.pending)} سالن در انتظار تأیید</Link>} {o.openReports > 0 && <Link className="font-bold text-brand-600" href="/admin/reports">{toFa(o.openReports)} گزارش باز</Link>}</p>}
    </div>
  );
}
