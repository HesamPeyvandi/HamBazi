import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { db, schema } from '@/db/client';
import { env } from '../env';
import { getSetting } from '../settings';
import { ipHash, newSessionToken, sha256 } from './crypto';

export const SESSION_COOKIE = 'hb_session';

export async function createSession(userId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = newSessionToken(); // new token on every login (rotation; no fixation)
  const days = await getSetting('session_ttl_days');
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await db().insert(schema.userSessions).values({
    userId, tokenHash: sha256(token), expiresAt, ipHash: ipHash(ctx.ip), userAgent: ctx.userAgent?.slice(0, 200),
  });
  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string | undefined | null) {
  if (!token) return null;
  const rows = await db().select({ user: schema.users, sessionId: schema.userSessions.id })
    .from(schema.userSessions).innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(and(eq(schema.userSessions.tokenHash, sha256(token)), isNull(schema.userSessions.revokedAt),
      gt(schema.userSessions.expiresAt, new Date()), eq(schema.users.status, 'active'))).limit(1);
  if (!rows[0]) return null;
  // "Last activity" shown in settings: refreshed at most every 10 minutes per session (one cheap conditional update).
  await db().update(schema.userSessions).set({ lastSeenAt: new Date() })
    .where(and(eq(schema.userSessions.id, rows[0].sessionId), lt(schema.userSessions.lastSeenAt, new Date(Date.now() - 600_000))));
  return rows[0].user;
}

export async function revokeSessionToken(token: string) {
  await db().update(schema.userSessions).set({ revokedAt: new Date() })
    .where(and(eq(schema.userSessions.tokenHash, sha256(token)), isNull(schema.userSessions.revokedAt)));
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt,
    secure: env().appUrl.startsWith('https://'),
  });
}
export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function clientContext() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
  return { ip, userAgent: h.get('user-agent') };
}

export type SessionUser = typeof schema.users.$inferSelect;
export async function currentUser(): Promise<SessionUser | null> {
  return getUserBySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
