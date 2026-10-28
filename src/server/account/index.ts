import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { sha256 } from '@/server/auth/crypto';

/**
 * Notification groups the user may switch off. Critical messages (payments, cancellations, refunds,
 * attendance results) are never optional, so a user can never miss money-related news.
 */
export const NOTIF_GROUPS = {
  sessions: { label: 'سانس‌های باز من', hint: 'پیوستن و خروج بازیکنان، تأیید قطعی سانس', types: ['participant_joined', 'participant_left', 'session_confirmed', 'session_published'] },
  rating: { label: 'امتیاز و نظر', hint: 'یادآوری امتیازدهی بعد از بازی و امتیازهایی که دریافت می‌کنید', types: ['rate_game', 'peer_rated'] },
  teams: { label: 'تیم‌ها', hint: 'درخواست عضویت، دعوت‌ها و اعلان‌های تیم', types: ['team_member', 'team_request', 'team_request_result', 'team_invite', 'team_session'] },
  owner: { label: 'پنل مالک', hint: 'رزروهای جدید سالن و نتیجهٔ بررسی سالن', types: ['reservation_new', 'venue_review'] },
} as const;
export type NotifGroup = keyof typeof NOTIF_GROUPS;
const OPTIONAL: Record<string, NotifGroup> = {};
for (const [g, v] of Object.entries(NOTIF_GROUPS)) for (const t of v.types) OPTIONAL[t] = g as NotifGroup;

export const groupOf = (type: string): NotifGroup | null => OPTIONAL[type] ?? null;
/** Pure: should a notification of `type` be stored given the user's prefs? Unset = on. */
export function wantsNotification(prefs: Record<string, boolean> | null | undefined, type: string): boolean {
  const g = groupOf(type);
  return g ? prefs?.[g] !== false : true;
}

export async function getNotifPrefs(userId: string): Promise<Record<NotifGroup, boolean>> {
  const [p] = await db().select({ n: schema.userProfiles.notifPrefs }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
  return Object.fromEntries(Object.keys(NOTIF_GROUPS).map((g) => [g, p?.n?.[g] !== false])) as Record<NotifGroup, boolean>;
}

export async function saveNotifPrefs(userId: string, input: Record<string, boolean>) {
  const prefs = Object.fromEntries(Object.keys(NOTIF_GROUPS).map((g) => [g, input[g] === true]));
  await db().update(schema.userProfiles).set({ notifPrefs: prefs }).where(eq(schema.userProfiles.userId, userId));
}

export async function listMySessions(userId: string, currentToken?: string | null) {
  const cur = currentToken ? sha256(currentToken) : null;
  const rows = await db().select().from(schema.userSessions)
    .where(and(eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt), gt(schema.userSessions.expiresAt, new Date())))
    .orderBy(desc(schema.userSessions.lastSeenAt));
  return rows.map((s) => ({ id: s.id, userAgent: s.userAgent ?? '', createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: cur === s.tokenHash }));
}

/** Revoke one of the caller's own sessions (other users' ids simply match nothing). */
export async function revokeMySession(userId: string, sessionId: string) {
  const r = await db().update(schema.userSessions).set({ revokedAt: new Date() })
    .where(and(eq(schema.userSessions.id, sessionId), eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt))).returning({ id: schema.userSessions.id });
  if (r.length) await audit(userId, 'session.revoke', 'session', sessionId, {});
  return r.length > 0;
}
export async function revokeOtherSessions(userId: string, currentToken: string | null | undefined) {
  const keep = currentToken ? sha256(currentToken) : '';
  const r = await db().update(schema.userSessions).set({ revokedAt: new Date() })
    .where(and(eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt), ne(schema.userSessions.tokenHash, keep))).returning({ id: schema.userSessions.id });
  if (r.length) await audit(userId, 'session.revoke_others', 'user', userId, { count: r.length });
  return r.length;
}
