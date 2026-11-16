// Phase 13 E2E: standing weekly reservations (owner) + admin settings button alignment.
// Usage: E2E_DB_URL=postgres://... BASE=http://localhost:3000 node tests/e2e/phase13.mjs   (freshly seeded DB)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const DB = process.env.E2E_DB_URL;
const psql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
const FA = '۰۱۲۳۴۵۶۷۸۹'; const toEn = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d));
const browser = await chromium.launch();
async function login(phone) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#phone', phone.replace(/\d/g, (d) => FA[d])); await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify**'); await page.waitForLoadState('networkidle');
  await page.fill('#code', toEn(await page.locator('[role=status] bdi').innerText())); await page.click('button[type=submit]:has-text("تأیید")');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  return { ctx, page };
}
const vid = psql(`SELECT id FROM venues WHERE slug='aftab'`);
const dow = psql(`SELECT extract(dow from starts_at AT TIME ZONE 'Asia/Tehran')::int FROM time_slots WHERE venue_id='${vid}' AND starts_at > now() + interval '1 day' AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='19:00' ORDER BY starts_at LIMIT 1`);
const inWin = (extra = '') => `SELECT count(*) FROM time_slots WHERE venue_id='${vid}' AND starts_at > now() AND extract(dow from starts_at AT TIME ZONE 'Asia/Tehran')=${dow} AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='19:00' ${extra}`;

// guest cannot open the page
{ const r = await fetch(BASE + `/owner/venues/${vid}/blocks`, { redirect: 'manual' }); check('guest is redirected away from the block page', r.status === 307 || r.status === 302, String(r.status)); }

const { page: p } = await login('09000000002');
await p.goto(BASE + `/owner/venues/${vid}/blocks`, { waitUntil: 'networkidle' });
check('block page opens for the owner', (await p.locator('h1').innerText()).includes('رزروهای دائمی'));
const total = Number(psql(inWin()));
check('precondition: seeded slots exist in the target window', total > 0, String(total));

await p.fill('#title', 'باشگاه فوتسال نمونه');
await p.selectOption('#weekday', dow); await p.selectOption('#start', '19:00'); await p.selectOption('#end', '20:30');
await p.click('button[type=submit]:has-text("ثبت رزرو دائمی")');
await p.waitForURL('**ok=created**'); await p.waitForLoadState('networkidle');
check('success message shown', (await p.locator('[role=status]').innerText()).includes('رزرو دائمی ثبت شد'));
check('entry appears in the list', (await p.locator('li', { hasText: 'باشگاه فوتسال نمونه' }).count()) === 1);
check('matching slots are closed and linked to the block', Number(psql(inWin(`AND status='closed' AND block_id IS NOT NULL`))) === total);
check('neighbouring slots (17:30) stay open', Number(psql(`SELECT count(*) FROM time_slots WHERE venue_id='${vid}' AND starts_at>now() AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='17:30' AND status='open'`)) > 0);

// public: no booking link for a blocked slot
const blocked = psql(`SELECT id FROM time_slots WHERE venue_id='${vid}' AND block_id IS NOT NULL LIMIT 1`);
const g = p;
const r = await g.goto(BASE + `/book/${blocked}`, { waitUntil: 'networkidle' });
void r;
check('booking a blocked slot is not possible ("no longer bookable")', (await g.content()).includes('این سانس دیگر قابل رزرو نیست') );

// owner cannot reopen a blocked slot by hand; slots page shows the label
await p.goto(BASE + `/owner/venues/${vid}/slots`, { waitUntil: 'networkidle' });
check('slots page labels them "رزرو دائمی" with no open/delete buttons', (await p.locator('li:has(.pill:text("رزرو دائمی"))').count()) > 0 && (await p.locator('li:has(.pill:text("رزرو دائمی")) button').count()) === 0);

// overlapping second block rejected
await p.goto(BASE + `/owner/venues/${vid}/blocks`, { waitUntil: 'networkidle' });
await p.fill('#title', 'گروه دیگر'); await p.selectOption('#weekday', dow); await p.selectOption('#start', '19:30'); await p.selectOption('#end', '21:00');
await p.click('button[type=submit]:has-text("ثبت رزرو دائمی")');
await p.waitForURL('**err=**'); check('overlapping standing reservation is rejected with a message', (await p.locator('p[role=alert]').innerText()).includes('همپوشانی'));

// edit: move to 20:30-22:00 -> 19:00 slots reopen
await p.goto(BASE + `/owner/venues/${vid}/blocks`, { waitUntil: 'networkidle' });
await p.click('a[href*="?edit="]'); await p.waitForURL('**edit=**'); await p.waitForLoadState('networkidle');
check('edit form is prefilled', (await p.inputValue('#title')) === 'باشگاه فوتسال نمونه');
await p.selectOption('#start', '20:30'); await p.selectOption('#end', '22:00');
await p.click('button[type=submit]:has-text("ذخیرهٔ تغییرات")'); await p.waitForURL('**ok=updated**');
check('after edit the old 19:00 slots are open again', Number(psql(inWin(`AND status='open'`))) === total);
check('and the 20:30 slots are now the closed ones', Number(psql(`SELECT count(*) FROM time_slots WHERE venue_id='${vid}' AND block_id IS NOT NULL AND to_char(starts_at AT TIME ZONE 'Asia/Tehran','HH24:MI')='20:30'`)) > 0);

// cancel
await p.click('button:has-text("لغو")'); await p.waitForURL('**ok=cancelled**');
check('cancel reopens every slot and keeps the history row', Number(psql(`SELECT count(*) FROM time_slots WHERE venue_id='${vid}' AND block_id IS NOT NULL`)) === 0 && (await p.locator('.pill:text("لغو شده")').count()) === 1);

// another owner's venue is not reachable (404)
const other = psql(`SELECT id FROM venues WHERE slug<>'aftab' AND id NOT IN (SELECT venue_id FROM venue_managers WHERE user_id=(SELECT id FROM users WHERE phone_e164='+989000000002')) LIMIT 1`);
if (other) { const rr = await p.goto(BASE + `/owner/venues/${other}/blocks`); check('someone else’s venue → 404', rr.status() === 404, String(rr.status())); }

// admin settings: the green "ذخیره" button is level with its input
const { page: a } = await login('09000000003');
await a.goto(BASE + '/admin/settings', { waitUntil: 'networkidle' });
const pairs = await a.evaluate(() => [...document.querySelectorAll('form')].filter((f) => f.querySelector('input[name=value]')).map((f) => { const i = f.querySelector('input[name=value]').getBoundingClientRect(), b = f.querySelector('button').getBoundingClientRect(); return { dy: Math.abs((i.top + i.height / 2) - (b.top + b.height / 2)), dh: Math.abs(i.height - b.height) }; }));
check('admin settings: every ذخیره button is vertically centred on its input', pairs.length >= 2 && pairs.every((x) => x.dy < 1.5), JSON.stringify(pairs));
await browser.close();
