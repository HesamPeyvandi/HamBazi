// Phase 4 E2E: owner dashboard, user settings (notifications, devices), admin (users, venues, settings, audit). Real browser/server/DB.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots4 node tests/e2e/phase4.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots4';
const DB = process.env.E2E_DB_URL;
fs.mkdirSync(SHOTS, { recursive: true });
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim().split('\n')[0];
psql('TRUNCATE rate_limits, auth_challenges');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
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
async function pageChecks(page, label) {
  const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, page.viewportSize().width);
  check(`${label}: no horizontal scroll`, overflow <= 1, `overflow=${overflow}`);
  const bad = await page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const b = [];
    while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE'].includes(p.tagName) || p.closest('[dir=ltr]')) continue; if (/[0-9]/.test(n.textContent)) b.push(n.textContent.trim().slice(0, 40)); } return b.slice(0, 4); });
  check(`${label}: digits are Persian`, bad.length === 0, bad.join(' | '));
}
const uid = (phone) => psql(`select id from users where phone_e164='+98${phone.slice(1)}'`);

// ---- seed a paid game for the owner's venue (seeded data has venues managed by 09000000002)
const venueId = psql(`select venue_id from venue_managers where user_id='${uid('09000000002')}' limit 1`);
const sportId = psql(`select id from sports where key='futsal'`);
psql(`delete from reservations where host_user_id='${uid('09000000011')}'`);
psql(`delete from reservations where venue_id='${venueId}' and slot_id in (select id from time_slots where venue_id='${venueId}' and starts_at < now())`);
psql(`delete from time_slots where venue_id='${venueId}' and sport_id='${sportId}' and starts_at < now() and starts_at > now() - interval '3 days'`);
const slotId = psql(`insert into time_slots(venue_id,sport_id,starts_at,ends_at,price,status) values('${venueId}','${sportId}', now()-interval '30 hours', now()-interval '28.5 hours', 350000,'booked') returning id`);
const resId = psql(`insert into reservations(host_user_id,venue_id,slot_id,sport_id,mode,payment_arrangement,status,policy_version,policy_snapshot,fee_snapshot,base_amount,fee_amount,total_amount,venue_payable) select '${uid('09000000011')}','${venueId}','${slotId}','${sportId}','full','single','completed',1,'{"tiers":[]}','{"percentBp":500,"minToman":5000,"payer":"player"}',350000,17500,367500,350000 returning id`);

// ---- owner dashboard
const owner = await login('09000000002'); const op = owner.page;
let r = await op.goto(BASE + '/owner', { waitUntil: 'networkidle' });
check('owner dashboard 200', r.status() === 200);
const rev = await op.locator('[data-stat="درآمد سالن"]').innerText();
check('revenue KPI shows venue payable (۳۵۰٬۰۰۰), not fee-inclusive total', /۳۵۰[,٬]۰۰۰/.test(rev) && !/۳۶۷/.test(rev), rev);
check('chart is present with accessible label', await op.locator('[role=img][aria-label*="نمودار درآمد"]').count() === 1);
check('recent reservations lists the game', (await op.locator('text=رضا کریمی').count()) >= 1);
await op.selectOption('#f-days', '7'); await op.click('button:has-text("اعمال")'); await op.waitForURL('**days=7**');
check('7-day filter applied (URL + 7 bars)', (await op.locator('[role=img][aria-label*="۷ روز"] > div').count()) === 7);
await op.goto(BASE + '/owner', { waitUntil: 'networkidle' });
await op.screenshot({ path: `${SHOTS}/owner-dashboard.png`, fullPage: true });
await pageChecks(op, 'owner dashboard');
r = await op.goto(BASE + '/owner?venue=00000000-0000-0000-0000-000000000000&days=9999', { waitUntil: 'networkidle' });
check('bogus venue/days params are ignored safely', r.status() === 200);

// ---- player cannot reach admin or other-owner data
const player = await login('09000000011'); const pp = player.page;
for (const path of ['/admin', '/admin/users', '/admin/settings', '/admin/audit']) {
  const x = await pp.goto(BASE + path, { waitUntil: 'networkidle' }); check(`player gets 404 on ${path}`, x.status() === 404, String(x.status()));
}
const x2 = await owner.page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' }); check('venue manager gets 404 on /admin/users', x2.status() === 404);

