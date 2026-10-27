/**
 * Storage abstraction.
 *  - BLOB_READ_WRITE_TOKEN set  -> Vercel Blob (demo/production on Vercel).
 *  - otherwise, non-production  -> local disk under .uploads/ (development only; Vercel's disk is read-only).
 *  - otherwise                   -> uploads are refused with a clear message.
 * Bundled demo images use keys like "img/hall-a.jpg" (served from /public).
 */
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '@/server/env';
import { DomainError } from '@/server/booking/errors';

export function publicUrl(storageKey: string): string {
  if (storageKey.startsWith('img/')) return '/' + storageKey;
  if (/^https?:\/\//.test(storageKey) || storageKey.startsWith('/')) return storageKey;
  const base = process.env.STORAGE_PUBLIC_BASE_URL ?? '';
  return `${base.replace(/\/$/, '')}/${storageKey}`;
}

/** Local-development upload folder (served by /api/uploads; disabled in production). */
export const UPLOAD_DIR = path.join(process.cwd(), '.uploads');
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5MB request bodies

/** Detects the real image type from magic bytes (the client-provided type/extension is never trusted). */
export function sniffImage(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

/** Validates, re-encodes (strips metadata, caps size) and stores an uploaded image. Returns the stored key/URL. */
export async function storeImage(input: Buffer, folder: string): Promise<string> {
  if (input.length === 0) throw new DomainError('upload', 'فایلی انتخاب نشده است.');
  if (input.length > MAX_UPLOAD_BYTES) throw new DomainError('upload', 'حجم عکس نباید بیشتر از ۴ مگابایت باشد.');
  if (!sniffImage(input)) throw new DomainError('upload', 'فقط عکس با فرمت JPG، PNG یا WebP مجاز است.');
  const sharp = (await import('sharp')).default;
  let out: Buffer;
  try { out = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); }
  catch { throw new DomainError('upload', 'فایل عکس معتبر نیست.'); }
  const name = `${folder}/${randomBytes(12).toString('hex')}.webp`;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const { put } = await import('@vercel/blob');
    const r = await put(name, out, { access: 'public', contentType: 'image/webp', token, addRandomSuffix: false });
    return r.url;
  }
  if (env().isProduction) throw new DomainError('upload', 'ذخیره‌سازی تصاویر پیکربندی نشده است.');
  if (process.env.VERCEL) throw new DomainError('upload', 'برای آپلود عکس روی Vercel باید BLOB_READ_WRITE_TOKEN تنظیم شود.');
  const file = path.join(UPLOAD_DIR, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, out);
  return `/api/uploads/${name}`;
}

export async function deleteImage(key: string) {
  if (key.startsWith('img/')) return;
  try {
    if (/^https?:\/\//.test(key) && process.env.BLOB_READ_WRITE_TOKEN) { const { del } = await import('@vercel/blob'); await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN }); }
    else if (key.startsWith('/api/uploads/')) await unlink(path.join(UPLOAD_DIR, key.slice('/api/uploads/'.length)));
  } catch { /* best-effort cleanup; the database row is the source of truth */ }
}
