'use client';
import { useActionState } from 'react';
import { ArrowLeft, Smartphone, User, Gift, ShieldCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { loginAction, registerAction, verifyAction, resendAction, type FormState } from '@/server/auth/actions';

const init: FormState = {};
function Err({ s, k }: { s: FormState; k: string }) { return s.fieldErrors?.[k] ? <p className="error-text" role="alert">{s.fieldErrors[k]}</p> : null; }
function Top({ s }: { s: FormState }) { return s.error ? <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{s.error}</p> : null; }

export function LoginForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState(loginAction, init);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Top s={s} />
      <div>
        <label htmlFor="phone" className="label">شمارهٔ موبایل</label>
        <div className="relative">
          <Smartphone className="pointer-events-none absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹" className="field pe-12" dir="ltr" style={{ textAlign: 'right' }} required aria-describedby="phone-help" />
        </div>
        <p id="phone-help" className="help">کد ورود به این شماره پیامک می‌شود.</p>
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? 'در حال ارسال…' : 'دریافت کد ورود'}<ArrowLeft className="h-4 w-4" aria-hidden /></button>
      <p className="text-center text-sm text-ink-500">حساب کاربری ندارید؟ <Link href="/register" className="font-bold text-brand-600">ثبت‌نام کنید</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const [s, action, pending] = useActionState(registerAction, init);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Top s={s} />
      <div>
        <label htmlFor="name" className="label">نام و نام خانوادگی</label>
        <div className="relative"><User className="pointer-events-none absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input id="name" name="name" autoComplete="name" className="field pe-12" required aria-invalid={!!s.fieldErrors?.name} /></div>
        <Err s={s} k="name" />
      </div>
      <div>
        <label htmlFor="phone" className="label">شمارهٔ موبایل</label>
        <div className="relative"><Smartphone className="pointer-events-none absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹" className="field pe-12" dir="ltr" style={{ textAlign: 'right' }} required aria-invalid={!!s.fieldErrors?.phone} /></div>
        <Err s={s} k="phone" />
      </div>
      <div>
        <label htmlFor="referral" className="label">کد معرف (اختیاری)</label>
        <div className="relative"><Gift className="pointer-events-none absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input id="referral" name="referral" className="field pe-12" dir="ltr" style={{ textAlign: 'right' }} /></div>
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="terms" className="checkbox mt-0.5" />
          <span>با <Link href="/terms" className="font-bold text-brand-600" target="_blank">قوانین و مقررات</Link> و <Link href="/privacy" className="font-bold text-brand-600" target="_blank">حریم خصوصی</Link> موافقم.</span></label>
        <Err s={s} k="terms" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? 'در حال ارسال…' : 'ثبت‌نام و دریافت کد'}<ArrowLeft className="h-4 w-4" aria-hidden /></button>
      <p className="flex items-center justify-center gap-2 rounded-xl bg-page p-3 text-xs text-ink-500"><ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />اطلاعات شما امن و محرمانه خواهد ماند.</p>
      <p className="text-center text-sm text-ink-500">قبلاً ثبت‌نام کرده‌اید؟ <Link href="/login" className="font-bold text-brand-600">وارد شوید</Link></p>
    </form>
  );
}

export function VerifyForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState(verifyAction, init);
  const [r, resend, resending] = useActionState(async () => resendAction(), init);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {(s.error) && <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{s.error}</p>}
        <div>
          <label htmlFor="code" className="label">کد تأیید ۶ رقمی</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required autoFocus
            className="field text-center text-2xl font-bold tracking-[0.5em]" placeholder="••••••" />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? 'در حال بررسی…' : 'تأیید و ورود'}<ArrowLeft className="h-4 w-4" aria-hidden /></button>
      </form>
      <form action={resend} className="text-center">
        {r.error && <p className="mb-2 text-sm text-danger-fg" role="alert">{r.error}</p>}
        {r.ok && <p className="mb-2 text-sm text-brand-700" role="status">کد جدید ارسال شد.</p>}
        <button type="submit" disabled={resending} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600"><RefreshCw className="h-4 w-4" aria-hidden />ارسال مجدد کد</button>
      </form>
      <p className="text-center text-sm"><Link href="/login" className="text-ink-500">تغییر شمارهٔ موبایل</Link></p>
    </div>
  );
}
