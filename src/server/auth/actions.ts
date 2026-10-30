'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requestOtp, verifyOtp } from './otp';
import { clearSessionCookie, clientContext, currentUser, revokeSessionToken, SESSION_COOKIE, setSessionCookie } from './session';
import { safeRedirectPath } from './rbac';
import { normalizeIranMobile } from '@/lib/i18n/phone';
import { normalizeDigits } from '@/lib/i18n/digits';
import { env } from '../env';

export interface FormState { error?: string; fieldErrors?: Record<string, string>; ok?: boolean }
const OTP_PHONE_COOKIE = 'hb_otp_phone';
const OTP_ERRORS: Record<string, string> = {
  invalid_phone: 'شمارهٔ موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹',
  sms_failed: 'ارسال پیامک ممکن نشد. لطفاً کمی بعد دوباره تلاش کنید.',
};

async function startOtp(phone: string, next: string, meta?: { name?: string; referral?: string }): Promise<FormState> {
  const ctx = await clientContext();
  const r = await requestOtp(phone, { ip: ctx.ip, meta });
  if (!r.ok) {
    if (r.error === 'rate_limited') {
      const wait = r.retryAfterSeconds ?? 60;
      if (wait <= 120) {
        // within cooldown: let the user continue with the code already sent
        const p = normalizeIranMobile(phone);
        if (p) { await setOtpCookie(p); redirect(`/login/verify?next=${encodeURIComponent(next)}`); }
      }
      return { error: 'تعداد درخواست‌ها زیاد است. لطفاً بعداً دوباره تلاش کنید.' };
    }
    return { error: OTP_ERRORS[r.error] ?? 'خطای ناشناخته' };
  }
  await setOtpCookie(r.phone);
  redirect(`/login/verify?next=${encodeURIComponent(next)}`);
}
async function setOtpCookie(phone: string) {
  (await cookies()).set(OTP_PHONE_COOKIE, phone, { httpOnly: true, sameSite: 'lax', path: '/login', maxAge: 600, secure: env().appUrl.startsWith('https://') });
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const next = safeRedirectPath(String(fd.get('next') ?? '/'));
  return startOtp(String(fd.get('phone') ?? ''), next);
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'نام و نام خانوادگی را وارد کنید').max(60),
  phone: z.string().min(1, 'شمارهٔ موبایل را وارد کنید'),
  referral: z.string().trim().max(16).optional(),
  terms: z.literal('on', { message: 'پذیرش قوانین و مقررات الزامی است' }),
});
export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  if (!normalizeIranMobile(parsed.data.phone)) return { fieldErrors: { phone: OTP_ERRORS.invalid_phone } };
  return startOtp(parsed.data.phone, '/profile', { name: parsed.data.name, referral: normalizeDigits(parsed.data.referral ?? '') || undefined });
}

export async function resendAction(): Promise<FormState> {
  const phone = (await cookies()).get(OTP_PHONE_COOKIE)?.value;
  if (!phone) redirect('/login');
  const ctx = await clientContext();
  const r = await requestOtp(phone, { ip: ctx.ip });
  if (!r.ok) {
    return { error: r.error === 'rate_limited' ? `برای ارسال مجدد کد کمی صبر کنید${r.retryAfterSeconds && r.retryAfterSeconds <= 120 ? ` (${r.retryAfterSeconds} ثانیه)` : ''}.` : OTP_ERRORS[r.error] };
  }
  return { ok: true };
}

export async function verifyAction(_: FormState, fd: FormData): Promise<FormState> {
  const phone = (await cookies()).get(OTP_PHONE_COOKIE)?.value;
  if (!phone) return { error: 'زمان ورود به پایان رسیده است. دوباره شمارهٔ موبایل را وارد کنید.' };
  const next = safeRedirectPath(String(fd.get('next') ?? '/'));
  const ctx = await clientContext();
  const r = await verifyOtp(phone, String(fd.get('code') ?? ''), ctx);
  if (!r.ok) {
    return { error: r.error === 'too_many_attempts' ? 'تعداد تلاش‌های ناموفق زیاد بود. کد جدید درخواست کنید.' : 'کد واردشده نادرست یا منقضی شده است.' };
  }
  await setSessionCookie(r.token, r.expiresAt);
  (await cookies()).delete({ name: OTP_PHONE_COOKIE, path: '/login' });
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, r.userId));
  // Venue managers land in their own panel by default; an explicit deep link (e.g. /owner/reservations) is still honoured.
  const dest = next === '/' && u.role === 'venue_manager' ? '/owner' : next;
  redirect(!u.onboardedAt ? `/onboarding?next=${encodeURIComponent(dest)}` : dest);
}