// ---- settings: notification prefs + devices
await pp.goto(BASE + '/settings', { waitUntil: 'networkidle' });
check('settings page lists current device', (await pp.locator('text=این دستگاه').count()) === 1);
await pp.uncheck('input[name=sessions]'); await pp.click('button:has-text("ذخیرهٔ اعلان‌ها")');
await pp.waitForSelector('p[role=status]:has-text("ذخیره شد")');
check('prefs persisted in DB (sessions=false)', psql(`select notif_prefs->>'sessions' from user_profiles where user_id='${uid('09000000011')}'`) === 'false');
await pp.reload({ waitUntil: 'networkidle' });
check('unchecked state survives reload', !(await pp.locator('input[name=sessions]').isChecked()));
await pp.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
await pageChecks(pp, 'settings');
// second device then revoke it
const dev2 = await browser.newContext({ storageState: await player.ctx.storageState(), locale: 'fa-IR' });
const before = psql(`select count(*) from user_sessions where user_id='${uid('09000000011')}' and revoked_at is null`);
psql(`insert into user_sessions(user_id,token_hash,expires_at,user_agent) values('${uid('09000000011')}','e2e-${Date.now()}', now()+interval '1 day','Mozilla/5.0 (Linux; Android 14) Chrome/120')`);
await pp.reload({ waitUntil: 'networkidle' });
check('second device appears', (await pp.locator('button:has-text("خروج این دستگاه")').count()) === 1);
await pp.click('button:has-text("خروج این دستگاه")'); await pp.waitForSelector('p[role=status]:has-text("نشست بسته شد")');
check('other device revoked, current still logged in', (await pp.locator('button:has-text("خروج این دستگاه")').count()) === 0 && pp.url().includes('/settings'));
await dev2.close(); void before;
psql(`update user_profiles set notif_prefs='{}' where user_id='${uid('09000000011')}'`);

// ---- admin
const adm = await login('09000000003'); const ap = adm.page;
r = await ap.goto(BASE + '/admin', { waitUntil: 'networkidle' }); check('admin overview 200', r.status() === 200);
await ap.screenshot({ path: `${SHOTS}/admin-home.png`, fullPage: true }); await pageChecks(ap, 'admin overview');

// users: search, suspend -> that user is logged out, reactivate
await ap.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
await ap.fill('#uq', 'مهدی رضایی'); await ap.click('button:has-text("جستجو")'); await ap.waitForURL('**q=**');
const rowsN = await ap.locator('li.card').count(); check('user search narrows to 1 result', rowsN === 1, String(rowsN));
const victim = await login('09000000012'); // second player
await ap.click('li.card button:has-text("تعلیق")'); await ap.waitForSelector('p[role=status]');
check('user is suspended in DB', psql(`select status from users where id='${uid('09000000012')}'`) === 'suspended');
const vr = await victim.page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
check('suspended user is kicked to login on next request', victim.page.url().includes('/login'), victim.page.url());
void vr;
await ap.screenshot({ path: `${SHOTS}/admin-users.png`, fullPage: true }); await pageChecks(ap, 'admin users');
await ap.click('li.card button:has-text("فعال‌سازی")'); await ap.waitForSelector('p[role=status]');
check('user reactivated', psql(`select status from users where id='${uid('09000000012')}'`) === 'active');
const noSelf = await ap.goto(BASE + '/admin/users?q=' + encodeURIComponent('ادمین'), { waitUntil: 'networkidle' });
check('admin row has no suspend button', noSelf.status() === 200 && (await ap.locator('li.card button:has-text("تعلیق")').count()) === 0);

// venues: suspend -> hidden from public; reinstate
const slug = psql(`select slug from venues where id='${venueId}'`);
await ap.goto(BASE + '/admin/venues', { waitUntil: 'networkidle' });
const vli = ap.locator('li.card', { hasText: psql(`select name from venues where id='${venueId}'`) }).last();
await vli.locator('button:has-text("تعلیق سالن")').click(); await ap.waitForSelector('p[role=status]');
check('venue suspended in DB', psql(`select status from venues where id='${venueId}'`) === 'suspended');
const pub = await pp.goto(BASE + '/venues/' + slug, { waitUntil: 'networkidle' }); check('suspended venue page is 404 publicly', pub.status() === 404, String(pub.status()));
await ap.screenshot({ path: `${SHOTS}/admin-venues.png`, fullPage: true });
await ap.locator('li.card', { hasText: psql(`select name from venues where id='${venueId}'`) }).last().locator('button:has-text("بازگردانی")').click(); await ap.waitForSelector('p[role=status]');
check('venue reinstated', psql(`select status from venues where id='${venueId}'`) === 'published');

