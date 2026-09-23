// Landing page QA: screenshots at desktop and phone size in both themes, plus the mechanical checks
// (console errors, horizontal overflow at 390px, third-party requests, what the meter says vs. what
// the browser really requested, touch-target size, text contrast).
//   cd slm/app/web && node src/landing/qa/shots.mjs [origin] [outPrefix]
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:8098';
const out = process.argv[3] ?? '/home/edu/Public/bizloop/slm/app/qa/landing';
const PROFILE = '/home/edu/.cache/slm-pw-landing';

const sizes = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const themes = ['carbon', 'carbonpaper'];
let failed = 0;

// Runs in the page: the contrast of real text against the background it is really drawn on, and the
// size of everything that can be tapped. Neither is something a screenshot can be trusted to show.
function audit() {
  const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => {
    const a = fg[3] === undefined ? 1 : fg[3];
    return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const bad = [];
  for (const el of document.querySelectorAll('p, li, dd, dt, td, th, h1, h2, h3, span, b, a, button, label')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.getBoundingClientRect().height === 0) continue;
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    const opacity = parse(cs.opacity)[0];
    const eff = opacity < 1 ? over([...fg.slice(0, 3), opacity], bg) : over(fg, bg);
    const r = ratio(eff, bg);
    const floor = large ? 3 : 4.5;
    if (r < floor)
      bad.push({ text: text.slice(0, 40), px: size, ratio: Math.round(r * 100) / 100, need: floor, color: cs.color, on: `rgb(${bg.join(',')})` });
  }

  const small = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).display === 'inline') continue; // a link inside a sentence: WCAG's inline exception
    if (r.height < 44 || r.width < 24) small.push({ text: (el.textContent ?? '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return { bad: bad.slice(0, 12), badCount: bad.length, small };
}

for (const size of sizes) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: size.viewport,
    deviceScaleFactor: size.deviceScaleFactor,
    isMobile: size.isMobile,
    hasTouch: !!size.hasTouch,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const problems = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e).slice(0, 300)}`));
  page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`); });
  page.on('request', (r) => requests.push(r.url()));

  for (const theme of themes) {
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    // choose the theme with the page's own control, so the toggle in the screenshot tells the truth
    await page.evaluate((t) => {
      const want = t === 'carbonpaper' ? 'Dark' : 'Light';
      [...document.querySelectorAll('.theme button')].find((b) => b.textContent.trim() === want)?.click();
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      pressed: [...document.querySelectorAll('.theme button')].map((b) => `${b.textContent.trim()}=${b.getAttribute('aria-pressed')}`).join(' '),
      fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.stretch}`),
      meter: Object.fromEntries([...document.querySelectorAll('[data-meter]')].map((el) => [el.getAttribute('data-meter'), el.textContent])),
      h1: getComputedStyle(document.querySelector('h1')).fontFamily,
    }));
    const overflow = m.scrollWidth > m.innerWidth;
    if (overflow) failed++;
    console.log(`${size.name}/${theme}: data-theme=${m.theme} toggle[${m.pressed}] scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} ${overflow ? 'OVERFLOW' : 'ok'} meter=${JSON.stringify(m.meter)}`);
    if (theme === themes[0]) console.log(`  fonts loaded: ${[...new Set(m.fonts)].join(' | ')}`);
    if (overflow) {
      const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 8).map((el) => `${el.tagName}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`));
      console.log('  overflowing:', wide);
    }
    const a = await page.evaluate(audit);
    if (a.badCount) { failed++; console.log(`  CONTRAST below the floor: ${a.badCount}`, JSON.stringify(a.bad)); }
    else console.log('  contrast: every text run meets 4.5:1, or 3:1 where the type is large');
    if (a.small.length) { failed++; console.log('  TOUCH TARGETS under 44px high:', JSON.stringify(a.small)); }
    else console.log('  touch targets: every block-level control is at least 44px high');
    await page.screenshot({ path: `${out}-${size.name}-${theme}.png`, fullPage: true });
    await page.screenshot({ path: `${out}-${size.name}-${theme}-fold.png`, fullPage: false });
  }

  const hosts = {};
  for (const u of requests) { const h = new URL(u).host; hosts[h] = (hosts[h] ?? 0) + 1; }
  console.log(`${size.name}: real requests by host (both loads): ${JSON.stringify(hosts)}`);
  const third = Object.keys(hosts).filter((h) => h !== new URL(origin).host);
  if (third.length) { failed++; console.log('  THIRD-PARTY HOSTS BEFORE ANY MODEL LOAD:', third); }
  if (problems.length) { failed++; console.log('  problems:\n   ' + problems.join('\n   ')); } else console.log('  no console errors, warnings, failed requests or 4xx');
  await ctx.close();
}
process.exit(failed ? 1 : 0);