export async function logoutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionToken(token);
  await clearSessionCookie();
  redirect('/');
}

/* ---------- onboarding & profile ---------- */
const SKILL_KEYS: Record<string, string[]> = {
  futsal: ['shooting', 'passing', 'dribbling', 'defense', 'speed', 'stamina'],
  volleyball: ['serving', 'receiving', 'setting', 'attacking', 'blocking', 'defense'],
};
const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'نام را وارد کنید').max(60),
  city: z.string().regex(/^[a-z0-9-]{1,40}$/),
  time: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
});

export async function onboardingAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect('/login');
  const parsed = onboardingSchema.safeParse({ name: fd.get('name'), city: fd.get('city'), time: fd.get('time') || undefined });
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const sportKeys = fd.getAll('sport').map(String).filter((s) => s in SKILL_KEYS);
  if (!sportKeys.length) return { fieldErrors: { sport: 'حداقل یک ورزش را انتخاب کنید' } };

  const [city] = await db().select().from(schema.cities).where(eq(schema.cities.slug, parsed.data.city)).limit(1);
  const sportRows = await db().select().from(schema.sports);
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ displayName: parsed.data.name, onboardedAt: user.onboardedAt ?? new Date() }).where(eq(schema.users.id, user.id));
    await tx.update(schema.userProfiles).set({ cityId: city?.id, preferredSports: sportKeys, preferredTime: parsed.data.time ?? null, updatedAt: new Date() })
      .where(eq(schema.userProfiles.userId, user.id));
    for (const key of sportKeys) {
      const sport = sportRows.find((s) => s.key === key);
      if (!sport) continue;
      // self-assessment: 1..10 per category (server-validated), stored on a 10..100 scale
      const scores: Record<string, number> = {};
      for (const c of SKILL_KEYS[key]) {
        const raw = Number(normalizeDigits(String(fd.get(`skill_${key}_${c}`) ?? '5')));
        scores[c] = Math.min(10, Math.max(1, Math.round(Number.isFinite(raw) ? raw : 5))) * 10;
      }
      const ovr = Math.min(99, Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length));
      const level = ovr < 45 ? 'beginner' : ovr < 75 ? 'intermediate' : 'pro';
      await tx.insert(schema.playerSportProfiles).values({ userId: user.id, sportId: sport.id, selfScores: scores, ovr, level })
        .onConflictDoUpdate({ target: [schema.playerSportProfiles.userId, schema.playerSportProfiles.sportId], set: { selfScores: scores, ovr, level, updatedAt: new Date() } });
    }
  });
  const dest = safeRedirectPath(String(fd.get('next') ?? '/profile'), '/profile');
  redirect(dest.startsWith('/onboarding') ? '/profile' : dest);
}

const editSchema = z.object({ name: z.string().trim().min(2, 'نام را وارد کنید').max(60), bio: z.string().trim().max(300, 'حداکثر ۳۰۰ کاراکتر') });
export async function editProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect('/login');
  const p = editSchema.safeParse({ name: fd.get('name'), bio: fd.get('bio') ?? '' });
  if (!p.success) return { fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const sportKeys = fd.getAll('sport').map(String).filter((s) => s in SKILL_KEYS);
  const showProfile = fd.get('showProfile') === 'on', showHistory = fd.get('showHistory') === 'on';
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ displayName: p.data.name }).where(eq(schema.users.id, user.id));
    await tx.update(schema.userProfiles).set({ bio: p.data.bio, preferredSports: sportKeys, privacy: { showProfile, showHistory }, updatedAt: new Date() })
      .where(and(eq(schema.userProfiles.userId, user.id)));
  });
  redirect('/profile?saved=1');
}
