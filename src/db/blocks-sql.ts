import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, schema } from './client';

type Executor = Pick<ReturnType<typeof db>, 'update' | 'select'>;
export interface BlockWindow { weekday: number; startMinute: number; endMinute: number; fromDate: string; toDate: string }

const TZ = 'Asia/Tehran';
const localStart = sql`(${schema.timeSlots.startsAt} AT TIME ZONE ${TZ})`;
const localEnd = sql`(${schema.timeSlots.endsAt} AT TIME ZONE ${TZ})`;

/** SQL condition: the slot falls on the block's weekday, inside its date range, and overlaps its time window (all in Tehran time). */
export function matchesBlock(b: BlockWindow): SQL {
  const day0 = sql`date_trunc('day', ${localStart})`;
  return sql`(${localStart}::date BETWEEN ${b.fromDate}::date AND ${b.toDate}::date
    AND extract(dow from ${localStart}) = ${b.weekday}
    AND extract(epoch from (${localStart} - ${day0})) / 60 < ${b.endMinute}
    AND extract(epoch from (${localEnd} - ${day0})) / 60 > ${b.startMinute})`;
}

/** Number of reserved/held future slots that a block would collide with. */
export async function countBlockConflicts(x: Executor, venueId: string, b: BlockWindow): Promise<number> {
  const [r] = await x.select({ n: sql<number>`count(*)::int` }).from(schema.timeSlots).where(and(
    eq(schema.timeSlots.venueId, venueId), sql`${schema.timeSlots.status} IN ('held','booked')`, sql`${schema.timeSlots.endsAt} > now()`, matchesBlock(b)));
  return r.n;
}

/** Closes the venue's open future slots that fall inside an active standing reservation. Idempotent. Returns how many were closed. */
export async function applyBlocks(x: Executor, venueId: string, onlyBlockId?: string): Promise<number> {
  const blocks = await x.select().from(schema.recurringBlocks).where(and(eq(schema.recurringBlocks.venueId, venueId), eq(schema.recurringBlocks.active, true)));
  let closed = 0;
  for (const b of blocks) {
    if (onlyBlockId && b.id !== onlyBlockId) continue;
    const r = await x.update(schema.timeSlots).set({ status: 'closed', blockId: b.id, version: sql`${schema.timeSlots.version} + 1` })
      .where(and(eq(schema.timeSlots.venueId, venueId), eq(schema.timeSlots.status, 'open'), sql`${schema.timeSlots.startsAt} > now()`, matchesBlock(b))).returning({ id: schema.timeSlots.id });
    closed += r.length;
  }
  return closed;
}

/** Re-opens the slots a block had closed (used when the block is cancelled or edited). */
export async function releaseBlock(x: Executor, blockId: string): Promise<number> {
  const r = await x.update(schema.timeSlots).set({ status: 'open', blockId: null, version: sql`${schema.timeSlots.version} + 1` })
    .where(and(eq(schema.timeSlots.blockId, blockId), eq(schema.timeSlots.status, 'closed'))).returning({ id: schema.timeSlots.id });
  await x.update(schema.timeSlots).set({ blockId: null }).where(eq(schema.timeSlots.blockId, blockId));
  return r.length;
}
