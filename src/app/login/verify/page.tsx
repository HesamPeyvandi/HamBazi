import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/layout/AuthShell';
import { VerifyForm } from '@/components/forms/AuthForms';
import { latestMockCode } from '@/server/providers/sms';
import { safeRedirectPath } from '@/server/auth/rbac';
import { formatPhoneDisplay } from '@/lib/i18n/phone';
import { toFa } from '@/lib/i18n/digits';
import { getSetting } from '@/server/settings';

export const metadata = { title: 'تأیید شمارهٔ موبایل' };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const phone = (await cookies()).get('hb_otp_phone')?.value;
  if (!phone) redirect('/login');
  const next = safeRedirectPath((await searchParams).next);
  const [mockCode, ttl] = await Promise.all([latestMockCode(phone), getSetting('otp_ttl_seconds')]);
  return (
    <AuthShell title="تأیید شمارهٔ موبایل" subtitle={`کد ارسال‌شده به ${formatPhoneDisplay(phone)} را وارد کنید. کد تا ${toFa(Math.round(ttl / 60))} دقیقه معتبر است.`}>
      {mockCode && (
        <div className="mb-5 rounded-xl border border-warn-fg/30 bg-warn-bg p-4 text-center" role="status">
          <p className="text-xs font-bold text-warn-fg">حالت دمو — پیامکی ارسال نمی‌شود</p>
          <p className="mt-1 text-sm">کد شما: <bdi className="text-xl font-extrabold tracking-widest">{toFa(mockCode)}</bdi></p>
        </div>
      )}
      <VerifyForm next={next} />
    </AuthShell>
  );
}
