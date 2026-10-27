import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export async function unreadCount(userId: string) {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return r.n;
}
export const listNotifications = (userId: string) => db().select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(100);
export const markAllRead = (userId: string) => db().update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
