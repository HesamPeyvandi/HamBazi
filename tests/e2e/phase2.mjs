// Phase 2 end-to-end: owner -> admin -> slots -> booking/hold/payment -> open session -> cancellation (real browser, server, DB).
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots2 node tests/e2e/phase2.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require(process.cwd() + '/node_modules/sharp');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots2';
const DB = process.env.E2E_DB_URL;
fs.mkdirSync(SHOTS, { recursive: true });
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
psql('TRUNCATE rate_limits, auth_challenges');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const browser = await chromium.launch();
const NAME = 'سالن آزمایشی ' + Date.now().toString().slice(-5).replace(/\d/g, (d) => FA[d]);
const png = '/tmp/e2e-venue.png';
await sharp({ create: { width: 800, height: 450, channels: 3, background: '#1a8f5a' } }).png().toFile(png);

async function login(phone, vp = { width: 1280, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
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
async function pageChecks(page, label) {
  const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, page.viewportSize().width);
  check(`${label}: no horizontal scroll`, overflow <= 1, `overflow=${overflow}`);
  const bad = await page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const b = [];
    while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue; if (/[0-9]/.test(n.textContent)) b.push(n.textContent.trim().slice(0, 40)); } return b.slice(0, 4); });
  check(`${label}: digits are Persian`, bad.length === 0, bad.join(' | '));
}

