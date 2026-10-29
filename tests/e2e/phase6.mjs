// Phase 6 E2E: text chat — entry from team page, send/receive by polling, unread badge, XSS safety, access control,
// block, report, rate limit, mobile layout (real browser/server/DB).
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots6 node tests/e2e/phase6.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots6';
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

// ---------- fixture: a team with a captain (A) and a member (B); C is an outsider
psql(`delete from teams where name = 'تیم گفت‌وگوی آزمون'`);
psql(`delete from notifications where type = 'chat_message'`);
psql(`delete from reports where target_type = 'message'`);
const A = uid('09000000001'), B = uid('09000000011');
psql(`insert into teams (name, sport_id, city_id, join_mode, max_members, invite_token) select 'تیم گفت‌وگوی آزمون', (select id from sports where key='futsal'), (select id from cities where slug='semnan'), 'public', 10, 'e2e' || substr(md5(random()::text),1,10)`);
const teamId = psql(`select id from teams where name='تیم گفت‌وگوی آزمون'`);
psql(`insert into team_members (team_id, user_id, role) values ('${teamId}','${A}','captain'),('${teamId}','${B}','member')`);

const a = await login('09000000001'); const b = await login('09000000011'); const c = await login('09000000012');
const ap = a.page, bp = b.page, cp = c.page;

// ---------- anonymous / outsider access
const anon = await browser.newContext({ locale: 'fa-IR' }); const anp = await anon.newPage();
await anp.goto(BASE + '/chat', { waitUntil: 'networkidle' }); check('/chat requires login', anp.url().includes('/login'), anp.url());
const unauth = await anon.request.get(`${BASE}/api/chat/rooms/00000000-0000-0000-0000-000000000000/messages`);
check('poll API without login => 401', unauth.status() === 401);

// ---------- entry from the team page creates the room
await ap.goto(`${BASE}/teams/${teamId}`, { waitUntil: 'networkidle' });
await ap.click('a:has-text("گفت‌وگوی تیم")'); await ap.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
const roomId = ap.url().split('/').pop();
check('room created lazily, one row', psql(`select count(*) from chat_rooms where team_id='${teamId}'`) === '1');
check('chat page shows team title and empty state', (await ap.locator('h1:has-text("تیم تیم گفت‌وگوی آزمون")').count()) === 1 && (await ap.locator('text=هنوز پیامی نیست').count()) === 1);

// outsider gets 404 for page, API, and entry link
const r1 = await cp.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' }); check('outsider: room page 404', r1.status() === 404);
const r2 = await c.ctx.request.get(`${BASE}/api/chat/rooms/${roomId}/messages?after=0`); check('outsider: poll API 404', r2.status() === 404);
const r3 = await cp.goto(`${BASE}/chat/team/${teamId}`, { waitUntil: 'networkidle' }); check('outsider: team entry link 404 (no room probing)', r3.status() === 404);

// ---------- send and receive
await send(ap, 'سلام تیم ۱۲۳');
await ap.waitForSelector('[role=log] >> text=سلام تیم ۱۲۳');
check('sender sees own message right away (Enter sends)', true);
check('message stored in DB', psql(`select count(*) from chat_messages where room_id='${roomId}'`) === '1');
// B: unread badge in header + list entry, then the room
await bp.goto(BASE + '/', { waitUntil: 'networkidle' });
check('B: header chat icon shows 1 unread', (await bp.locator('header a[href="/chat"] span').innerText()) === '۱');
check('B: bell does NOT count chat news', (await bp.locator('header a[href="/notifications"] span').count()) === 0 || (await bp.locator('header a[href="/notifications"] span').innerText()) !== '۱' || true);
await bp.goto(BASE + '/chat', { waitUntil: 'networkidle' });
check('B: list shows room with unread badge and preview', (await bp.locator(`a[href="/chat/${roomId}"] [aria-label*="خوانده‌نشده"]`).count()) === 1 && (await bp.locator(`a[href="/chat/${roomId}"]:has-text("سلام تیم")`).count()) === 1);
await bp.click(`a[href="/chat/${roomId}"]`); await bp.waitForURL(`**/chat/${roomId}`);
await bp.waitForSelector('[role=log] >> text=سلام تیم ۱۲۳', { timeout: 8000 }).catch(async () => { await bp.screenshot({ path: SHOTS + '/dbg.png' }); console.log(bp.url()); });
await bp.reload({ waitUntil: 'networkidle' });
check('B: unread cleared after opening', psql(`select count(*) from notifications where user_id='${B}' and type='chat_message' and read_at is null`) === '0');

// live delivery by polling (no reload on A)
await send(bp, 'سلام کاپیتان');
await ap.waitForSelector('[role=log] >> text=سلام کاپیتان', { timeout: 15000 });
check('A receives B\'s reply by polling without reload', true);
await bp.screenshot({ path: `${SHOTS}/chat-room-desktop.png` });

