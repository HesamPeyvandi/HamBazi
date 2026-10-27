import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { requestOtp, verifyOtp } from '@/server/auth/otp';
import { getUserBySessionToken, revokeSessionToken } from '@/server/auth/session';
import { canManageVenue, safeRedirectPath, hasRole } from '@/server/auth/rbac';
import { getSmsProvider } from '@/server/providers/sms';
import { __resetEnvCache } from '@/server/env';
import { resetDb, lastCode, wrongCodeFor } from './helpers';

const PHONE = '+989121234567';
beforeEach(resetDb);
afterAll(async () => { await sqlClient().end(); });

describe('OTP request', () => {
  it('rejects invalid numbers', async () => {
    expect(await requestOtp('12345')).toEqual({ ok: false, error: 'invalid_phone' });
  });
  it('accepts Persian digits and stores only a hash (never the plain code)', async () => {
    const r = await requestOtp('۰۹۱۲۱۲۳۴۵۶۷');
    expect(r).toMatchObject({ ok: true, phone: PHONE });
    const [row] = await db().select().from(schema.authChallenges);
    const code = await lastCode(PHONE);
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toHaveLength(64);
    expect(code).toMatch(/^\d{6}$/);
  });
  it('enforces the resend cooldown', async () => {
    await requestOtp(PHONE);
    const r = await requestOtp(PHONE);
    expect(r).toMatchObject({ ok: false, error: 'rate_limited' });
  });
  it('rate-limits per phone per hour', async () => {
    for (let i = 0; i < 5; i++) {
      await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
      expect((await requestOtp(PHONE)).ok).toBe(true);
    }
    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    expect(await requestOtp(PHONE)).toMatchObject({ ok: false, error: 'rate_limited' });
  });
  it('rate-limits per IP', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await requestOtp('+9891212345' + String(10 + i), { ip: '1.2.3.4' })).ok).toBe(true);
    }
    expect(await requestOtp('+989121234599', { ip: '1.2.3.4' })).toMatchObject({ ok: false, error: 'rate_limited' });
  });
  it('response shape is identical for existing and new numbers (no account enumeration)', async () => {
    const a = await requestOtp(PHONE);
    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    await verifyOtp(PHONE, await lastCode(PHONE));
    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    const b = await requestOtp(PHONE);
    const c = await requestOtp('+989351112233');
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    expect(Object.keys(c).sort()).toEqual(Object.keys(a).sort());
  });
  it('a new code invalidates the previous one', async () => {
    await requestOtp(PHONE);
    const first = await lastCode(PHONE);
    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    await requestOtp(PHONE);
    const second = await lastCode(PHONE);
    if (first !== second) expect(await verifyOtp(PHONE, first)).toMatchObject({ ok: false });
    expect(await verifyOtp(PHONE, second)).toMatchObject({ ok: true });
  });
});

describe('OTP verification', () => {
  it('logs in, creates the user as new, then recognises them', async () => {
    await requestOtp(PHONE, { meta: { name: 'علی' } });
    const r = await verifyOtp(PHONE, await lastCode(PHONE));
    expect(r).toMatchObject({ ok: true, isNewUser: true });
    if (!r.ok) throw 0;
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, r.userId));
    expect(u.displayName).toBe('علی');
    expect((await getUserBySessionToken(r.token))?.id).toBe(r.userId);

    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    await requestOtp(PHONE);
    const r2 = await verifyOtp(PHONE, await lastCode(PHONE));
    expect(r2).toMatchObject({ ok: true, isNewUser: false });
  });
  it('accepts Persian-digit codes', async () => {
    await requestOtp(PHONE);
    const code = (await lastCode(PHONE)).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
    expect(await verifyOtp(PHONE, code)).toMatchObject({ ok: true });
  });
  it('rejects an expired code', async () => {
    await requestOtp(PHONE);
    await sqlClient()`UPDATE auth_challenges SET expires_at = now() - interval '1 second'`;
    expect(await verifyOtp(PHONE, await lastCode(PHONE))).toMatchObject({ ok: false, error: 'invalid_code' });
  });
  it('rejects reuse of a code', async () => {
    await requestOtp(PHONE);
    const code = await lastCode(PHONE);
    expect((await verifyOtp(PHONE, code)).ok).toBe(true);
    expect((await verifyOtp(PHONE, code)).ok).toBe(false);
  });
  it('locks after max attempts, even for the right code', async () => {
    await requestOtp(PHONE);
    const bad = await wrongCodeFor(PHONE);
    for (let i = 0; i < 4; i++) expect(await verifyOtp(PHONE, bad)).toMatchObject({ error: 'invalid_code' });
    expect(await verifyOtp(PHONE, bad)).toMatchObject({ error: 'too_many_attempts' });
    expect((await verifyOtp(PHONE, await lastCode(PHONE))).ok).toBe(false);
  });
  it('concurrent verification of one code yields exactly one session', async () => {
    await requestOtp(PHONE);
    const code = await lastCode(PHONE);
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyOtp(PHONE, code)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [{ n }] = await sqlClient()<{ n: number }[]>`SELECT count(*)::int n FROM users`;
    expect(n).toBe(1);
  });
  it('rejects malformed codes without consuming attempts', async () => {
    await requestOtp(PHONE);
    expect(await verifyOtp(PHONE, '12')).toMatchObject({ ok: false });
    expect((await db().select().from(schema.authChallenges))[0].attempts).toBe(0);
  });
  it('suspended users cannot log in', async () => {
    await requestOtp(PHONE);
    const r = await verifyOtp(PHONE, await lastCode(PHONE));
    if (!r.ok) throw 0;
    await db().update(schema.users).set({ status: 'suspended' }).where(eq(schema.users.id, r.userId));
    expect(await getUserBySessionToken(r.token)).toBeNull();
    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    await requestOtp(PHONE);
    expect((await verifyOtp(PHONE, await lastCode(PHONE))).ok).toBe(false);
  });
});

