import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';

/** Bell counter: everything except chat news, which has its own badge next to the chat icon. */
export async function unreadCount(userId: string) {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt), sql`${schema.notifications.type} <> 'chat_message'`));
  return r.n;
}
/** Unread "new chat message" notifications (at most one per room => number of rooms with news). */
export async function unreadChatCount(userId: string) {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.type, 'chat_message'), isNull(schema.notifications.readAt)));
  return r.n;
}
export const listNotifications = (userId: string) => db().select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(100);
export const markAllRead = (userId: string) => db().update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
