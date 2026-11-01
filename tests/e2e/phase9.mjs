// Phase 9 E2E: health, robots, sitemap, OG metadata, desktop zoom lock, 404 page.
// Usage: BASE=http://localhost:3000 node tests/e2e/phase9.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const h = await fetch(BASE + '/api/health');
check('health: 200 {ok:true} and not cacheable', h.status === 200 && (await h.json()).ok === true && h.headers.get('cache-control') === 'no-store');
const robots = await (await fetch(BASE + '/robots.txt')).text();
check('robots: private areas disallowed, sitemap listed', /Disallow: \/admin/.test(robots) && /Disallow: \/api\//.test(robots) && /Sitemap: .*\/sitemap\.xml/.test(robots), robots.slice(0, 120).replace(/\n/g, ' | '));
const map = await (await fetch(BASE + '/sitemap.xml')).text();
check('sitemap: lists published venues and static pages', /\/venues\/[a-z0-9-]+<\/loc>/.test(map) && /<loc>[^<]*\/venues<\/loc>/.test(map));
check('sitemap: no private pages', !/\/(admin|owner|chat|profile|settings)</.test(map));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fa-IR' });
const p = await ctx.newPage();
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
const og = await p.evaluate(() => ({ t: document.querySelector('meta[property="og:title"]')?.content, l: document.querySelector('meta[property="og:locale"]')?.content, i: document.querySelector('meta[property="og:image"]')?.content }));
check('home has Open Graph title, locale and image', !!og.t && og.l === 'fa_IR' && /icon-512\.png/.test(og.i ?? ''), JSON.stringify(og));
const zoom = await p.evaluate(() => {
  const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true, bubbles: true }); window.dispatchEvent(w);
  const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true, bubbles: true }); window.dispatchEvent(k);
  const k2 = new KeyboardEvent('keydown', { key: '-', metaKey: true, cancelable: true, bubbles: true }); window.dispatchEvent(k2);
  const plain = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true }); window.dispatchEvent(plain);
  return { wheel: w.defaultPrevented, plus: k.defaultPrevented, minus: k2.defaultPrevented, plain: plain.defaultPrevented };
});
check('desktop zoom lock: Ctrl+wheel and Ctrl/Cmd +/- are blocked, normal scrolling is not', zoom.wheel && zoom.plus && zoom.minus && !zoom.plain, JSON.stringify(zoom));
const r404 = await p.goto(BASE + '/no-such-page', { waitUntil: 'networkidle' });
check('unknown URL: 404 status with the friendly page', r404.status() === 404 && (await p.locator('h1').innerText()).includes('پیدا نشد'));
const gone = await p.goto(BASE + '/coming-soon', { waitUntil: 'networkidle' });
check('removed /coming-soon is a 404', gone.status() === 404);
const bad = await fetch(BASE + '/sessions/not-a-uuid', { redirect: 'manual' });
check('malformed id never causes a 500', bad.status < 500, String(bad.status));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