describe('sessions', () => {
  it('expired and revoked sessions are rejected; tokens are stored hashed', async () => {
    await requestOtp(PHONE);
    const r = await verifyOtp(PHONE, await lastCode(PHONE));
    if (!r.ok) throw 0;
    const [s] = await db().select().from(schema.userSessions);
    expect(s.tokenHash).not.toBe(r.token);
    await sqlClient()`UPDATE user_sessions SET expires_at = now() - interval '1 second'`;
    expect(await getUserBySessionToken(r.token)).toBeNull();
    await sqlClient()`UPDATE user_sessions SET expires_at = now() + interval '1 day'`;
    expect(await getUserBySessionToken(r.token)).not.toBeNull();
    await revokeSessionToken(r.token);
    expect(await getUserBySessionToken(r.token)).toBeNull();
  });
  it('each login gets a fresh token (rotation)', async () => {
    await requestOtp(PHONE);
    const a = await verifyOtp(PHONE, await lastCode(PHONE));
    await sqlClient()`UPDATE auth_challenges SET created_at = now() - interval '5 minutes'`;
    await requestOtp(PHONE);
    const b = await verifyOtp(PHONE, await lastCode(PHONE));
    if (!a.ok || !b.ok) throw 0;
    expect(a.token).not.toBe(b.token);
  });
  it('garbage tokens are rejected', async () => {
    expect(await getUserBySessionToken('nope')).toBeNull();
    expect(await getUserBySessionToken(undefined)).toBeNull();
  });
});

describe('authorization', () => {
  it('a venue manager can only manage their own venue; admin can manage any; players none', async () => {
    const [city] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 's' }).returning();
    const mk = (p: string, role: 'player' | 'venue_manager' | 'admin') =>
      db().insert(schema.users).values({ phoneE164: p, role }).returning().then((r) => r[0]);
    const m1 = await mk('+989120000001', 'venue_manager'), m2 = await mk('+989120000002', 'venue_manager');
    const player = await mk('+989120000003', 'player'), admin = await mk('+989120000004', 'admin');
    const [v1] = await db().insert(schema.venues).values({ ownerUserId: m1.id, cityId: city.id, slug: 'v1', name: 'a', address: 'a' }).returning();
    await db().insert(schema.venueManagers).values({ venueId: v1.id, userId: m1.id });
    expect(await canManageVenue(m1, v1.id)).toBe(true);
    expect(await canManageVenue(m2, v1.id)).toBe(false);
    expect(await canManageVenue(player, v1.id)).toBe(false);
    expect(await canManageVenue(admin, v1.id)).toBe(true);
    expect(hasRole(player, 'admin')).toBe(false);
  });
  it.each([
    ['//evil.com', '/'], ['/\\evil.com', '/'], ['https://evil.com', '/'], ['javascript:alert(1)', '/'],
    ['/venues?x=1', '/venues?x=1'], ['/profile', '/profile'], [null, '/'], ['/a\nb', '/'],
  ])('safeRedirectPath(%s)', (inp, out) => expect(safeRedirectPath(inp as string)).toBe(out));
});

describe('production safety of the SMS layer', () => {
  const keep = { ...process.env };
  const prod = (sms: string) => {
    Object.assign(process.env, { APP_ENV: 'production', PAYMENT_MODE: 'disabled', SMS_PROVIDER: sms,
      OTP_HMAC_SECRET: 'q'.repeat(48), SESSION_SECRET: 'r'.repeat(48) });
    __resetEnvCache();
  };
  afterEach(() => { process.env = { ...keep }; __resetEnvCache(); });
  it('mock provider is impossible in production (env validation refuses it)', () => {
    prod('mock');
    expect(() => getSmsProvider()).toThrow(/forbidden in production/);
  });
  it('production without an adapter fails visibly instead of faking delivery', async () => {
    prod('kavenegar');
    await expect(getSmsProvider().sendOtp(PHONE, '123456')).rejects.toThrow(/not configured/);
  });
  it('requestOtp reports sms_failed (no silent success) when the provider is unavailable', async () => {
    prod('kavenegar');
    expect(await requestOtp(PHONE)).toMatchObject({ ok: false, error: 'sms_failed' });
  });
});
