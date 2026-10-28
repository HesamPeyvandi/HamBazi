'use client';
import { useState } from 'react';
import { createSessionAction } from '@/server/booking/actions';
import { splitShare, calcFee } from '@/server/booking/money';
import { formatToman, toFa } from '@/lib/i18n/digits';

/** Split-payment form. The user picks ONLY the number of players; the per-person share is computed automatically. */
export function SessionForm({ slotId, slotPrice, maxCapacity, defaultTarget, feeBp, feeMin }: { slotId: string; slotPrice: number; maxCapacity: number; defaultTarget: number; feeBp: number; feeMin: number }) {
  const [target, setTarget] = useState(Math.min(Math.max(defaultTarget, 2), maxCapacity));
  const share = splitShare(slotPrice, target);
  const fee = calcFee(share, { percentBp: feeBp, minToman: feeMin });
  const options = Array.from({ length: maxCapacity - 1 }, (_, i) => i + 2);
  return (
    <form action={createSessionAction.bind(null, slotId)} className="space-y-4">
      <div><label className="label" htmlFor="target">تعداد بازیکنان (با خودتان)</label>
        <select id="target" name="target" value={target} onChange={(e) => setTarget(+e.target.value)} className="field">{options.map((n) => <option key={n} value={n}>{toFa(n)} نفر</option>)}</select>
        <p className="help">حداکثر {toFa(maxCapacity)} نفر (ظرفیت سالن). سانس وقتی قطعی می‌شود که همهٔ بازیکنان سهم خود را پرداخت کرده باشند.</p></div>

      <div className="rounded-2xl bg-brand-50 p-4" aria-live="polite" data-testid="share-box">
        <p className="text-sm text-ink-700">سهم هر نفر (محاسبهٔ خودکار)</p>
        <p className="text-2xl font-extrabold text-brand-700" data-testid="share">{formatToman(share)}</p>
        <dl className="mt-2 space-y-1 text-sm text-ink-700">
          <div className="flex justify-between"><dt>کارمزد خدمات (هر نفر)</dt><dd>{formatToman(fee)}</dd></div>
          <div className="flex justify-between font-bold"><dt>پرداخت هر نفر</dt><dd data-testid="per-person-total">{formatToman(share + fee)}</dd></div>
        </dl>
        <p className="help mt-2">هزینهٔ سالن {formatToman(slotPrice)} بین {toFa(target)} نفر تقسیم و برای رندشدن به بالا گرد می‌شود.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="skillMin">حداقل مهارت (OVR)</label><input id="skillMin" name="skillMin" type="number" min={0} max={99} defaultValue={0} className="field" /></div>
        <div><label className="label" htmlFor="skillMax">حداکثر مهارت (OVR)</label><input id="skillMax" name="skillMax" type="number" min={0} max={99} defaultValue={99} className="field" /></div>
      </div>
      <div><label className="label" htmlFor="deadlineHours">مهلت پیوستن</label>
        <select id="deadlineHours" name="deadlineHours" defaultValue="24" className="field">
          <option value="48">۴۸ ساعت قبل از شروع</option><option value="24">۲۴ ساعت قبل از شروع</option><option value="12">۱۲ ساعت قبل از شروع</option><option value="6">۶ ساعت قبل از شروع</option><option value="2">۲ ساعت قبل از شروع</option></select>
        <p className="help">اگر تا آن زمان ظرفیت تکمیل نشود، سانس لغو و مبلغ پرداختی‌ها بازگردانده می‌شود.</p></div>
      <div><label className="label" htmlFor="visibility">نمایش سانس</label>
        <select id="visibility" name="visibility" className="field"><option value="public">عمومی (در فهرست سانس‌های باز)</option><option value="invite_only">فقط با لینک دعوت</option></select></div>
      <div><label className="label" htmlFor="description">توضیحات (اختیاری)</label><textarea id="description" name="description" rows={3} maxLength={500} className="field" /></div>
      <button className="btn btn-primary w-full">ایجاد سانس و پرداخت سهم من</button>
    </form>
  );
}
