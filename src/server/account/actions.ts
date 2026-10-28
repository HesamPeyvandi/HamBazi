'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { SESSION_COOKIE } from '@/server/auth/session';
import { revokeMySession, revokeOtherSessions, saveNotifPrefs, NOTIF_GROUPS } from './index';

const UUID = /^[0-9a-f-]{36}$/i;
export async function saveNotifPrefsAction(fd: FormData) {
  const u = await requireUser('/settings');
  await saveNotifPrefs(u.id, Object.fromEntries(Object.keys(NOTIF_GROUPS).map((g) => [g, fd.get(g) === 'on'])));
  redirect('/settings?ok=prefs');
}
export async function revokeSessionAction(sessionId: string) {
  const u = await requireUser('/settings');
  if (UUID.test(sessionId)) await revokeMySession(u.id, sessionId);
  redirect('/settings?ok=session');
}
export async function revokeOthersAction() {
  const u = await requireUser('/settings');
  await revokeOtherSessions(u.id, (await cookies()).get(SESSION_COOKIE)?.value);
  redirect('/settings?ok=others');
}
