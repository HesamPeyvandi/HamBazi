'use server';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { normalizeDigits } from '@/lib/i18n/digits';
import { markAttendance } from './attendance';
import { submitPeerReviews, submitVenueReview, getRateContext } from './ratings';
import { reportMessage } from '@/server/messaging';
import { createReport, resolveReport, REPORT_TYPES, type ReportType } from './reports';

const UUID = /^[0-9a-f-]{36}$/i;
const int = (v: FormDataEntryValue | null) => parseInt(normalizeDigits(String(v ?? '')).replace(/[^\d]/g, ''), 10);
async function run<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof DomainError) redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(e.message)}`); throw e; }
}

export async function markAttendanceAction(reservationId: string, userId: string, result: 'attended' | 'no_show') {
  const u = await requireRole(['venue_manager', 'admin']);
  await run('/owner/attendance', () => markAttendance(u, reservationId, userId, result));
  redirect('/owner/attendance?ok=1');
}

export async function submitPeerReviewsAction(reservationId: string, fd: FormData) {
  const u = await requireUser(`/rate/${reservationId}`);
  const path = `/rate/${reservationId}`;
  if (!UUID.test(reservationId)) redirect('/dashboard');
  const ctx = await getRateContext(u.id, reservationId);
  if (!ctx) redirect('/dashboard');
  const items = ctx!.peers.filter((p) => !p.rated && fd.get(`rate_${p.userId}`) === 'on').map((p) => ({
    targetId: p.userId, comment: String(fd.get(`comment_${p.userId}`) ?? ''),
    scores: Object.fromEntries(ctx!.categories.map((c) => [c.key, int(fd.get(`s_${p.userId}_${c.key}`))])),
  }));
  await run(path, () => submitPeerReviews(u.id, reservationId, items));
  redirect(`${path}?ok=peers`);
}
export async function submitVenueReviewAction(reservationId: string, fd: FormData) {
  const u = await requireUser(`/rate/${reservationId}`);
  await run(`/rate/${reservationId}`, () => submitVenueReview(u.id, reservationId, int(fd.get('rating')), String(fd.get('comment') ?? '')));
  redirect(`/rate/${reservationId}?ok=venue`);
}

export async function createReportAction(type: string, targetId: string, fd: FormData) {
  const u = await requireUser(`/report?type=${type}&id=${targetId}`);
  if (!REPORT_TYPES.includes(type as ReportType) || !UUID.test(targetId)) redirect('/');
  await run(`/report?type=${type}&id=${targetId}`, () => {
    const reason = String(fd.get('reason') ?? ''), details = String(fd.get('details') ?? '');
    return type === 'message' ? reportMessage(u.id, targetId, reason, details) : createReport(u.id, type as ReportType, targetId, reason, details);
  });
  redirect('/report?done=1');
}
export async function resolveReportAction(reportId: string, decision: 'resolved' | 'dismissed', fd: FormData) {
  const u = await requireRole(['admin']);
  await run('/admin/reports', () => resolveReport(u, reportId, decision, String(fd.get('note') ?? ''), fd.get('suspend') === 'on', fd.get('hide') === 'on'));
  redirect('/admin/reports?ok=1');
}
