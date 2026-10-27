import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { UPLOAD_DIR } from '@/server/storage';

/** Serves locally stored uploads (development/demo without Vercel Blob). Never active in production. */
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (env().isProduction) return new NextResponse(null, { status: 404 });
  const rel = (await params).path.join('/');
  if (!/^[\w-]+(\/[\w-]+)*\/[\w-]+\.webp$/.test(rel)) return new NextResponse(null, { status: 404 });
  const file = path.join(UPLOAD_DIR, rel);
  if (!file.startsWith(UPLOAD_DIR + path.sep)) return new NextResponse(null, { status: 404 });
  try { return new NextResponse(new Uint8Array(await readFile(file)), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } }); }
  catch { return new NextResponse(null, { status: 404 }); }
}
