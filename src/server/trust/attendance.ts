import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { notify } from '@/server/booking/core';
import { E } from '@/server/booking/errors';
import { lockSession, lockSlot } from '@/server/booking/lifecycle';
import { assertManages, type Actor } from '@/server/owner/venues';
import { replaceAttendance } from './reliability';

export const RATING_WINDOW_DAYS = 14;
const DAY = 86_400_000;

/** Games of the venues this actor manages that have started within the last 14 days (the attendance window). */
export async function listAttendanceTasks(actor: Actor, now = new Date()) {
  const scope = actor.role === 'admin' ? undefined : inArray(schema.reservations.venueId, db().select({ id: schema.venueManagers.venueId }).from(schema.venueManagers).where(eq(schema.venueManagers.userId, actor.id)));
  const rows = await db().select({ r: schema.reservations, venueName: schema.venues.name, sportName: schema.sports.nameFa, startsAt: schema.timeSlots.startsAt, endsAt: schema.timeSlots.endsAt, hostName: schema.users.displayName })
    .from(schema.reservations).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId))
    .innerJoin(schema.sports, eq(schema.sports.id, schema.reservations.sportId)).innerJoin(schema.users, eq(schema.users.id, schema.reservations.hostUserId))
    .where(and(scope, inArray(schema.reservations.status, ['confirmed', 'completed']), lte(schema.timeSlots.startsAt, now), gte(schema.timeSlots.startsAt, new Date(now.getTime() - RATING_WINDOW_DAYS * DAY))))
    .orderBy(desc(schema.timeSlots.startsAt));
  const sessionIds = rows.filter((x) => x.r.mode === 'open_session').map((x) => x.r.id);
  const players = sessionIds.length ? await db().select({ resId: schema.openSessions.reservationId, p: schema.sessionParticipants, name: schema.users.displayName })
    .from(schema.sessionParticipants).innerJoin(schema.openSessions, eq(schema.openSessions.id, schema.sessionParticipants.sessionId))
    .innerJoin(schema.users, eq(schema.users.id, schema.sessionParticipants.userId))
    .where(and(inArray(schema.openSessions.reservationId, sessionIds), inArray(schema.sessionParticipants.status, ['confirmed', 'attended', 'no_show']))).orderBy(asc(schema.sessionParticipants.joinedAt)) : [];
  return rows.map((x) => ({
    ...x,
    players: x.r.mode === 'full' ? [{ userId: x.r.hostUserId, name: x.hostName, status: x.r.attendance ?? 'confirmed' }]
      : players.filter((p) => p.resId === x.r.id).map((p) => ({ userId: p.p.userId, name: p.name, status: p.p.status })),
  }));
}

/**
 * Venue staff marks a player as attended / no-show. Allowed only after the game started, within the window,
 * only for confirmed participants of non-cancelled games. Corrections replace the previous mark (audit-logged).
 */
export async function markAttendance(actor: Actor, reservationId: string, userId: string, result: 'attended' | 'no_show', now = new Date()) {
  return db().transaction(async (tx) => {
    const [pre] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId));
    if (!pre) throw E.notFound();
    await assertManages(actor, pre.venueId);
    const slot = await lockSlot(tx, pre.slotId);
    if (slot.startsAt > now) throw E.invalid('ثبت حضور فقط بعد از شروع سانس ممکن است.');
    if (slot.startsAt.getTime() < now.getTime() - RATING_WINDOW_DAYS * DAY) throw E.invalid('مهلت ثبت حضور این سانس تمام شده است.');
    const [r] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId)).for('update');
    if (!['confirmed', 'completed'].includes(r.status)) throw E.badState();
    let hostNoShow = false;
    if (r.mode === 'full') {
      if (userId !== r.hostUserId) throw E.notFound();
      await tx.update(schema.reservations).set({ attendance: result, attendanceMarkedAt: now }).where(eq(schema.reservations.id, r.id));
      hostNoShow = result === 'no_show';
    } else {
      const [s] = await tx.select({ id: schema.openSessions.id }).from(schema.openSessions).where(eq(schema.openSessions.reservationId, r.id));
      const sess = s && (await lockSession(tx, s.id));
      if (!sess || !['confirmed', 'completed'].includes(sess.status)) throw E.badState();
      const [p] = await tx.select().from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, sess.id), eq(schema.sessionParticipants.userId, userId)));
      if (!p || !['confirmed', 'attended', 'no_show'].includes(p.status)) throw E.notFound();
      await tx.update(schema.sessionParticipants).set({ status: result }).where(eq(schema.sessionParticipants.id, p.id));
    }
    await replaceAttendance(tx, userId, r.id, result);
    await audit(actor.id, `attendance.${result}`, 'reservation', r.id, { userId });
    if (result === 'attended') await notify(tx, userId, 'rate_game', 'بازی چطور بود؟', 'به هم‌بازی‌ها و سالن امتیاز بدهید.', `/rate/${r.id}`);
    else await notify(tx, userId, 'no_show', 'غیبت شما ثبت شد', 'غیبت در امتیاز تعهد شما اثر می‌گذارد. اگر اشتباه است با سالن تماس بگیرید.', '/profile/commitment');
    return { hostNoShow };
  });
}
export { sql };
