import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';

/** Single settings service. DB overrides win; defaults live here (one place). */
export const DEFAULTS = {
  otp_ttl_seconds: 120,
  otp_max_attempts: 5,
  otp_resend_cooldown_seconds: 60,
  otp_phone_hourly_limit: 5,
  otp_ip_hourly_limit: 20,
  session_ttl_days: 30,
  hold_minutes: 15,
  join_deadline_hours: 24,
  fee_percent_bp: 500, // 5% in basis points (used from Phase 2)
  fee_min_toman: 5000,
} as const;
export type SettingKey = keyof typeof DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const rows = await db().select().from(schema.platformSettings).where(eq(schema.platformSettings.key, key)).limit(1);
  const v = rows[0]?.value;
  return (typeof v === typeof DEFAULTS[key] ? v : DEFAULTS[key]) as (typeof DEFAULTS)[K];
}
