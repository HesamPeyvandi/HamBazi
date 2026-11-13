// Converts the bundled JPG/PNG photos in public/img to responsive AVIF + WebP files and writes src/lib/image-manifest.json.
//   node scripts/optimize-images.mjs            -> generate variants next to the sources (keeps the sources)
//   node scripts/optimize-images.mjs --remove   -> also delete the original .jpg/.png after a successful conversion
// Photos (hall-a.jpg ...)  -> name-<width>.avif / .webp   (widths up to the source width)
// Avatars (avatars/p1.jpg) -> p1-96.webp / p1-192.webp    (they are shown at 40-96 px)
// The app keeps referring to "/img/hall-a.jpg" (database rows stay valid); <Picture> maps that to the variants.
import { readdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
const ROOT = path.resolve(import.meta.dirname, '..');
const IMG = path.join(ROOT, 'public/img');
const remove = process.argv.includes('--remove');
const PHOTO_WIDTHS = [480, 800, 1280, 1920];
const manifest = {};
let before = 0, after = 0;

const isSrc = (f) => /\.(jpe?g|png)$/i.test(f);
for (const f of (await readdir(IMG)).filter(isSrc)) {
  const base = f.replace(/\.[^.]+$/, '');
  const file = path.join(IMG, f);
  const { width: w0, size } = await sharp(file).metadata().then(async (m) => ({ width: m.width, size: (await sharp(file).toBuffer()).length }));
  before += size;
  const widths = [...new Set([...PHOTO_WIDTHS.filter((w) => w < w0), w0])];
  for (const w of widths) {
    const img = () => sharp(file).rotate().resize({ width: w, withoutEnlargement: true });
    const a = await img().avif({ quality: 50, effort: 3 }).toBuffer(); await writeFile(path.join(IMG, `${base}-${w}.avif`), a);
    const b = await img().webp({ quality: 78, effort: 6 }).toBuffer(); await writeFile(path.join(IMG, `${base}-${w}.webp`), b);
    after += a.length + b.length;
  }
  manifest[base] = widths;
  if (remove) await unlink(file);
}
const AV = path.join(IMG, 'avatars');
for (const f of (await readdir(AV)).filter(isSrc)) {
  const base = f.replace(/\.[^.]+$/, '');
  const file = path.join(AV, f);
  before += (await sharp(file).toBuffer()).length;
  for (const w of [96, 192]) {
    const b = await sharp(file).resize({ width: w, height: w, fit: 'cover' }).webp({ quality: 80, effort: 6 }).toBuffer();
    await writeFile(path.join(AV, `${base}-${w}.webp`), b); after += b.length;
  }
  manifest[`avatars/${base}`] = [96, 192];
  if (remove) await unlink(file);
}
await writeFile(path.join(ROOT, 'src/lib/image-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`originals: ${(before / 1024).toFixed(0)} KB -> variants: ${(after / 1024).toFixed(0)} KB (all sizes, both formats)`);
