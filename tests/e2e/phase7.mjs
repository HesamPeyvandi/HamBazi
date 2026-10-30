// Phase 7 E2E: chat reply + identity colours, hero, favourites, help desk, owner staff and sessions overview.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots7 node tests/e2e/phase7.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots7';
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
const uid = (phone) => psql(`select id from users where phone_e164='+98${phone.slice(1)}'`);
const send = async (p, text) => { await p.fill('#chat-text', text); await p.press('#chat-text', 'Enter'); };
psql(`delete from notifications where type = 'chat_message'`);
const A = uid('09000000001'), B = uid('09000000011');
psql(`delete from teams where name = 'تیم پاسخ آزمون'`);
psql(`insert into teams (name, sport_id, city_id, join_mode, max_members, invite_token) select 'تیم پاسخ آزمون', (select id from sports where key='futsal'), (select id from cities where slug='semnan'), 'public', 10, 'e2e' || substr(md5(random()::text),1,10)`);
const teamId = psql(`select id from teams where name='تیم پاسخ آزمون'`);
psql(`insert into team_members (team_id, user_id, role) values ('${teamId}','${A}','captain'),('${teamId}','${B}','member')`);
psql(`delete from favorite_venues where user_id='${B}'`);
psql(`delete from support_messages where user_id='${B}'`);
psql(`delete from venue_managers where role='staff'`);

// ---------- hero (desktop + mobile screenshots; the photo must be visible)
{
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fa-IR' }); const p = await d.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.screenshot({ path: `${SHOTS}/hero-desktop.png` });
  check('home loads, h1 present', (await p.locator('h1').count()) >= 1);
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, locale: 'fa-IR' }); const mp = await m.newPage();
  await mp.goto(BASE + '/', { waitUntil: 'networkidle' }); await mp.screenshot({ path: `${SHOTS}/hero-mobile.png` });
  check('mobile: no horizontal scroll on home', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

// ---------- chat reply + identity colour
const a = await login('09000000001'), b = await login('09000000011');
const ap = a.page, bp = b.page;
const errs = []; bp.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); bp.on('pageerror', (e) => errs.push(String(e)));
await ap.goto(`${BASE}/teams/${teamId}`, { waitUntil: 'networkidle' });
await ap.click('a:has-text("گفت‌وگوی تیم")'); await ap.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
const roomId = ap.url().split('/').pop();
await send(ap, 'پیام اول از علی');
await ap.waitForSelector('[role=log] >> text=پیام اول از علی');
await bp.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
await bp.waitForSelector('[role=log] >> text=پیام اول از علی');
await bp.click('button[aria-label="پاسخ به این پیام"]');
check('reply: quote bar appears with cancel button', (await bp.locator('button[aria-label="لغو پاسخ"]').count()) === 1);
await send(bp, 'این جواب شماست');
await bp.waitForSelector('[role=log] >> text=این جواب شماست');
check('reply stored with reply_to_id', psql(`select count(*) from chat_messages where room_id='${roomId}' and reply_to_id is not null`) === '1');
check('reply bubble shows the quoted snippet', (await bp.locator('[role=log] button[aria-label^="رفتن به پیام"]').count()) === 1);
await ap.waitForSelector('[role=log] button[aria-label^="رفتن به پیام"]', { timeout: 15000 });
check('other side receives the reply by polling', true);
await bp.screenshot({ path: `${SHOTS}/chat-reply.png` });
await bp.click('button[aria-label^="رفتن به پیام"]');
check('quote bar cleared after sending', (await bp.locator('button[aria-label="لغو پاسخ"]').count()) === 0);
// a no-avatar user gets a stable colour: same inline colour across reloads
const colorOf = async (p) => p.evaluate(() => { const el = [...document.querySelectorAll('[role=log] [style*="color"], [role=log] [style*="background"]')][0]; return el ? el.getAttribute('style') : ''; });
const c1 = await colorOf(bp); await bp.reload({ waitUntil: 'networkidle' }); const c2 = await colorOf(bp);
check('identity colour is stable across reloads', !!c1 && c1 === c2, c1);
// cancel reply
await bp.click('button[aria-label="پاسخ به این پیام"]'); await bp.click('button[aria-label="لغو پاسخ"]');
check('reply can be cancelled', (await bp.locator('button[aria-label="لغو پاسخ"]').count()) === 0);

