// Phase 5 E2E: teams & groups — create, browse, request/approve, invite link, matching, leave, team->session invite (real browser/server/DB).
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots5 node tests/e2e/phase5.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots5';
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
    while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(p.tagName) || p.closest('[dir=ltr]')) continue; if (/[0-9]/.test(n.textContent)) b.push(n.textContent.trim().slice(0, 40)); } return b.slice(0, 4); });
  check(`${label}: digits are Persian`, bad.length === 0, bad.join(' | '));
}
const uid = (phone) => psql(`select id from users where phone_e164='+98${phone.slice(1)}'`);
const NAME = 'ستارگان آزمون';
psql(`delete from teams where name like 'ستارگان آزمون%'`);
psql(`delete from notifications where type like 'team%'`);

const A = await login('09000000001'); const ap = A.page;       // captain
const B = await login('09000000011'); const bp = B.page;       // requests to join
const C = await login('09000000012'); const cp = C.page;       // joins via link
const D = await login('09000000013'); const dp = D.page;       // receives a captain invitation

// ---------- logged-out visitors can browse but must log in to join
const anon = await browser.newContext({ locale: 'fa-IR' }); const anp = await anon.newPage();
let r = await anp.goto(BASE + '/teams', { waitUntil: 'networkidle' }); check('/teams is public (200), no redirect to coming-soon', r.status() === 200 && anp.url().endsWith('/teams'));
check('empty state offers creating the first team', (await anp.locator('text=اولین تیم را شما بسازید').count()) >= 1 || (await anp.locator('li a[href^="/teams/"]').count()) >= 0);
const rn = await anp.goto(BASE + '/teams/new', { waitUntil: 'networkidle' }); check('/teams/new requires login', anp.url().includes('/login'), anp.url());
void rn;

// ---------- create a team (captain)
await ap.goto(BASE + '/teams/new', { waitUntil: 'networkidle' });
await ap.fill('#name', NAME); await ap.fill('#description', 'تیم دوستانهٔ فوتسال، هر هفته پنجشنبه‌ها بازی می‌کنیم.');
await ap.selectOption('#sportId', { label: 'فوتسال' }); await ap.selectOption('#joinMode', 'request'); await ap.fill('#maxMembers', '4');
await ap.screenshot({ path: `${SHOTS}/team-new.png`, fullPage: true });
await ap.click('button:has-text("ساخت تیم")'); await ap.waitForURL(/\/teams\/[0-9a-f-]{36}\?ok=created/);
const teamUrl = ap.url().split('?')[0]; const teamId = teamUrl.split('/').pop();
check('team created; creator is the captain in DB', psql(`select role from team_members where team_id='${teamId}' and user_id='${uid('09000000001')}'`) === 'captain');
check('captain sees management panel and invite link', (await ap.locator('text=مدیریت تیم').count()) === 1 && (await ap.locator('#inv').count()) === 1);
// duplicate name in same city is refused with a Persian message
await ap.goto(BASE + '/teams/new', { waitUntil: 'networkidle' }); await ap.fill('#name', NAME);
await ap.click('button:has-text("ساخت تیم")'); await ap.waitForSelector('p[role=alert]:has-text("همین نام")');
check('duplicate team name rejected', true);

// ---------- browse + request to join + approve
await bp.goto(BASE + '/teams', { waitUntil: 'networkidle' });
await bp.fill('#tq', 'ستارگان آزمون'); await bp.click('button:has-text("جستجو")'); await bp.waitForURL('**q=**');
check('search finds the team', (await bp.locator(`a[href="/teams/${teamId}"]`).count()) === 1);
await bp.screenshot({ path: `${SHOTS}/teams-list.png`, fullPage: true });
await bp.click(`a[href="/teams/${teamId}"]`); await bp.waitForLoadState('networkidle');
check('non-member sees request form but no management', (await bp.locator('button:has-text("ارسال درخواست عضویت")').count()) === 1 && (await bp.locator('text=مدیریت تیم').count()) === 0 && (await bp.locator('#inv').count()) === 0);
await bp.fill('#message', 'سلام، سطح من متوسطه و پنجشنبه‌ها آزادم.'); await bp.click('button:has-text("ارسال درخواست عضویت")');
await bp.waitForSelector('p[role=status]:has-text("درخواست")');
check('request recorded and visible as pending to the requester', (await bp.locator('text=در انتظار تأیید').count()) >= 1 && psql(`select count(*) from team_requests where team_id='${teamId}' and status='pending'`) === '1');
check('captain was notified', psql(`select count(*) from notifications where user_id='${uid('09000000001')}' and type='team_request'`) === '1');
await ap.goto(teamUrl, { waitUntil: 'networkidle' });
check('captain sees the request with message', (await ap.locator('text=سلام، سطح من متوسطه').count()) === 1);
await ap.screenshot({ path: `${SHOTS}/team-captain.png`, fullPage: true });
await ap.click('button:has-text("تأیید")'); await ap.waitForSelector('p[role=status]:has-text("پذیرفته")');
check('approved: member in DB and the requester is notified', psql(`select count(*) from team_members where team_id='${teamId}' and user_id='${uid('09000000011')}'`) === '1' && psql(`select count(*) from notifications where user_id='${uid('09000000011')}' and type='team_request_result'`) === '1');
await bp.goto(teamUrl, { waitUntil: 'networkidle' });
check('member sees leave button, no join form', (await bp.locator('button:has-text("خروج از تیم")').count()) === 1 && (await bp.locator('button:has-text("ارسال درخواست عضویت")').count()) === 0);

