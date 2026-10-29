'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { sendMessage, setBlocked, setMuted, type MessageDTO } from './index';

const UUID = /^[0-9a-f-]{36}$/i;
export type SendResult = { ok: true; message: MessageDTO } | { ok: false; error: string; code: string };

/** Server action (Next enforces same-origin on actions => CSRF-safe). Business failures return a result, never throw. */
export async function sendMessageAction(roomId: string, body: string, replyToId?: string | null): Promise<SendResult> {
  const u = await requireUser(`/chat/${roomId}`);
  if (!UUID.test(roomId)) return { ok: false, code: 'not_found', error: 'گفت‌وگو پیدا نشد.' };
  try { return { ok: true, message: await sendMessage(u.id, roomId, body, replyToId && UUID.test(replyToId) ? replyToId : null) }; }
  catch (e) { if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code }; throw e; }
}
export async function muteAction(roomId: string, muted: boolean) {
  const u = await requireUser(`/chat/${roomId}`);
  if (!UUID.test(roomId)) redirect('/chat');
  try { await setMuted(u.id, roomId, muted); } catch (e) { if (!(e instanceof DomainError)) throw e; redirect('/chat'); }
  redirect(`/chat/${roomId}?ok=${muted ? 'muted' : 'unmuted'}`);
}
export async function blockAction(roomId: string, targetId: string, blocked: boolean) {
  const u = await requireUser(`/chat/${roomId}`);
  if (!UUID.test(roomId) || !UUID.test(targetId)) redirect('/chat');
  try { await setBlocked(u.id, roomId, targetId, blocked); }
  catch (e) { if (e instanceof DomainError) redirect(`/chat/${roomId}?err=${encodeURIComponent(e.message)}`); throw e; }
  // `n` changes the client component key, so the message list is re-fetched (client state survives soft navigations)
  redirect(`/chat/${roomId}?ok=${blocked ? 'blocked' : 'unblocked'}&n=${Date.now()}`);
}
