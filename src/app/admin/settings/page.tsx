import { requireRole } from '@/server/auth/rbac';
import { currentSettings, EDITABLE, listCancellationPolicies, listFeePolicies } from '@/server/admin';
import { createCancellationPolicyAction, createFeePolicyAction, updateSettingAction } from '@/server/admin/actions';
import { AdminNav } from '@/components/layout/AdminNav';
import { formatJalaliDateTime } from '@/lib/i18n/jalali';
import { formatToman, toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'تنظیمات پلتفرم' };
export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const a = await requireRole(['admin']);
  const q = await searchParams;
  const [cur, fees, pols] = await Promise.all([currentSettings(), listFeePolicies(), listCancellationPolicies()]);
  const fee = fees[0];
  const latest = pols[0];
  return (
    <div className="container-page max-w-3xl py-8"><h1 className="mb-4 text-2xl font-extrabold">تنظیمات پلتفرم</h1><AdminNav current="/admin/settings" />
      <span className="sr-only">{a.displayName}</span>
      {q.ok && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">ذخیره شد.</p>}
      {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}

      <section className="card p-6" aria-labelledby="g-t"><h2 id="g-t" className="section-title">مهلت‌ها</h2>
        <div className="mt-4 space-y-4">{(Object.entries(EDITABLE) as [keyof typeof EDITABLE, (typeof EDITABLE)[keyof typeof EDITABLE]][]).map(([k, d]) => (
          <form key={k} action={updateSettingAction.bind(null, k)} className="flex flex-wrap items-end gap-2"><div className="min-w-56 flex-1"><label className="label" htmlFor={`s-${k}`}>{d.label} ({d.unit})</label>
            <input id={`s-${k}`} name="value" defaultValue={toFa(cur[k])} inputMode="numeric" className="field" /><p className="help">بین {toFa(d.min)} و {toFa(d.max)}</p></div><button className="btn btn-primary">ذخیره</button></form>))}</div></section>

      <section className="card mt-5 p-6" aria-labelledby="f-t"><h2 id="f-t" className="section-title">کارمزد پلتفرم</h2>
        <p className="mt-2 text-sm">فعلی: <b>{fee ? `${toFa((fee.percentBp / 100).toString().replace('.', '٫'))}٪` : '—'}</b> با حداقل <b>{fee ? formatToman(fee.minToman) : '—'}</b>. تغییر فقط روی رزروهای جدید اثر دارد؛ رزروهای قبلی نسخهٔ خودشان را نگه می‌دارند.</p>
        <form action={createFeePolicyAction} className="mt-4 flex flex-wrap items-end gap-2">
          <div><label className="label" htmlFor="fp">درصد (۰ تا ۳۰)</label><input id="fp" name="percent" defaultValue={fee ? toFa((fee.percentBp / 100).toString().replace('.', '٫')) : ''} inputMode="decimal" className="field !w-32" /></div>
          <div><label className="label" htmlFor="fm">حداقل (تومان)</label><input id="fm" name="minToman" defaultValue={fee ? toFa(fee.minToman) : ''} inputMode="numeric" className="field !w-40" /></div>
          <button className="btn btn-primary">ثبت کارمزد جدید</button></form></section>

      <section className="card mt-5 p-6" aria-labelledby="c-t"><h2 id="c-t" className="section-title">سیاست لغو</h2>
        <p className="mt-2 text-sm">نسخهٔ فعلی: <b>{toFa(latest?.version ?? 0)}</b>. هر تغییر یک نسخهٔ جدید می‌سازد و رزروهای قبلی با نسخهٔ خودشان محاسبه می‌شوند. آخرین پلکان باید «۰ ساعت» باشد.</p>
        <ul className="mt-2 text-sm text-ink-700">{latest?.tiers.map((t) => <li key={t.minHoursBefore}>{t.minHoursBefore > 0 ? `حداقل ${toFa(t.minHoursBefore)} ساعت مانده` : 'کمتر از آن / بعد از شروع'}: {toFa(t.refundPercent)}٪ بازگشت</li>)}</ul>
        <form action={createCancellationPolicyAction} className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => { const t = latest?.tiers[i]; return (
            <div key={i} className="flex flex-wrap items-end gap-2"><div><label className="label" htmlFor={`h${i}`}>پلکان {toFa(i + 1)}: حداقل ساعت مانده</label><input id={`h${i}`} name={`h${i}`} defaultValue={t ? toFa(t.minHoursBefore) : ''} inputMode="numeric" className="field !w-32" /></div>
              <div><label className="label" htmlFor={`p${i}`}>درصد بازگشت</label><input id={`p${i}`} name={`p${i}`} defaultValue={t ? toFa(t.refundPercent) : ''} inputMode="numeric" className="field !w-32" /></div></div>); })}
          <button className="btn btn-primary">ثبت نسخهٔ جدید سیاست</button></form>
        <p className="help mt-3">تاریخچه: {pols.map((p) => `نسخهٔ ${toFa(p.version)} (${formatJalaliDateTime(p.activeFrom)})`).join('، ')}</p></section>
    </div>
  );
}
