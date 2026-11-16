import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { applyBlocks, countBlockConflicts, releaseBlock } from '@/db/blocks-sql';
import { audit } from '@/server/audit';
import { E } from '@/server/booking/errors';
import { jalaliToUtc, jalaliMonthLength, tehranParts } from '@/lib/i18n/jalali';
import { assertManages, type Actor } from './venues';

export const blockInput = z.object({
  title: z.string().trim().min(2, 'نام مجموعه/گروه را وارد کنید.').max(80),
  note: z.string().trim().max(300).default(''),
  weekday: z.number().int().min(0).max(6), // 0 = Sunday … 6 = Saturday (JS/Postgres convention)
  startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440),
  from: z.object({ jy: z.number().int(), jm: z.number().int(), jd: z.number().int() }),
  to: z.object({ jy: z.number().int(), jm: z.number().int(), jd: z.number().int() }),
}).refine((v) => v.endMinute > v.startMinute, { message: 'ساعت پایان باید بعد از ساعت شروع باشد.' });
export type BlockInput = z.input<typeof blockInput>;

const MAX_DAYS = 400;
const pad = (n: number) => String(n).padStart(2, '0');
function jalaliToIso(j: { jy: number; jm: number; jd: number }): string {
  if (j.jy < 1380 || j.jy > 1500 || j.jm < 1 || j.jm > 12 || j.jd < 1 || j.jd > jalaliMonthLength(j.jy, j.jm)) throw E.invalid('تاریخ معتبر نیست.');
  const p = tehranParts(jalaliToUtc(j.jy, j.jm, j.jd, 12, 0));
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
function parse(input: BlockInput) {
  const r = blockInput.safeParse(input);
  if (!r.success) throw E.invalid(r.error.issues[0]?.message ?? 'اطلاعات معتبر نیست.');
  const v = r.data;
  const fromDate = jalaliToIso(v.from), toDate = jalaliToIso(v.to);
  if (toDate < fromDate) throw E.invalid('تاریخ پایان باید بعد از تاریخ شروع باشد.');
  const today = tehranParts(new Date()); const todayIso = `${today.y}-${pad(today.m)}-${pad(today.d)}`;
  if (toDate < todayIso) throw E.invalid('بازهٔ انتخابی کاملاً در گذشته است.');
  if ((Date.parse(toDate) - Date.parse(fromDate)) / 86400_000 > MAX_DAYS) throw E.invalid('حداکثر طول بازه یک سال و چند ماه (۴۰۰ روز) است.');
  return { title: v.title, note: v.note, weekday: v.weekday, startMinute: v.startMinute, endMinute: v.endMinute, fromDate, toDate };
}

type Data = ReturnType<typeof parse>;
async function assertNoBlockOverlap(tx: Pick<ReturnType<typeof db>, 'select'>, venueId: string, d: Data, exceptId?: string) {
  const rows = await tx.select().from(schema.recurringBlocks).where(and(eq(schema.recurringBlocks.venueId, venueId), eq(schema.recurringBlocks.active, true), eq(schema.recurringBlocks.weekday, d.weekday)));
  const clash = rows.find((b) => b.id !== exceptId && b.fromDate <= d.toDate && b.toDate >= d.fromDate && b.startMinute < d.endMinute && b.endMinute > d.startMinute);
  if (clash) throw E.invalid(`این بازه با رزرو دائمی «${clash.title}» همپوشانی دارد.`);
}

export async function createBlock(actor: Actor, venueId: string, input: BlockInput) {
  await assertManages(actor, venueId);
  const d = parse(input);
  return db().transaction(async (tx) => {
    await assertNoBlockOverlap(tx, venueId, d);
    const n = await countBlockConflicts(tx, venueId, d);
    if (n > 0) throw E.invalid(`در این بازه ${n} سانس رزرو یا در حال رزرو وجود دارد. ابتدا آن رزروها را لغو کنید، سپس رزرو دائمی را ثبت کنید.`);
    const [b] = await tx.insert(schema.recurringBlocks).values({ venueId, ...d, createdBy: actor.id }).returning();
    const closed = await applyBlocks(tx, venueId, b.id);
    await audit(actor.id, 'block.create', 'venue', venueId, { blockId: b.id, title: d.title, closed });
    return { id: b.id, closed };
  });
}

export async function updateBlock(actor: Actor, blockId: string, input: BlockInput) {
  const [cur] = await db().select().from(schema.recurringBlocks).where(eq(schema.recurringBlocks.id, blockId));
  if (!cur) throw E.notFound();
  await assertManages(actor, cur.venueId);
  if (!cur.active) throw E.badState();
  const d = parse(input);
  return db().transaction(async (tx) => {
    await assertNoBlockOverlap(tx, cur.venueId, d, blockId);
    await releaseBlock(tx, blockId);
    const n = await countBlockConflicts(tx, cur.venueId, d);
    if (n > 0) throw E.invalid(`در این بازه ${n} سانس رزرو یا در حال رزرو وجود دارد. ابتدا آن رزروها را لغو کنید.`); // throwing rolls the release back
    await tx.update(schema.recurringBlocks).set(d).where(eq(schema.recurringBlocks.id, blockId));
    const closed = await applyBlocks(tx, cur.venueId);
    await audit(actor.id, 'block.update', 'venue', cur.venueId, { blockId, title: d.title, closed });
    return { closed };
  });
}

/** Ends a standing reservation: its slots become bookable again by the public. History is kept (active = false). */
export async function cancelBlock(actor: Actor, blockId: string) {
  const [cur] = await db().select().from(schema.recurringBlocks).where(eq(schema.recurringBlocks.id, blockId));
  if (!cur) throw E.notFound();
  await assertManages(actor, cur.venueId);
  return db().transaction(async (tx) => {
    await tx.update(schema.recurringBlocks).set({ active: false }).where(eq(schema.recurringBlocks.id, blockId));
    const reopened = await releaseBlock(tx, blockId);
    await applyBlocks(tx, cur.venueId); // other blocks that also cover a re-opened slot keep it closed
    await audit(actor.id, 'block.cancel', 'venue', cur.venueId, { blockId, reopened });
    return { reopened };
  });
}

export async function listBlocks(actor: Actor, venueId: string) {
  await assertManages(actor, venueId);
  return db().select({ b: schema.recurringBlocks, closedSlots: sql<number>`(select count(*)::int from time_slots t where t.block_id = ${schema.recurringBlocks.id} and t.ends_at > now())` })
    .from(schema.recurringBlocks).where(eq(schema.recurringBlocks.venueId, venueId)).orderBy(desc(schema.recurringBlocks.active), asc(schema.recurringBlocks.fromDate)).limit(100);
}
