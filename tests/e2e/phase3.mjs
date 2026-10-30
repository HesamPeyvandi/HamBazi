// Phase 3 end-to-end: game -> attendance -> peer rating + venue review -> public profile -> report -> admin (real browser/server/DB).
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots3 node tests/e2e/phase3.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots3';
const DB = process.env.E2E_DB_URL;
fs.mkdirSync(SHOTS, { recursive: true });
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
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
    while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName) || p.closest('[role=img][aria-label^="OVR"]')) continue; if (/[0-9]/.test(n.textContent)) b.push(n.textContent.trim().slice(0, 40)); } return b.slice(0, 4); });
  check(`${label}: digits are Persian`, bad.length === 0, bad.join(' | '));
}
const uid = (phone) => psql(`select id from users where phone_e164='+98${phone.slice(1)}'`);

// ---------- a confirmed open session with 3 players at the seeded venue (owned by the demo manager)
const H = await login('09000000001'); const J = await login('09000000011'); const N = await login('09000000012');
const slotId = psql(`select t.id from time_slots t join venues v on v.id=t.venue_id where v.slug='aftab' and t.status='open' and t.starts_at > now() + interval '3 days' order by t.starts_at limit 1`);
await H.page.goto(`${BASE}/book/${slotId}?mode=split`, { waitUntil: 'networkidle' });
await H.page.selectOption('#target', '3');
await H.page.click('button:has-text("ایجاد سانس و پرداخت سهم من")'); await H.page.waitForURL(/\/pay\//);
await H.page.click('button:has-text("پرداخت (شبیه‌سازی)")'); await H.page.waitForURL(/\/sessions\/[0-9a-f-]{36}\?ok=paid/);
const sessionUrl = H.page.url().split('?')[0];
for (const P of [J, N]) {
  await P.page.goto(sessionUrl, { waitUntil: 'networkidle' }); await P.page.click('button:has-text("پیوستن و پرداخت سهم")');
  await P.page.waitForURL(/\/pay\//); await P.page.click('button:has-text("پرداخت (شبیه‌سازی)")'); await P.page.waitForURL(/\?ok=paid/);
}
const resId = psql(`select reservation_id from open_sessions where id='${sessionUrl.split('/').pop()}'`);
check('session confirmed with 3 players', psql(`select status from open_sessions where reservation_id='${resId}'`) === 'confirmed');

// ---------- attendance is refused before the game starts, then the game "happens"
const owner = await login('09000000002'); const op = owner.page;
await op.goto(BASE + '/owner/attendance', { waitUntil: 'networkidle' });
check('future game is not in the attendance list', (await op.locator('text=سانس باز').count()) === 0);
const ago = 4 + (Date.now() % 30) * 2;
psql(`update time_slots set starts_at = now() - interval '${ago} hours', ends_at = now() - interval '${ago - 1.5} hours' where id='${slotId}'`);
await op.goto(BASE + '/owner/attendance', { waitUntil: 'networkidle' });
const card = op.locator('li.card', { hasText: 'سانس باز' }).first();
check('started game appears in attendance list with 3 players', (await card.locator('ul li').count()) === 3);
await op.screenshot({ path: `${SHOTS}/owner-attendance.png`, fullPage: true });
const nameOf = (phone) => psql(`select display_name from users where phone_e164='+98${phone.slice(1)}'`);
const [hName, jName, nName] = ['09000000001', '09000000011', '09000000012'].map(nameOf);
const mark = async (name, label, pill) => {
  await op.locator('li.card', { hasText: 'سانس باز' }).first().locator('ul li', { hasText: name }).locator(`button:has-text("${label}")`).click();
  await op.locator('li.card', { hasText: 'سانس باز' }).first().locator('ul li', { hasText: name }).locator(`.pill:has-text("${pill}")`).waitFor();
};
await mark(hName, 'حاضر', 'حاضر'); await mark(jName, 'حاضر', 'حاضر'); await mark(nName, 'غایب', 'غایب');
check('attendance stored (2 attended, 1 no-show)', psql(`select string_agg(status::text, ',' order by status::text) from session_participants where session_id='${sessionUrl.split('/').pop()}'`) === 'attended,attended,no_show');
check('no-show lowers reliability to 85', psql(`select 100 + coalesce(sum(delta),0) from reliability_events where user_id='${uid('09000000012')}'`) === '85');

// ---------- no-show cannot rate; attended can; peers & venue
const rn = await N.page.goto(`${BASE}/rate/${resId}`); check('no-show player cannot open rating page (404)', rn.status() === 404, String(rn.status()));
await N.page.goto(BASE + '/profile/commitment', { waitUntil: 'networkidle' });
check('commitment page shows score 85 and the no-show', (await N.page.locator('text=۸۵').count()) >= 1 && (await N.page.locator('text=غیبت').count()) >= 1);
const sportId = psql(`select sport_id from time_slots where id='${slotId}'`);
const ovrBefore = psql(`select ovr from player_sport_profiles where user_id='${uid('09000000001')}' and sport_id='${sportId}'`);
await J.page.goto(`${BASE}/rate/${resId}`, { waitUntil: 'networkidle' });
check('rating page lists only attended co-player (not the no-show)', (await J.page.locator('fieldset:has(input[type=range])').count()) === 1 && (await J.page.locator(`text=${nName}`).count()) === 0);
await J.page.locator('input[type=checkbox]').first().check();
const sliders = J.page.locator('input[type=range]');
for (let i = 0; i < await sliders.count(); i++) await sliders.nth(i).fill('10');
await J.page.fill('textarea[name^=comment_]', 'پاس‌های فوق‌العاده و روحیهٔ عالی');
await J.page.screenshot({ path: `${SHOTS}/rate.png`, fullPage: true });
await J.page.click('button:has-text("ثبت امتیازها")'); await J.page.waitForURL('**ok=peers');
const ovrAfter = psql(`select ovr from player_sport_profiles where user_id='${uid('09000000001')}' and sport_id='${sportId}'`);
check('peer rating raised the host OVR', Number(ovrAfter) > Number(ovrBefore), `${ovrBefore} -> ${ovrAfter}`);
check('double rating is refused (form hidden/done)', (await J.page.locator('text=به همهٔ هم‌بازی‌ها امتیاز داده‌اید').count()) === 1);
const rcBefore = psql(`select rating_count from venues where slug='aftab'`);
await J.page.locator('label:has-text("۵ ★")').click(); await J.page.fill('#comment', 'سالن تمیز و منظم بود');
await J.page.click('button:has-text("ثبت نظر")'); await J.page.waitForURL('**ok=venue');
check('venue review stored and rating_count incremented', Number(psql(`select rating_count from venues where slug='aftab'`)) === Number(rcBefore) + 1);
await J.page.goto(`${BASE}/rate/${resId}`, { waitUntil: 'networkidle' });
check('second venue review not offered', (await J.page.locator('text=برای این بازی نظر داده‌اید').count()) === 1);
await H.page.goto(`${BASE}/rate/${resId}`, { waitUntil: 'networkidle' });
check('host also sees the rating page', (await H.page.locator('h1:has-text("بازی چطور بود؟")').count()) === 1);
await H.page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
check('dashboard prompts the host to rate', (await H.page.locator('text=منتظر امتیاز شما').count()) === 1);

// ---------- owner sees the review; public profile shows peer comment
await op.goto(BASE + '/owner/reviews', { waitUntil: 'networkidle' });
check('owner sees the new venue review', (await op.locator('text=سالن تمیز و منظم بود').count()) === 1);
const hostId = uid('09000000001');
await J.page.goto(`${BASE}/players/${hostId}`, { waitUntil: 'networkidle' });
check('public profile shows peer comment, OVR and reliability', (await J.page.locator('text=پاس‌های فوق‌العاده').count()) === 1 && (await J.page.locator('text=امتیاز تعهد').count()) === 1);
check('public profile does not leak the phone number', !(await J.page.content()).match(/0900000000|\+98900/));
await J.page.screenshot({ path: `${SHOTS}/player-profile.png`, fullPage: true });

// ---------- report flow + admin
await J.page.click('a:has-text("گزارش")'); await J.page.waitForURL(/\/report\?type=user/);
await J.page.selectOption('#reason', 'abuse'); await J.page.fill('#details', 'نمونهٔ گزارش آزمایشی');
await J.page.click('button:has-text("ثبت گزارش")'); await J.page.waitForURL('**done=1');
check('report stored', psql(`select count(*) from reports where status='open'`) === '1');
await J.page.goto(`${BASE}/report?type=user&id=${hostId}`); await J.page.fill('#details', 'تکراری'); await J.page.click('button:has-text("ثبت گزارش")');
await J.page.waitForSelector('p[role=alert]'); check('duplicate report refused with a Persian message', (await J.page.locator('p[role=alert]').innerText()).includes('بررسی'));
const admin = await login('09000000003');
await admin.page.goto(BASE + '/admin/reports', { waitUntil: 'networkidle' });
await admin.page.screenshot({ path: `${SHOTS}/admin-reports.png`, fullPage: true });
await admin.page.click('button:has-text("رد گزارش")'); await admin.page.waitForURL('**ok=1');
check('admin dismissed the report; reporter notified', psql(`select status from reports limit 1`) === 'dismissed' && psql(`select count(*) from notifications where type='report_update'`) === '1');
const pr = await J.page.goto(`${BASE}/admin/reports`); check('players cannot open admin reports (404)', pr.status() === 404, String(pr.status()));

// ---------- privacy
psql(`insert into user_profiles(user_id, privacy) values ('${hostId}', '{"showProfile":false,"showHistory":false}') on conflict (user_id) do update set privacy = excluded.privacy`);
await J.page.goto(`${BASE}/players/${hostId}`, { waitUntil: 'networkidle' });
check('private profile hides details from others', (await J.page.locator('text=پروفایل خود را خصوصی کرده').count()) === 1 && (await J.page.locator('text=مهارت‌های').count()) === 0);
await H.page.goto(`${BASE}/players/${hostId}`, { waitUntil: 'networkidle' });
check('owner still sees own private profile', (await H.page.locator('text=مهارت‌های').count()) >= 1);
psql(`update user_profiles set privacy = '{"showProfile":true,"showHistory":true}' where user_id='${hostId}'`);

// ---------- mobile layout of new pages
const Mctx = await browser.newContext({ storageState: await J.ctx.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
const mp = await Mctx.newPage();
for (const [path, tag] of [[`/players/${hostId}`, 'player'], [`/rate/${resId}`, 'rate'], ['/profile/commitment', 'commitment'], ['/profile', 'profile'], [`/report?type=venue&id=${psql(`select id from venues where slug='aftab'`)}`, 'report']]) {
  const r = await mp.goto(BASE + path, { waitUntil: 'networkidle' }); check(`mobile ${tag} status 200`, r.status() === 200, String(r.status()));
  await pageChecks(mp, `mobile ${tag}`); await mp.screenshot({ path: `${SHOTS}/mobile-${tag}.png`, fullPage: true });
}
const Octx = await browser.newContext({ storageState: await owner.ctx.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
const mo = await Octx.newPage();
for (const [path, tag] of [['/owner/attendance', 'attendance'], ['/owner/reviews', 'reviews'], ['/owner', 'owner']]) {
  const r = await mo.goto(BASE + path, { waitUntil: 'networkidle' }); check(`mobile ${tag} status 200`, r.status() === 200, String(r.status()));
  await pageChecks(mo, `mobile ${tag}`); await mo.screenshot({ path: `${SHOTS}/mobile-${tag}.png`, fullPage: true });
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
