import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/layout/AuthShell';
import { LoginForm } from '@/components/forms/AuthForms';
import { currentUser } from '@/server/auth/session';
import { safeRedirectPath } from '@/server/auth/rbac';
import { isMockSmsActive } from '@/server/providers/sms';
import { env } from '@/server/env';
import { db, schema } from '@/db/client';
import { inArray } from 'drizzle-orm';
import { formatPhoneDisplay } from '@/lib/i18n/phone';

export const metadata = { title: 'ورود' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  if (await currentUser()) redirect(next);
  // Demo accounts are listed only in demo/development with the mock SMS provider.
  const demo = env().appEnv !== 'production' && isMockSmsActive()
    ? await db().select().from(schema.users).where(inArray(schema.users.phoneE164, ['+989000000001', '+989000000002', '+989000000003'])) : [];
  const ROLE: Record<string, string> = { player: 'بازیکن', venue_manager: 'مدیر سالن', admin: 'ادمین' };
  return (
    <AuthShell title="ورود به حساب کاربری" subtitle="شمارهٔ موبایل خود را وارد کنید تا کد ورود برایتان ارسال شود.">
      <LoginForm next={next} />
      {demo.length > 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-page p-4 text-sm">
          <p className="mb-2 font-bold">حساب‌های ورود سریع</p>
          <ul className="space-y-1">{demo.map((u) => <li key={u.id} className="flex justify-between"><span>{ROLE[u.role]} — {u.displayName}</span><bdi className="font-mono">{formatPhoneDisplay(u.phoneE164)}</bdi></li>)}</ul>
        </div>
      )}
    </AuthShell>
  );
}
