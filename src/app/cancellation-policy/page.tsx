import { db } from '@/db/client';
import { activeCancellationPolicy, activeFeePolicy } from '@/server/booking/policy';
import { formatToman, toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'سیاست لغو و بازگشت وجه' };
export const dynamic = 'force-dynamic';

export default async function PolicyPage() {
  const [p, fee] = await Promise.all([activeCancellationPolicy(db() as never), activeFeePolicy(db() as never)]);
  const tiers = [...p.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="text-2xl font-extrabold">سیاست لغو و بازگشت وجه</h1>
      <p className="mt-2 text-sm text-ink-500">نسخهٔ {toFa(p.version)} — هر رزرو با نسخهٔ سیاست زمان ثبتش ذخیره می‌شود و تغییرات بعدی روی آن اثر ندارد.</p>
      <p role="note" className="mt-4 rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn-fg">در این نسخهٔ نمایشی، پرداخت و بازگشت وجه شبیه‌سازی‌شده است و پولی جابه‌جا نمی‌شود.</p>
      <section className="card mt-5 p-6"><h2 className="section-title mb-3">لغو توسط بازیکن</h2>
        <ul className="space-y-2 text-sm leading-7">{tiers.map((t, i) => <li key={t.minHoursBefore}>{i === 0 ? `بیش از ${toFa(t.minHoursBefore)} ساعت قبل از شروع` : `کمتر از ${toFa(tiers[i - 1].minHoursBefore)} ساعت تا شروع`}: بازگشت <b>{toFa(t.refundPercent)}٪</b> مبلغ پرداختی</li>)}
          <li>پس از شروع سانس: بدون بازگشت وجه</li></ul></section>
      <section className="card mt-5 p-6"><h2 className="section-title mb-3">موارد بازگشت کامل (۱۰۰٪)</h2>
        <ul className="list-disc space-y-2 ps-5 text-sm leading-7"><li>لغو سانس توسط سالن</li><li>نرسیدن سانس باز به حداقل نفرات تا مهلت پیوستن (لغو خودکار)</li><li>پرداخت‌نشدن سهم میزبان در مهلت ۱۵ دقیقه‌ای</li></ul></section>
      <section className="card mt-5 p-6"><h2 className="section-title mb-3">کارمزد خدمات</h2>
        <p className="text-sm leading-7">کارمزد {toFa(fee.percentBp / 100)}٪ مبلغ (حداقل {formatToman(fee.minToman)}) به هر پرداخت اضافه می‌شود. بازگشت وجه درصد تعیین‌شده را از کل مبلغ پرداخت‌شده در نظر می‌گیرد.</p></section>
    </div>
  );
}
