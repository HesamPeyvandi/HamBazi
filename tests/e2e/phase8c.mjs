// Phase 8c E2E: header/search alignment, transparent venues header, multi-select play times, Android geo: link, badge clearing, no zoom, progress bar, soccer-ball icon.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots8c node tests/e2e/phase8c.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots8c';
const DB = process.env.E2E_DB_URL;
fs.mkdirSync(SHOTS, { recursive: true });
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim().split('\n')[0];
psql('TRUNCATE rate_limits, auth_challenges');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const browser = await chromium.launch();
async function login(phone, vp = { width: 1280, height: 900 }, extra = {}) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'fa-IR', timezoneId: 'Asia/Tehran', ...extra });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#phone', phone.replace(/\d/g, (d) => FA[d])); await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**'); await page.waitForLoadState('networkidle');
  await page.fill('#code', toEn(await page.locator('[role=status] bdi').innerText())); await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  return { ctx, page };
}
const centre = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });

// ---- guest: alignment, transparent header, viewport, ball icon
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const p = await ctx.newPage();
  for (const path of ['/', '/venues', '/sessions']) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    const h = p.locator('header').first();
    const logo = await centre(h.locator('svg').first()), word = await centre(h.locator('svg + span').first()), nav = await centre(h.getByRole('link', { name: 'سالن‌ها' }).first());
    check(`header ${path}: logo, wordmark and menu share one centre line`, Math.abs(logo - word) < 1 && Math.abs(logo - nav) < 1, `${logo}/${word}/${nav}`);
  }
  for (const path of ['/', '/venues']) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    const bg = await p.locator('header').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    check(`header ${path}: transparent`, bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', bg);
  }
  await p.goto(BASE + '/sessions', { waitUntil: 'networkidle' });
  const bg = await p.locator('header').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  check('header /sessions: solid', bg !== 'rgba(0, 0, 0, 0)', bg);
  for (const path of ['/', '/venues']) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    const ys = await p.locator('form:has(select[name=city])').first().locator('select').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
    const icons = await p.locator('form:has(select[name=city])').first().locator('svg').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
    const sel = ys.length ? Math.round(ys[0]) : -1;
    check(`search box ${path}: selects and their icons are on one line`, ys.length >= 3 && ys.every((y) => Math.abs(y - ys[0]) < 1) && icons.slice(0, 6).every((y) => Math.abs(y - sel) <= 1), JSON.stringify({ ys, icons }));
  }
  const vp = await p.evaluate(() => document.querySelector('meta[name=viewport]')?.content ?? '');
  check('viewport meta disables zoom', /maximum-scale=1/.test(vp) && /user-scalable=no/.test(vp), vp);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const ball = await p.locator('svg:has(circle[r="9.5"])').count();
  check('home: futsal uses the soccer-ball icon', ball >= 1, String(ball));
  await p.screenshot({ path: `${SHOTS}/home.png` });
  await ctx.close();
}

// ---- mobile alignment + Android geo: link
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const w = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('mobile home: no horizontal overflow', w);
  await p.screenshot({ path: `${SHOTS}/home-mobile.png` });
  const slug = psql('select slug from venues where lat is not null limit 1');
  await p.goto(`${BASE}/venues/${slug}`, { waitUntil: 'networkidle' });
  const a = p.getByRole('link', { name: 'مسیریابی' });
  await a.first().waitFor({ timeout: 8000 });
  const href = await a.first().getAttribute('href');
  check('Android: «مسیریابی» is a geo: link (OS chooser)', /^geo:\d+\.\d+,\d+\.\d+\?q=/.test(href ?? ''), href ?? '');
  await ctx.close();
}

// ---- desktop keeps the dialog
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const p = await ctx.newPage();
  const slug = psql('select slug from venues where lat is not null limit 1');
  await p.goto(`${BASE}/venues/${slug}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'مسیریابی' }).first().click();
  check('desktop: «مسیریابی» opens the app dialog', await p.getByRole('dialog').isVisible());
  await ctx.close();
}

// ---- logged in: multi-select times, badge clearing
{
  const { ctx, page: p } = await login('09000000001');
  await p.goto(BASE + '/profile/edit', { waitUntil: 'networkidle' });
  const boxes = p.locator('input[type=checkbox][name=time]');
  check('profile edit: four play-time checkboxes', (await boxes.count()) === 4);
  await boxes.nth(0).setChecked(true); await boxes.nth(2).setChecked(true); await boxes.nth(1).setChecked(false); await boxes.nth(3).setChecked(false);
  await p.locator('form button[type=submit]').last().click();
  await p.waitForLoadState('networkidle');
  const saved = psql(`select preferred_time from user_profiles where user_id=(select id from users where phone_e164='+989000000001')`);
  check('profile: two play times saved', saved === 'morning,evening', saved);
  await p.goto(BASE + '/profile', { waitUntil: 'networkidle' });
  check('profile page shows both labels', (await p.locator('main').innerText()).includes('صبح، عصر و شب'));

  const uid = psql(`select id from users where phone_e164='+989000000001'`);
  psql(`insert into notifications (user_id, type, title, body) values ('${uid}','system','آزمون نشان','متن')`);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const bell = p.locator('header a[href="/notifications"]');
  const before = await bell.locator('span').count();
  check('bell shows a badge when unread notifications exist', before === 1);
  await bell.click();
  await p.waitForURL('**/notifications');
  check('bell badge disappears at once on opening notifications', (await bell.locator('span').count()) === 0);
  await p.waitForLoadState('networkidle');
  const unread = psql(`select count(*) from notifications where user_id='${uid}' and read_at is null and type <> 'chat_message'`);
  check('opening notifications marks them read', unread === '0', unread);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('badge stays gone afterwards', (await p.locator('header a[href="/notifications"] span').count()) === 0);

  await p.goto(BASE + '/sessions', { waitUntil: 'networkidle' });
  const bar = p.locator('[role=progressbar] > div').first();
  if (await bar.count()) {
    const cls = await bar.getAttribute('class');
    check('progress bar: rounded fill with gradient', /rounded-full/.test(cls) && /bg-gradient/.test(cls), cls);
  } else check('progress bar: rounded fill with gradient', true, 'no sessions listed (skipped)');
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
