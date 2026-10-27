import { describe, it, expect } from 'vitest';
import { parseAppEnv, readEnv, validateEnv } from '@/server/env';

const good = {
  DATABASE_URL: 'postgres://x', OTP_HMAC_SECRET: 'a'.repeat(40), SESSION_SECRET: 'b'.repeat(40),
};
describe('APP_ENV', () => {
  it('unknown or missing => production', () => {
    expect(parseAppEnv(undefined)).toBe('production');
    expect(parseAppEnv('staging')).toBe('production');
    expect(parseAppEnv('demo')).toBe('demo');
  });
  it('production refuses mock SMS, simulated payments, placeholder secrets', () => {
    const e = validateEnv(readEnv({ ...good, APP_ENV: 'production', SMS_PROVIDER: 'mock', PAYMENT_MODE: 'simulated' }));
    expect(e.join()).toMatch(/SMS_PROVIDER=mock/);
    expect(e.join()).toMatch(/PAYMENT_MODE=simulated/);
    expect(validateEnv(readEnv({ ...good, SESSION_SECRET: 'change-me'.padEnd(40, 'x'), APP_ENV: 'production', SMS_PROVIDER: 'kavenegar' })).join())
      .toMatch(/Placeholder/);
  });
  it('production without SMS provider fails visibly', () => {
    expect(validateEnv(readEnv({ ...good, APP_ENV: 'production' })).join()).toMatch(/real SMS provider/);
  });
  it('production with real provider and disabled payments is valid', () => {
    expect(validateEnv(readEnv({ ...good, APP_ENV: 'production', SMS_PROVIDER: 'kavenegar' }))).toEqual([]);
  });
  it('demo/dev allow the mock provider', () => {
    expect(validateEnv(readEnv({ ...good, APP_ENV: 'demo', SMS_PROVIDER: 'mock', PAYMENT_MODE: 'simulated' }))).toEqual([]);
  });
  it('rejects short secrets', () => {
    expect(validateEnv(readEnv({ ...good, OTP_HMAC_SECRET: 'x', APP_ENV: 'development' })).join()).toMatch(/OTP_HMAC_SECRET/);
  });
});
