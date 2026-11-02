// Phase 10 E2E: install-the-web-app popup (one click, "don't show again"), permanent footer entry, standalone behaviour, sample-user names.
// Usage: E2E_DB_URL=... BASE=http://localhost:3000 node tests/e2e/phase10.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const DB = process.env.E2E_DB_URL;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const browser = await chromium.launch();
// Fire the event the way Chromium does; counts how often prompt() is called.
const fire = (p) => p.evaluate(() => {
  window.__prompts = 0;
  window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => { window.__prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) }));
});
const fresh = async (vp = { width: 1280, height: 800 }) => { const ctx = await browser.newContext({ viewport: vp, locale: 'fa-IR' }); return { ctx, p: await ctx.newPage() }; };

// 1. popup appears after the event, with one-click install
{
  const { ctx, p } = await fresh();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('no popup when the browser offers no install prompt', (await p.getByRole('dialog').count()) === 0);
  await fire(p);
  const dlg = p.getByRole('dialog', { name: /نصب وب‌اپ هم‌بازی/ });
  await dlg.waitFor({ timeout: 5000 }).then(() => check('popup appears shortly after the prompt event', true)).catch(() => check('popup appears shortly after the prompt event', false));
  check('popup has a one-click install button, a "don\'t show again" option and a later button', (await dlg.getByRole('button', { name: 'نصب هم‌بازی' }).count()) === 1 && (await dlg.getByLabel('دیگر به من نمایش نده').count()) === 1 && (await dlg.getByRole('button', { name: 'الان نه' }).count()) === 1);
  check('focus moves into the dialog', await p.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  await p.screenshot({ path: '/tmp/install-popup.png' });
  await dlg.getByLabel('دیگر به من نمایش نده').check();
  check('ticking the option keeps focus on the checkbox (no focus stealing)', await p.evaluate(() => document.activeElement?.getAttribute('type') === 'checkbox'));
  await dlg.getByRole('button', { name: 'نصب هم‌بازی' }).click();
  await p.waitForTimeout(300);
  check('one click on install calls the browser prompt once', (await p.evaluate(() => window.__prompts)) === 1);
  check('popup closes after installing', (await p.getByRole('dialog').count()) === 0);
  check('footer entry disappears once installed', (await p.locator('footer button:has-text("نصب")').count()) === 0);
  await ctx.close();
}
// 2. "later" hides it for the session only; "don't show again" persists
{
  const { ctx, p } = await fresh();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await fire(p);
  await p.getByRole('dialog').waitFor();
  await p.keyboard.press('Escape');
  check('Esc closes the popup', (await p.getByRole('dialog').count()) === 0);
  await p.goto(BASE + '/venues', { waitUntil: 'networkidle' }); await fire(p); await p.waitForTimeout(1800);
  check('closing without the option: not shown again in the same session', (await p.getByRole('dialog').count()) === 0);
  check('footer entry is still there', (await p.locator('footer button:has-text("نصب")').count()) === 1);
  const p2 = await ctx.newPage(); // new tab = new sessionStorage, localStorage not set
  await p2.goto(BASE + '/', { waitUntil: 'networkidle' }); await fire(p2);
  await p2.getByRole('dialog').waitFor({ timeout: 5000 }).then(() => check('a new visit shows the popup again', true)).catch(() => check('a new visit shows the popup again', false));
  await p2.getByLabel('دیگر به من نمایش نده').check();
  await p2.getByRole('button', { name: 'الان نه' }).click();
  const p3 = await ctx.newPage();
  await p3.goto(BASE + '/', { waitUntil: 'networkidle' }); await fire(p3); await p3.waitForTimeout(1800);
  check('"don\'t show again" persists across visits', (await p3.getByRole('dialog').count()) === 0);
  check('footer entry stays available after "don\'t show again"', (await p3.locator('footer button:has-text("نصب")').count()) === 1);
  await p3.locator('footer button:has-text("نصب")').click(); await p3.waitForTimeout(300);
  check('footer entry triggers the browser prompt directly', (await p3.evaluate(() => window.__prompts)) === 1);
  await ctx.close();
}
// 3. browsers without an install prompt: footer opens instructions; no popup
{
  const { ctx, p } = await fresh();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800);
  check('no popup in a browser that cannot install', (await p.getByRole('dialog').count()) === 0);
  await p.locator('footer button:has-text("نصب")').click();
  const d = p.getByRole('dialog');
  check('footer entry opens manual instructions', (await d.count()) === 1 && /Install app|Add to Home/.test(await d.innerText()));
  check('instructions have no "don\'t show again" (it is an explicit action)', (await d.getByLabel('دیگر به من نمایش نده').count()) === 0);
  await d.getByRole('button', { name: 'متوجه شدم' }).click();
  check('instructions close', (await p.getByRole('dialog').count()) === 0);
  await ctx.close();
}
// 4. iOS Safari: popup shows the Add-to-Home-Screen steps
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.getByRole('dialog').waitFor({ timeout: 5000 }).then(() => check('iOS: popup with Add to Home Screen steps', true)).catch(() => check('iOS: popup with Add to Home Screen steps', false));
  check('iOS: steps mention Add to Home Screen', /Add to Home Screen/.test(await p.getByRole('dialog').innerText().catch(() => '')));
  await p.screenshot({ path: '/tmp/install-popup-ios.png' });
  await ctx.close();
}
// 5. installed app (standalone display mode): never shown
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : mm(q)); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await fire(p); await p.waitForTimeout(1800);
  check('standalone app: no popup and no footer entry', (await p.getByRole('dialog').count()) === 0 && (await p.locator('footer button:has-text("نصب")').count()) === 0);
  await ctx.close();
}
// 6. blocked storage must not break the page
{
  const { ctx, p } = await fresh();
  await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await fire(p);
  await p.getByRole('dialog').waitFor({ timeout: 5000 }).then(() => check('works when browser storage is blocked', true)).catch(() => check('works when browser storage is blocked', false));
  await ctx.close();
}
// 7. sample users: names match their photos (female photos -> female names)
if (DB) {
  const q = (s) => execSync(`psql "${DB}" -At -c "${s}"`).toString().trim();
  const rows = Object.fromEntries(q("select avatar_url, display_name from users where avatar_url is not null").split('\n').map((l) => l.split('|')));
  check('sample users: female-photo accounts have female names', rows['/img/avatars/p6.jpg'] === 'رها کریمی' && rows['/img/avatars/p8.jpg'] === 'سیما رستمی' && rows['/img/avatars/p10.jpg'] === 'کیمیا شریفی', JSON.stringify(rows));
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
