import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { env } from '@/server/env';
import { sweepDue } from '@/server/booking/lifecycle';
import { purgeOldMessages } from '@/server/messaging';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** Backstop only: all expiry rules are also enforced transactionally on every read/write. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env().cronSecret;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [job] = await db().insert(schema.jobRuns).values({ name: 'sweep' }).returning();
  const result = { ...(await sweepDue(500)), chatMessagesPurged: await purgeOldMessages() };
  await db().update(schema.jobRuns).set({ finishedAt: new Date(), result }).where(eq(schema.jobRuns.id, job.id));
  return NextResponse.json({ ok: true, ...result });
}
