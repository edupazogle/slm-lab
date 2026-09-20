// Drive bench.html in headless Chromium and print the posted result.
//   node scripts/run-bench.mjs <gguf-url> [threads=auto] [gpu=0] [n=96] [reps=3] [tag]
// Optional env: BENCH_ORIGIN (default http://127.0.0.1:8097), BENCH_DEVICE ("Pixel 7" etc. for mobile emulation)
import { chromium, devices } from 'playwright';
const [url, threads = 'auto', gpu = '0', n = '96', reps = '3', tag = 'headless-chromium'] = process.argv.slice(2);
if (!url) { console.error('usage: run-bench.mjs <gguf-url> [threads] [gpu] [n] [reps] [tag]'); process.exit(2); }
const origin = process.env.BENCH_ORIGIN ?? 'http://127.0.0.1:8097';
const device = process.env.BENCH_DEVICE ? devices[process.env.BENCH_DEVICE] : undefined;
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
const ctx = await browser.newContext(device ? { ...device } : {});
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (/error|fail|abort/i.test(t)) console.error('[console]', t.slice(0, 300)); });
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
const qs = new URLSearchParams({ url, threads, gpu, n, reps, tag });
await page.goto(`${origin}/bench.html?${qs}`);
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 30 * 60 * 1000) {
  const title = await page.title();
  const log = await page.locator('#log').innerText();
  const tail = log.split('\n').filter(Boolean).slice(-1)[0] ?? '';
  if (tail !== last) { last = tail; console.log(`  +${Math.round((Date.now() - t0) / 1000)}s  ${tail}`); }
  if (title.startsWith('BENCH ')) { console.log('== ' + title); break; }
  await page.waitForTimeout(1500);
}
console.log((await page.locator('#log').innerText()).split('\n').slice(-12).join('\n'));
await browser.close();
