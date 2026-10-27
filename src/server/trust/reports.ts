import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { notify } from '@/server/booking/core';
import { DomainError, E } from '@/server/booking/errors';
import type { Actor } from '@/server/owner/venues';

export const REPORT_REASONS: Record<string, string> = { abuse: 'رفتار نامناسب یا توهین', no_show: 'غیبت یا تعهدشکنی', fake: 'اطلاعات نادرست یا کلاهبرداری', safety: 'مسائل ایمنی', other: 'سایر' };
export const REPORT_TYPES = ['user', 'venue', 'session'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

async function targetExists(type: ReportType, id: string) {
  const t = type === 'user' ? schema.users : type === 'venue' ? schema.venues : schema.openSessions;
  const [r] = await db().select({ id: t.id }).from(t).where(eq(t.id, id));
  return !!r;
}

export async function createReport(reporterId: string, type: ReportType, targetId: string, reason: string, details: string) {
  if (!REPORT_TYPES.includes(type) || !(reason in REPORT_REASONS)) throw E.invalid();
  if (type === 'user' && targetId === reporterId) throw E.invalid('گزارش دادن خودتان ممکن نیست.');
  if (!(await targetExists(type, targetId))) throw E.notFound();
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.reports).where(and(eq(schema.reports.reporterId, reporterId), gt(schema.reports.createdAt, new Date(Date.now() - 86_400_000))));
  if (n >= 5) throw new DomainError('rate_limited', 'امروز بیش از حد گزارش ثبت کرده‌اید. لطفاً فردا دوباره تلاش کنید.');
  const [dup] = await db().select({ id: schema.reports.id }).from(schema.reports).where(and(eq(schema.reports.reporterId, reporterId), eq(schema.reports.targetType, type), eq(schema.reports.targetId, targetId), eq(schema.reports.status, 'open')));
  if (dup) throw new DomainError('duplicate', 'گزارش قبلی شما هنوز در حال بررسی است.');
  const [r] = await db().insert(schema.reports).values({ reporterId, targetType: type, targetId, reason, details: details.trim().slice(0, 1000) }).returning();
  await audit(reporterId, 'report.create', type, targetId, { reason });
  return r;
}

export async function listReports(admin: Actor, status: 'open' | 'resolved' | 'dismissed' = 'open') {
  if (admin.role !== 'admin') throw E.forbidden();
  return db().select({ r: schema.reports, reporter: schema.users.displayName }).from(schema.reports).innerJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    .where(eq(schema.reports.status, status)).orderBy(desc(schema.reports.createdAt)).limit(100);
}

/** Admin decision. Optionally suspends the reported user (sessions revoked immediately). Always audit-logged. */
export async function resolveReport(admin: Actor, reportId: string, decision: 'resolved' | 'dismissed', note: string, suspendUser = false) {
  if (admin.role !== 'admin') throw E.forbidden();
  return db().transaction(async (tx) => {
    const [r] = await tx.select().from(schema.reports).where(eq(schema.reports.id, reportId)).for('update');
    if (!r) throw E.notFound();
    if (r.status !== 'open') throw E.badState();
    if (suspendUser) {
      if (r.targetType !== 'user') throw E.invalid('تعلیق فقط برای گزارش کاربر ممکن است.');
      await tx.update(schema.users).set({ status: 'suspended' }).where(and(eq(schema.users.id, r.targetId), eq(schema.users.role, 'player')));
      await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(eq(schema.userSessions.userId, r.targetId));
    }
    await tx.update(schema.reports).set({ status: decision, resolution: note.slice(0, 500), resolvedBy: admin.id, resolvedAt: new Date() }).where(eq(schema.reports.id, reportId));
    await notify(tx, r.reporterId, 'report_update', 'گزارش شما بررسی شد', decision === 'resolved' ? 'اقدام لازم انجام شد. ممنون از اطلاع‌رسانی شما.' : 'پس از بررسی، تخلفی تأیید نشد.', '/notifications');
    await audit(admin.id, `report.${decision}`, 'report', reportId, { suspendUser, note });
  });
}
