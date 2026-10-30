// Phase 8b E2E: chat full-screen + edit/delete/ticks/scroll button, transparent home header + hero gradient, venue map + navigation chooser, owner location picker, OVR badge.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 SHOTS=./shots8b node tests/e2e/phase8b.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? './shots8b';
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
const A = psql(`select id from users where phone_e164='+989000000001'`), B = psql(`select id from users where phone_e164='+989000000011'`);
psql(`delete from teams where name = 'تیم ویرایش آزمون'`);
psql(`insert into teams (name, sport_id, city_id, join_mode, max_members, invite_token) select 'تیم ویرایش آزمون', (select id from sports where key='futsal'), (select id from cities where slug='semnan'), 'public', 10, 'e2e' || substr(md5(random()::text),1,10)`);
const teamId = psql(`select id from teams where name='تیم ویرایش آزمون'`);
psql(`insert into team_members (team_id, user_id, role) values ('${teamId}','${A}','captain'),('${teamId}','${B}','member')`);
const send = async (p, text) => { await p.fill('#chat-text', text); await p.press('#chat-text', 'Enter'); };
const bubble = (p, txt) => p.locator(`[role=log] [id^="m-"]:has-text("${txt}") .rounded-2xl`).first();

// ---------- chat: fills the screen, no footer, no page scroll
const a = await login('09000000001'), b = await login('09000000011');
const ap = a.page, bp = b.page;
await ap.goto(`${BASE}/teams/${teamId}`, { waitUntil: 'networkidle' });
await ap.click('a:has-text("گفت‌وگوی تیم")'); await ap.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
const roomId = ap.url().split('/').pop();
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && getComputedStyle(document.documentElement).overflow === 'hidden');
check('desktop chat: no footer', (await ap.locator('footer').count()) === 0);
check('desktop chat: page does not scroll', await noScroll(ap));
await ap.screenshot({ path: `${SHOTS}/chat-desktop.png` });
await ap.goto(BASE + '/', { waitUntil: 'networkidle' });
check('leaving the chat restores footer and scrolling', (await ap.locator('footer').count()) === 1 && (await ap.evaluate(() => getComputedStyle(document.documentElement).overflow !== 'hidden')));
await ap.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
const st = await b.ctx.storageState();
const mctx = await browser.newContext({ storageState: st, viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, locale: 'fa-IR' });
const mp = await mctx.newPage(); await mp.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
check('mobile chat: no footer, no page scroll, composer visible above the bottom nav', (await mp.locator('footer').count()) === 0 && await noScroll(mp)
  && await mp.evaluate(() => { const f = document.querySelector('#chat-text').getBoundingClientRect(); const n = document.querySelector('nav[aria-label="منوی پایین"]').getBoundingClientRect(); return f.bottom <= n.top + 1 && f.top > 0; }));
await mp.screenshot({ path: `${SHOTS}/chat-mobile.png` });
await mctx.close();

