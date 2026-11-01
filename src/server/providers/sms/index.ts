import { env } from '../../env';
import { db, schema } from '@/db/client';

export interface SmsProvider {
  readonly name: string;
  /** Sends an OTP. Must never log the code in production. */
  sendOtp(phoneE164: string, code: string): Promise<void>;
}

/** Development/demo only. Sends nothing; stores the message so the verification page can display it. */
class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  async sendOtp(phoneE164: string, code: string) {
    if (env().isProduction) throw new Error('Mock SMS provider is forbidden in production');
    await db().insert(schema.devSmsOutbox).values({
      phoneE164, code, message: `کد ورود هم‌بازی: ${code}`,
    });
  }
}

/**
 * Kavenegar "verify/lookup" (template-based OTP). The template (SMS_TEMPLATE) must be created in the Kavenegar panel and
 * contain the token placeholder `%token`. The code is sent as the token and is never logged.
 */
class KavenegarSmsProvider implements SmsProvider {
  readonly name = 'kavenegar';
  constructor(private apiKey: string, private template: string) {}
  async sendOtp(phoneE164: string, code: string) {
    const receptor = phoneE164.replace(/^\+98/, '0'); // +98912... -> 0912...
    const body = new URLSearchParams({ receptor, token: code, template: this.template });
    let res: Response;
    try {
      res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/verify/lookup.json`, {
        method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000), cache: 'no-store',
      });
    } catch {
      throw new Error('SMS provider unreachable'); // no details: the URL contains the API key
    }
    const j = (await res.json().catch(() => null)) as { return?: { status?: number } } | null;
    if (!res.ok || j?.return?.status !== 200) throw new Error(`SMS provider rejected the request (http ${res.status}, status ${j?.return?.status ?? 'n/a'})`);
  }
}

export function getSmsProvider(): SmsProvider {
  const e = env();
  if (e.smsProvider === 'mock') {
    if (e.isProduction) throw new Error('Mock SMS provider is forbidden in production');
    return new MockSmsProvider();
  }
  if (e.smsProvider === 'kavenegar') return new KavenegarSmsProvider(e.smsApiKey, e.smsTemplate);
  throw new Error(`SMS provider "${e.smsProvider}" is not supported`);
}

/** The code may be shown on screen only when the mock provider is active outside production. */
export function isMockSmsActive(): boolean {
  const e = env();
  return !e.isProduction && e.smsProvider === 'mock';
}

export async function latestMockCode(phoneE164: string): Promise<string | null> {
  if (!isMockSmsActive()) return null;
  const { desc, eq } = await import('drizzle-orm');
  const rows = await db().select().from(schema.devSmsOutbox)
    .where(eq(schema.devSmsOutbox.phoneE164, phoneE164))
    .orderBy(desc(schema.devSmsOutbox.createdAt)).limit(1);
  return rows[0]?.code ?? null;
}
