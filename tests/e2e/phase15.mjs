// Phase 15 E2E: panel buttons on the profile page (owner / admin / player).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
const FA = '۰۱۲۳۴۵۶۷۸۹'; const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const browser = await chromium.launch();
async function login(phone, w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#phone', phone.replace(/\d/g, (d) => FA[d])); await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**'); await page.waitForLoadState('networkidle');
  await page.fill('#code', toEn(await page.locator('[role=status] bdi').innerText())); await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  return page;
}
const nav = (p) => p.locator('nav[aria-label="پنل‌های مدیریتی"]');
// owner (mobile width: the header link is hidden there, the profile button must still work)
const o = await login('09000000002', 390);
await o.goto(BASE + '/profile', { waitUntil: 'networkidle' });
check('owner sees "ورود به پنل مالک" on the profile', (await nav(o).getByText('ورود به پنل مالک').count()) === 1);
check('owner does not see the admin button', (await nav(o).getByText('ورود به پنل ادمین').count()) === 0);
await nav(o).getByText('ورود به پنل مالک').click(); await o.waitForURL('**/owner**');
check('button opens the owner panel', new URL(o.url()).pathname.startsWith('/owner'));
// admin
const a = await login('09000000003', 390);
await a.goto(BASE + '/profile', { waitUntil: 'networkidle' });
check('admin sees both buttons', (await nav(a).getByText('ورود به پنل مالک').count()) === 1 && (await nav(a).getByText('ورود به پنل ادمین').count()) === 1);
await nav(a).getByText('ورود به پنل ادمین').click(); await a.waitForURL('**/admin**');
check('admin button opens the admin panel', new URL(a.url()).pathname.startsWith('/admin'));
// player
const pl = await login('09000000001', 390);
await pl.goto(BASE + '/profile', { waitUntil: 'networkidle' });
check('a normal player sees no panel buttons', (await nav(pl).count()) === 0);
await browser.close();