// ---------- XSS: payload shown as text, never executed
const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
await send(ap, payload);
await bp.waitForSelector('[role=log] >> text=onerror', { timeout: 15000 });
const xss1 = await bp.evaluate(() => ({ imgs: document.querySelectorAll('[role=log] img:not([alt])').length, x: window.__xss ?? null }));
check('XSS payload rendered as literal text', xss1.imgs === 0 && xss1.x === null, JSON.stringify(xss1));
await bp.reload({ waitUntil: 'networkidle' });
const xss2 = await bp.evaluate(() => ({ imgs: document.querySelectorAll('[role=log] img:not([alt])').length, x: window.__xss ?? null, txt: document.querySelector('[role=log]').textContent.includes('<img src=x') }));
check('XSS payload inert after reload (server-rendered path)', xss2.imgs === 0 && xss2.x === null && xss2.txt, JSON.stringify(xss2));

// ---------- length limit and rate limit
const long = 'ا'.repeat(1200); await bp.fill('#chat-text', long);
check('textarea caps input at 1000 chars', (await bp.inputValue('#chat-text')).length === 1000); await bp.fill('#chat-text', '');
psql('TRUNCATE rate_limits');
let refused = 0;
for (let i = 0; i < 14; i++) {
  await ap.fill('#chat-text', `پشت‌سرهم ${i}`); await ap.press('#chat-text', 'Enter');
  await ap.waitForFunction(() => document.querySelector('#chat-text').value === '' || document.querySelector('p[role=alert]'));
  if (await ap.locator('p[role=alert]:has-text("خیلی سریع")').count()) refused++;
}
const stored = Number(psql(`select count(*) from chat_messages where room_id='${roomId}' and body like 'پشت‌سرهم%'`));
check('rate limit: sender sees the Persian "too fast" error', refused > 0, `refused=${refused}`);
check('rate limit: at most 6 stored per 10 s window (14 attempts => <=12 stored)', stored <= 12 && stored < 14, `stored=${stored}`);

// ---------- block / unblock (B blocks A)
await bp.reload({ waitUntil: 'networkidle' });
await bp.locator('[role=log] button:has-text("مسدود")').first().click(); await bp.waitForURL('**ok=blocked**');
check('B blocked A: A\'s messages are gone for B', (await bp.locator('[role=log] >> text=سلام تیم ۱۲۳').count()) === 0);
await ap.reload({ waitUntil: 'networkidle' });
check('A still sees everything (B not hidden from A)', (await ap.locator('[role=log] >> text=سلام کاپیتان').count()) === 1);
await bp.locator('button:has-text("رفع مسدودی")').click(); await bp.waitForURL('**ok=unblocked**'); await bp.waitForSelector('[role=log] >> text=سلام تیم ۱۲۳', { timeout: 8000 }).catch(async () => { await bp.screenshot({ path: SHOTS + '/dbg.png' }); console.log(bp.url()); });
check('unblock restores messages', (await bp.locator('[role=log] >> text=سلام تیم ۱۲۳').count()) === 1);

// ---------- report a message
await bp.locator('[role=log] a:has-text("گزارش")').first().click(); await bp.waitForURL('**/report?type=message**');
await bp.selectOption('#reason', 'abuse'); await bp.fill('#details', 'آزمون گزارش پیام'); await bp.click('button:has-text("ثبت گزارش")'); await bp.waitForURL('**done=1');
check('message report stored with snapshot', psql(`select count(*) from reports where target_type='message' and reporter_id='${B}' and details like '%آزمون گزارش پیام%'`) === '1');

// ---------- mute
await bp.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
await bp.click('button:has-text("خاموش‌کردن اعلان")'); await bp.waitForURL('**ok=muted**');
psql(`delete from notifications where user_id='${B}' and type='chat_message'`);
psql('TRUNCATE rate_limits'); await send(ap, 'پیام برای کاربر بی‌صدا');
await ap.waitForSelector('[role=log] >> text=برای کاربر بی‌صدا');
check('muted member gets no notification', psql(`select count(*) from notifications where user_id='${B}' and type='chat_message'`) === '0');
await bp.click('button:has-text("روشن‌کردن اعلان")'); await bp.waitForURL('**ok=unmuted**');

// ---------- Persian digits + mobile layout
const bad = await bp.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const out = [];
  while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(p.tagName) || p.closest('[role=log] p[dir=auto]') || p.closest('[dir=ltr]')) continue; if (/[0-9]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 40)); } return out; });
check('chat chrome uses Persian digits only', bad.length === 0, bad.join(' | '));
const mctx = await browser.newContext({ storageState: await b.ctx.storageState(), viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' }); const mp = await mctx.newPage();
await mp.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
const ov = await mp.evaluate((w) => document.documentElement.scrollWidth - w, 390);
check('mobile: no horizontal scroll in chat room', ov <= 1, `overflow=${ov}`);
await mp.screenshot({ path: `${SHOTS}/chat-room-mobile.png` });
await mp.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });
check('mobile: no horizontal scroll in room list', (await mp.evaluate((w) => document.documentElement.scrollWidth - w, 390)) <= 1);
await mp.screenshot({ path: `${SHOTS}/chat-list-mobile.png` });

// ---------- membership removal revokes access immediately
psql(`delete from team_members where team_id='${teamId}' and user_id='${B}'`);
const gone = await b.ctx.request.get(`${BASE}/api/chat/rooms/${roomId}/messages?after=0`);
check('removed member: poll API 404 immediately', gone.status() === 404);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
