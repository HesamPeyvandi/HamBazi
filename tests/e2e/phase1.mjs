// Phase 1 end-to-end check (real browser, real server, real DB). Usage: BASE=http://localhost:3000 SHOTS=./shots node tests/e2e/phase1.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots';
fs.mkdirSync(SHOTS, { recursive: true });
import { execSync } from 'node:child_process';
// reset OTP rate limits so repeated local runs are not throttled (dev/demo database only)
if (process.env.E2E_DB_URL) execSync(`psql "${process.env.E2E_DB_URL}" -c "TRUNCATE rate_limits, auth_challenges"`, { stdio: 'ignore' });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const browser = await chromium.launch();
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));

async function pageChecks(page, label) {
  const dir = await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang]);
  check(`${label}: html is rtl/fa`, dir[0] === 'rtl' && dir[1] === 'fa');
  const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, page.viewportSize().width);
  check(`${label}: no horizontal scroll`, overflow <= 1, `overflow=${overflow}`);
  const ascii = await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const bad = [];
    while (w.nextNode()) { const n = w.currentNode; const p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName) || p.closest('[role=img][aria-label^="OVR"]')) continue; // the OVR badge is Latin by design
      const m = n.textContent.match(/[0-9]+/g); if (m) bad.push(n.textContent.trim().slice(0, 40)); }
    return bad.slice(0, 5);
  });
  check(`${label}: all visible digits are Persian`, ascii.length === 0, ascii.join(' | '));
}

for (const [name, vp, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await ctx.newPage();
  for (const [path, tag] of [['/', 'home'], ['/venues', 'venues'], ['/venues?view=grid&sport=volleyball&fac=parking', 'venues-grid'], ['/venues/aftab', 'venue'], ['/login', 'login'], ['/register', 'register'], ['/nonexistent', '404']]) {
    const r = await page.goto(BASE + path, { waitUntil: 'networkidle' });
    check(`${name} ${path} status`, tag === '404' ? r.status() === 404 : r.status() === 200, String(r.status()));
    await pageChecks(page, `${name} ${tag}`);
    await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png`, fullPage: true });
  }
  await ctx.close();
}

// ---- unauthorized access
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/profile');
  check('anonymous /profile redirects to login with next', page.url().includes('/login?next=%2Fprofile'), page.url());
  await page.goto(BASE + '/login?next=//evil.com');
  await page.fill('#phone', '۰۹۰۰۰۰۰۰۰۰۱');
  await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**');
  await page.waitForLoadState('networkidle');
  const code = toEn(await page.locator('[role=status] bdi').innerText());
  check('mock OTP shown on verify page (dev/demo)', /^\d{6}$/.test(code), 'code length ok');
  await page.screenshot({ path: `${SHOTS}/desktop-verify.png` });
  // wrong code first
  await page.fill('#code', code === '000000' ? '111111' : '000000');
  await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForSelector('p[role=alert]');
  check('wrong code shows Persian error', (await page.locator('p[role=alert]').first().innerText()).includes('نادرست'));
  await page.fill('#code', code.replace(/\d/g, (d) => FA[d]));  // Persian digits accepted
  await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => u.pathname === '/' || u.pathname === '/profile', { timeout: 8000 });
  check('open-redirect payload ignored after login', new URL(page.url()).origin === new URL(BASE).origin, page.url());
  const cookies = await ctx.cookies();
  const sess = cookies.find((c) => c.name === 'hb_session');
  check('session cookie is HttpOnly + SameSite=Lax', !!sess && sess.httpOnly && sess.sameSite === 'Lax');
  await page.goto(BASE + '/profile');
  check('logged-in user sees profile', (await page.locator('h1').first().innerText()).includes('علی'));
  await pageChecks(page, 'desktop profile');
  await page.screenshot({ path: `${SHOTS}/desktop-profile.png`, fullPage: true });
  await page.goto(BASE + '/profile/edit');
  await page.screenshot({ path: `${SHOTS}/desktop-profile-edit.png`, fullPage: true });
  await page.goto(BASE + '/profile');
  await page.click('button:has-text("خروج از حساب")');
  await page.waitForURL(BASE + '/');
  await page.goto(BASE + '/profile');
  check('logout invalidates the session', page.url().includes('/login'));
  await ctx.close();
}

// ---- new registration + onboarding (mobile)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/register', { waitUntil: 'networkidle' });
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert]');
  check('register validates required fields', (await page.locator('[role=alert]').count()) >= 2);
  const phone = '09' + String(Math.floor(1e8 + Math.random() * 8e8)).padStart(9, '0').slice(0, 9);
  await page.fill('#name', 'کاربر آزمایشی');
  await page.fill('#phone', phone);
  await page.check('input[name=terms]');
  await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**');
  const code = toEn(await page.locator('[role=status] bdi').innerText());
  await page.fill('#code', code);
  await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL('**/onboarding**');
  await page.waitForLoadState('networkidle');
  check('new user lands on onboarding', true);
  await page.check('input[name=sport][value=futsal]');
  await page.waitForSelector('input[name="skill_futsal_shooting"]');
  await page.screenshot({ path: `${SHOTS}/mobile-onboarding.png`, fullPage: true });
  await page.click('button[type=submit]');
  await page.waitForURL('**/profile');
  check('onboarding saved and profile shows skills', (await page.locator('text=مهارت‌های فوتسال').count()) === 1);
  await pageChecks(page, 'mobile profile');
  await page.screenshot({ path: `${SHOTS}/mobile-profile.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
