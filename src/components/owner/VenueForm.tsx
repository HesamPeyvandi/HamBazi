import { FACILITIES } from '@/lib/facilities';
import { LocationPicker } from '@/components/owner/LocationPicker';

interface Props {
  action: (fd: FormData) => void | Promise<void>;
  cities: { id: string; nameFa: string }[];
  sports: { id: string; nameFa: string; defaultCapacity: number }[];
  defaults?: { name: string; cityId: string; address: string; neighborhood: string; description: string; surface: string; openHours: string; rules: string[]; facilities: string[]; lat?: number | null; lng?: number | null;
    sports: { sportId: string; pricePerSlot: number; slotMinutes: number; maxCapacity: number }[] };
  submitLabel: string;
}
export function VenueForm({ action, cities, sports, defaults: d, submitLabel }: Props) {
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="name">نام سالن</label><input id="name" name="name" required minLength={3} maxLength={80} defaultValue={d?.name} className="field" /></div>
        <div><label className="label" htmlFor="cityId">شهر</label><select id="cityId" name="cityId" defaultValue={d?.cityId} className="field">{cities.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}</select></div>
        <div><label className="label" htmlFor="neighborhood">محله</label><input id="neighborhood" name="neighborhood" defaultValue={d?.neighborhood} className="field" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="address">آدرس</label><input id="address" name="address" required defaultValue={d?.address} className="field" /></div>
        <div className="sm:col-span-2"><LocationPicker lat={d?.lat} lng={d?.lng} /></div>
        <div><label className="label" htmlFor="surface">نوع کفپوش</label><input id="surface" name="surface" defaultValue={d?.surface} className="field" placeholder="مثلاً پارکت" /></div>
        <div><label className="label" htmlFor="openHours">ساعت فعالیت</label><input id="openHours" name="openHours" defaultValue={d?.openHours} className="field" placeholder="۱۰ صبح تا ۱۲ شب" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="description">توضیحات</label><textarea id="description" name="description" rows={4} maxLength={1500} defaultValue={d?.description} className="field" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="rules">قوانین سالن (هر قانون در یک خط)</label><textarea id="rules" name="rules" rows={3} defaultValue={d?.rules.join('\n')} className="field" /></div>
      </div>
      <fieldset><legend className="label">امکانات</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(FACILITIES).map(([k, t]) => (
          <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3"><input type="checkbox" name="facility" value={k} defaultChecked={d?.facilities.includes(k)} className="checkbox" />{t}</label>))}</div></fieldset>
      <fieldset><legend className="label">ورزش‌ها و قیمت</legend>
        <div className="space-y-3">{sports.map((s) => { const cur = d?.sports.find((x) => x.sportId === s.id); return (
          <div key={s.id} className="rounded-2xl border border-line p-4">
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" name={`sport_${s.id}`} defaultChecked={!!cur || (!d && sports[0]?.id === s.id)} className="checkbox" />{s.nameFa}</label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><label className="label" htmlFor={`price_${s.id}`}>قیمت هر سانس (تومان)</label><input id={`price_${s.id}`} name={`price_${s.id}`} inputMode="numeric" defaultValue={cur?.pricePerSlot ?? 200000} className="field" /></div>
              <div><label className="label" htmlFor={`minutes_${s.id}`}>مدت سانس (دقیقه)</label><input id={`minutes_${s.id}`} name={`minutes_${s.id}`} inputMode="numeric" defaultValue={cur?.slotMinutes ?? 90} className="field" /></div>
              <div><label className="label" htmlFor={`cap_${s.id}`}>ظرفیت سالن (نفر)</label><input id={`cap_${s.id}`} name={`cap_${s.id}`} inputMode="numeric" defaultValue={cur?.maxCapacity ?? s.defaultCapacity} className="field" /></div>
            </div></div>); })}</div></fieldset>
      <button className="btn btn-primary w-full sm:w-auto">{submitLabel}</button>
    </form>
  );
}
