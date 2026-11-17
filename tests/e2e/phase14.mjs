// Phase 14 E2E: slots appear by themselves (demo) + owner weekly schedule page.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 node tests/e2e/phase14.mjs   (freshly seeded DB, APP_ENV not production)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const DB = process.env.E2E_DB_URL;
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
const FA = '۰۱۲۳۴۵۶۷۸۹'; const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const EMPTY = 'برای این روز سانس خالی ثبت نشده است';
const browser = await chromium.launch();
async function login(phone) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#phone', phone.replace(/\d/g, (d) => FA[d])); await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**'); await page.waitForLoadState('networkidle');
  await page.fill('#code', toEn(await page.locator('[role=status] bdi').innerText())); await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  return page;
}
const [slug, vid] = psql(`SELECT slug||'|'||id FROM venues WHERE slug='nashat'`).split('|');

// 1) The exact production-like symptom: only expired slots, no schedule.
psql(`DELETE FROM venue_schedules; UPDATE venues SET schedule_set=false; UPDATE time_slots SET starts_at=starts_at - interval '40 days', ends_at=ends_at - interval '40 days'`);
const g = await (await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran' })).newPage();
await g.goto(`${BASE}/venues/${slug}`, { waitUntil: 'networkidle' });
const urls = await g.$$eval('a[href*="day="]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
check('7 day tabs found', urls.length >= 7, String(urls.length));
let withSlots = 0, empty = 0;
for (const u of urls.slice(0, 7)) { await g.goto(BASE + u, { waitUntil: 'networkidle' }); const html = await g.content(); if (html.includes(EMPTY)) empty++; else withSlots++; }
check('demo: every one of the 7 days shows slots without anyone adding them', withSlots === 7 && empty === 0, `with=${withSlots} empty=${empty}`);
check('a default schedule was created once for the venue', Number(psql(`SELECT count(*) FROM venue_schedules WHERE venue_id='${vid}'`)) >= 7 && psql(`SELECT schedule_set FROM venues WHERE id='${vid}'`) === 't');
check('about 14 days of future slots exist', Number(psql(`SELECT count(DISTINCT (starts_at AT TIME ZONE 'Asia/Tehran')::date) FROM time_slots WHERE venue_id='${vid}' AND starts_at>now()`)) >= 13);

// 2) Owner weekly schedule page
const o = await login('09000000002');
await o.goto(`${BASE}/owner/venues/${vid}/schedule`, { waitUntil: 'networkidle' });
check('schedule page shows 7 weekday rows', (await o.locator('fieldset li').count()) === 7);
check('existing (demo) schedule is prefilled', (await o.locator('fieldset input[type=checkbox]:checked').count()) >= 1);
// Keep only Saturday + Wednesday, 18:00–21:00, 60-minute slots
await o.selectOption('#slotMinutes', '60');
const n = await o.locator('fieldset li').count();
for (let i = 0; i < n; i++) {
  const li = o.locator('fieldset li').nth(i); const label = (await li.locator('label').innerText()).trim();
  const keep = label === 'شنبه' || label === 'چهارشنبه';
  const cb = li.locator('input[type=checkbox]'); if ((await cb.isChecked()) !== keep) await cb.click();
  if (keep) { await li.locator('select').nth(0).selectOption('18:00'); await li.locator('select').nth(1).selectOption('21:00'); }
}
await o.click('button:has-text("ذخیرهٔ برنامه")'); await o.waitForURL('**ok=saved**'); await o.waitForLoadState('networkidle');
check('saved message shown', (await o.locator('[role=status]').innerText()).includes('ذخیره شد'));
const own = `venue_id='${vid}' AND starts_at>now() AND status='open'`;
check('only Saturday/Wednesday remain, 18–21, 60 min', psql(`SELECT count(*) FROM time_slots WHERE ${own} AND (extract(dow from starts_at AT TIME ZONE 'Asia/Tehran') NOT IN (6,3) OR to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI') NOT IN ('18:00','19:00','20:00') OR ends_at-starts_at <> interval '60 minutes')`) === '0' && Number(psql(`SELECT count(*) FROM time_slots WHERE ${own}`)) >= 12);

// 3) a standing reservation closes its window and is unselectable
const dow = psql(`SELECT extract(dow from starts_at AT TIME ZONE 'Asia/Tehran')::int FROM time_slots WHERE ${own} ORDER BY starts_at LIMIT 1`);
await o.goto(`${BASE}/owner/venues/${vid}/blocks`, { waitUntil: 'networkidle' });
await o.fill('#title', 'باشگاه نمونه'); await o.selectOption('#weekday', dow); await o.selectOption('#start', '18:00'); await o.selectOption('#end', '19:00');
await o.click('button[type=submit]:has-text("ثبت رزرو دائمی")'); await o.waitForURL('**ok=created**');
check('block closes the 18:00 slots (not selectable)', Number(psql(`SELECT count(*) FROM time_slots WHERE venue_id='${vid}' AND starts_at>now() AND block_id IS NOT NULL AND status='closed' AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='18:00'`)) > 0 && psql(`SELECT count(*) FROM time_slots WHERE ${own} AND extract(dow from starts_at AT TIME ZONE 'Asia/Tehran')=${dow} AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='18:00'`) === '0');
// re-saving the schedule keeps the block closed
await o.goto(`${BASE}/owner/venues/${vid}/schedule`, { waitUntil: 'networkidle' });
await o.click('button:has-text("ذخیرهٔ برنامه")'); await o.waitForURL('**ok=saved**');
check('re-saving the schedule does not reopen block slots', psql(`SELECT count(*) FROM time_slots WHERE ${own} AND extract(dow from starts_at AT TIME ZONE 'Asia/Tehran')=${dow} AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='18:00'`) === '0');

// 4) validation
await o.goto(`${BASE}/owner/venues/${vid}/schedule`, { waitUntil: 'networkidle' });
await o.selectOption('#slotMinutes', '120');
const li = o.locator('fieldset li').first(); const cb = li.locator('input[type=checkbox]'); if (!(await cb.isChecked())) await cb.click();
await li.locator('select').nth(0).selectOption('18:00'); await li.locator('select').nth(1).selectOption('19:00');
await o.click('button:has-text("ذخیرهٔ برنامه")'); await o.waitForURL('**err=**');
check('a window shorter than one slot is rejected', (await o.locator('p[role=alert]').innerText()).includes('کوتاه'));
// guest blocked
const r = await fetch(`${BASE}/owner/venues/${vid}/schedule`, { redirect: 'manual' });
check('guest is redirected away', r.status === 307 || r.status === 302, String(r.status));
await browser.close();
