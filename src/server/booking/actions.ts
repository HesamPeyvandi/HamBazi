'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/rbac';
import { DomainError } from './errors';
import { cancelReservationByPlayer, createFullReservation } from './reservations';
import { createOpenSession, joinSession, leaveSession, updateSessionDetails } from './sessions';
import { simulatePay } from './settle';
import { markAllRead } from './notifications';
import { normalizeDigits } from '@/lib/i18n/digits';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';

const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: FormDataEntryValue | null, d = 0) => { const n = parseInt(normalizeDigits(String(v ?? '')).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : d; };
const back = (path: string, msg: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(msg)}`);
/** Runs a service call; business errors go back to the page with a Persian message, unexpected ones bubble up. */
async function run<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof DomainError) return back(path, e.message); throw e; }
}

export async function reserveFullAction(slotId: string) {
  if (!UUID.test(slotId)) redirect('/venues');
  const u = await requireUser(`/book/${slotId}`);
  const r = await run(`/book/${slotId}`, () => createFullReservation(u.id, slotId));
  redirect(`/pay/${r.intentId}`);
}

export async function createSessionAction(slotId: string, fd: FormData) {
  const u = await requireUser(`/book/${slotId}`);
  const [slot] = UUID.test(slotId) ? await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.id, slotId)) : [];
  if (!slot) redirect('/venues');
  const hours = num(fd.get('deadlineHours'), 24);
  const r = await run(`/book/${slotId}`, () => createOpenSession(u.id, {
    slotId, targetCount: num(fd.get('target')), minToConfirm: num(fd.get('min')), pricePerParticipant: num(fd.get('price')),
    skillMin: num(fd.get('skillMin'), 0), skillMax: num(fd.get('skillMax'), 99),
    joinDeadline: new Date(slot.startsAt.getTime() - hours * 3_600_000),
    visibility: fd.get('visibility') === 'invite_only' ? 'invite_only' : 'public', description: String(fd.get('description') ?? ''),
  }));
  redirect(`/pay/${r.intentId}`);
}

export async function joinSessionAction(sessionId: string, token: string | undefined) {
  const path = `/sessions/${sessionId}${token ? `?t=${token}` : ''}`;
  const u = await requireUser(path);
  const r = await run(path, () => joinSession(u.id, sessionId, { inviteToken: token }));
  redirect(`/pay/${r.intentId}`);
}
export async function leaveSessionAction(sessionId: string) {
  const u = await requireUser(`/sessions/${sessionId}`);
  const r = await run(`/sessions/${sessionId}`, () => leaveSession(u.id, sessionId));
  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}?ok=${r.refundPercent > 0 ? 'left_refund' : 'left'}`);
}
export async function updateSessionAction(sessionId: string, fd: FormData) {
  const u = await requireUser(`/sessions/${sessionId}`);
  await run(`/sessions/${sessionId}`, () => updateSessionDetails(u.id, sessionId, { description: String(fd.get('description') ?? ''), visibility: fd.get('visibility') === 'invite_only' ? 'invite_only' : 'public' }));
  redirect(`/sessions/${sessionId}?ok=updated`);
}

export async function payAction(intentId: string) {
  const u = await requireUser(`/pay/${intentId}`);
  const r = await run(`/pay/${intentId}`, () => simulatePay(u.id, intentId));
  redirect(r.sessionId ? `/sessions/${r.sessionId}?ok=paid` : `/reservations/${r.reservationId}?ok=paid`);
}
export async function cancelReservationAction(reservationId: string) {
  const u = await requireUser(`/reservations/${reservationId}`);
  const r = await run(`/reservations/${reservationId}`, () => cancelReservationByPlayer(u.id, reservationId));
  redirect(`/reservations/${reservationId}?ok=cancelled&pct=${r.refundPercent}`);
}
export async function markNotificationsReadAction() {
  const u = await requireUser('/notifications');
  await markAllRead(u.id);
  revalidatePath('/notifications');
}
