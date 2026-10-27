/**
 * Central environment model. APP_ENV: development | demo | production.
 * Missing or unknown value => production (safest). Production refuses unsafe flags.
 */
export type AppEnv = 'development' | 'demo' | 'production';
export type PaymentMode = 'disabled' | 'simulated' | 'sandbox' | 'live';

export function parseAppEnv(raw: string | undefined): AppEnv {
  return raw === 'development' || raw === 'demo' ? raw : 'production';
}

export interface Env {
  appEnv: AppEnv;
  databaseUrl: string;
  otpSecret: string;
  sessionSecret: string;
  cronSecret: string;
  appUrl: string;
  smsProvider: string;
  smsApiKey: string;
  paymentMode: PaymentMode;
  isProduction: boolean;
  isDemoLike: boolean; // development or demo
}

export function readEnv(src: Record<string, string | undefined> = process.env): Env {
  const appEnv = parseAppEnv(src.APP_ENV);
  const pm = (src.PAYMENT_MODE ?? 'disabled') as PaymentMode;
  return {
    appEnv,
    databaseUrl: src.DATABASE_URL ?? '',
    otpSecret: src.OTP_HMAC_SECRET ?? '',
    sessionSecret: src.SESSION_SECRET ?? '',
    cronSecret: src.CRON_SECRET ?? '',
    appUrl: src.APP_URL ?? 'http://localhost:3000',
    smsProvider: src.SMS_PROVIDER ?? (appEnv === 'production' ? '' : 'mock'),
    smsApiKey: src.SMS_API_KEY ?? '',
    paymentMode: ['disabled', 'simulated', 'sandbox', 'live'].includes(pm) ? pm : 'disabled',
    isProduction: appEnv === 'production',
    isDemoLike: appEnv !== 'production',
  };
}

/** Returns the list of configuration problems. Empty list = safe to start. */
export function validateEnv(env: Env): string[] {
  const errors: string[] = [];
  if (!env.databaseUrl) errors.push('DATABASE_URL is required');
  if (env.otpSecret.length < 32) errors.push('OTP_HMAC_SECRET must be at least 32 characters');
  if (env.sessionSecret.length < 32) errors.push('SESSION_SECRET must be at least 32 characters');
  if (env.isProduction) {
    if (env.smsProvider === 'mock') errors.push('SMS_PROVIDER=mock is forbidden in production');
    if (!env.smsProvider) errors.push('A real SMS provider must be configured in production');
    if (env.paymentMode === 'simulated') errors.push('PAYMENT_MODE=simulated is forbidden in production');
    if (/not-for-production|change-me/.test(env.otpSecret + env.sessionSecret))
      errors.push('Placeholder secrets are forbidden in production');
    if (process.env.ENABLE_DEMO_SEED === '1') errors.push('Demo seed flag is forbidden in production');
  }
  return errors;
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    cached = readEnv();
    const errors = validateEnv(cached);
    if (errors.length) {
      throw new Error('Unsafe or incomplete configuration:\n - ' + errors.join('\n - '));
    }
  }
  return cached;
}

/** Test helper */
export function __resetEnvCache() {
  cached = null;
}
