#!/usr/bin/env node
/* QA round for the Second Look page in headless Chromium (Playwright): device check, the rules-only redactor, the model
   download, every decision widget on every example, eight decisions fired at once, the threshold, keyboard tabs, the
   89-decision test (and a second run), the redactor with the model, a UK letter, a .docx and an .xlsx upload, the
   pseudonymised .docx export, synthetic variants (repeatable by seed) and their .zip, the usage meter and its .csv, the live
   request counter in the receipts, offline mode, the cached reload, and a reload with no connection (the service worker),
   which must leave the lab's pages under lab/ alone. Runs at the site root (the Railway site) or under a sub-path (Pages).
   Usage: node test/qa_browser.js --url http://127.0.0.1:8792/ [--out qa/report.json] [--shots qa] [--docx test/sample-claim.docx] [--xlsx test/sample-claims.xlsx] [--no-net]
   --no-net: the runner has no CDN access; everything off-origin is refused (the page serves its own scripts from vendor/).
   Needs playwright (npm i -D playwright && npx playwright install chromium). Exit code 0 when every check passes. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const v = process.argv[i + 1]; if (v && !v.startsWith('--')) { args[a.slice(2)] = v; i++; } else args[a.slice(2)] = true; } }
const URL = args.url || 'http://127.0.0.1:8792/', DOCX = args.docx || path.join(__dirname, 'sample-claim.docx'), XLSX = args.xlsx || path.join(__dirname, 'sample-claims.xlsx');
const checks = [], errors = { page: [], console: [], failedRequests: [] }, measured = {};
const check = (id, ok, detail) => { checks.push({ id, ok: !!ok, detail: String(detail ?? '') }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`); };
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
let NIR = null; for (let k = 0; k < 100 && !NIR; k++) { const c = `1850578006084${String(k).padStart(2, '0')}`; if (luhn(c)) NIR = `1 85 05 78 006 084 ${String(k).padStart(2, '0')}`; }
const FIXED = `Dossier sinistre AX-2026-0091
- Nom: Alexandrie-Claudine Martineau
- Prénom: Jean-Pierre
- Numéro de sécurité sociale: ${NIR}
Dear Albesjan Le Mao, thank you for your letter. Mr Le said the garage was closed. Madame Édith Dupont a vu l'accident. We were skiing à Innsbruck with Patrick-Xavier Lemoine.
Kind regards,
Sunanda Iasna Maffezzini Ryhiner Majidzadeh Kumar`;
const EXPECT = {
  route: ['Motor', 'Home', 'Travel', 'Liability'], legal: ['Yes', 'No', 'Yes'], vuln: ['Yes', 'Yes', 'No'], guard: ['Yes', 'No', 'Yes'], custom: ['Yes', 'Yes', 'Yes'],
};
(async () => {
  for (let i = 0; i < 100; i++) { try { await new Promise((res, rej) => http.get(URL, (r) => { r.resume(); res(); }).on('error', rej)); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => { try { localStorage.setItem('sl_tour_done', '1'); } catch (e) {} });   // the first-visit tour would cover the page
  if (args['no-net']) await context.route('**/*', (route) => route.request().url().startsWith(URL) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.page.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => errors.failedRequests.push(r.url().slice(0, 120)));
  const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
  const kpiNet = () => page.evaluate(() => ['kpiNet', 'kpiNetU', 'kpiNetL'].map((id) => document.getElementById(id).textContent.trim()).join(' | '));   // the hero's network figure: value | unit | caption
  const click = (sel) => page.$eval(sel, (e) => e.click());        // a DOM click: the fixed model bar may sit over the target
  const mapRows = () => page.$$eval('#anonMap tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
  const waitText = (sel, re, timeout = 60000) => page.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s).textContent), [sel, re.source], { timeout });
  const shot = async (name) => { if (args.shots) { fs.mkdirSync(args.shots, { recursive: true }); await page.screenshot({ path: path.join(args.shots, name + '.png'), fullPage: name === 'full' }); } };
  const download = async (sel) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), click(sel)]); return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) }; };
  const unzipNames = (buf) => { const out = []; let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--; let p = buf.readUInt32LE(e + 16); for (let k = 0; k < buf.readUInt16LE(e + 10); k++) { const nl = buf.readUInt16LE(p + 28); out.push(buf.slice(p + 46, p + 46 + nl).toString()); p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32); } return out; };

  // 0. the first-visit tour, as a new visitor meets it, in its own context (the rest of this round skips the tour and uses
  //    DOM clicks, which is how a highlight ring that took the click on "Download & turn on" went unnoticed: step 1 then
  //    waited for a download that never started). Real, hit-tested clicks only.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (args['no-net']) await ctx.route('**/*', (route) => route.request().url().startsWith(URL) ? route.continue() : route.abort());
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    // v9: the tour is offered, not imposed: a new visitor meets the page, and the tour starts from the hero button
    const auto = await p.waitForSelector('#tour:not([hidden])', { timeout: 1500 }).then(() => true, () => false);
    check('tour-opt-in', !auto, auto ? 'the tour opened over the page on its own' : 'the page opens without the tour over it');
    await p.click('#tourStartBtn');                                                // a real, hit-tested click
    await p.waitForSelector('#tour:not([hidden])', { timeout: 5000 });
    await p.click('#tourNext');                                                    // "Start"
    await p.waitForFunction(() => /Download/.test(document.querySelector('#tourStep').textContent), null, { timeout: 5000 });
    await p.waitForTimeout(700);                                                   // the ring moves onto the button (.45 s)
    const hit = await p.$eval('#dockBtn', (b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, t = document.elementFromPoint(x, y); return { x, y, ok: !!t && b.contains(t), top: t ? t.id || String(t.className) : 'nothing' }; });
    await p.mouse.click(hit.x, hit.y);
    const started = await p.waitForFunction(() => /Downloading|Starting|Models ready/.test(document.querySelector('#dlText').textContent), null, { timeout: 15000 }).then(() => true, () => false);
    check('tour-first-visit', hit.ok && started, !hit.ok ? `a click on the highlighted button lands on #${hit.top}` : started ? 'the highlighted button takes a real click and the download starts' : 'the button took the click but no download started');
    // closing the tour gives keyboard focus back to where it was (the hero's tour button), not to <body>
    await p.keyboard.press('Escape');
    const back = await p.evaluate(() => ({ hidden: document.querySelector('#tour').hidden, at: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }));
    check('tour-focus-return', back.hidden && back.at === 'tourStartBtn', `tour closed with Escape; focus on ${back.at}`);
    await ctx.close();
  }

  // 0b. a phone: no keyboard-shortcut hint on a touch screen, no sideways scroll
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('sl_tour_done', '1'); } catch (e) {} });
    if (args['no-net']) await ctx.route('**/*', (route) => route.request().url().startsWith(URL) ? route.continue() : route.abort());
    const p = await ctx.newPage(); await p.goto(URL, { waitUntil: 'load' });
    const ph = await p.evaluate(() => ({ kbd: [...document.querySelectorAll('.q .kbd')].filter((k) => k.getClientRects().length).length, sw: document.documentElement.scrollWidth, req: document.querySelector('#reqText').getClientRects().length }));
    check('phone-layout', ph.kbd === 0 && ph.sw <= 390, `${ph.kbd} shortcut hints shown; page ${ph.sw} px wide at 390; request counter in the bar ${ph.req ? 'shown' : 'hidden (the tour points at its own count instead)'}`);
    await ctx.close();
  }

  // 1. the device check
  await page.goto(URL, { waitUntil: 'load' });
  await waitText('#capTitle', /Can run|lacks/, 15000);
  check('device-check', /Can run/.test(await text('#capTitle')), await text('#capTitle'));
  const store = await page.$$eval('#capRows .kv', (es) => es.map((e) => e.textContent.trim()).find((t) => /^Storage/.test(t)) || '');
  check('storage-units', /^Storage free[\d.]+ (GB|MB)$/.test(store) && !/\d{4,}(\.\d)? MB/.test(store), store);
  check('scripts-self-hosted', await page.evaluate(() => typeof ort === 'object' && [...document.scripts].some((s) => /vendor\/ort\.wasm\.min\.js$/.test(s.src))), 'ONNX Runtime from vendor/, not the CDN');

  // 2. the redactor with the rules alone (before any model), on the built-in sample letter
  await waitText('#anonMeta', /items replaced/);
  const rows0 = await mapRows(), orig0 = rows0.map((r) => r[1]).join('\n');
  const must0 = ['CLM-2026-004871', 'MOT-77-341902', 'Camille Dubois', '12 rue des Lilas', '69003 Lyon', 'FR-482-XZ', 'camille.dubois@example.fr', '+33 6 12 34 56 78', 'FR76 3000 6000 0112 3456 7890 189', '4242 4242 4242 4242', 'Thomas Leclerc', '03/07/1988', 'Sophie Marchand', '14 September 2026'];
  const miss0 = must0.filter((s) => !orig0.includes(s));
  check('redactor-rules-only', miss0.length === 0 && /Rules only/.test(await text('#anonMeta')), miss0.length ? 'missed: ' + miss0.join(', ') : `${rows0.length} placeholders; ` + await text('#anonMeta'));
  const out0 = await text('#anonOut');
  check('redactor-output-clean', !/Dubois|Leclerc|Marchand|example\.fr/.test(out0), out0.slice(0, 80).replace(/\n/g, ' '));

  // 2a. the redactor says what it does: pseudonymisation, and the leak rate E1a measured for these rules, with its source
  const copy = await page.evaluate(() => { const b = document.body.cloneNode(true); b.querySelectorAll('script, style').forEach((e) => e.remove()); return b.textContent; });
  const leak = await text('#anonLeak');
  check('redactor-pseudonymise-copy', !/anonymis|Safe to share/i.test(copy) && /Pseudonymise this text/.test(await text('#anonRun')) && /Pseudonymised: check before sharing/.test(copy) && /0\.7515/.test(leak) && /487/.test(leak) && /E1a v4/.test(leak) && /2026-09-25/.test(leak),
    `button "${await text('#anonRun')}"; ${leak.slice(0, 110)}`);
  // 2a'. a UK letter: the street address, a postcode with no town, a date written "3rd of May 1961" (it came out unchanged)
  const UK = 'Dear Mr Hughes,\n\nI am writing about my mother, Margaret Ellis, born on the 3rd of May 1961. She lives at 27 Harrow Road, London W2 5DY. Please also write to her sister at 14 Park Lane, Manchester M1 1AE, born May 3rd, 1958.\n\nKind regards,\nDavid Ellis';
  await click('#xp [data-go="2"]'); await page.fill('#anonIn', UK); await click('#anonRun'); await waitText('#anonMeta', /items replaced/);
  const ukRows = await mapRows(), ukOut = await text('#anonOut'), ukBy = Object.fromEntries(ukRows.map((r) => [r[1], r[0]]));
  const ukWant = [['27 Harrow Road', 'ADDRESS'], ['W2 5DY', 'POSTCODE'], ['3rd of May 1961', 'DATE'], ['14 Park Lane', 'ADDRESS'], ['M1 1AE', 'POSTCODE'], ['May 3rd, 1958', 'DATE']];
  const ukBad = ukWant.filter(([t, ty]) => !(ukBy[t] || '').startsWith(`[${ty}_`) || ukOut.includes(t));
  check('redactor-uk-letter', ukBad.length === 0, ukBad.length ? 'missed or left in: ' + ukBad.map((x) => x[0]).join(', ') : ukWant.map(([t]) => `${t} → ${ukBy[t]}`).join(' · '));

  // 2b. the lock: the page's security policy refuses a request to another site (a fetch and an image), and says so
  const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content).catch(() => '');
  check('csp-connect-self', /connect-src 'self'(;|$)/.test(csp) && /img-src 'self'/.test(csp), csp.slice(0, 90));
  await click('#lockRun');
  await page.waitForFunction(() => document.querySelectorAll('#lockOut .lk').length === 2, null, { timeout: 10000 });
  const lock = await page.$$eval('#lockOut .lk', (es) => es.map((e) => ({ cls: e.className, t: e.textContent.trim() })));
  check('lock-refused', lock.every((l) => l.cls === 'lk' && /^Refused/.test(l.t)) && /connect-src/.test(lock[0].t) && /img-src/.test(lock[1].t), lock.map((l) => l.t.slice(0, 70)).join(' | '));
  // the calibration view and "At your volume" work before any download, from the recorded run, and say so
  const vol = await page.$$eval('#volOut b', (es) => es.map((e) => e.textContent.trim()));
  check('volume-view-recorded', vol.length === 3 && vol.every((v) => /^~[\d,]+$/.test(v)) && /Recorded 25 Sep 2026/.test(await text('#chartSub')) && /the recorded run/.test(await text('#volNote')), vol.join(' · ') + ' · ' + (await text('#volNote')).slice(0, 60));

  // an example clicked before the models are on says why nothing ran
  await click('#w-route [data-ex="0"]');
  const toast0 = await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !t.hidden && t.textContent; }, null, { timeout: 3000 }).then((h) => h.jsonValue(), () => '');
  check('example-before-models', /Turn on the models/.test(toast0), toast0 || 'no toast');
  const kpi0 = await kpiNet();

  // 3. the download, from the button in the model bar
  const t0 = Date.now(); await click('#dockBtn');
  await waitText('#dlText', /Models ready|Try the download again/, 240000);
  measured.download_s = +((Date.now() - t0) / 1000).toFixed(1);
  const cards = await page.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
  const dlTotal = await text('#dlTotal'), m = dlTotal.match(/^([\d.]+) MB \/ ([\d.]+) MB$/);
  check('models-download', /Models ready/.test(await text('#dlText')) && cards.every((c) => /^Ready/.test(c)) && m && m[1] === m[2], `${dlTotal} in ${measured.download_s} s; ` + cards.join(' | '));
  if (!/Models ready/.test(await text('#dlText'))) { await finish(); return; }
  // every on/off switch in the bar takes a real click (from 1181 to about 1370 px the third chip was cut off by its row)
  const sws = await page.$$eval('.dm .sw', (ss) => ss.map((s) => { const b = s.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!t && s.contains(t); }));
  check('dock-switches-reachable', sws.length === 2 && sws.every(Boolean), `${sws.filter(Boolean).length} of ${sws.length} switches hit-testable at ${page.viewportSize().width} px`);
  check('model-bar-live', await page.$eval('#dock', (d) => d.dataset.live) === 'on' && (await page.$$eval('.dm[data-st="on"]', (e) => e.length)) === 3, await text('#dsTitle') + ' · ' + await text('#dsSub'));
  check('meter-warm-up', /\d+ calls · [\d,.k]+ tokens/.test(await text('#meterTotals')), await text('#meterTotals'));
  await shot('models-ready');
  await click('#lockRun'); await page.waitForTimeout(600);
  check('lock-not-counted', /^0 network requests since ready/.test(await text('#reqText')), await text('#reqText'));
  // the hero's "0 bytes" is the request counter (it was a constant): not counted before the models, 0 since
  const kpi1 = await kpiNet();
  check('kpi-reads-counter', /^— \| bytes \| sent: counted once/.test(kpi0) && /^0 \| bytes \| sent since the models started$/.test(kpi1), `before: ${kpi0} · after: ${kpi1}`);

  // 4. every widget, every example, one at a time (each tab opened first)
  await page.waitForFunction(() => document.querySelector('#out-custom .trc-v'), null, { timeout: 120000 });
  const widgets = await page.$$eval('.widget', (ws) => ws.map((w) => ({ id: w.id.slice(2), n: w.querySelectorAll('[data-ex]').length })));
  measured.widgets = {};
  for (const w of widgets) {
    await click(`.dtab[data-dtab="${w.id}"]`);
    for (let i = 0; i < w.n; i++) {
      const before = await text(`#out-${w.id} .json`), label = await text(`#w-${w.id} [data-ex="${i}"]`);
      await click(`#w-${w.id} [data-ex="${i}"]`);
      await page.waitForFunction(([id, b]) => document.querySelector(`#out-${id} .json`).textContent !== b, [w.id, before], { timeout: 60000 });
      const json = JSON.parse(await text(`#out-${w.id} .json`)), big = await text(`#out-${w.id} .trc-v`), receipt = await page.$(`#out-${w.id} .receipt`);
      const u = json.usage || {};
      // mechanics are pass / fail; whether the small model agrees with the example's label is measured, and gated below
      let ok = !!receipt && u.calls >= 1 && u.tokens_in > 0 && u.ms_infer > 0 && json.ms >= 0, why = '', agree = null;
      if (!ok) why = 'no receipt or no usage measured';
      if (EXPECT[w.id]) { const exp = EXPECT[w.id][i]; agree = big.startsWith(exp); if (!agree) why = `answer ${big} differs from the label ${exp}: a model error, not a page fault`; }
      if (w.id === 'urgency' && !(json.score >= 1 && json.score <= 5)) { ok = false; why = 'score out of range'; }
      if (json.type === 'choice') { const ps = await page.$$eval(`#out-${w.id} .sbl-r .v`, (es) => es.map((e) => +e.textContent)); if (ps.length !== 5 || Math.abs(ps.reduce((a, b) => a + b, 0) - 1) > 0.02) { ok = false; why = 'the five probabilities do not sum to 1'; } }
      (measured.widgets[w.id] ||= []).push({ example: i, label, answer: big, agrees_with_label: agree, p: json.p ?? json.score, ms: json.ms, tokens_in: u.tokens_in, ms_infer: u.ms_infer, tokens_per_s: u.tokens_per_s });
      check(`widget-${w.id}-${i}`, ok, `${big}${agree === false ? ' (label ✗)' : ''} · ${u.tokens_in} tokens · ${json.ms} ms (${u.ms_infer} in the model) · ${u.tokens_per_s} tok/s` + (why ? ' · ' + why : ''));
    }
    // all examples at once: a table with one row per example, tokens and ms on each
    await click(`#b-${w.id} [data-batch]`);
    await page.waitForFunction(([id, n]) => document.querySelectorAll(`#bt-${id} tbody tr`).length === n && !document.querySelector(`#b-${id} [data-batch]`).disabled, [w.id, w.n], { timeout: 60000 });
    const brow = await page.$$eval(`#bt-${w.id} tbody tr`, (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
    check(`batch-${w.id}`, brow.length === w.n && brow.every((r) => +r[4] > 0 && +r[5] >= 0), brow.map((r) => `${r[2]} (${r[4]} tok, ${r[5]} ms)`).join(' · '));
  }
  const labelled = Object.values(measured.widgets).flat().filter((x) => x.agrees_with_label !== null), agreed = labelled.filter((x) => x.agrees_with_label).length;
  measured.label_agreement = { agreed, of: labelled.length };
  check('widgets-label-agreement', labelled.length && agreed / labelled.length >= 0.75, `${agreed} of ${labelled.length} labelled examples answered as labelled (the page's own routing figure is 79 %)`);
  const urg = measured.widgets.urgency || [];
  check('widget-urgency-order', urg.length === 3 && urg[0].p > urg[2].p, urg.map((x) => x.p).join(' > '));
  // 4b. eight decisions at once (five or more overlapping decisions crashed the tab): five Decide clicks and a Ctrl+Enter,
  //     then two example clicks queued behind running decisions; and three that must not run: a Decide click on a widget
  //     whose run is in flight (the button is off), a Ctrl+Enter on one, and a held key's repeat
  {
    // the meter's table is drawn on the next frame: read where it stands only once the last "Run all" is in it
    await page.waitForTimeout(300); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const e0 = errors.page.length, seq0 = await page.$eval('#meterTable tbody tr td', (td) => +td.textContent || 0);
    await page.evaluate(() => {
      const w = (id) => document.getElementById('w-' + id);
      const key = (id, repeat) => w(id).querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: true, repeat, bubbles: true, cancelable: true }));
      for (const id of ['route', 'legal', 'vuln', 'urgency', 'guard']) w(id).querySelector('[data-run]').click();
      key('custom', false);
      key('custom', true); key('legal', false); w('route').querySelector('[data-run]').click();   // none of these runs
      w('vuln').querySelector('[data-ex="1"]').click(); w('guard').querySelector('[data-ex="2"]').click();
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.widget [data-run]')].every((b) => !b.disabled), null, { timeout: 60000 });
    await page.waitForTimeout(400);   // the meter's table is drawn on the next frame; any stray extra run would land by now
    const rows = await page.$$eval('#meterTable tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
    const fresh = rows.filter((r) => +r[0] > seq0), where = {}; for (const r of fresh) where[r[2]] = (where[r[2]] || 0) + 1;
    const want = { route: 1, legal: 1, vuln: 2, urgency: 1, guard: 2, custom: 1 };
    const own = await page.$$eval('.widget .json', (es) => es.map((e) => { try { return JSON.parse(e.textContent).usage.calls; } catch (x) { return -1; } }));
    const ok = errors.page.length === e0 && fresh.length === 8 && Object.entries(want).every(([k, n]) => where[k] === n) && own.every((c) => c === 1);
    check('overlap-8-decisions', ok, `${fresh.length} decisions answered (${Object.entries(where).map(([k, n]) => `${k} ${n}`).join(', ')}); receipts' own calls ${own.join('/')}; page errors ${errors.page.length - e0}`);
  }
  // "Turn off" and on again from the hero's button (it stayed disabled after "Turn off")
  {
    const before = await page.$eval('#dlBtn', (b) => b.disabled);
    await click('#dockBtn'); await waitText('#dockBtnText', /^Turn on/, 10000);
    const off = await page.$eval('#dlBtn', (b) => ({ dis: b.disabled, t: b.textContent.trim() }));
    await click('#dlBtn'); await waitText('#dlText', /Models ready/, 60000);
    const after = await page.$eval('#dlBtn', (b) => b.disabled);
    check('hero-button-after-off', before && !off.dis && /back on/i.test(off.t) && after && await page.$eval('#dock', (d) => d.dataset.live) === 'on', `on: disabled ${before}; after "Turn off": "${off.t}", disabled ${off.dis}; on again: ${await text('#dlText')}`);
  }
  // the Decide button runs the current text again
  await click('.dtab[data-dtab="legal"]');
  const b0 = await text('#out-legal .json'); await click('#w-legal [data-run]');
  await page.waitForFunction((b) => document.querySelector('#out-legal .json').textContent !== b, b0, { timeout: 30000 });
  check('widget-decide-button', true, 'legal re-run');
  // keyboard: arrow keys move between the decision tabs
  await page.focus('.dtab[data-dtab="legal"]'); await page.keyboard.press('ArrowRight');
  const sel = await page.$eval('.dtab[aria-selected="true"]', (e) => e.dataset.dtab), vis = await page.$eval('#w-vuln', (e) => !e.hidden);
  check('tabs-keyboard', sel === 'vuln' && vis, `ArrowRight from legal → ${sel}`);
  await click('.dtab[data-dtab="legal"]');

  // 5. the threshold slider changes the action without a new run
  await click('#w-legal [data-ex="0"]'); await page.waitForTimeout(300);
  const pLegal = JSON.parse(await text('#out-legal .json')).p;
  const setT = (v) => page.$eval('#t-legal', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const answer = async () => `${await text('#out-legal .trc-v')} · ${await text('#out-legal .act')}`;
  await setT('0.95'); const hi = await answer(); await setT('0.30'); const lo = await answer();
  check('threshold-slider', /^No/.test(hi) && /Normal queue/.test(hi) && /^Yes/.test(lo) && pLegal < 0.95, `p ${pLegal}: at 0.95 → ${hi}; at 0.30 → ${lo}`);

  // 6. the telling test
  const t1 = Date.now(); await click('#testRun');
  await waitText('#testMeta', /Ran 89 decisions/, 300000);
  measured.test_s = +((Date.now() - t1) / 1000).toFixed(1); measured.test = { button: await text('#testMeta') };
  for (const k of ['legal', 'vuln', 'route']) {
    await click(`#testTabs [data-k="${k}"]`);
    measured.test[k] = await page.$$eval('#testStats .stat .n', (es) => es.map((e) => e.textContent.trim()));
  }
  const aucL = +measured.test.legal[0], aucV = +measured.test.vuln[0], acc = parseInt(measured.test.route[0], 10);
  check('test-89-decisions', aucL >= 0.95 && aucV >= 0.95 && acc >= 75 && /tokens · median/.test(measured.test.button), `legal AUC ${aucL}, vulnerable AUC ${aucV}, routing ${acc} %; ${measured.test.button}`);
  // the last tab clicked above is routing: the volume view now reads this device's run
  check('volume-view-live', /measured on this device/i.test(await text('#chartSub')) && /this device's run/.test(await text('#volNote')), (await text('#volOut')).replace(/\s+/g, ' ').slice(0, 80));
  // the test runs again (the result used to be written on its button, which stayed disabled)
  {
    const calls = async () => +((await text('#meterTotals')).match(/^(\d+) calls/) || [0, 0])[1];
    const n0 = await calls(), lbl = await text('#testRun'), en = await page.$eval('#testRun', (b) => !b.disabled);
    await click('#testRun'); await page.waitForFunction(() => !document.querySelector('#testRun').disabled, null, { timeout: 300000 });
    const n1 = await calls();
    check('test-rerun', en && /again/.test(lbl) && n1 - n0 === 89, `"${lbl}", enabled ${en}; second run: ${n1 - n0} calls`);
  }
  const caseRows = await page.$$eval('#caseTable tbody tr', (rs) => rs.map((r) => r.children.length));
  check('test-case-table', caseRows.length === 30 && caseRows.every((n) => n === 7), `${caseRows.length} rows`);
  await shot('test');

  // 7. the redactor with the model, on the cases the E1a follow-up fixed
  await click('#xp [data-go="2"]');
  await page.fill('#anonIn', FIXED); await click('#anonRun');
  await waitText('#anonMeta', /model checked|No unsure/);
  const rows1 = await mapRows(), by = Object.fromEntries(rows1.map((r) => [r[1], r]));
  const want = [['Alexandrie-Claudine Martineau', 'context'], ['Jean-Pierre', 'context'], [NIR, 'pattern'], ['Albesjan Le Mao', 'greeting'], ['Le', 'title'], ['Édith Dupont', 'title'], ['Patrick-Xavier Lemoine', 'first name'], ['Sunanda Iasna Maffezzini Ryhiner Majidzadeh Kumar', 'sign-off']];
  const bad = want.filter(([t, why]) => !by[t] || by[t][2] !== why).map(([t]) => t);
  const nirRow = by[NIR], leRow = by['Le'], fullRow = by['Albesjan Le Mao'];
  check('redactor-fixed-cases', bad.length === 0 && nirRow && nirRow[0].startsWith('[NIR_') && leRow && fullRow && leRow[0] !== fullRow[0], bad.length ? 'wrong or missing: ' + bad.join(', ') : `${rows1.length} placeholders, NIR as ${nirRow && nirRow[0]}, "Le" as ${leRow && leRow[0]} vs ${fullRow && fullRow[0]}`);
  check('redactor-model-meta', /model checked \d+ unsure name/.test(await text('#anonMeta')) && /tokens, \d+ ms/.test(await text('#anonMeta')), await text('#anonMeta'));
  check('experience-step-3', await page.$eval('#xp', (e) => e.dataset.step) === '3' && /Bytes sent\s*0/.test(await text('#xpStats')), (await text('#xpStats')).replace(/\s+/g, ' '));

  // 8. a Word file, then the pseudonymised result saved as a Word file
  if (fs.existsSync(DOCX)) {
    await click('#xp [data-go="2"]');
    await page.setInputFiles('#anonFile', DOCX);
    await page.waitForFunction(() => /Claire Fontaine/.test(document.querySelector('#anonIn').value), null, { timeout: 30000 });
    await waitText('#anonMeta', /items replaced/);
    const rows2 = await mapRows(), orig2 = rows2.map((r) => r[1]).join('\n');
    const must2 = ['CLM-2026-77120', 'AX-FR-5530018', 'GH-921-TR', 'Claire Fontaine', 'FR76 3000 6000 0112 3456 7890 189', '+33 6 98 76 54 32', 'paul.girard@example.com', '5 rue Pasteur', '33000 Bordeaux', 'Paul Girard', '3 September 2026'];
    const miss2 = must2.filter((s) => !orig2.includes(s));
    check('docx-upload', miss2.length === 0, miss2.length ? 'missed: ' + miss2.join(', ') : `${rows2.length} placeholders from ${path.basename(DOCX)}`);
    const saved = await download('#anonSave'), names = unzipNames(saved.buf), body = saved.buf.toString('latin1');
    check('docx-export', /-pseudonymised\.docx$/.test(saved.name) && names.includes('word/document.xml') && /\[PERSON_1\]/.test(body) && !/Claire Fontaine|paul\.girard/.test(body), `${saved.name}: ${saved.buf.length} bytes, ${names.length} parts, placeholders inside, no original name`);
  } else check('docx-upload', false, `no file at ${DOCX} (python3 test/make_sample_docx.py)`);

  // 9. an Excel file
  if (fs.existsSync(XLSX)) {
    await click('#xp [data-go="2"]');
    await page.setInputFiles('#anonFile', XLSX);
    await page.waitForFunction(() => /Oliver Grant/.test(document.querySelector('#anonIn').value), null, { timeout: 30000 });
    await waitText('#anonMeta', /items replaced/);
    const rows3 = await mapRows(), orig3 = rows3.map((r) => r[1]).join('\n');
    const must3 = ['CLM-2026-55012', 'Hélène Rousseau', 'helene.rousseau@example.org', '+33 6 11 22 33 44', 'FR76 3000 6000 0112 3456 7890 189', 'Oliver Grant', 'o.grant@example.co.uk', 'DE89 3704 0044 0532 0130 00'];
    const miss3 = must3.filter((s) => !orig3.includes(s));
    check('xlsx-upload', miss3.length === 0, miss3.length ? 'missed: ' + miss3.join(', ') : `${rows3.length} placeholders from ${path.basename(XLSX)} (shared strings, deflated)`);
  } else check('xlsx-upload', false, `no file at ${XLSX} (python3 test/make_sample_xlsx.py)`);

  // 10. synthetic variants: seeded and repeatable, no original name left, saved as a zip
  await page.fill('#synSeed', '2026'); await click('#synRun'); await waitText('#synMeta', /documents generated/);
  const syn1 = await text('#synTable'), leaked = ['Marie Lefebvre', 'Thomas Becker', 'Sophie Wagner', 'Carlos Mendes', 'Jean-Pierre Martin', 'Lucas Garcia', 'Ana Garcia Lopez', 'marie.lefebvre'].filter((n) => syn1.includes(n));
  await click('#synRun'); await page.waitForTimeout(300); const syn2 = await text('#synTable');
  await page.fill('#synSeed', '7'); await click('#synRun'); await page.waitForTimeout(300); const syn3 = await text('#synTable');
  const nRows = await page.$$eval('#synTable tbody tr', (rs) => rs.length);
  check('synthetic-variants', nRows === 9 && leaked.length === 0 && syn1 === syn2 && syn3 !== syn1, `${nRows} variants; same seed identical: ${syn1 === syn2}; other seed differs: ${syn3 !== syn1}` + (leaked.length ? '; leaked ' + leaked.join(', ') : ''));
  const z = await download('#synZip'), zn = unzipNames(z.buf);
  check('synthetic-zip', zn.length === 10 && zn.includes('variants.jsonl'), `${z.name}: ${zn.length} files`);

  // 10b. a model call that fails in the middle of a pseudonymisation or of the variants: a sentence says so, the button is
  //      free again, and no earlier result is left on screen as if it were this one's (the runtime is made to fail here)
  {
    await page.evaluate(() => { const P = ort.InferenceSession.prototype; P._run = P.run; P.run = function () { return Promise.reject(new Error('a test failure')); }; });
    await click('#xp [data-go="2"]'); await page.fill('#anonIn', FIXED); await click('#anonRun');
    await page.waitForFunction(() => !document.querySelector('#anonErr').hidden, null, { timeout: 30000 }).catch(() => {});
    const a = await page.evaluate(() => ({ err: document.querySelector('#anonErr').hidden ? '' : document.querySelector('#anonErr').textContent, free: !document.querySelector('#anonRun').disabled, out: document.querySelector('#anonOut').textContent, step: document.querySelector('#xp').dataset.step }));
    await page.setInputFiles('#synFile', { name: 'unsure-names.txt', mimeType: 'text/plain', buffer: Buffer.from('We were skiing with Albesjan Kowalczyk and Ioana Mbeki last winter.\nThe report went to Gustavo Adeyemi.') });
    await waitText('#synMeta', /No variants|documents generated/, 30000);
    const sm = await text('#synMeta'), sfree = await page.$eval('#synRun', (b) => !b.disabled), srows = await page.$$eval('#synTable tbody tr', (r) => r.length);
    await page.evaluate(() => { const P = ort.InferenceSession.prototype; P.run = P._run; });
    check('errors-say-so', /^Not pseudonymised: a test failure/.test(a.err) && a.free && a.out === '' && a.step === '2' && /^No variants: the run stopped \(a test failure\)/.test(sm) && sfree && srows === 0,
      `pseudonymise: "${a.err.slice(0, 70)}", button free ${a.free}, step ${a.step}; variants: "${sm.slice(0, 60)}", button free ${sfree}`);
  }

  // 11. the usage meter
  const meterRows = await page.$$eval('#meterTable tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
  const modelsSeen = new Set(meterRows.map((r) => r[3]));
  measured.meter = { pill: await text('#meterTotals'), cards: await page.$$eval('#modelCards [data-meter]', (es) => es.map((e) => e.textContent.trim())), chips: await page.$$eval('.dm [data-s]', (es) => es.map((e) => e.textContent.trim())) };
  check('usage-meter', meterRows.length === 40 && modelsSeen.has('xtremedistil-l6-h256') && modelsSeen.has('all-MiniLM-L6-v2') && meterRows.every((r) => +r[5] > 0 && +r[9] > 0) && /calls/.test(measured.meter.pill), `${measured.meter.pill}; ${measured.meter.cards.slice(1).join(' | ')}`);
  check('meter-in-model-bar', measured.meter.chips.slice(1).every((c) => /calls · [\d,.k]+ tok · \d+ ms/.test(c)), measured.meter.chips.join(' | '));
  const csv = await download('#meterCsv'), lines = csv.buf.toString('utf8').trim().split('\n');
  check('meter-csv', /^seq,at,ctx,model/.test(lines[0]) && lines.length > 100, `${csv.name}: ${lines.length - 1} calls`);
  await page.evaluate(() => document.querySelector('#meter').scrollIntoView()); await shot('meter');

  // 12. offline
  await context.setOffline(true);
  await waitText('#netText', /offline/i, 10000);
  await click('.dtab[data-dtab="route"]');
  const b1 = await text('#out-route .json'); await click('#w-route [data-run]');
  await page.waitForFunction((b) => document.querySelector('#out-route .json').textContent !== b, b1, { timeout: 30000 });
  check('offline-run', /computed offline/.test(await text('#offBanner')) && /^0 network requests/.test(await text('#reqText')), `${await text('#netText')}; ${await text('#reqText')}`);
  await shot('offline');
  await context.setOffline(false);

  // 12b. the receipts, the hero figure and the meter read the live request counter: a real request after the models started
  //      (same origin, so the policy allows it) moves all of them
  {
    const sent0 = await page.$$eval('[data-sent]', (es) => es.map((e) => e.textContent));
    await page.evaluate(() => fetch('manifest.webmanifest?probe=' + Date.now(), { cache: 'no-store' }).then((r) => r.text()));
    await page.waitForFunction(() => document.querySelector('#kpiNet').textContent === '1', null, { timeout: 10000 }).catch(() => {});
    const sent1 = await page.$$eval('[data-sent]', (es) => es.map((e) => e.textContent)), kpi = await kpiNet();
    const mstat = await page.$$eval('#meterStats .mstat', (es) => es[es.length - 1].textContent.trim());
    check('receipts-live-counter', sent0.length >= 6 && sent0.every((t) => /^0 requests since the models started · 0 bytes sent$/.test(t)) && sent1.every((t) => /^1 request since the models started/.test(t)) && /^1 \| request \| since the models started/.test(kpi) && /^1request since/.test(mstat),
      `${sent0.length} receipts: "${sent0[0]}" → "${sent1[0]}"; hero ${kpi}; meter "${mstat}"`);
  }

  // 13. the cached reload: nothing downloaded the second time
  await page.reload({ waitUntil: 'load' }); await waitText('#capTitle', /Can run|lacks/, 15000);
  await page.waitForFunction(() => /cached/.test(document.querySelector('#dockBtnText').textContent), null, { timeout: 10000 }).catch(() => {});
  const label2 = await text('#dockBtnText');
  const t2 = Date.now(); await click('#dockBtn'); await waitText('#dlText', /Models ready|Try the download again/, 120000);
  measured.reload_s = +((Date.now() - t2) / 1000).toFixed(1);
  const cards2 = await page.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
  check('cached-reload', /cached/.test(label2) && cards2.every((c) => /loaded from this browser, nothing downloaded/.test(c)), `button "${label2}"; ${measured.reload_s} s; ` + cards2.join(' | '));

  await shot('full');

  // 14. a reload with no connection at all: the service worker serves the page, IndexedDB the models. The connection is
  //     really cut: the page is opened in its own context through a small proxy this script owns, and the proxy is shut
  //     before the reload. context.setOffline alone proved nothing: Playwright 1.56 (the CI's) does not apply it, nor
  //     context.route, to the service worker's own fetches, so a worker that fetched everything from the network passed.
  //     The same run checks that the worker leaves the lab's pages alone (lab/ beside the page: at the site root its scope
  //     is the whole origin): the proxy answers lab/ itself, so the check needs no file on the server.
  await offlineReload();
  await finish();

  async function offlineReload() {
    const up = new (require('url').URL)(URL), lib = up.protocol === 'https:' ? require('https') : http, socks = new Set();
    const labPath = up.pathname.replace(/[^/]*$/, '') + 'lab/';
    const proxy = http.createServer((req, res) => {
      if (req.url.startsWith(labPath)) { res.writeHead(200, { 'Content-Type': req.url.endsWith('.html') ? 'text/html' : 'text/plain', 'Cache-Control': 'no-store' }); return res.end(req.url.endsWith('.html') ? '<!doctype html><title>lab page</title>lab' : 'lab probe'); }
      const f = lib.request({ protocol: up.protocol, hostname: up.hostname, port: up.port, path: req.url, method: req.method, headers: { ...req.headers, host: up.host } },
        (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      f.on('error', () => res.destroy()); req.pipe(f);
    });
    proxy.on('connection', (s) => { socks.add(s); s.on('close', () => socks.delete(s)); });
    const cut = () => new Promise((r) => { proxy.close(() => r()); for (const s of socks) s.destroy(); });
    await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${proxy.address().port}`, at = origin + up.pathname + up.search, lab = origin + labPath;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('sl_tour_done', '1'); } catch (e) {} });
    if (args['no-net']) await ctx.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 200)); });
    p.on('pageerror', (e) => errors.page.push(String(e).slice(0, 300)));
    const txt = (sel) => p.$eval(sel, (e) => e.textContent.trim()), ready = () => p.waitForFunction(() => /Models ready|Try the download again/.test(document.querySelector('#dlText').textContent), null, { timeout: 240000 });
    let labCached = 'not checked', labOnline = 'not checked';
    try {
      await p.goto(at, { waitUntil: 'load' });
      const sw = await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).then(() => true, () => false);
      if (!sw) return check('offline-reload', false, 'no service worker took control of the page');
      await p.$eval('#dockBtn', (b) => b.click()); await ready();                      // the models into this origin's IndexedDB
      if (!/Models ready/.test(await txt('#dlText'))) return check('offline-reload', false, 'the first download failed: ' + await txt('#dlText'));
      // the lab's files, fetched while the worker controls the page: they must not land in its cache
      labOnline = await p.evaluate(async (u) => (await Promise.all([u + 'probe.txt', u + 'assets/probe.css'].map((x) => fetch(x).then((r) => r.status, () => 0)))).join('/'), lab);
      await p.waitForTimeout(300);
      labCached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/\/lab\//.test(r.url)) out.push(r.url); return out.join(' ') || 'none'; });
      await cut(); await ctx.setOffline(true);                                        // no server any more, and the browser offline
      try { await p.reload({ waitUntil: 'load', timeout: 30000 }); }
      catch (e) { return check('offline-reload', false, 'with no connection the page did not load: ' + e.message.split('\n')[0]); }
      await p.waitForFunction(() => /Can run|lacks/.test(document.querySelector('#capTitle').textContent), null, { timeout: 15000 });
      const t3 = Date.now(); await p.$eval('#dockBtn', (b) => b.click()); await ready();
      measured.offline_reload_s = +((Date.now() - t3) / 1000).toFixed(1);
      await p.waitForFunction(() => document.querySelector('#out-route .trc-v'), null, { timeout: 60000 });
      const fromSw = await p.evaluate(() => !!navigator.serviceWorker.controller && performance.getEntriesByType('navigation')[0].workerStart > 0);
      const cards = await p.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
      check('offline-reload', fromSw && /Models ready/.test(await txt('#dlText')) && /offline/i.test(await txt('#netText')) && cards.every((c) => /loaded from this browser/.test(c)),
        `server shut and browser offline; page, scripts and fonts from the service worker, models from IndexedDB: ready in ${measured.offline_reload_s} s; route → ${await txt('#out-route .trc-v')}`);
      // offline, a lab file is not answered from the worker's cache, and a lab page does not open as this page
      const labOffline = await p.evaluate((u) => fetch(u + 'assets/probe.css').then(() => 'answered', () => 'failed'), lab);
      const labNav = await p.goto(lab + 'chat.html', { waitUntil: 'load', timeout: 15000 }).then(async () => 'opened: ' + await p.title(), (e) => 'failed: ' + e.message.split('\n')[0].slice(0, 60));
      check('sw-leaves-lab', labOnline === '200/200' && labCached === 'none' && labOffline === 'failed' && /^failed/.test(labNav),
        `${labPath}: fetched online ${labOnline}, in the worker's cache: ${labCached}; offline: fetch ${labOffline}, page ${labNav}`);
    } catch (e) { check('offline-reload', false, e.message.split('\n')[0]); }
    finally { await cut(); await ctx.close(); }
  }

  async function finish() {
    check('no-page-errors', errors.page.length === 0, errors.page.join(' | ') || 'none');
    // the lock test's own refusals (example.org, by the page's policy) are expected; any other policy violation is a fault
    const relevant = errors.console.filter((e) => !/ERR_FAILED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_(?:REFUSED|RESET|CLOSED)/.test(e) && !/example\.org/.test(e));
    check('no-console-errors', relevant.length === 0, relevant.join(' | ') || (errors.console.length ? `${errors.console.length} from refused off-origin or offline requests, or the lock test, only` : 'none'));
    const failed = checks.filter((c) => !c.ok);
    const report = { url: URL, at: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks, measured, errors };
    if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(report, null, 1)); }
    console.log(`\n${report.passed} passed, ${report.failed} failed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
  }
})().catch(async (e) => { console.log('FATAL', e && e.stack || e); console.log(JSON.stringify({ checks, measured, errors }, null, 1)); process.exit(2); });