// settings: invalid then valid; fee & policy versions
await ap.goto(BASE + '/admin/settings', { waitUntil: 'networkidle' });
const holdForm = ap.locator('form', { has: ap.locator('#s-hold_minutes') });
await ap.fill('#s-hold_minutes', '۲'); await holdForm.locator('button').click(); await ap.waitForSelector('p[role=alert]:has-text("باید بین")');
check('out-of-range hold minutes rejected with Persian message', true);
await ap.fill('#s-hold_minutes', '۲۰'); await holdForm.locator('button').click(); await ap.waitForSelector('p[role=status]:has-text("ذخیره شد")');
check('hold_minutes saved = 20', psql(`select value from platform_settings where key='hold_minutes'`) === '20');
await ap.fill('#fp', '۶٫۵'); await ap.fill('#fm', '۷٬۰۰۰'); await ap.click('button:has-text("ثبت کارمزد جدید")'); await ap.waitForSelector('p[role=status]');
check('new fee policy row (650bp, 7000)', psql(`select percent_bp||','||min_toman from fee_policies order by active_from desc limit 1`) === '650,7000');
await ap.fill('#h0', '۴۸'); await ap.fill('#p0', '۱۰۰'); await ap.fill('#h1', '۱۲'); await ap.fill('#p1', '۷۰'); await ap.fill('#h2', '۰'); await ap.fill('#p2', '۲۰');
const vBefore = Number(psql('select max(version) from cancellation_policies'));
await ap.click('button:has-text("ثبت نسخهٔ جدید سیاست")'); await ap.waitForSelector('p[role=status]');
check('new cancellation policy version created', Number(psql('select max(version) from cancellation_policies')) === vBefore + 1);
const cp = await pp.goto(BASE + '/cancellation-policy', { waitUntil: 'networkidle' });
check('public policy page reflects new tiers (۷۰٪)', cp.status() === 200 && (await pp.locator('body').innerText()).includes('۷۰'));
await ap.goto(BASE + '/admin/settings', { waitUntil: 'networkidle' });
await ap.fill('#h0', '۴۸'); await ap.fill('#p0', '۱۰۰'); await ap.fill('#h1', '۲۴'); await ap.fill('#p1', '۹۰'); await ap.fill('#h2', '۵'); await ap.fill('#p2', '۹۵');
await ap.click('button:has-text("ثبت نسخهٔ جدید سیاست")'); await ap.waitForSelector('p[role=alert]');
check('invalid tiers (no 0h, increasing) rejected', Number(psql('select max(version) from cancellation_policies')) === vBefore + 1);
await ap.goto(BASE + '/admin/settings', { waitUntil: 'networkidle' });
await ap.screenshot({ path: `${SHOTS}/admin-settings.png`, fullPage: true }); await pageChecks(ap, 'admin settings');

// audit log shows what we did
await ap.goto(BASE + '/admin/audit?action=user.', { waitUntil: 'networkidle' });
const at = await ap.locator('body').innerText();
check('audit shows user.suspend and user.reactivate', at.includes('user.suspend') && at.includes('user.reactivate'));
await ap.goto(BASE + '/admin/audit', { waitUntil: 'networkidle' });
const at2 = await ap.locator('body').innerText();
check('audit shows settings/fee/policy/venue changes', ['settings.update', 'fee_policy.create', 'cancellation_policy.create', 'venue.suspend', 'venue.reinstate'].every((a) => at2.includes(a)));
await ap.screenshot({ path: `${SHOTS}/admin-audit.png`, fullPage: true }); await pageChecks(ap, 'admin audit');

// cleanup so the demo DB returns to defaults
psql(`update platform_settings set value='15' where key='hold_minutes'`);
psql(`delete from fee_policies where percent_bp=650`);
psql(`delete from cancellation_policies where version > ${vBefore}`);
void resId;

// mobile
const Mctx = await browser.newContext({ storageState: await adm.ctx.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
const mp = await Mctx.newPage();
for (const [path, tag] of [['/admin', 'admin'], ['/admin/users', 'users'], ['/admin/settings', 'settings'], ['/admin/audit', 'audit'], ['/admin/venues', 'venues'], ['/owner', 'owner'], ['/settings', 'usersettings']]) {
  const x = await mp.goto(BASE + path, { waitUntil: 'networkidle' }); check(`mobile ${tag} 200`, x.status() === 200, String(x.status()));
  await pageChecks(mp, `mobile ${tag}`); await mp.screenshot({ path: `${SHOTS}/mobile-${tag}.png`, fullPage: true });
}
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
