import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { currentUser, type SessionUser } from './session';

export class ForbiddenError extends Error {
  constructor(msg = 'forbidden') { super(msg); }
}

export async function requireUser(next = '/'): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(safeRedirectPath(next))}`);
  return u;
}

export function hasRole(user: Pick<SessionUser, 'role'>, ...roles: SessionUser['role'][]) {
  return roles.includes(user.role);
}
export async function requireRole(roles: SessionUser['role'][]): Promise<SessionUser> {
  const u = await requireUser();
  if (!hasRole(u, ...roles)) notFound(); // do not reveal that the area exists
  return u;
}

/** Resource-level check: the user must be a manager of this very venue (admins may override). */
export async function canManageVenue(user: Pick<SessionUser, 'id' | 'role'>, venueId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  const rows = await db().select().from(schema.venueManagers)
    .where(and(eq(schema.venueManagers.venueId, venueId), eq(schema.venueManagers.userId, user.id))).limit(1);
  return rows.length > 0;
}
export async function requireVenueManager(venueId: string): Promise<SessionUser> {
  const u = await requireUser();
  if (!(await canManageVenue(u, venueId))) throw new ForbiddenError();
  return u;
}

/** Only same-site relative paths. Blocks //evil.com, /\evil.com, absolute URLs, control chars. */
export function safeRedirectPath(p: string | null | undefined, fallback = '/'): string {
  if (!p || typeof p !== 'string') return fallback;
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\') || /[\u0000-\u001f\\]/.test(p)) return fallback;
  return p;
}
