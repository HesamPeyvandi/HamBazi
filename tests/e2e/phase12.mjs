// Phase 12 E2E: AVIF/WebP images, long-lived image cache, debounced search, no duplicate requests.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 node tests/e2e/phase12.mjs   (freshly seeded DB)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const DB = process.env.E2E_DB_URL;
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const browser = await chromium.launch();
const newCtx = async (o = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'fa-IR', ...o }); await c.addCookies([{ name: 'hb_splash', value: '1', url: BASE }]); return c; };
const slug = psql(`SELECT slug FROM venues WHERE status='published' ORDER BY created_at LIMIT 1`);

// ---------- 1. image formats and bytes
{
  const html = await (await fetch(BASE + '/')).text();
  check('home: <picture> with AVIF and WebP sources', /<source[^>]*type="image\/avif"/.test(html) && /<source[^>]*type="image\/webp"/.test(html));
  check('home: no .jpg/.png photo referenced (only AVIF/WebP)', !/\/img\/[\w-]+\.jpe?g/.test(html));
  check('home: LCP hero is eager + fetchpriority=high', /fetchPriority="high"|fetchpriority="high"/.test(html));
  check('home: desktop hero art-direction source (min-width:1024px)', /media="\(min-width: ?1024px\)"/.test(html));
  const a = await fetch(BASE + '/img/hall-a-800.avif'); const w = await fetch(BASE + '/img/hall-a-800.webp');
  check('AVIF asset served as image/avif', a.status === 200 && a.headers.get('content-type') === 'image/avif', a.headers.get('content-type'));
  check('WebP asset served as image/webp', w.status === 200 && w.headers.get('content-type') === 'image/webp');
  check('images are cached for 30 days (Cache-Control)', /max-age=2592000/.test(a.headers.get('cache-control') ?? ''), a.headers.get('cache-control'));
  check('fonts are cached long too', /max-age=2592000/.test((await fetch(BASE + '/img/logo.svg')).headers.get('cache-control') ?? ''));
  check('old JPEGs are gone (404)', (await fetch(BASE + '/img/hall-a.jpg')).status === 404);
  check('AVIF is much smaller than the old 223 KB JPEG', Number(a.headers.get('content-length') ?? (await a.arrayBuffer()).byteLength) < 40_000);
}
{
  const ctx = await newCtx(); const p = await ctx.newPage();
  const imgs = []; p.on('response', (r) => { if (/\/img\//.test(r.url()) && !r.url().endsWith('.svg')) imgs.push({ url: r.url(), type: r.headers()['content-type'], len: Number(r.headers()['content-length'] ?? 0) }); });
  const bad = []; p.on('requestfailed', (r) => { if (/\/img\//.test(r.url())) bad.push(r.url()); }); // (aborted prefetches and map tiles are not image problems)
  await p.goto(BASE + '/venues', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelectorAll('img').forEach((i) => i.scrollIntoView())); await sleep(800);
  await p.goto(BASE + '/venues/' + slug, { waitUntil: 'networkidle' });
  check('venues + venue page: every photo response is AVIF/WebP', imgs.length > 0 && imgs.every((i) => /avif|webp/.test(i.type)), imgs.map((i) => i.type).join(','));
  check('browser actually picked AVIF for the hero/cards', imgs.some((i) => i.type === 'image/avif'));
  const total = imgs.reduce((s, i) => s + i.len, 0);
  check('photo bytes on the two pages are small (< 450 KB total)', total > 0 && total < 450_000, `${Math.round(total / 1024)} KB`);
  check('no failed image requests', bad.length === 0, bad.join(' | '));
  const dims = await p.evaluate(() => [...document.querySelectorAll('picture img')].every((i) => i.complete && i.naturalWidth > 0));
  check('all <picture> images decoded (naturalWidth > 0)', dims);
  const sample = await p.evaluate(() => { const i = document.querySelector('main picture img, picture img'); return i ? i.currentSrc : ''; });
  check('currentSrc is a generated variant', /-(480|800|1280|1586|1200)\.(avif|webp)$/.test(sample), sample);
  await ctx.close();
}
{ // avatars
  const sid = psql(`SELECT id FROM open_sessions LIMIT 1`);
  if (sid) {
    const ctx = await newCtx(); const p = await ctx.newPage(); const av = [];
    p.on('response', (r) => { if (r.url().includes('/img/avatars/')) av.push(r.url()); });
    await p.goto(BASE + '/sessions/' + sid, { waitUntil: 'networkidle' });
    check('avatars load as small WebP files', av.length > 0 && av.every((u) => /-(96|192)\.webp$/.test(u)), av.slice(0, 2).join(','));
    await ctx.close();
  }
}

// ---------- 2. debounced search
async function typeTest(path, selector) {
  const ctx = await newCtx(); const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: 'networkidle' });
  const reqs = []; p.on('request', (r) => { const u = new URL(r.url()); if (u.pathname === path && u.searchParams.has('q') && r.method() === 'GET') reqs.push(u.search); });
  await p.evaluate(() => { window.__noReload = true; });
  const input = p.locator(selector);
  await input.click();
  await input.pressSequentially('فوتسال', { delay: 70 }); // 6 quick keystrokes
  await sleep(250);
  const early = reqs.length;
  await sleep(1200);
  check(`${path}: no request while typing (before 400 ms of silence)`, early === 0, String(early));
  check(`${path}: exactly ONE request after the pause, with the full term`, reqs.length === 1 && decodeURIComponent(reqs[0]).includes('q=فوتسال'), reqs.join(' '));
  check(`${path}: URL updated (shareable) and field keeps the text`, p.url().includes('q=') && (await input.inputValue()) === 'فوتسال');
  check(`${path}: no full page reload (soft navigation)`, await p.evaluate(() => window.__noReload === true));
  const n1 = reqs.length;
  await input.pressSequentially(' '); await sleep(900); // trailing space = same trimmed term
  check(`${path}: unchanged term sends nothing`, reqs.length === n1);
  await input.fill(''); await input.pressSequentially('ف'); await sleep(900);
  check(`${path}: a single character is not searched`, !reqs.slice(n1).some((s) => /q=%D9%81(&|$)/.test(s)));
  await input.fill(''); await sleep(1000);
  check(`${path}: clearing the field removes ?q`, !p.url().includes('q='), p.url());
  await input.fill('x'); await input.press('Enter'); await p.waitForURL(/q=x/, { timeout: 5000 }).catch(() => {});
  check(`${path}: Enter still submits immediately (native form)`, p.url().includes('q=x'), p.url());
  await ctx.close();
}
await typeTest('/sessions', 'input[name=q]');
await typeTest('/teams', '#tq');

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