// ---------- edit / delete / copy / ticks
await send(ap, 'متن اولیه برای ویرایش');
await ap.waitForSelector('[role=log] >> text=متن اولیه برای ویرایش');
await bp.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
await bp.waitForSelector('[role=log] >> text=متن اولیه برای ویرایش');
await bp.waitForTimeout(500);
await bubble(bp, 'متن اولیه برای ویرایش').click({ button: 'right' });
check('other person\'s message: menu has no edit / delete-for-everyone', (await bp.locator('[role=menuitem]:has-text("ویرایش")').count()) === 0 && (await bp.locator('[role=menuitem]:has-text("حذف برای همه")').count()) === 0 && (await bp.locator('[role=menuitem]:has-text("کپی")').count()) === 1);
await bp.keyboard.press('Escape');
// A sees the double tick once B has the room open
await ap.waitForSelector('[role=log] [aria-label="دیده شد"]', { timeout: 15000 }).then(() => check('sender sees the read tick after the other member opened the room', true)).catch(() => check('sender sees the read tick after the other member opened the room', false));
// A edits through the menu
await bubble(ap, 'متن اولیه برای ویرایش').click({ button: 'right' });
await ap.locator('[role=menuitem]:has-text("ویرایش")').click();
check('edit mode shows the edit bar with the old text', (await ap.locator('text=ویرایش پیام').count()) >= 1 && (await ap.inputValue('#chat-text')) === 'متن اولیه برای ویرایش');
await ap.fill('#chat-text', 'متن ویرایش‌شده'); await ap.press('#chat-text', 'Enter');
await ap.waitForSelector('[role=log] >> text=متن ویرایش‌شده');
check('edited message shows «ویرایش شده» under it', (await ap.locator('[role=log] [id^="m-"]:has-text("متن ویرایش‌شده") >> text=ویرایش شده').count()) === 1);
check('edit stored once with edited_at', psql(`select count(*) from chat_messages where room_id='${roomId}' and edited_at is not null and body='متن ویرایش‌شده'`) === '1');
await bp.waitForSelector('[role=log] >> text=متن ویرایش‌شده', { timeout: 15000 }).then(() => check('other member sees the edit by polling (no reload)', true)).catch(() => check('other member sees the edit by polling (no reload)', false));
check('other member sees the «ویرایش شده» label', (await bp.locator('[role=log] [id^="m-"]:has-text("متن ویرایش‌شده") >> text=ویرایش شده').count()) === 1);
// ArrowUp = edit last own message; Escape cancels
await ap.focus('#chat-text'); await ap.press('#chat-text', 'ArrowUp');
check('ArrowUp in an empty box starts editing the last own message', (await ap.inputValue('#chat-text')) === 'متن ویرایش‌شده');
await ap.press('#chat-text', 'Escape');
check('Escape cancels editing', (await ap.inputValue('#chat-text')) === '' && (await ap.locator('button[aria-label="لغو ویرایش"]').count()) === 0);
// delete for everyone
ap.once('dialog', (d) => d.accept());
await bubble(ap, 'متن ویرایش‌شده').click({ button: 'right' });
await ap.locator('[role=menuitem]:has-text("حذف برای همه")').click();
await ap.waitForSelector('[role=log] >> text=این پیام حذف شد');
check('deleted: text wiped in the database', psql(`select count(*) from chat_messages where room_id='${roomId}' and deleted_at is not null and body='·'`) === '1');
await bp.waitForSelector('[role=log] >> text=این پیام حذف شد', { timeout: 15000 }).then(() => check('other member sees the deletion by polling', true)).catch(() => check('other member sees the deletion by polling', false));
check('deleted text is gone from the other member\'s page', (await bp.locator('[role=log] >> text=متن ویرایش‌شده').count()) === 0);

// ---------- scroll-to-bottom button
psql(`insert into chat_messages (room_id, sender_id, body) select '${roomId}', '${B}', 'پیام انبوه ' || g from generate_series(1,60) g`);
await ap.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'networkidle' });
await ap.locator('[role=log]').evaluate((el) => { el.scrollTop = 0; });
await ap.waitForSelector('button[aria-label^="رفتن به آخرین پیام"]', { timeout: 5000 }).then(() => check('scroll-down button appears when scrolled up', true)).catch(() => check('scroll-down button appears when scrolled up', false));
await ap.screenshot({ path: `${SHOTS}/chat-scrolled.png` });
await ap.click('button[aria-label^="رفتن به آخرین پیام"]'); await ap.waitForTimeout(1200);
check('button scrolls to the bottom and hides', (await ap.locator('button[aria-label^="رفتن به آخرین پیام"]').count()) === 0);

