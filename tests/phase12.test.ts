import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bundledVariants, bundledSingle } from '@/lib/images';
import manifest from '@/lib/image-manifest.json';
import { singleFlight } from '@/lib/client/single-flight';

const PUB = path.join(process.cwd(), 'public');

describe('image variants (phase 12)', () => {
  it('maps legacy .jpg keys to AVIF + WebP srcsets', () => {
    const v = bundledVariants('/img/hall-a.jpg')!;
    expect(v.avif).toContain('/img/hall-a-480.avif 480w');
    expect(v.webp).toContain('/img/hall-a-1280.webp 1280w');
    expect(v.fallback).toBe('/img/hall-a-800.webp');
  });
  it('avatars get small WebP only', () => {
    const v = bundledVariants('/img/avatars/p3.jpg')!;
    expect(v.avif).toBe(''); expect(v.webp).toBe('/img/avatars/p3-96.webp 96w, /img/avatars/p3-192.webp 192w');
  });
  it('uploads, remote URLs and unknown names are left alone', () => {
    for (const s of ['/api/uploads/venues/x.webp', 'https://abc.public.blob.vercel-storage.com/a.webp', '/img/unknown.jpg', '/img/logo.svg']) expect(bundledVariants(s)).toBeNull();
    expect(bundledSingle('https://x/y.webp')).toBe('https://x/y.webp');
  });
  it('every file named in the manifest exists and the originals were removed', () => {
    for (const [name, widths] of Object.entries(manifest as Record<string, number[]>)) {
      for (const w of widths) {
        expect(existsSync(path.join(PUB, 'img', `${name}-${w}.webp`)), `${name}-${w}.webp`).toBe(true);
        if (!name.startsWith('avatars/')) expect(existsSync(path.join(PUB, 'img', `${name}-${w}.avif`)), `${name}-${w}.avif`).toBe(true);
      }
      expect(existsSync(path.join(PUB, 'img', `${name}.jpg`))).toBe(false);
    }
  });
  it('the AVIF variants are far smaller than the old ~170-260 KB JPEGs at the sizes cards use', () => {
    expect(statSync(path.join(PUB, 'img/hall-a-800.avif')).size).toBeLessThan(40_000);
    expect(statSync(path.join(PUB, 'img/hero-1280.avif')).size).toBeLessThan(60_000);
  });
  it('no raw jpg/png photos are left in public/img', () => {
    const left = [...readdirSync(path.join(PUB, 'img')), ...readdirSync(path.join(PUB, 'img/avatars')).map((f) => 'avatars/' + f)].filter((f) => /\.(jpe?g|png)$/i.test(f));
    expect(left).toEqual([]);
  });
});

describe('singleFlight (request de-duplication)', () => {
  it('concurrent callers with the same key share one run; a later call runs again', async () => {
    let runs = 0;
    const slow = () => new Promise<number>((r) => setTimeout(() => r(++runs), 30));
    const [a, b, c] = await Promise.all([singleFlight('k', slow), singleFlight('k', slow), singleFlight('k', slow)]);
    expect([a, b, c]).toEqual([1, 1, 1]); expect(runs).toBe(1);
    expect(await singleFlight('k', slow)).toBe(2);
  });
  it('different keys run independently and a failure does not poison the key', async () => {
    let n = 0;
    await expect(singleFlight('f', async () => { n++; throw new Error('x'); })).rejects.toThrow('x');
    expect(await singleFlight('f', async () => ++n)).toBe(2);
    expect(await Promise.all([singleFlight('x1', async () => 1), singleFlight('x2', async () => 2)])).toEqual([1, 2]);
  });
});
