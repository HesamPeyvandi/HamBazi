'use client';
import { useState } from 'react';
import { createSessionAction } from '@/server/booking/actions';
import { suggestPricePerParticipant } from '@/server/booking/money';
import { formatToman, toFa } from '@/lib/i18n/digits';

export function SessionForm({ slotId, slotPrice, maxCapacity, defaultTarget, feeBp, feeMin }: { slotId: string; slotPrice: number; maxCapacity: number; defaultTarget: number; feeBp: number; feeMin: number }) {
  const [target, setTarget] = useState(Math.min(defaultTarget, maxCapacity));
  const [min, setMin] = useState(Math.max(2, Math.min(target, Math.ceil(target * 0.7))));
  const suggested = suggestPricePerParticipant(slotPrice, min);
  const [price, setPrice] = useState<number | null>(null);
  const p = price ?? suggested;
  const fee = Math.max(feeMin, Math.ceil((p * feeBp) / 100000) * 10);
  return (
    <form action={createSessionAction.bind(null, slotId)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="target">ظرفیت هدف (نفر)</label>
          <input id="target" name="target" type="number" inputMode="numeric" min={2} max={maxCapacity} value={target} onChange={(e) => { const v = +e.target.value; setTarget(v); if (min > v) setMin(v); }} className="field" />
          <p className="help">حداکثر {toFa(maxCapacity)} نفر (ظرفیت سالن)</p></div>
        <div><label className="label" htmlFor="min">حداقل برای قطعی شدن</label>
          <input id="min" name="min" type="number" inputMode="numeric" min={2} max={target} value={min} onChange={(e) => setMin(+e.target.value)} className="field" />
          <p className="help">مثلاً {toFa(7)} از {toFa(10)}</p></div>
      </div>
      <div><label className="label" htmlFor="price">سهم هر نفر (تومان)</label>
        <input id="price" name="price" type="number" inputMode="numeric" step={1000} value={p} onChange={(e) => setPrice(+e.target.value)} className="field" />
        <p className="help">پیشنهاد: {formatToman(suggested)} (هزینهٔ سالن / حداقل نفرات). کارمزد خدمات هر نفر: {formatToman(fee)}.</p></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="skillMin">حداقل مهارت (OVR)</label><input id="skillMin" name="skillMin" type="number" min={0} max={99} defaultValue={0} className="field" /></div>
        <div><label className="label" htmlFor="skillMax">حداکثر مهارت (OVR)</label><input id="skillMax" name="skillMax" type="number" min={0} max={99} defaultValue={99} className="field" /></div>
      </div>
      <div><label className="label" htmlFor="deadlineHours">مهلت پیوستن</label>
        <select id="deadlineHours" name="deadlineHours" defaultValue="24" className="field">
          <option value="48">۴۸ ساعت قبل از شروع</option><option value="24">۲۴ ساعت قبل از شروع</option><option value="12">۱۲ ساعت قبل از شروع</option><option value="6">۶ ساعت قبل از شروع</option><option value="2">۲ ساعت قبل از شروع</option></select>
        <p className="help">اگر تا آن زمان به حداقل نفرات نرسد، سانس لغو و مبلغ پرداختی‌ها بازگردانده می‌شود.</p></div>
      <div><label className="label" htmlFor="visibility">نمایش سانس</label>
        <select id="visibility" name="visibility" className="field"><option value="public">عمومی (در فهرست سانس‌های باز)</option><option value="invite_only">فقط با لینک دعوت</option></select></div>
      <div><label className="label" htmlFor="description">توضیحات (اختیاری)</label><textarea id="description" name="description" rows={3} maxLength={500} className="field" /></div>
      <button className="btn btn-primary w-full">ایجاد سانس و پرداخت سهم من</button>
    </form>
  );
}