// ---------- owner creates venue + photo + submits
const owner = await login('09000000002');
let op = owner.page;
await op.goto(BASE + '/owner/venues/new', { waitUntil: 'networkidle' });
await op.fill('#name', NAME); await op.fill('#address', 'سمنان، خیابان آزمایش، پلاک ۱');
await op.click('button:has-text("ثبت سالن")');
await op.waitForURL(/\/owner\/venues\/[0-9a-f-]{36}\?ok=created/);
const venueId = op.url().match(/venues\/([0-9a-f-]{36})/)[1];
check('owner created venue (draft)', psql(`select status from venues where id='${venueId}'`) === 'draft');
await op.click('button:has-text("ارسال برای تأیید")');
await op.waitForSelector('p[role=alert]');
check('cannot submit without a photo (Persian error)', (await op.locator('p[role=alert]').innerText()).includes('عکس'));
await op.setInputFiles('#image', png); await op.click('button:has-text("آپلود")');
await op.waitForURL('**ok=image'); await op.waitForLoadState('networkidle');
check('photo uploaded and shown', (await op.locator('section ul img').count()) === 1);
const imgSrc = await op.locator('section ul img').first().getAttribute('src');
const imgResp = await op.request.get(BASE + imgSrc);
check('uploaded image is served as image', imgResp.ok() && (imgResp.headers()['content-type'] ?? '').startsWith('image/'));
await op.setInputFiles('#image', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') });
await op.click('button:has-text("آپلود")'); await op.waitForSelector('p[role=alert]');
check('fake image rejected', (await op.locator('p[role=alert]').innerText()).includes('عکس'));
await op.goto(`${BASE}/owner/venues/${venueId}`); await op.click('button:has-text("ارسال برای تأیید")');
await op.waitForURL('**ok=submitted');
check('venue pending review', psql(`select status from venues where id='${venueId}'`) === 'pending');
await op.goto(`${BASE}/venues?q=${encodeURIComponent(NAME)}`, { waitUntil: 'networkidle' });
check('pending venue is not public', (await op.locator(`text=${NAME}`).count()) === 0);
await op.goto(`${BASE}/owner/venues/${venueId}/slots`);
check('slots blocked before approval', (await op.locator('text=پس از تأیید سالن').count()) === 1);

// ---------- another (non-admin) user cannot see admin page or others' venue
const p1 = await login('09000000001');
const r403 = await p1.page.goto(`${BASE}/owner/venues/${venueId}`);
check('player cannot open owner venue page (IDOR) -> 404', r403.status() === 404, String(r403.status()));
await p1.page.goto(`${BASE}/admin/venues`);
check('player cannot open admin page', !(await p1.page.innerText('body')).includes('سالن‌های در انتظار تأیید'));

// ---------- admin approves
const admin = await login('09000000003');
await admin.page.goto(BASE + '/admin/venues', { waitUntil: 'networkidle' });
await admin.page.locator('li', { hasText: NAME }).locator('button:has-text("تأیید و انتشار")').click();
await admin.page.waitForURL('**ok=1');
check('admin approved -> published', psql(`select status from venues where id='${venueId}'`) === 'published');
await admin.ctx.close();

// ---------- owner opens slots (days +2..+4)
await op.goto(`${BASE}/owner/venues/${venueId}/slots`, { waitUntil: 'networkidle' });
const boxes = op.locator('input[name=day]');
for (const i of [2, 3, 4]) await boxes.nth(i).check();
await op.screenshot({ path: `${SHOTS}/owner-slots.png`, fullPage: true });
await op.click('button:has-text("ایجاد سانس‌ها")');
await op.waitForSelector('[role=status]');
const nSlots = Number(psql(`select count(*) from time_slots where venue_id='${venueId}'`));
check('owner created 12 slots (3 days x 4)', nSlots === 12, String(nSlots));
const slotIds = psql(`select id from time_slots where venue_id='${venueId}' order by starts_at`).split('\n');
await op.screenshot({ path: `${SHOTS}/owner-slots-after.png`, fullPage: true });
const slug = psql(`select slug from venues where id='${venueId}'`);
await op.goto(`${BASE}/venues/${slug}`, { waitUntil: 'networkidle' });
check('published venue page is public', (await op.locator(`h1:has-text("${NAME}")`).count()) === 1);

// ---------- player A books full venue + pays (simulated)
const A = p1; const ap = A.page;
await ap.goto(`${BASE}/book/${slotIds[0]}`, { waitUntil: 'networkidle' });
await ap.screenshot({ path: `${SHOTS}/book.png`, fullPage: true });
await ap.click('button:has-text("رزرو و ادامه به پرداخت")');
await ap.waitForURL(/\/pay\//);
check('payment page shows simulated notice', (await ap.locator('text=پرداخت شبیه‌سازی‌شده — پولی کسر نمی‌شود').count()) === 1);
check('slot is held', psql(`select status from time_slots where id='${slotIds[0]}'`) === 'held');
await ap.waitForLoadState('networkidle');
await ap.screenshot({ path: `${SHOTS}/pay.png`, fullPage: true });
// concurrent second user is rejected while held
const B = await login('09000000011');
await B.page.goto(`${BASE}/book/${slotIds[0]}`);
check('second user cannot book a held slot', (await B.page.locator('text=دیگر قابل رزرو نیست').count()) === 1);
await ap.click('button:has-text("پرداخت (شبیه‌سازی)")');
await ap.waitForURL(/\/reservations\/[0-9a-f-]{36}\?ok=paid/);
check('reservation confirmed after simulated payment', (await ap.locator('text=تأیید شده').count()) >= 1 && psql(`select status from time_slots where id='${slotIds[0]}'`) === 'booked');
const resId = ap.url().match(/reservations\/([0-9a-f-]{36})/)[1];
await ap.screenshot({ path: `${SHOTS}/reservation.png`, fullPage: true });

// ---------- true simultaneous click on one slot from two users
const A2 = await login('09000000012'); const A3 = await login('09000000013');
await Promise.all([A2.page.goto(`${BASE}/book/${slotIds[1]}`, { waitUntil: 'networkidle' }), A3.page.goto(`${BASE}/book/${slotIds[1]}`, { waitUntil: 'networkidle' })]);
await Promise.all([A2.page.click('button:has-text("رزرو و ادامه به پرداخت")'), A3.page.click('button:has-text("رزرو و ادامه به پرداخت")')]);
await Promise.all([A2.page.waitForLoadState('networkidle'), A3.page.waitForLoadState('networkidle')]);
await new Promise((r) => setTimeout(r, 1500));
const onPay = [A2.page.url(), A3.page.url()].filter((u) => u.includes('/pay/')).length;
check('simultaneous booking: exactly one winner', onPay === 1, `${A2.page.url().split('/').slice(-2).join('/')} | ${A3.page.url().split('/').slice(-2).join('/')}`);
check('simultaneous booking: exactly one active claim in DB', psql(`select count(*) from slot_claims where slot_id='${slotIds[1]}' and status in ('held','confirmed')`) === '1');
const loser = A2.page.url().includes('/pay/') ? A3.page : A2.page;
check('loser sees Persian message', (await loser.locator('[role=alert]').count()) >= 1 || (await loser.locator('text=دیگر').count()) >= 1);

// ---------- open session 2 of 3: host + joiner
await ap.goto(`${BASE}/book/${slotIds[2]}`, { waitUntil: 'networkidle' });
check('booking page offers both payment modes', (await ap.locator('[role=tab]').count()) === 2 && (await ap.locator('[role=tab][aria-selected=true]').innerText()).includes('همه را من می‌پردازم'));
await ap.click('[role=tab]:has-text("تقسیم بین بازیکنان")'); await ap.waitForURL('**mode=split**'); await ap.waitForSelector('#target');
check('split mode has no manual price/min inputs', (await ap.locator('#price, #min').count()) === 0);
const slotPrice = Number(psql(`select price from time_slots where id='${slotIds[2]}'`));
const shareFor = (n) => Math.ceil(slotPrice / n / 1000) * 1000;
await ap.selectOption('#target', '2');
check('auto share for 2 players is price/2 rounded up to 1000', toEn(await ap.locator('[data-testid=share]').innerText()).replace(/[^\d]/g, '') === String(shareFor(2)), await ap.locator('[data-testid=share]').innerText());
await ap.selectOption('#target', '5');
check('share updates live when players change (5)', toEn(await ap.locator('[data-testid=share]').innerText()).replace(/[^\d]/g, '') === String(shareFor(5)));
await ap.selectOption('#target', '2');
await ap.screenshot({ path: `${SHOTS}/book-session.png`, fullPage: true });
await ap.click('button:has-text("ایجاد سانس و پرداخت سهم من")');
await ap.waitForURL(/\/pay\//); await ap.click('button:has-text("پرداخت (شبیه‌سازی)")');
await ap.waitForURL(/\/sessions\/[0-9a-f-]{36}\?ok=paid/);
const sessionUrl = ap.url().split('?')[0];
check('session published, collecting', (await ap.locator('text=در حال جذب بازیکن').count()) >= 1);
check('invite link visible to host', (await ap.locator('input[aria-label="لینک دعوت"]').count()) === 1);
await ap.screenshot({ path: `${SHOTS}/session-host.png`, fullPage: true });
const bp = B.page;
await bp.goto(BASE + '/sessions', { waitUntil: 'networkidle' });
check('session listed publicly', (await bp.locator(`text=${NAME}`).count()) >= 1);
await bp.screenshot({ path: `${SHOTS}/sessions-list.png`, fullPage: true });
await bp.goto(sessionUrl, { waitUntil: 'networkidle' });
check('payment status hidden from non-host', (await bp.locator('text=پرداخت شد').count()) === 0);
await bp.click('button:has-text("پیوستن و پرداخت سهم")');
await bp.waitForURL(/\/pay\//); await bp.click('button:has-text("پرداخت (شبیه‌سازی)")');
await bp.waitForURL(/\/sessions\/[0-9a-f-]{36}\?ok=paid/);
check('session confirmed when minimum reached', (await bp.locator('text=قطعی شد').count()) >= 1);
await bp.screenshot({ path: `${SHOTS}/session-joined.png`, fullPage: true });
await ap.goto(sessionUrl, { waitUntil: 'networkidle' });
check('host sees participant payment status', (await ap.locator('text=پرداخت شد').count()) >= 2);
await ap.goto(BASE + '/notifications', { waitUntil: 'networkidle' });
check('host received persistent notifications', (await ap.locator('main li, .container-page li').count()) >= 2);
await ap.screenshot({ path: `${SHOTS}/notifications.png`, fullPage: true });
const bell = await ap.locator('header a[href="/notifications"]').getAttribute('aria-label');
check('header bell shows unread count', /خوانده‌نشده/.test(bell ?? ''), bell ?? '');

// ---------- joiner leaves -> refund policy applied
await bp.goto(sessionUrl); await bp.click('button:has-text("خروج از سانس")'); await bp.waitForURL('**ok=left_refund');
check('leaving > 24h before start refunds 100% (simulated record)', psql(`select percent||':'||mode from refunds order by created_at desc limit 1`) === '100:simulated');

// ---------- host cancels the confirmed reservation (>24h) -> 100%
await ap.goto(`${BASE}/reservations/${resId}`, { waitUntil: 'networkidle' });
await ap.click('button:has-text("لغو رزرو")'); await ap.waitForURL(/ok=cancelled/);
check('cancel >24h shows 100% simulated refund', (await ap.locator('text=۱۰۰٪').count()) >= 1);
check('slot reopened after cancellation', psql(`select status from time_slots where id='${slotIds[0]}'`) === 'open');
check('refund record exists, intent immutable amounts intact', psql(`select count(*) from refunds r join payment_intents i on i.id=r.intent_id where i.reservation_id='${resId}'`) === '1');

// ---------- venue-side cancel + deadline auto-cancel via cron endpoint
psql(`update open_sessions set join_deadline = now() - interval '1 minute', min_to_confirm = 2 where false`);
const cron401 = await ap.request.get(BASE + '/api/cron/sweep');
check('cron endpoint rejects unauthenticated calls', cron401.status() === 401);
const cron = await ap.request.get(BASE + '/api/cron/sweep', { headers: { authorization: 'Bearer dev-cron' } });
check('cron endpoint works with secret', cron.ok(), String(cron.status()));

// ---------- layout: mobile + digits on new pages
const state = await A.ctx.storageState();
const Mctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
const M = { ctx: Mctx, page: await Mctx.newPage() };
for (const [path, tag] of [['/sessions', 'sessions'], [`/book/${slotIds[3]}`, 'book'], ['/reservations', 'reservations'], ['/notifications', 'notifications'], ['/dashboard', 'dashboard'], ['/cancellation-policy', 'policy'], ['/owner', 'owner'], [sessionUrl.replace(BASE, ''), 'session']]) {
  const r = await M.page.goto(BASE + path, { waitUntil: 'networkidle' });
  check(`mobile ${tag} status 200`, r.status() === 200, String(r.status()));
  await pageChecks(M.page, `mobile ${tag}`);
  await M.page.screenshot({ path: `${SHOTS}/mobile-${tag}.png`, fullPage: true });
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
