import { sqlClient } from '@/db/client';

export async function resetDb() {
  const sql = sqlClient();
  await sql`TRUNCATE rate_limits, auth_challenges, dev_sms_outbox, user_sessions, venue_reviews, player_sport_profiles,
    user_profiles, venue_managers, venue_images, venue_facilities, venue_sports, time_slots, venues, users, platform_settings, cities, sports, audit_logs
    RESTART IDENTITY CASCADE`;
}
export async function lastCode(phone: string): Promise<string> {
  const r = await sqlClient()<{ code: string }[]>`SELECT code FROM dev_sms_outbox WHERE phone_e164 = ${phone} ORDER BY created_at DESC LIMIT 1`;
  return r[0].code;
}
export async function wrongCodeFor(phone: string): Promise<string> {
  const c = await lastCode(phone);
  return c === '000000' ? '111111' : '000000';
}
