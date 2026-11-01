import { NextResponse } from 'next/server';
import { sqlClient } from '@/db/client';

export const dynamic = 'force-dynamic';

/** Uptime probe: 200 only when the database answers. Reveals nothing else. */
export async function GET() {
  try {
    await sqlClient()`select 1`;
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
