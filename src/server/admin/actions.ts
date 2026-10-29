'use server';
import { redirect } from 'next/navigation';
import { requireRole } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { normalizeDigits } from '@/lib/i18n/digits';
import { audit } from '@/server/audit';
import { cancelReservationByVenue } from '@/server/booking/reservations';
import { setReviewHidden } from './oversight';
import { createCancellationPolicy, createFeePolicy, setUserStatus, setVenueSuspended, updateSetting } from './index';

const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: FormDataEntryValue | null) => Number(normalizeDigits(String(v ?? '')).replace(/٬|,/g, '').replace(/٫/g, '.'));
async function run(path: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if (e instanceof DomainError) redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(e.message)}`); throw e; }
}
export async function setUserStatusAction(userId: string, status: 'active' | 'suspended', fd: FormData) {
  const a = await requireRole(['admin']);
  if (!UUID.test(userId)) redirect('/admin/users');
  await run('/admin/users', () => setUserStatus(a, userId, status, String(fd.get('note') ?? '')));
  redirect('/admin/users?ok=1');
}
export async function setVenueSuspendedAction(venueId: string, suspend: boolean, fd: FormData) {
  const a = await requireRole(['admin']);
  if (!UUID.test(venueId)) redirect('/admin/venues');
  await run('/admin/venues', () => setVenueSuspended(a, venueId, suspend, String(fd.get('note') ?? '')));
  redirect('/admin/venues?ok=1');
}
export async function updateSettingAction(key: string, fd: FormData) {
  const a = await requireRole(['admin']);
  await run('/admin/settings', () => updateSetting(a, key, num(fd.get('value'))));
  redirect('/admin/settings?ok=1');
}
export async function createFeePolicyAction(fd: FormData) {
  const a = await requireRole(['admin']);
  await run('/admin/settings', () => createFeePolicy(a, { percent: num(fd.get('percent')), minToman: num(fd.get('minToman')) }));
  redirect('/admin/settings?ok=1');
}
export async function createCancellationPolicyAction(fd: FormData) {
  const a = await requireRole(['admin']);
  const tiers = [0, 1, 2].map((i) => ({ h: fd.get(`h${i}`), p: fd.get(`p${i}`) })).filter((t) => String(t.h ?? '').trim() !== '')
    .map((t) => ({ minHoursBefore: num(t.h), refundPercent: num(t.p) }));
  await run('/admin/settings', () => createCancellationPolicy(a, tiers));
  redirect('/admin/settings?ok=1');
}

export async function setReviewHiddenAction(reviewId: string, hide: boolean, fd: FormData) {
  const a = await requireRole(['admin']);
  if (!UUID.test(reviewId)) redirect('/admin/reviews');
  await run('/admin/reviews', () => setReviewHidden(a, reviewId, hide, String(fd.get('note') ?? '')));
  redirect(`/admin/reviews${hide ? '' : '?hidden=1'}${hide ? '?ok=1' : '&ok=1'}`);
}
export async function adminCancelReservationAction(reservationId: string) {
  const a = await requireRole(['admin']);
  if (!UUID.test(reservationId)) redirect('/admin/sessions');
  await run('/admin/sessions?view=reservations', () => cancelReservationByVenue(a, reservationId));
  await audit(a.id, 'reservation.admin_cancel', 'reservation', reservationId, {});
  redirect('/admin/sessions?view=reservations&ok=1');
}
