'use client';
import { useActionState, useState } from 'react';
import { onboardingAction, editProfileAction, type FormState } from '@/server/auth/actions';
import { toFa } from '@/lib/i18n/digits';
import { PLAY_TIMES } from '@/lib/play-times';

function TimesField({ defaults }: { defaults: string[] }) {
  return (
    <fieldset><legend className="label">زمان‌های ترجیحی بازی <span className="font-normal text-ink-500">(می‌توانید چند مورد را انتخاب کنید)</span></legend>
      <div className="flex flex-wrap gap-3">{PLAY_TIMES.map(([v, t]) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"><input type="checkbox" name="time" value={v} defaultChecked={defaults.includes(v)} className="checkbox" />{t}</label>))}</div></fieldset>
  );
}

interface SportInfo { key: string; nameFa: string; skills: { key: string; nameFa: string }[] }
const init: FormState = {};

function Err({ s, k }: { s: FormState; k: string }) { return s.fieldErrors?.[k] ? <p className="error-text" role="alert">{s.fieldErrors[k]}</p> : null; }

function Slider({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  const [v, setV] = useState(defaultValue);
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3">
      <label htmlFor={name} className="text-sm">{label}</label>
      <input id={name} name={name} type="range" min={1} max={10} step={1} value={v} onChange={(e) => setV(+e.target.value)} className="w-full accent-[#02834a]" aria-valuetext={`${toFa(v)} از ۱۰`} />
      <output className="text-center font-bold">{toFa(v)}</output>
    </div>
  );
}

export function OnboardingForm({ sports, cities, defaults, next }: {
  sports: SportInfo[]; cities: { slug: string; nameFa: string }[];
  defaults: { name: string; city: string; sports: string[]; times: string[]; scores: Record<string, Record<string, number>> }; next: string;
}) {
  const [s, action, pending] = useActionState(onboardingAction, init);
  const [chosen, setChosen] = useState<string[]>(defaults.sports);
  const toggle = (k: string) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      {s.error && <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{s.error}</p>}
      <div><label htmlFor="name" className="label">نام و نام خانوادگی</label>
        <input id="name" name="name" defaultValue={defaults.name} className="field" autoComplete="name" /><Err s={s} k="name" /></div>
      <div><label htmlFor="city" className="label">شهر</label>
        <select id="city" name="city" defaultValue={defaults.city} className="field">{cities.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}</select></div>
      <fieldset><legend className="label">ورزش‌های مورد علاقه</legend>
        <div className="flex flex-wrap gap-3">{sports.map((sp) => (
          <label key={sp.key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 ${chosen.includes(sp.key) ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
            <input type="checkbox" name="sport" value={sp.key} checked={chosen.includes(sp.key)} onChange={() => toggle(sp.key)} className="checkbox" />{sp.nameFa}</label>))}</div>
        <Err s={s} k="sport" /></fieldset>
      <TimesField defaults={defaults.times} />

      {sports.filter((sp) => chosen.includes(sp.key)).map((sp) => (
        <fieldset key={sp.key} className="rounded-2xl border border-line p-4">
          <legend className="px-2 font-bold">خودارزیابی مهارت — {sp.nameFa}</legend>
          <p className="help mb-3">به هر مهارت از ۱ تا ۱۰ نمره بدهید. این فقط یک تخمین اولیه است و با نظر هم‌بازی‌ها دقیق‌تر می‌شود.</p>
          <div className="space-y-3">{sp.skills.map((k) => <Slider key={k.key} name={`skill_${sp.key}_${k.key}`} label={k.nameFa} defaultValue={Math.round((defaults.scores[sp.key]?.[k.key] ?? 50) / 10)} />)}</div>
        </fieldset>
      ))}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? 'در حال ذخیره…' : 'ذخیره و ادامه'}</button>
    </form>
  );
}

export function EditProfileForm({ defaults, sports }: { defaults: { name: string; bio: string; sports: string[]; times: string[]; showProfile: boolean; showHistory: boolean }; sports: { key: string; nameFa: string }[] }) {
  const [s, action, pending] = useActionState(editProfileAction, init);
  const [bio, setBio] = useState(defaults.bio);
  return (
    <form action={action} className="space-y-5" noValidate>
      <div><label htmlFor="name" className="label">نام و نام خانوادگی</label><input id="name" name="name" defaultValue={defaults.name} className="field" /><Err s={s} k="name" /></div>
      <div><label htmlFor="bio" className="label">توضیحات</label>
        <textarea id="bio" name="bio" rows={4} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} className="field" />
        <p className="help">{toFa(bio.length)} / {toFa(300)}</p><Err s={s} k="bio" /></div>
      <fieldset><legend className="label">ورزش‌ها</legend>
        <div className="flex flex-wrap gap-3">{sports.map((sp) => (
          <label key={sp.key} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-4"><input type="checkbox" name="sport" value={sp.key} defaultChecked={defaults.sports.includes(sp.key)} className="checkbox" />{sp.nameFa}</label>))}</div></fieldset>
      <TimesField defaults={defaults.times} />
      <fieldset><legend className="label">حریم خصوصی</legend>
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="showProfile" defaultChecked={defaults.showProfile} className="checkbox" />نمایش پروفایل من به سایر کاربران</label>
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="showHistory" defaultChecked={defaults.showHistory} className="checkbox" />نمایش سابقهٔ بازی‌ها</label>
        <p className="help">شمارهٔ موبایل شما هرگز به دیگران نمایش داده نمی‌شود.</p></fieldset>
      <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">{pending ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</button>
    </form>
  );
}
