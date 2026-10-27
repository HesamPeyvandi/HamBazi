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

/** Placeholder for a real Iranian SMS panel (Kavenegar, Melipayamak, ...). Wire credentials via env. */
class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = 'unconfigured';
  constructor(private reason: string) {}
  async sendOtp(): Promise<void> {
    throw new Error(`SMS provider is not configured: ${this.reason}`);
  }
}

export function getSmsProvider(): SmsProvider {
  const e = env();
  if (e.smsProvider === 'mock') {
    if (e.isProduction) throw new Error('Mock SMS provider is forbidden in production');
    return new MockSmsProvider();
  }
  // Real providers are added here in Phase 8 / when the panel is chosen (no auth logic changes needed).
  return new UnconfiguredSmsProvider(`provider "${e.smsProvider}" has no adapter yet`);
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
