// Phase 8 E2E: PWA (manifest, icons, service worker, offline fallback, no private caching) and an axe-core accessibility pass.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots8 node tests/e2e/phase8.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots8';
const DB = process.env.E2E_DB_URL;
fs.mkdirSync(SHOTS, { recursive: true });
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim().split('\n')[0];
psql('TRUNCATE rate_limits, auth_challenges');
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const results = [];
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const browser = await chromium.launch();
async function login(phone, vp = { width: 1280, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#phone', phone.replace(/\d/g, (d) => FA[d])); await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**'); await page.waitForLoadState('networkidle');
  await page.fill('#code', toEn(await page.locator('[role=status] bdi').innerText())); await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  return { ctx, page };
}
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

// ---------- static PWA assets
const anon = await browser.newContext({ locale: 'fa-IR' });
const man = await anon.request.get(BASE + '/manifest.webmanifest');
const mj = await man.json().catch(() => ({}));
check('manifest served, Persian, RTL, standalone', man.status() === 200 && mj.lang === 'fa' && mj.dir === 'rtl' && mj.display === 'standalone' && mj.start_url === '/');
check('manifest has 192, 512 and a maskable icon', ['192x192', '512x512'].every((z) => mj.icons?.some((i) => i.sizes === z)) && mj.icons?.some((i) => i.purpose === 'maskable'));
for (const i of mj.icons ?? []) check(`icon ${i.src} is a PNG`, (await anon.request.get(BASE + i.src)).headers()['content-type']?.includes('image/png'));
const sw = await anon.request.get(BASE + '/sw.js');
check('sw.js: JS, never cached by HTTP caches, scope allowed', sw.status() === 200 && sw.headers()['content-type']?.includes('javascript') && /no-cache|no-store/.test(sw.headers()['cache-control'] ?? '') && sw.headers()['service-worker-allowed'] === '/');
const off = await anon.request.get(BASE + '/offline.html');
check('offline.html is static and personal-data free', off.status() === 200 && !(await off.text()).includes('خروج'));

// ---------- service worker behaviour (real browser)
const a = await login('09000000001'); const p = a.page;
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload({ waitUntil: 'networkidle' });
check('service worker registered and controlling the page', await p.evaluate(() => !!navigator.serviceWorker.controller));
await p.goto(BASE + '/venues', { waitUntil: 'networkidle' });
await p.goto(BASE + '/profile', { waitUntil: 'networkidle' });
const cached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) out.push(new URL(r.url).pathname); } return out; });
check('cache holds static files only (no pages, no API)', cached.length > 0 && cached.every((x) => /^\/(_next\/static\/|img\/|fonts\/|icons\/|offline\.html$)/.test(x)), cached.filter((x) => !/^\/(_next\/static\/|img\/|fonts\/|icons\/)/.test(x)).join(','));
check('nothing under /profile, /api or /chat is cached', !cached.some((x) => /^\/(profile|api|chat|pay|book)/.test(x)));
await a.ctx.setOffline(true);
await p.goto(BASE + '/venues').catch(() => null);
check('offline navigation shows the Persian offline page', (await p.locator('h1:has-text("اتصال اینترنت برقرار نیست")').count()) === 1);
await p.screenshot({ path: `${SHOTS}/offline.png` });
await a.ctx.setOffline(false);
await p.goto(BASE + '/venues', { waitUntil: 'networkidle' });
check('back online: real page again (not the fallback)', (await p.locator('h1:has-text("اتصال اینترنت برقرار نیست")').count()) === 0);
// banner appears on the offline event
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await a.ctx.setOffline(true);
await p.waitForSelector('[role=status]:has-text("اتصال اینترنت قطع است")', { timeout: 5000 }).then(() => check('offline banner shows while disconnected', true)).catch(() => check('offline banner shows while disconnected', false));
await a.ctx.setOffline(false);
// install button: hidden in a normal desktop browser without a prompt event
check('no install button without a prompt event', (await p.locator('footer button:has-text("نصب")').count()) === 0);
await p.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })));
check('install button appears on beforeinstallprompt', (await p.locator('footer button:has-text("نصب")').count()) === 1);

// ---------- axe accessibility pass (serious + critical only)
const venueSlug = psql(`select slug from venues where status='published' order by created_at limit 1`);
const scan = async (page, path, label) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.evaluate(axeSrc);
  const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, n: v.nodes.length, ex: v.nodes[0].target.join(' ').slice(0, 80) })));
  check(`axe ${label}: no serious/critical violations`, res.length === 0, JSON.stringify(res).slice(0, 400));
};
const g = anon; const gp = await g.newPage();
for (const [path, label] of [['/', 'home'], ['/venues', 'venues'], [`/venues/${venueSlug}`, 'venue page'], ['/login', 'login'], ['/sessions', 'sessions'], ['/teams', 'teams'], ['/help', 'help'], ['/terms', 'terms']]) await scan(gp, path, label);
for (const [path, label] of [['/profile', 'profile'], ['/chat', 'chat list'], ['/favorites', 'favourites'], ['/notifications', 'notifications']]) await scan(p, path, label);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
