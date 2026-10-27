import { asc, eq, and } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import type { Tx } from '@/server/booking/core';

export type ReliabilityType = 'attended' | 'no_show' | 'late_cancel';
/** Documented rules (docs/03): start 100; attended +1 (cap 100); late cancel -5; no-show -15; floor 0. Being a beginner is never penalised. */
export const DELTAS: Record<ReliabilityType, number> = { attended: 1, late_cancel: -5, no_show: -15 };

export function computeScore(events: { delta: number }[]): number {
  let s = 100;
  for (const e of events) s = Math.max(0, Math.min(100, s + e.delta));
  return s;
}

export async function recordReliability(tx: Tx, userId: string, reservationId: string, type: ReliabilityType) {
  await tx.insert(schema.reliabilityEvents).values({ userId, reservationId, type, delta: DELTAS[type] }).onConflictDoNothing();
}
/** Attendance can be corrected: replaces the previous attended/no_show event of that game. */
export async function replaceAttendance(tx: Tx, userId: string, reservationId: string, type: 'attended' | 'no_show') {
  const other = type === 'attended' ? 'no_show' : 'attended';
  await tx.delete(schema.reliabilityEvents).where(and(eq(schema.reliabilityEvents.userId, userId), eq(schema.reliabilityEvents.reservationId, reservationId), eq(schema.reliabilityEvents.type, other)));
  await recordReliability(tx, userId, reservationId, type);
}

export async function getReliability(userId: string) {
  const events = await db().select().from(schema.reliabilityEvents).where(eq(schema.reliabilityEvents.userId, userId)).orderBy(asc(schema.reliabilityEvents.createdAt));
  const count = (t: ReliabilityType) => events.filter((e) => e.type === t).length;
  const attended = count('attended'), noShow = count('no_show'), lateCancel = count('late_cancel');
  return {
    score: computeScore(events), attended, noShow, lateCancel, events,
    attendanceRate: attended + noShow > 0 ? Math.round((attended / (attended + noShow)) * 100) : null,
  };
}
