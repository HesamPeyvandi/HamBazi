# Assets (logo, photos, font)

## Delivered and integrated (Phase 6 session)
| Asset | Where it lives | Notes |
|---|---|---|
| Logo | `src/components/ui/Logo.tsx` (inline SVG path), `public/img/logo.svg` | Re-traced from `Green Teamwork Sports Logo.png` into one clean vector path (no background). Colour is a prop (`#10824B` on light, `#2ee07a` on dark). |
| App icon / favicon | `src/app/icon.png` (512), `src/app/apple-icon.png` (180) | Generated from the logo on a white rounded square. |
| Hero | `public/img/hero.jpg` | "Futsal footwork under arena lights". |
| Hall photos | `public/img/hall-a.jpg … hall-d.jpg` | Four empty futsal arenas, 1586 px wide, JPEG q80. |
| Locker rooms | `public/img/locker.jpg`, `shower.jpg`, `stands.jpg` | Three locker-room photos. The file names are historical (seed keys); the content is "locker room" for all three. |
| Avatars | `public/img/avatars/p1.jpg … p20.jpg` | 20 portraits cropped from the supplied grid, 256×256. |

## Still needed from the owner
| What | Where | Spec |
|---|---|---|
| Brand font (optional) | `public/fonts/brand/` + `src/styles/font.css` | See `docs/FONT.md`. Vazirmatn is used until then. |
| PWA icons 192/512 maskable | `public/icons/` (Phase 8) | Square, ≥ 512×512. |
| Real venue photos | uploaded through the owner panel | JPG/PNG/WebP ≤ 4 MB, 16:9 preferred. |

Before a public launch: confirm that you hold the rights to every supplied image (they look AI-generated); the portraits are fictional people, not real users.
