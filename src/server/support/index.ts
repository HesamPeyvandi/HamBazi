import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { DomainError, E } from '@/server/booking/errors';
import { rateLimit } from '@/server/ratelimit';
import type { Actor } from '@/server/owner/venues';

export const TOPICS: Record<string, string> = { booking: 'رزرو و سانس', payment: 'پرداخت و بازگشت وجه', account: 'حساب کاربری', venue: 'ثبت یا مدیریت سالن', report: 'گزارش تخلف', other: 'سایر' };
const input = z.object({
  topic: z.string().refine((t) => t in TOPICS, 'موضوع معتبر نیست.'),
  body: z.string().trim().min(10, 'پیام حداقل ۱۰ حرف باشد.').max(2000, 'پیام حداکثر ۲۰۰۰ حرف باشد.'),
});

/** Signed-in users only (no anonymous spam). 3 messages per hour, 1 open message per topic. */
export async function createSupportMessage(userId: string, raw: { topic: string; body: string }) {
  const r = input.safeParse(raw);
  if (!r.success) throw E.invalid(r.error.issues[0]?.message);
  const [dup] = await db().select({ id: schema.supportMessages.id }).from(schema.supportMessages)
    .where(and(eq(schema.supportMessages.userId, userId), eq(schema.supportMessages.topic, r.data.topic), eq(schema.supportMessages.status, 'open')));
  if (dup) throw new DomainError('duplicate', 'پیام قبلی شما در همین موضوع هنوز در حال بررسی است.');
  const rl = await rateLimit(`support:${userId}`, 3, 3600);
  if (!rl.allowed) throw new DomainError('rate_limited', 'در یک ساعت بیش از ۳ پیام نمی‌توانید بفرستید.');
  const [m] = await db().insert(schema.supportMessages).values({ userId, topic: r.data.topic, body: r.data.body }).returning();
  return m;
}
export async function listMySupport(userId: string) {
  return db().select().from(schema.supportMessages).where(eq(schema.supportMessages.userId, userId)).orderBy(desc(schema.supportMessages.createdAt)).limit(20);
}
export async function listSupport(admin: Actor, status: 'open' | 'closed') {
  if (admin.role !== 'admin') throw E.forbidden();
  return db().select({ m: schema.supportMessages, name: schema.users.displayName }).from(schema.supportMessages)
    .innerJoin(schema.users, eq(schema.users.id, schema.supportMessages.userId)).where(eq(schema.supportMessages.status, status))
    .orderBy(desc(schema.supportMessages.createdAt)).limit(100);
}
export async function closeSupport(admin: Actor, id: string) {
  if (admin.role !== 'admin') throw E.forbidden();
  const r = await db().update(schema.supportMessages).set({ status: 'closed', resolvedBy: admin.id, resolvedAt: new Date() })
    .where(and(eq(schema.supportMessages.id, id), eq(schema.supportMessages.status, 'open'))).returning({ id: schema.supportMessages.id });
  if (!r.length) throw E.badState();
  await audit(admin.id, 'support.close', 'support_message', id, {});
}
export async function openSupportCount() {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.supportMessages).where(eq(schema.supportMessages.status, 'open'));
  return r.n;
}
