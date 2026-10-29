import { NextResponse } from 'next/server';
import { currentUser } from '@/server/auth/session';
import { DomainError } from '@/server/booking/errors';
import { checkPollLimit, getMessages } from '@/server/messaging';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: string | null) => { if (v === null || !/^\d{1,15}$/.test(v)) return undefined; return Number(v); };
const H = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

/** Short-polling endpoint: GET ?after=<seq> (new messages) | ?before=<seq> (older page). Read-only, so no CSRF surface. */
export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: H });
  if (!UUID.test(roomId)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: H });
  const q = new URL(req.url).searchParams;
  try {
    await checkPollLimit(user.id);
    const after = num(q.get('after')), before = num(q.get('before'));
    const r = await getMessages(user.id, roomId, { after, before, limit: num(q.get('limit')), markRead: q.get('mark') === '1' });
    return NextResponse.json({ messages: r.messages, hasMore: r.hasMore, lastSeq: r.lastSeq, canWrite: r.access.canWrite }, { headers: H });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.code }, { status: e.code === 'rate_limited' ? 429 : 404, headers: H });
    throw e;
  }
}
