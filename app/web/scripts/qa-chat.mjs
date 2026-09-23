// QA driver for the chat app: real Chromium, real model, screenshots.
//   node scripts/qa-chat.mjs <stage> [size] [theme]
//     stage: shots | e2e | skill
//     size:  desktop (1280x800) | mobile (390x844, dpr 2)
//     theme: carbon | carbonpaper | system
// Serve dist-chat first:  python3 ../serve.py --port 8099 --dir web/dist-chat
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const [stage = 'shots', size = 'desktop', theme = 'carbon'] = process.argv.slice(2);
const ORIGIN = process.env.QA_ORIGIN ?? 'http://127.0.0.1:8099';
const PROFILE = '/home/edu/.cache/slm-pw-chat';
const QA = '/home/edu/Public/bizloop/slm/app/qa';
const MODEL = 'SmolLM2 360M Instruct';
const isMobile = size === 'mobile';
mkdirSync(QA, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  viewport: isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
  deviceScaleFactor: isMobile ? 2 : 1,
  isMobile,
  hasTouch: isMobile,
  args: ['--enable-unsafe-webgpu'],
});
await ctx.addInitScript((t) => {
  try {
    if (t === 'system') localStorage.removeItem('slm-lab-theme');
    else localStorage.setItem('slm-lab-theme', t);
  } catch (e) {}
}, theme);

const page = ctx.pages()[0] ?? (await ctx.newPage());
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`));

const shot = async (name) => {
  const file = `${QA}/chat-${name}-${size}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('shot', file);
};
const overflow = async (where) => {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    worst: Math.max(
      0,
      ...[...document.querySelectorAll('body *')].map((el) => Math.round(el.getBoundingClientRect().right))
    ),
  }));
  console.log(`overflow@${where}: scrollWidth=${r.doc} innerWidth=${r.win} rightmost=${r.worst}`);
  if (r.doc > r.win) problems.push(`horizontal scroll at ${where}: ${r.doc} > ${r.win}`);
};
const openDrawer = async () => {
  if (!isMobile) return;
  const btn = page.getByRole('button', { name: /conversation list/i });
  if (await btn.isVisible()) await btn.click();
  await page.waitForTimeout(300);
};
const goto = async (label) => {
  await openDrawer();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(400);
};

await page.goto(`${ORIGIN}/chat.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

if (stage === 'shots') {
  await shot('empty');
  await overflow('empty chat');
  if (isMobile) {
    await openDrawer();
    await shot('drawer');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await goto('Models');
  await page.waitForTimeout(700);
  await shot('models');
  await overflow('models');
  await goto('Settings');
  await shot('settings');
  await overflow('settings');
  await goto('Engine log');
  await shot('log');
  await goto('Models');
}

if (stage === 'e2e' || stage === 'skill' || stage === 'skills-all' || stage === 'focus') {
  await goto('Models');
  const card = page.locator('.model-card', { hasText: MODEL });
  await card.waitFor();
  const state = (await card.locator('.model-state').innerText()).trim();
  console.log('model state:', state);
  if (state === 'not downloaded') {
    await card.getByRole('button', { name: /^Download/ }).click();
    await card.locator('.model-state', { hasText: 'on this device' }).waitFor({ timeout: 20 * 60 * 1000 });
    console.log('downloaded');
  }
  if (!(await card.locator('.model-state', { hasText: 'in this tab' }).count())) {
    await card.getByRole('button', { name: 'Load into this tab' }).click();
    await card.locator('.model-state', { hasText: 'in this tab' }).waitFor({ timeout: 10 * 60 * 1000 });
  }
  console.log('loaded');
  await shot('model-loaded');
  await page.getByRole('button', { name: 'Start chatting' }).click();
  await page.waitForTimeout(400);

  if (stage === 'e2e') {
    await page.locator('textarea[data-slot="prompt-input-textarea"]').fill(
      'In two sentences, tell a customer their photos arrived.'
    );
    const t0 = Date.now();
    await page.evaluate(() => ((window).__t = performance.now()));
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.locator('.receipt').first().waitFor({ timeout: 10 * 60 * 1000 });
    console.log('answered in', Math.round((Date.now() - t0) / 1000), 's');
    await page.waitForTimeout(500);
    const during = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((e) => e.startTime >= window.__t)
        .map((e) => `${e.name} (${e.initiatorType})`)
    );
    console.log('resource entries during answer 1:', JSON.stringify(during));
    const receipt = await page.locator('.receipt-wrap').first().innerText();
    console.log('--- receipt ---\n' + receipt + '\n---------------');

    // a second answer in the same tab: nothing new to fetch, so the count should be 0
    await page.locator('textarea[data-slot="prompt-input-textarea"]').fill('Reply with one short sentence: thank the customer.');
    await page.evaluate(() => ((window).__t = performance.now()));
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.receipt').length >= 2, null, { timeout: 10 * 60 * 1000 });
    await page.waitForTimeout(500);
    const during2 = await page.evaluate(() =>
      performance.getEntriesByType('resource').filter((e) => e.startTime >= window.__t).map((e) => e.name)
    );
    console.log('resource entries during answer 2:', JSON.stringify(during2));
    console.log('--- receipt 2 ---\n' + (await page.locator('.receipt-wrap').last().innerText()) + '\n---------------');
    const answer = await page.locator('.msg-assistant .chat-markdown').first().innerText();
    console.log('--- answer ---\n' + answer.slice(0, 400) + '\n--------------');
    await page.screenshot({ path: `${QA}/chat-e2e.png` });
    await shot('answer');
    await overflow('answer');
  }

  if (stage === 'skill') {
    await page.locator('.skill-chip', { hasText: 'Pull claim fields' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Use an example', exact: true }).click();
    await page.waitForTimeout(200);
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Run the skill', exact: true }).click();
    await page.locator('.validation').last().waitFor({ timeout: 10 * 60 * 1000 });
    console.log('skill ran in', Math.round((Date.now() - t0) / 1000), 's');
    await page.waitForTimeout(400);
    console.log('--- skill result ---\n' + (await page.locator('.msg-assistant').last().innerText()) + '\n--------------');
    await page.locator('.skill-result').last().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${QA}/chat-skill.png` });
    await shot('skill');
    await overflow('skill');
  }
}

if (stage === 'skills-all') {
  for (const name of ['Anonymise', 'Triage a claim', 'Synthetic claims']) {
    await page.locator('.skill-chip', { hasText: name }).click();
    await page.waitForTimeout(200);
    if (name !== 'Synthetic claims') await page.getByRole('button', { name: 'Use an example', exact: true }).click();
    const before = await page.locator('.validation').count();
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Run the skill', exact: true }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.validation').length > n, before, { timeout: 10 * 60 * 1000 });
    await page.waitForTimeout(600);
    console.log(`\n===== ${name} (${Math.round((Date.now() - t0) / 1000)} s) =====`);
    console.log((await page.locator('.msg-assistant').last().innerText()).slice(0, 1600));
    await page.locator('.skill-result').last().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${QA}/chat-skill-${name.toLowerCase().split(' ')[0]}-${size}-${theme}.png` });
    await overflow(name);
  }
}

if (stage === 'focus') {
  await page.getByRole('button', { name: 'Start chatting' }).click().catch(() => {});
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  await shot('focus');
  console.log('focused:', await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
}

console.log(problems.length ? `PROBLEMS:\n- ${problems.join('\n- ')}` : 'no console errors');
await ctx.close();