// ---------- home: transparent header, gradient only on one third
{
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fa-IR' }); const p = await d.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const hdr = await p.evaluate(() => { const h = document.querySelector('header'); const cs = getComputedStyle(h); return { bg: cs.backgroundColor, pos: cs.position, top: h.getBoundingClientRect().top }; });
  check('home header is transparent and floats over the hero', hdr.bg === 'rgba(0, 0, 0, 0)' && hdr.pos === 'absolute' && hdr.top <= 1, JSON.stringify(hdr));
  const g = await p.evaluate(() => { const el = document.querySelector('section.relative.isolate > div[aria-hidden].lg\\:block'); const r = el?.getBoundingClientRect(); const s = el?.parentElement.getBoundingClientRect(); return r && { w: r.width / s.width, right: Math.round(s.right - r.right) }; });
  check('hero gradient covers only the inline-start third', g && Math.abs(g.w - 1 / 3) < 0.02 && g.right <= 1, JSON.stringify(g));
  await p.screenshot({ path: `${SHOTS}/home.png` });
  await p.goto(BASE + '/venues', { waitUntil: 'networkidle' });
  const h2 = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('header')); return cs.position + '|' + cs.backgroundColor; });
  check('other pages keep the solid sticky header', h2.startsWith('sticky|') && !h2.endsWith('rgba(0, 0, 0, 0)'), h2);
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, locale: 'fa-IR' }); const mp2 = await m.newPage();
  await mp2.goto(BASE + '/', { waitUntil: 'networkidle' }); await mp2.screenshot({ path: `${SHOTS}/home-mobile.png` });
  check('mobile home: no horizontal scroll', await mp2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

// ---------- venue map + navigation chooser
{
  const d = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' }); const p = await d.newPage();
  const slug = psql(`select slug from venues where status='published' and lat is not null order by created_at limit 1`);
  const [lat, lng] = psql(`select lat || ',' || lng from venues where slug='${slug}'`).split(',');
  await p.goto(`${BASE}/venues/${slug}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 10000 });
  check('venue page has a map with the venue marker', (await p.locator('.leaflet-container').count()) === 1 && (await p.locator('.leaflet-marker-icon').count()) === 1);
  await p.locator('#loc-title').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOTS}/venue-map.png` });
  await p.click('button:has-text("مسیریابی")');
  const links = await p.locator('[role=dialog] a').evaluateAll((as) => as.map((a) => [a.textContent.trim().split(/(?=[A-Za-z])|مکان|مسیریابی/)[0], a.href, a.target, a.rel]));
  check('chooser lists Neshan, Balad, Waze and Google Maps', ['نشان', 'بلد', 'ویز', 'گوگل مپ'].every((n) => links.some(([t]) => t.includes(n))), JSON.stringify(links.map((l) => l[0])));
  check('every link carries this venue\'s coordinates and opens safely', links.length === 4 && links.every(([, href, tgt, rel]) => href.includes(Number(lat).toFixed(6)) && href.includes(Number(lng).toFixed(6)) && tgt === '_blank' && rel.includes('noopener')));
  await p.screenshot({ path: `${SHOTS}/nav-chooser.png` });
  await p.keyboard.press('Escape');
  check('Escape closes the chooser', (await p.locator('[role=dialog]').count()) === 0);
  psql(`update venues set lat = null, lng = null where slug = (select slug from venues where status='published' order by created_at desc limit 1)`);
  const noPos = psql(`select slug from venues where lat is null and status='published' limit 1`);
  await p.goto(`${BASE}/venues/${noPos}`, { waitUntil: 'networkidle' });
  check('venue without coordinates: address only, no map and no chooser', (await p.locator('.leaflet-container').count()) === 0 && (await p.locator('button:has-text("مسیریابی")').count()) === 0);
  psql(`update venues set lat = 35.57 + 0.0 , lng = 53.39 where slug = '${noPos}'`);
}

// ---------- owner location picker
{
  const o = await login('09000000002'); const op = o.page;
  const vid = psql(`select id from venues where slug = (select slug from venues where status='published' order by created_at limit 1)`);
  await op.goto(`${BASE}/owner/venues/${vid}`, { waitUntil: 'networkidle' });
  await op.waitForSelector('.leaflet-container', { timeout: 10000 });
  const before = psql(`select lat from venues where id='${vid}'`);
  check('owner form has the picker with the saved position', (await op.locator('input[name=lat]').inputValue()) !== '');
  await op.locator('.leaflet-container').scrollIntoViewIfNeeded(); const box = await op.locator('.leaflet-container').boundingBox();
  await op.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  const newLat = await op.locator('input[name=lat]').inputValue();
  check('clicking the map moves the pin and updates the hidden fields', newLat !== '' && newLat !== Number(before).toFixed(6), newLat);
  await op.click('button:has-text("ذخیرهٔ تغییرات")'); await op.waitForURL('**ok=saved**');
  check('position saved to the database', Math.abs(Number(psql(`select lat from venues where id='${vid}'`)) - Number(newLat)) < 1e-5);
}

// ---------- OVR badge
{
  await ap.goto(BASE + '/profile', { waitUntil: 'networkidle' });
  const o = await ap.locator('[role=img][aria-label^="OVR"]').first().evaluate((el) => ({ text: el.textContent.trim(), bg: getComputedStyle(el).backgroundImage }));
  check('OVR badge: Latin digits only, label next to it', /^[0-9]{1,3}OVR$/.test(o.text), o.text);
  check('OVR badge: striped pattern on the disc', o.bg.includes('repeating-linear-gradient'));
  await ap.locator('[role=img][aria-label^="OVR"]').first().screenshot({ path: `${SHOTS}/ovr.png` });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