// ---------- chat layout, context menu, hydration
{
  await bp.reload({ waitUntil: 'networkidle' });
  const box = async (txt) => bp.locator(`[role=log] [id^="m-"]:has-text("${txt}")`).first().locator('.rounded-2xl').first().boundingBox();
  const mine = await box('این جواب شماست'), theirs = await box('پیام اول از علی');
  check('own message is on the right, the other person\'s on the left', mine.x > theirs.x, `${Math.round(mine.x)} vs ${Math.round(theirs.x)}`);
  check('no report/block links under messages (only reply)', (await bp.locator('[role=log] a:has-text("گزارش")').count()) === 0 && (await bp.locator('[role=log] button:has-text("مسدود")').count()) === 0);
  const ph = await bp.locator('#chat-text').evaluate((el) => getComputedStyle(el).textAlign + '|' + el.dir);
  check('input is right-aligned (rtl)', ph.endsWith('rtl') && ['start', 'right'].includes(ph.split('|')[0]), ph);
  await bp.locator('[role=log] [id^="m-"]:has-text("پیام اول از علی") .rounded-2xl').first().click({ button: 'right' });
  check('desktop right-click on the other person\'s message: reply/report/block', (await bp.locator('[role=menuitem]').count()) === 3);
  await bp.keyboard.press('Escape');
  check('Escape closes the menu', (await bp.locator('[role=menu]').count()) === 0);
  await bp.locator('[role=log] [id^="m-"]:has-text("این جواب شماست") .rounded-2xl').first().click({ button: 'right' });
  check('own message menu has only reply', (await bp.locator('[role=menuitem]').count()) === 1);
  await bp.keyboard.press('Escape');
  check('desktop plain click does not open the menu', (await (async () => { await bp.locator('[role=log] [id^="m-"]:has-text("پیام اول از علی") .rounded-2xl').first().click(); return bp.locator('[role=menu]').count(); })()) === 0);
  const st = await b.ctx.storageState();
  const mctx = await browser.newContext({ storageState: st, viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, locale: 'fa-IR' });
  const mob = { page: await mctx.newPage() };
  await mob.page.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
  await mob.page.locator('[role=log] [id^="m-"]:has-text("پیام اول از علی") .rounded-2xl').first().tap();
  check('mobile tap on a message opens the menu', (await mob.page.locator('[role=menu]').count()) === 1);
  await mob.page.screenshot({ path: `${SHOTS}/chat-menu-mobile.png` });
  check('no hydration / console errors in the chat page', errs.length === 0, errs.join(' | ').slice(0, 200));
}

// ---------- favourites
await bp.goto(BASE + '/venues', { waitUntil: 'networkidle' });
await bp.locator('button[aria-label="افزودن به علاقه‌مندی‌ها"]').first().click();
await bp.waitForLoadState('networkidle');
check('favourite saved', psql(`select count(*) from favorite_venues where user_id='${B}'`) === '1');
await bp.goto(BASE + '/favorites', { waitUntil: 'networkidle' });
check('favourites page lists the venue', (await bp.locator('a[href^="/venues/"]').count()) >= 1);
const anon = await browser.newContext({ locale: 'fa-IR' }); const anp = await anon.newPage();
await anp.goto(BASE + '/favorites', { waitUntil: 'networkidle' }); check('/favorites requires login', anp.url().includes('/login'));

// ---------- help desk
await bp.goto(BASE + '/help', { waitUntil: 'networkidle' });
await bp.fill('#body', 'سلام، این یک پیام آزمایشی برای پشتیبانی است');
await bp.click('#contact button:has-text("ارسال پیام")'); await bp.waitForURL('**ok=sent**');
check('support message stored', psql(`select count(*) from support_messages where user_id='${B}'`) === '1');
const adm = await login('09000000003'); await adm.page.goto(BASE + '/admin/support', { waitUntil: 'networkidle' });
check('admin sees the support message', (await adm.page.locator('text=پیام آزمایشی برای پشتیبانی').count()) === 1);
for (const path of ['/admin/sessions', '/admin/reviews']) { const r = await adm.page.goto(BASE + path, { waitUntil: 'networkidle' }); check(`admin ${path} opens`, r.status() === 200); }
const rb = await bp.goto(BASE + '/admin/support', { waitUntil: 'networkidle' }); check('player cannot open admin support', rb.status() !== 200 || !bp.url().includes('/admin/support'));

// ---------- owner: sessions overview + staff
const o = await login('09000000002'); const op = o.page;
check('venue manager login lands on /owner', new URL(op.url()).pathname === '/owner', op.url());
const rs = await op.goto(BASE + '/owner/sessions', { waitUntil: 'networkidle' }); check('/owner/sessions opens for the owner', rs.status() === 200);
await op.goto(BASE + '/owner', { waitUntil: 'networkidle' });
await op.locator('a[href^="/owner/venues/"]:not([href$="/new"])').first().click(); await op.waitForURL(/\/owner\/venues\/[0-9a-f-]{36}$/); await op.waitForLoadState('networkidle');
const venueUrl = op.url();
await op.fill('#staff-phone', '09000000012'); await op.click('button:has-text("افزودن")'); await op.waitForLoadState('networkidle');
check('staff added (role staff in DB)', psql(`select count(*) from venue_managers where role='staff'`) === '1');
const s = await login('09000000012'); const sp = s.page;
const rv = await sp.goto(venueUrl, { waitUntil: 'networkidle' });
check('staff can open the venue page but sees no edit form / staff section', rv.status() === 200 && (await sp.locator('#staff-phone').count()) === 0 && (await sp.locator('#image').count()) === 0);
check('staff can open reservations', (await sp.goto(BASE + '/owner/reservations', { waitUntil: 'networkidle' })).status() === 200);
await op.reload({ waitUntil: 'networkidle' });
await op.locator('li:has-text("کارمند") button:has-text("حذف")').first().click(); await op.waitForLoadState('networkidle');
check('staff removed', psql(`select count(*) from venue_managers where role='staff'`) === '0');
const rv2 = await sp.goto(venueUrl, { waitUntil: 'networkidle' }); check('removed staff gets 404', rv2.status() === 404, String(rv2.status()) + ' ' + sp.url());

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
