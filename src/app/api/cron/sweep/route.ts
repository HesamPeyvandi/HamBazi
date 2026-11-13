import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { env } from '@/server/env';
import { sweepDue } from '@/server/booking/lifecycle';
import { purgeOldMessages } from '@/server/messaging';
import { eq } from 'drizzle-orm';
import { extendDemoSlots } from '@/db/demo-slots';

export const dynamic = 'force-dynamic';

/** Backstop only: all expiry rules are also enforced transactionally on every read/write. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env().cronSecret;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [job] = await db().insert(schema.jobRuns).values({ name: 'sweep' }).returning();
  const result: Record<string, unknown> = { ...(await sweepDue(500)), chatMessagesPurged: await purgeOldMessages() };
  // Demo deployments only (opt-in): keep the sample venues bookable. Real deployments never set this.
  if (process.env.DEMO_AUTO_SLOTS === '1' && !env().isProduction) result.demoSlotsAdded = await extendDemoSlots(14);
  await db().update(schema.jobRuns).set({ finishedAt: new Date(), result }).where(eq(schema.jobRuns.id, job.id));
  return NextResponse.json({ ok: true, ...result });
}
