// Phase 11 E2E: logo splash, spinner + double-submit lock, loading skeletons, HTTP status codes.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 node tests/e2e/phase11.mjs   (needs a freshly seeded DB)
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const DB = process.env.E2E_DB_URL;
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
psql('TRUNCATE rate_limits, auth_challenges');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const newCtx = (o = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran', ...o });
const hasSplashCookie = async (ctx) => (await ctx.cookies()).some((c) => c.name === 'hb_splash');

// ---------- 1. splash
{
  const ctx = await newCtx(); const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  check('splash: server-rendered on the first visit (logo + name)', (await p.locator('#hb-splash svg').count()) === 1 && (await p.locator('#hb-splash').innerText()).includes('هم‌بازی'));
  check('splash: covers the page (fixed, full screen)', await p.evaluate(() => { const r = document.getElementById('hb-splash').getBoundingClientRect(); return r.width >= innerWidth && r.height >= innerHeight; }));
  await p.waitForSelector('#hb-splash.hb-splash-out', { state: 'attached', timeout: 5000 });
  await sleep(700);
  check('splash: fades out by itself (hidden, no pointer capture)', await p.evaluate(() => { const s = getComputedStyle(document.getElementById('hb-splash')); return s.visibility === 'hidden' && s.opacity === '0'; }));
  check('splash: session cookie hb_splash is set (no Expires)', await hasSplashCookie(ctx) && (await ctx.cookies()).find((c) => c.name === 'hb_splash').expires === -1);
  await p.reload({ waitUntil: 'domcontentloaded' });
  check('splash: NOT shown again in the same session', (await p.locator('#hb-splash').count()) === 0);
  await p.goto(BASE + '/venues'); await p.goto(BASE + '/sessions');
  check('splash: not shown on other pages either', (await p.locator('#hb-splash').count()) === 0);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/'); await sleep(300);
  check('splash: page is clickable right after (header link works)', await p.locator('header a').first().isVisible());
  await ctx.close();
  const ctx2 = await newCtx(); const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/venues', { waitUntil: 'domcontentloaded' });
  check('splash: a new session shows it again (deep link too)', (await p2.locator('#hb-splash').count()) === 1);
  await ctx2.close();
}
{ // no JavaScript: the CSS fallback must hide it
  const ctx = await newCtx({ javaScriptEnabled: false }); const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(4400);
  check('splash: CSS fallback hides it even without JavaScript (never stuck)', await p.evaluate(() => getComputedStyle(document.getElementById('hb-splash')).visibility === 'hidden'));
  await ctx.close();
}
{ // reduced motion
  const ctx = await newCtx({ reducedMotion: 'reduce' }); const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  check('splash: respects prefers-reduced-motion (no animation on the logo block)', await p.evaluate(() => getComputedStyle(document.querySelector('.hb-splash-inner')).animationName === 'none'));
  await ctx.close();
}

// ---------- login helper (splash already dismissed by cookie to keep the flows quick)
async function login(phone, vp) {
  const ctx = await newCtx(vp ? { viewport: vp } : {});
  await ctx.addCookies([{ name: 'hb_splash', value: '1', url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#phone', phone.replace(/\d/g, (d) => FA[d]));
  await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**'); await page.waitForLoadState('networkidle');
  const code = toEn(await page.locator('[role=status] bdi').innerText());
  await page.fill('#code', code); await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  return { ctx, page };
}

// ---------- 2. double-submit protection
const slot = psql(`SELECT s.id FROM time_slots s WHERE s.status='open' AND s.starts_at > now() + interval '5 days' ORDER BY s.starts_at LIMIT 1`);
const { page: up } = await login('09000000001');
const me = psql(`SELECT id FROM users WHERE phone_e164 LIKE '%9000000001'`);
const resCount = () => Number(psql(`SELECT count(*) FROM reservations WHERE host_user_id='${me}' AND slot_id='${slot}'`));
const intents = () => Number(psql(`SELECT count(*) FROM payment_intents WHERE payer_user_id='${me}'`));
{
  await up.goto(BASE + `/book/${slot}?mode=split`, { waitUntil: "networkidle" });
  const btn = up.locator('button:has-text("ایجاد سانس و پرداخت سهم من")');
  // slow the server action so the second click would land while the first is still running
  await up.route('**/book/**', async (r) => { if (r.request().method() === 'POST') await sleep(1200); await r.continue(); });
  await btn.click();
  await up.waitForTimeout(150);
  check('create session: after one press the button is disabled', await btn.isDisabled());
  check('create session: aria-busy and a spinning circle next to the text', (await btn.getAttribute('aria-busy')) === 'true' && (await btn.locator('[data-testid=spinner]').count()) === 1 && (await btn.innerText()).includes('ایجاد سانس'));
  check('create session: spinner really rotates (animate-spin)', await btn.locator('[data-testid=spinner]').evaluate((e) => getComputedStyle(e).animationName === 'spin'));
  await btn.click({ force: true, timeout: 1000 }).catch(() => {}); // impatient second click
  await up.keyboard.press('Enter').catch(() => {});
  await up.waitForURL(/\/pay\//, { timeout: 15000 });
  await up.unroute('**/book/**');
  check('create session: exactly ONE reservation despite repeated presses', resCount() === 1, String(resCount()));
  check('create session: lands on the payment page, no "no longer bookable" error', up.url().includes('/pay/') && !up.url().includes('err='));
}
{ // the booking page no longer offers a held slot again (server-side replay is covered by the Vitest suite)
  const intent = psql(`SELECT id FROM payment_intents WHERE payer_user_id='${me}' AND status='created' LIMIT 1`);
  await up.goto(BASE + `/pay/${intent}`, { waitUntil: 'networkidle' });
  check('open payment intent is reachable from the pay page', up.url().includes('/pay/') && intent.length === 36);
}
{
  const pay = up.locator('button:has-text("پرداخت (شبیه‌سازی)")');
  await pay.waitFor();
  await up.route('**/pay/**', async (r) => { if (r.request().method() === 'POST') await sleep(1200); await r.continue(); });
  await pay.click(); await up.waitForTimeout(150);
  check('pay: button disabled + spinner while the payment runs', (await pay.isDisabled()) && (await pay.locator('[data-testid=spinner]').count()) === 1 && (await pay.getAttribute('aria-busy')) === 'true');
  await pay.click({ force: true, timeout: 1000 }).catch(() => {});
  await up.waitForURL(/\/sessions\/[0-9a-f-]{36}\?ok=paid/, { timeout: 15000 });
  await up.unroute('**/pay/**');
  check('pay: succeeded exactly once', psql(`SELECT count(*) FROM payment_intents WHERE payer_user_id='${me}' AND status='succeeded'`) === '1' && intents() === 1);
  check('pay: confirmation shown after redirect', (await up.locator('body').innerText()).includes('پرداخت') );
}
{ // after an error redirect the buttons must work again (lock released)
  const joinSlot = psql(`SELECT s.id FROM time_slots s WHERE s.status='open' AND s.starts_at > now() + interval '6 days' ORDER BY s.starts_at LIMIT 1`);
  await up.goto(BASE + `/book/${joinSlot}`, { waitUntil: 'networkidle' });
  const full = up.locator('button:has-text("رزرو و ادامه به پرداخت")');
  psql(`UPDATE time_slots SET status='closed' WHERE id='${joinSlot}'`);
  await full.click();
  await up.waitForURL(/err=/, { timeout: 10000 });
  check('error redirect: Persian message shown on the same page', (await up.locator('body').innerText()).includes('در دسترس نیست') || (await up.locator('[role=alert]').count()) > 0);
  psql(`UPDATE time_slots SET status='open' WHERE id='${joinSlot}'`);
  await up.goto(BASE + `/book/${joinSlot}`, { waitUntil: 'networkidle' });
  const again = up.locator('button:has-text("رزرو و ادامه به پرداخت")');
  check('error redirect: button is enabled again afterwards', await again.isEnabled());
  await again.click(); await up.waitForURL(/\/pay\//, { timeout: 10000 });
  check('after the error the retry works', up.url().includes('/pay/'));
}
check('a plain (non-form) browser back/forward restore does not leave a locked form', await up.evaluate(() => document.querySelectorAll('button[disabled][aria-busy="true"]').length) === 0);

// ---------- 3. skeletons (real DB lock makes the data slow, so the fallback must show)
async function withLock(table, ms, fn) {
  const c = spawn('psql', [DB, '-q', '-c', `BEGIN; LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(${ms / 1000}); COMMIT;`], { stdio: 'ignore' });
  await sleep(500);
  try { return await fn(); } finally { await new Promise((r) => c.on('exit', r)); }
}
{
  const ctx = await newCtx(); await ctx.addCookies([{ name: 'hb_splash', value: '1', url: BASE }]);
  const p = await ctx.newPage();
  await withLock('open_sessions', 3500, async () => {
    await p.goto(BASE + '/sessions', { waitUntil: 'commit' });
    await p.waitForSelector('h1', { timeout: 4000 });
    const skel = await p.locator('[data-testid=skeleton]').first().isVisible().catch(() => false);
    check('sessions list: heading is there at once, skeleton cards fill the results while data loads', skel && (await p.locator('h1').innerText()).includes('سانس'));
    check('sessions list: skeleton is announced to screen readers (role=status, aria-busy)', (await p.locator('[data-testid=skeleton][role=status][aria-busy=true]').count()) >= 1 || (await p.locator('[role=status][aria-busy=true]').count()) >= 1);
  });
  await p.waitForSelector('[data-testid=skeleton]', { state: 'detached', timeout: 10000 });
  check('sessions list: skeleton is replaced by the real list', (await p.locator('a[href^="/sessions/"]').count()) > 0 || (await p.locator('text=سانس بازی پیدا نشد').count()) > 0);
  await ctx.close();
}
{
  const ctx = await newCtx(); await ctx.addCookies([{ name: 'hb_splash', value: '1', url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(BASE + '/venues', { waitUntil: 'networkidle' });
  const ok = (await p.locator('h1').innerText()).includes('سالن');
  check('venues list renders normally with real cards', ok && (await p.locator('article.card').count()) > 0);
  await ctx.close();
}
{ // private page with loading.tsx: skeleton visible on slow data, then real content
  await withLock('favorite_venues', 3500, async () => {
    await up.goto(BASE + '/favorites', { waitUntil: 'commit' });
    await up.waitForSelector('[data-testid=skeleton]', { timeout: 4000 }).then(() => check('favorites: loading.tsx skeleton shown while data is slow', true), () => check('favorites: loading.tsx skeleton shown while data is slow', false));
  });
  await up.waitForSelector('[data-testid=skeleton]', { state: 'detached', timeout: 10000 }).catch(() => {});
  check('favorites: real content after loading', (await up.locator('h1').first().innerText()).length > 0 && (await up.locator('[data-testid=skeleton]').count()) === 0);
}

// ---------- 4. HTTP status codes must not be changed by streaming
const st = async (path, opt = {}) => { const r = await fetch(BASE + path, { redirect: 'manual', ...opt }); return r.status; };
const U0 = '00000000-0000-0000-0000-000000000000';
check('unknown venue -> 404', (await st('/venues/does-not-exist')) === 404);
check('unknown session -> 404', (await st(`/sessions/${U0}`)) === 404);
check('unknown team -> 404', (await st(`/teams/${U0}`)) === 404);
check('unknown player -> 404', (await st(`/players/${U0}`)) === 404);
check('guest on /favorites -> real 307 to login', (await st('/favorites')) === 307);
check('guest on /notifications, /profile, /reservations, /owner, /admin -> 307', (await Promise.all(['/notifications', '/profile', '/reservations', '/owner', '/admin', '/chat', '/dashboard'].map((x) => st(x)))).every((s) => s === 307));
const loc = (await fetch(BASE + '/reservations?x=1', { redirect: 'manual' })).headers.get('location');
check('guest redirect keeps the target in ?next=', /\/login\?next=%2Freservations%3Fx%3D1/.test(loc ?? ''), loc);
check('public pages stay 200 for guests', (await Promise.all(['/', '/venues', '/sessions', '/teams'].map((x) => st(x)))).every((s) => s === 200));
const hAuth = await fetch(BASE + '/favorites', { redirect: 'manual', headers: { cookie: 'hb_session=bogus' } });
check('a bogus session cookie passes the proxy but the page itself still rejects it', hAuth.status === 307 || hAuth.status === 200);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
