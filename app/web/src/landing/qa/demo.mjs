// Landing demo, end to end, in headless Chromium: press the button, let the real 386 MB model download
// (or come from storage), watch the form fill, and record what the page and the browser each say.
//   cd slm/app/web && node src/landing/qa/demo.mjs [origin] [outPng] [width] [height]
// Uses the persistent profile below so the model is downloaded once across runs.
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:8098';
const outPng = process.argv[3] ?? '/home/edu/Public/bizloop/slm/app/qa/landing-demo-done.png';
const width = Number(process.argv[4] ?? 1280);
const height = Number(process.argv[5] ?? 800);
const theme = process.env.THEME ?? 'carbon';
const PROFILE = '/home/edu/.cache/slm-pw-landing';
const LIMIT_MS = 25 * 60 * 1000;

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width, height },
  deviceScaleFactor: width < 600 ? 2 : 1,
  isMobile: width < 600,
  hasTouch: width < 600,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const problems = [];
const requests = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url().slice(0, 160)}`);
});
// every request the browser makes for this page, including the ones from inside the engine's worker
ctx.on('request', (r) => requests.push({ url: r.url(), method: r.method(), post: r.postData() ?? '' }));

await page.goto(origin + '/', { waitUntil: 'networkidle' });
await page.evaluate((t) => {
  // choose the theme through the page's own control, so the toggle state matches the screenshot
  const label = t === 'carbonpaper' ? 'Dark' : 'Light';
  [...document.querySelectorAll('.theme button')].find((b) => b.textContent.trim() === label)?.click();
}, theme);
const note = await page.locator('.note-field textarea').inputValue();
const meterBefore = await page.evaluate(() =>
  Object.fromEntries([...document.querySelectorAll('[data-meter],[data-meter-host]')].map((el) => [el.getAttribute('data-meter') ?? el.getAttribute('data-meter-host'), el.textContent])),
);
console.log('meter before:', JSON.stringify(meterBefore));
const reqBefore = requests.length;

const t0 = Date.now();
await page.locator('.demo-go').click();
let last = '';
let outcome = 'timeout';
while (Date.now() - t0 < LIMIT_MS) {
  const s = await page.evaluate(() => ({
    status: document.querySelector('.demo-status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    bar: document.querySelector('.bar [style]')?.getAttribute('style') ?? '',
    done: !!document.querySelector('[data-run="done"]'),
    failed: document.querySelector('.failure')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }));
  const line = `${s.status.slice(0, 150)} ${s.bar}`;
  if (line !== last) {
    last = line;
    console.log(`  +${Math.round((Date.now() - t0) / 1000)}s  ${line}`);
  }
  if (s.done) { outcome = 'done'; break; }
  if (s.failed) { outcome = 'failed: ' + s.failed; break; }
  await page.waitForTimeout(1000);
}
console.log(`outcome after ${Math.round((Date.now() - t0) / 1000)} s: ${outcome}`);

// let the stamp animation finish, then look at the form next to the sheet
await page.waitForTimeout(900);
const report = await page.evaluate(() => ({
  fields: Object.fromEntries([...document.querySelectorAll('[data-field]')].map((el) => [el.getAttribute('data-field'), el.querySelector('.claim-value')?.textContent ?? ''])),
  receipt: Object.fromEntries([...document.querySelectorAll('.receipt > div')].map((d) => [d.querySelector('span')?.textContent, d.querySelector('b')?.textContent])),
  runNote: [...document.querySelectorAll('.run-note')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
  meter: Object.fromEntries([...document.querySelectorAll('[data-meter],[data-meter-host]')].map((el) => [el.getAttribute('data-meter') ?? el.getAttribute('data-meter-host'), el.textContent])),
  stamp: document.querySelector('.stamp')?.getAttribute('data-land') ?? null,
  stampText: document.querySelector('.stamp')?.textContent ?? null,
  liveRow: document.querySelector('.live-row')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  fieldFont: getComputedStyle(document.querySelector('.claim-value')).fontFamily,
  resourceEntries: performance.getEntriesByType('resource').length + performance.getEntriesByType('navigation').length,
}));
console.log(JSON.stringify(report, null, 2));

await page.locator('#try').scrollIntoViewIfNeeded();
await page.evaluate(() => document.querySelector('.demo-grid')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(400);
await page.screenshot({ path: outPng, fullPage: false });
await page.screenshot({ path: outPng.replace(/\.png$/, '-full.png'), fullPage: true });

// what the browser really requested, by host, after the button was pressed
const after = requests.slice(reqBefore);
const byHost = {};
for (const r of after) {
  const h = new URL(r.url).host;
  byHost[h] = (byHost[h] ?? 0) + 1;
}
console.log('real requests after the click, by host (browser-level, incl. worker):', JSON.stringify(byHost));
const carried = requests.filter((r) => r.post && (r.post.includes('Moreau') || r.post.includes(note.slice(0, 40))));
console.log(`requests with a body: ${requests.filter((r) => r.post).length}; requests carrying the note text: ${carried.length}`);
for (const r of after) console.log(`   ${r.method} ${r.url.slice(0, 140)}`);
console.log(problems.length ? 'problems:\n   ' + problems.join('\n   ') : 'no console errors, warnings, failed requests or 4xx');
await ctx.close();
process.exit(outcome === 'done' ? 0 : 1);
