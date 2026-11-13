# Assets (logo, photos, font)

## Delivered and integrated (Phase 6 session)
| Asset | Where it lives | Notes |
|---|---|---|
| Logo | `src/components/ui/Logo.tsx` (inline SVG path), `public/img/logo.svg` | Re-traced from `Green Teamwork Sports Logo.png` into one clean vector path (no background). Colour is a prop (`#10824B` on light, `#2ee07a` on dark). |
| App icon / favicon | `src/app/icon.png` (512), `src/app/apple-icon.png` (180) | Generated from the logo on a white rounded square. |
| Hero | `public/img/hero-<w>.avif/.webp` (source name `hero.jpg`) | "Futsal footwork under arena lights". |
| Hall photos | `public/img/hall-a-<w>.avif/.webp … hall-d-…` | Four empty futsal arenas; widths 480 / 800 / 1280 / 1586. |
| Locker rooms | `public/img/locker-<w>.*`, `shower-<w>.*`, `stands-<w>.*` | Three locker-room photos. The file names are historical (seed keys); the content is "locker room" for all three. |
| Avatars | `public/img/avatars/p1-96.webp`, `p1-192.webp` … `p20-*` | 20 portraits, 96 px and 192 px WebP (shown at 40–96 px). |

## Still needed from the owner
| What | Where | Spec |
|---|---|---|
| Brand font (optional) | `public/fonts/brand/` + `src/styles/font.css` | See `docs/FONT.md`. Vazirmatn is used until then. |
| PWA icons 192/512 maskable | `public/icons/` (Phase 8) | Square, ≥ 512×512. |
| Real venue photos | uploaded through the owner panel | JPG/PNG/WebP ≤ 4 MB, 16:9 preferred. |

Before a public launch: confirm that you hold the rights to every supplied image (they look AI-generated); the portraits are fictional people, not real users.

## Image pipeline (phase 12)
- Only AVIF + WebP variants are shipped; the original JPEGs were removed from the repository. The database and seed data still use the legacy keys (`img/hall-a.jpg`, `/img/avatars/p3.jpg`) so existing rows stay valid: `src/lib/images.ts` + `<Picture>` map a legacy key to the generated files using `src/lib/image-manifest.json`.
- Uploaded photos (Vercel Blob / local `.uploads`) are re-encoded to WebP (max 1600 px) at upload time and are shown as they are.
- To add or replace a bundled photo: drop a `.jpg`/`.png` into `public/img/` (or `public/img/avatars/`), run `npm run images:optimize` (add `-- --remove` to delete the original afterwards), commit the generated files and the manifest.
- Files under `/img` and `/fonts` are served with `Cache-Control: public, max-age=2592000, stale-while-revalidate=86400`.