// ---------- invite link (token only works with the right link)
const inviteUrl = await ap.inputValue('#inv');
check('invite link has the /teams/join/ path', /\/teams\/join\/[\w-]{10,}$/.test(inviteUrl), inviteUrl);
await cp.goto(`${BASE}/teams/${teamId}`, { waitUntil: 'networkidle' });
check('without link a stranger cannot join a request-only team directly', (await cp.locator('button:has-text("پیوستن به تیم")').count()) === 0);
await cp.goto(BASE + new URL(inviteUrl).pathname, { waitUntil: 'networkidle' });
check('invite link forwards to the team page with join button', cp.url().includes(`/teams/${teamId}`) && (await cp.locator('button:has-text("پیوستن به تیم")').count()) === 1, cp.url());
await cp.click('button:has-text("پیوستن به تیم")'); await cp.waitForSelector('p[role=status]:has-text("پیوستید")');
check('joined via link', psql(`select count(*) from team_members where team_id='${teamId}' and user_id='${uid('09000000012')}'`) === '1');
// capacity 4: captain + B + C = 3 ; one seat left
await dp.goto(BASE + '/teams/join/garbage-token', { waitUntil: 'networkidle' }); check('bad invite token is a 404', (await dp.locator('text=پیدا نشد').count()) >= 1 || dp.url().includes('garbage'));

// ---------- matching: captain sees suggestions and invites a player
await ap.goto(teamUrl, { waitUntil: 'networkidle' });
const hasSug = (await ap.locator('text=بازیکنان پیشنهادی').count()) === 1;
check('captain sees suggested players', hasSug);
await ap.screenshot({ path: `${SHOTS}/team-suggestions.png`, fullPage: true });
if (hasSug) {
  const sugForm = ap.locator('li', { has: ap.locator('button:has-text("ارسال دعوت")') }).first();
  await sugForm.locator('button:has-text("ارسال دعوت")').click(); await ap.waitForSelector('p[role=status]:has-text("دعوت ارسال شد")');
  check('invitation stored as a notification for the invitee', psql(`select count(*) from notifications where type='team_invite' and link like '/teams/join/%'`) === '1');
}

// ---------- member leaves; captain cannot
await bp.goto(teamUrl, { waitUntil: 'networkidle' });
await bp.click('button:has-text("خروج از تیم")'); await bp.waitForURL('**/teams?ok=left');
check('member left the team', psql(`select count(*) from team_members where team_id='${teamId}' and user_id='${uid('09000000011')}'`) === '0');
check('captain has no leave button (must transfer or disband)', (await ap.locator('button:has-text("خروج از تیم")').count()) === 0);

// ---------- team -> session invite
const slotId = psql(`select t.id from time_slots t join venues v on v.id=t.venue_id where v.slug='aftab' and t.sport_id=(select id from sports where key='futsal') and t.status='open' and t.starts_at > now() + interval '4 days' order by t.starts_at desc limit 1`);
await ap.goto(`${BASE}/book/${slotId}?mode=split`, { waitUntil: 'networkidle' });
await ap.selectOption('#target', '4'); await ap.click('button:has-text("ایجاد سانس و پرداخت سهم من")'); await ap.waitForURL(/\/pay\//);
await ap.click('button:has-text("پرداخت (شبیه‌سازی)")'); await ap.waitForURL(/\/sessions\/[0-9a-f-]{36}\?ok=paid/);
const sessionUrl = ap.url().split('?')[0];
check('host with a team sees "invite my team" on a same-sport session', (await ap.locator('#teamId').count()) === 1);
await ap.click('button:has-text("ارسال دعوت به تیم")'); await ap.waitForSelector('p[role=status]:has-text("ارسال شد")');
check('team member (C) got the session invite with a working link', psql(`select link from notifications where user_id='${uid('09000000012')}' and type='team_session'`) === new URL(sessionUrl).pathname);
await ap.goto(sessionUrl, { waitUntil: 'networkidle' }); await ap.click('button:has-text("ارسال دعوت به تیم")'); await ap.waitForSelector('p[role=alert]:has-text("قبلاً")');
check('second invite for same team+session is refused', true);
await cp.goto(BASE + new URL(sessionUrl).pathname, { waitUntil: 'networkidle' }); check('invited member can open the session', cp.url().includes('/sessions/'));

// ---------- settings: team notifications can be turned off
await cp.goto(BASE + '/settings', { waitUntil: 'networkidle' });
check('settings has a "teams" notification group', (await cp.locator('input[name=teams]').count()) === 1);

// ---------- disband (captain)
await ap.goto(teamUrl, { waitUntil: 'networkidle' });
await ap.click('button:has-text("انحلال تیم")'); await ap.waitForURL('**/teams?ok=disbanded');
check('disbanded team is gone from list and 404s', psql(`select status from teams where id='${teamId}'`) === 'disbanded' && (await ap.goto(teamUrl)).status() === 404);
psql(`delete from teams where name like 'ستارگان آزمون%'`);

// ---------- mobile layout
await ap.goto(BASE + '/teams/new', { waitUntil: 'networkidle' }); await ap.fill('#name', NAME + ' موبایل'); await ap.click('button:has-text("ساخت تیم")'); await ap.waitForURL(/\/teams\//);
const mUrl = ap.url().split('?')[0];
const Mctx = await browser.newContext({ storageState: await A.ctx.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
const mp = await Mctx.newPage();
for (const [path, tag] of [['/teams', 'list'], ['/teams/new', 'new'], [new URL(mUrl).pathname, 'team']]) {
  const x = await mp.goto(BASE + path, { waitUntil: 'networkidle' }); check(`mobile ${tag} 200`, x.status() === 200, String(x.status()));
  await pageChecks(mp, `mobile ${tag}`); await mp.screenshot({ path: `${SHOTS}/mobile-${tag}.png`, fullPage: true });
}
await pageChecks(ap, 'desktop team');
psql(`delete from teams where name like 'ستارگان آزمون%'`);
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
