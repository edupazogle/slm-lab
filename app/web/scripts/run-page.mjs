// Open a self-driving page in headless Chromium and wait for its title to change to "<X> DONE" / "<X> FAILED".
//   node scripts/run-page.mjs <url> [deviceName]
import { chromium, devices } from 'playwright';
const [url, deviceName] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext(deviceName ? { ...devices[deviceName] } : {});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
page.on('requestfailed', (r) => console.error('[requestfailed]', r.url().slice(0, 120), r.failure()?.errorText));
const hosts = new Set(); page.on('request', (r) => hosts.add(new URL(r.url()).host));
await page.goto(url);
const t0 = Date.now();
while (Date.now() - t0 < 10 * 60 * 1000) { const t = await page.title(); if (/ (DONE|FAILED)$/.test(t)) { console.log('== ' + t); break; } await page.waitForTimeout(1000); }
console.log(await page.locator('#log').innerText());
console.log('hosts contacted:', [...hosts].join(', '));
await browser.close();
