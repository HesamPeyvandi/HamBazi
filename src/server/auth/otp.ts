import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { normalizeIranMobile } from '@/lib/i18n/phone';
import { normalizeDigits } from '@/lib/i18n/digits';
import { getSetting } from '../settings';
import { rateLimit } from '../ratelimit';
import { getSmsProvider } from '../providers/sms';
import { generateOtp, ipHash, otpHash, safeEqualHex } from './crypto';
import { createSession } from './session';
import { audit } from '../audit';

export type RequestOtpResult =
  | { ok: true; phone: string; cooldownSeconds: number }
  | { ok: false; error: 'invalid_phone' | 'rate_limited' | 'sms_failed'; retryAfterSeconds?: number };

/**
 * Step 1: request a code. Response is identical whether or not an account exists
 * (accounts are only created after a successful verification).
 */
export async function requestOtp(
  rawPhone: string, ctx: { ip?: string | null; meta?: { name?: string; referral?: string } } = {},
): Promise<RequestOtpResult> {
  const phone = normalizeIranMobile(rawPhone);
  if (!phone) return { ok: false, error: 'invalid_phone' };

  const [phoneLimit, ipLimit, cooldown] = await Promise.all([getSetting('otp_phone_hourly_limit'),
    getSetting('otp_ip_hourly_limit'), getSetting('otp_resend_cooldown_seconds')]);

  // resend cooldown (applies equally to every number => no enumeration signal)
  const last = await db().select({ createdAt: schema.authChallenges.createdAt }).from(schema.authChallenges)
    .where(eq(schema.authChallenges.phoneE164, phone)).orderBy(desc(schema.authChallenges.createdAt)).limit(1);
  if (last[0]) {
    const elapsed = (Date.now() - last[0].createdAt.getTime()) / 1000;
    if (elapsed < cooldown) return { ok: false, error: 'rate_limited', retryAfterSeconds: Math.ceil(cooldown - elapsed) };
  }
  const p = await rateLimit(`otp:phone:${phone}`, phoneLimit, 3600);
  const i = ctx.ip ? await rateLimit(`otp:ip:${ipHash(ctx.ip)}`, ipLimit, 3600) : { allowed: true };
  if (!p.allowed || !i.allowed) return { ok: false, error: 'rate_limited', retryAfterSeconds: 3600 };

  const ttl = await getSetting('otp_ttl_seconds');
  const code = generateOtp();

  const challengeId = await db().transaction(async (tx) => {
    // policy: a new code invalidates every previous unused code for this number
    await tx.update(schema.authChallenges).set({ invalidatedAt: new Date() })
      .where(and(eq(schema.authChallenges.phoneE164, phone), isNull(schema.authChallenges.usedAt),
        isNull(schema.authChallenges.invalidatedAt)));
    const [row] = await tx.insert(schema.authChallenges).values({
      phoneE164: phone, codeHash: 'pending', expiresAt: new Date(Date.now() + ttl * 1000),
      ipHash: ipHash(ctx.ip), meta: ctx.meta ?? null,
    }).returning({ id: schema.authChallenges.id });
    await tx.update(schema.authChallenges).set({ codeHash: otpHash(row.id, phone, code) })
      .where(eq(schema.authChallenges.id, row.id));
    return row.id;
  });

  try {
    await getSmsProvider().sendOtp(phone, code);
  } catch (err) {
    await db().update(schema.authChallenges).set({ invalidatedAt: new Date() }).where(eq(schema.authChallenges.id, challengeId));
    console.error('[sms] delivery failed:', (err as Error).message); // never log the code
    return { ok: false, error: 'sms_failed' };
  }
  return { ok: true, phone, cooldownSeconds: cooldown };
}

export type VerifyOtpResult =
  | { ok: true; userId: string; token: string; expiresAt: Date; isNewUser: boolean }
  | { ok: false; error: 'invalid_phone' | 'invalid_code' | 'too_many_attempts' };

/** Step 2: verify the code. Attempt counting and consumption are atomic. */
export async function verifyOtp(
  rawPhone: string, rawCode: string, ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<VerifyOtpResult> {
  const phone = normalizeIranMobile(rawPhone);
  const code = normalizeDigits(rawCode).trim();
  if (!phone) return { ok: false, error: 'invalid_phone' };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'invalid_code' };

  const maxAttempts = await getSetting('otp_max_attempts');
  const sql_ = sqlClient();

  // Atomically take one attempt on the latest live challenge.
  const taken = await sql_<{ id: string; code_hash: string; attempts: number; meta: { name?: string; referral?: string } | null }[]>`
    UPDATE auth_challenges SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM auth_challenges
      WHERE phone_e164 = ${phone} AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE)
    AND attempts < ${maxAttempts}
    RETURNING id, code_hash, attempts, meta`;
  if (!taken.length) {
    // either no live challenge, or attempts exhausted: both look the same to the caller
    return { ok: false, error: 'invalid_code' };
  }
  const ch = taken[0];
  if (!safeEqualHex(ch.code_hash, otpHash(ch.id, phone, code))) {
    if (ch.attempts >= maxAttempts) {
      await sql_`UPDATE auth_challenges SET invalidated_at = now() WHERE id = ${ch.id}`;
      return { ok: false, error: 'too_many_attempts' };
    }
    return { ok: false, error: 'invalid_code' };
  }
  // one-time consumption: only one concurrent request can win
  const used = await sql_`UPDATE auth_challenges SET used_at = now()
    WHERE id = ${ch.id} AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > now() RETURNING id`;
  if (!used.length) return { ok: false, error: 'invalid_code' };

  // find or create the user
  const existing = await db().select().from(schema.users).where(eq(schema.users.phoneE164, phone)).limit(1);
  let userId: string, isNewUser = false;
  if (existing[0]) {
    if (existing[0].status !== 'active') return { ok: false, error: 'invalid_code' };
    userId = existing[0].id;
  } else {
    isNewUser = true;
    const name = (ch.meta?.name ?? '').trim().slice(0, 60);
    const [u] = await db().insert(schema.users).values({ phoneE164: phone, displayName: name })
      .onConflictDoUpdate({ target: schema.users.phoneE164, set: { phoneE164: phone } }).returning({ id: schema.users.id });
    userId = u.id;
    await db().insert(schema.userProfiles).values({
      userId, referralCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    }).onConflictDoNothing();
    if (ch.meta?.referral) await audit(userId, 'referral.used', 'user', userId, { code: ch.meta.referral.slice(0, 16) });
  }
  const s = await createSession(userId, ctx);
  return { ok: true, userId, token: s.token, expiresAt: s.expiresAt, isNewUser };
}
