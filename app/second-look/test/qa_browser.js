#!/usr/bin/env node
/* QA round for the Second Look page in headless Chromium (Playwright): device check, the rules-only redactor, the model
   download, every decision widget on every example, the threshold, the 89-decision test, the redactor with the model,
   a .docx upload, synthetic variants (repeatable by seed), the usage meter, offline mode, and the cached reload.
   Usage: node test/qa_browser.js --url http://127.0.0.1:8792/ [--out qa/report.json] [--shots qa] [--docx test/sample-claim.docx] [--no-net]
   --no-net: the runner has no CDN access; the two CDN scripts are served from ORT_JS and MAMMOTH_JS and everything else off-origin is refused.
   Needs playwright (npm i -D playwright && npx playwright install chromium). Exit code 0 when every check passes. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const v = process.argv[i + 1]; if (v && !v.startsWith('--')) { args[a.slice(2)] = v; i++; } else args[a.slice(2)] = true; } }
const URL = args.url || 'http://127.0.0.1:8792/', DOCX = args.docx || path.join(__dirname, 'sample-claim.docx');
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (args['no-net']) await context.route('**/*', (route) => {
    const u = route.request().url();
    if (/ort\.wasm\.min\.js/.test(u) && process.env.ORT_JS) return route.fulfill({ path: process.env.ORT_JS, contentType: 'application/javascript' });
    if (/mammoth\.browser\.min\.js/.test(u) && process.env.MAMMOTH_JS) return route.fulfill({ path: process.env.MAMMOTH_JS, contentType: 'application/javascript' });
    return u.startsWith(URL) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.page.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => errors.failedRequests.push(r.url().slice(0, 120)));
  const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
  const mapRows = () => page.$$eval('#anonMap tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
  const waitText = (sel, re, timeout = 60000) => page.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s).textContent), [sel, re.source], { timeout });
  const shot = async (name) => { if (args.shots) { fs.mkdirSync(args.shots, { recursive: true }); await page.screenshot({ path: path.join(args.shots, name + '.png'), fullPage: name === 'full' }); } };

  // 1. the device check
  await page.goto(URL, { waitUntil: 'load' });
  await waitText('#capTitle', /Can run|lacks/, 15000);
  check('device-check', /Can run/.test(await text('#capTitle')), await text('#capTitle'));

  // 2. the redactor with the rules alone (before any model), on the built-in sample letter
  await waitText('#anonMeta', /items replaced/);
  const rows0 = await mapRows(), orig0 = rows0.map((r) => r[1]).join('\n');
  const must0 = ['CLM-2026-48213', 'AX-FR-7741902', 'FG-482-KL', 'Thomas Becker', 'FR76 3000 6000 0112 3456 7890 189', '+33 6 12 34 56 78', 'marie.lefebvre@example.com', '12 rue des Lilas', '69007 Lyon', 'Marie Lefebvre', '14 September 2026'];
  const miss0 = must0.filter((s) => !orig0.includes(s));
  check('redactor-rules-only', miss0.length === 0 && /Rules only/.test(await text('#anonMeta')), miss0.length ? 'missed: ' + miss0.join(', ') : `${rows0.length} placeholders; ` + await text('#anonMeta'));
  const out0 = await text('#anonOut');
  check('redactor-output-clean', !/Lefebvre|Becker|example\.com/.test(out0), out0.slice(0, 80).replace(/\n/g, ' '));

  // 3. the download
  const t0 = Date.now(); await page.click('#dlBtn');
  await waitText('#dlText', /Models ready|Try the download again/, 240000);
  measured.download_s = +((Date.now() - t0) / 1000).toFixed(1);
  const cards = await page.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
  const dlTotal = await text('#dlTotal'), m = dlTotal.match(/^([\d.]+) MB \/ ([\d.]+) MB$/);
  check('models-download', /Models ready/.test(await text('#dlText')) && cards.every((c) => /^Ready/.test(c)) && m && m[1] === m[2], `${dlTotal} in ${measured.download_s} s; ` + cards.join(' | '));
  if (!/Models ready/.test(await text('#dlText'))) { await finish(); return; }
  check('meter-warm-up', /\d+ model calls/.test(await text('#meterText')), await text('#meterText'));
  await shot('models-ready');

  // 4. every widget, every example, one at a time
  await page.waitForFunction(() => document.querySelector('#out-custom .big'), null, { timeout: 120000 });
  const widgets = await page.$$eval('.widget', (ws) => ws.map((w) => ({ id: w.id.slice(2), n: w.querySelectorAll('[data-ex]').length })));
  measured.widgets = {};
  for (const w of widgets) {
    for (let i = 0; i < w.n; i++) {
      const before = await text(`#out-${w.id} .json`), label = await text(`#w-${w.id} [data-ex="${i}"]`);
      await page.click(`#w-${w.id} [data-ex="${i}"]`);
      await page.waitForFunction(([id, b]) => document.querySelector(`#out-${id} .json`).textContent !== b, [w.id, before], { timeout: 60000 });
      const json = JSON.parse(await text(`#out-${w.id} .json`)), big = await text(`#out-${w.id} .big`), receipt = await page.$(`#out-${w.id} .receipt`);
      const u = json.usage || {};
      // mechanics are pass / fail; whether the small model agrees with the example's label is measured, and gated below
      let ok = !!receipt && u.calls >= 1 && u.tokens_in > 0 && u.ms_infer > 0 && json.ms >= 0, why = '', agree = null;
      if (!ok) why = 'no receipt or no usage measured';
      if (EXPECT[w.id]) { const exp = EXPECT[w.id][i]; agree = big.startsWith(exp); if (!agree) why = `answer ${big} differs from the label ${exp}: a model error, not a page fault`; }
      if (w.id === 'urgency' && !(json.score >= 1 && json.score <= 5)) { ok = false; why = 'score out of range'; }
      if (json.type === 'choice') { const ps = await page.$$eval(`#out-${w.id} .dist .v`, (es) => es.map((e) => +e.textContent)); if (ps.length !== 5 || Math.abs(ps.reduce((a, b) => a + b, 0) - 1) > 0.02) { ok = false; why = 'the five probabilities do not sum to 1'; } }
      (measured.widgets[w.id] ||= []).push({ example: i, label, answer: big, agrees_with_label: agree, p: json.p ?? json.score, ms: json.ms, tokens_in: u.tokens_in, ms_infer: u.ms_infer, tokens_per_s: u.tokens_per_s });
      check(`widget-${w.id}-${i}`, ok, `${big}${agree === false ? ' (label ✗)' : ''} · ${u.tokens_in} tokens · ${json.ms} ms (${u.ms_infer} in the model) · ${u.tokens_per_s} tok/s` + (why ? ' · ' + why : ''));
    }
  }
  const labelled = Object.values(measured.widgets).flat().filter((x) => x.agrees_with_label !== null), agreed = labelled.filter((x) => x.agrees_with_label).length;
  measured.label_agreement = { agreed, of: labelled.length };
  check('widgets-label-agreement', labelled.length && agreed / labelled.length >= 0.75, `${agreed} of ${labelled.length} labelled examples answered as labelled (the page's own routing figure is 79 %)`);
  const urg = measured.widgets.urgency || [];
  check('widget-urgency-order', urg.length === 3 && urg[0].p > urg[2].p, urg.map((x) => x.p).join(' > '));
  // the Decide button runs the current text again
  const b0 = await text('#out-legal .json'); await page.click('#w-legal [data-run]');
  await page.waitForFunction((b) => document.querySelector('#out-legal .json').textContent !== b, b0, { timeout: 30000 });
  check('widget-decide-button', true, 'legal re-run');

  // 5. the threshold slider changes the action without a new run
  await page.click('#w-legal [data-ex="0"]'); await page.waitForTimeout(300);
  const pLegal = JSON.parse(await text('#out-legal .json')).p;
  const setT = (v) => page.$eval('#t-legal', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await setT('0.95'); const hi = await text('#out-legal .answer'); await setT('0.30'); const lo = await text('#out-legal .answer');
  check('threshold-slider', /^No/.test(hi) && /Normal queue/.test(hi) && /^Yes/.test(lo) && pLegal < 0.95, `p ${pLegal}: at 0.95 → ${hi.replace(/\s+/g, ' ')}; at 0.30 → ${lo.replace(/\s+/g, ' ')}`);

  // 6. the telling test
  const t1 = Date.now(); await page.click('#testRun');
  await waitText('#testRun', /Ran 89 decisions/, 300000);
  measured.test_s = +((Date.now() - t1) / 1000).toFixed(1); measured.test = { button: await text('#testRun') };
  for (const k of ['legal', 'vuln', 'route']) {
    await page.click(`#testTabs [data-k="${k}"]`);
    measured.test[k] = await page.$$eval('#testStats .stat .n', (es) => es.map((e) => e.textContent.trim()));
  }
  const aucL = +measured.test.legal[0], aucV = +measured.test.vuln[0], acc = parseInt(measured.test.route[0], 10);
  check('test-89-decisions', aucL >= 0.95 && aucV >= 0.95 && acc >= 75 && /tokens · median/.test(measured.test.button), `legal AUC ${aucL}, vulnerable AUC ${aucV}, routing ${acc} %; ${measured.test.button}`);
  const caseRows = await page.$$eval('#caseTable tbody tr', (rs) => rs.map((r) => r.children.length));
  check('test-case-table', caseRows.length === 30 && caseRows.every((n) => n === 7), `${caseRows.length} rows`);
  await shot('test');

  // 7. the redactor with the model, on the cases the E1a follow-up fixed
  await page.fill('#anonIn', FIXED); await page.click('#anonRun');
  await waitText('#anonMeta', /model checked|No unsure/);
  const rows1 = await mapRows(), by = Object.fromEntries(rows1.map((r) => [r[1], r]));
  const want = [['Alexandrie-Claudine Martineau', 'context'], ['Jean-Pierre', 'context'], [NIR, 'pattern'], ['Albesjan Le Mao', 'greeting'], ['Le', 'title'], ['Édith Dupont', 'title'], ['Patrick-Xavier Lemoine', 'first name'], ['Sunanda Iasna Maffezzini Ryhiner Majidzadeh Kumar', 'sign-off']];
  const bad = want.filter(([t, why]) => !by[t] || by[t][2] !== why).map(([t]) => t);
  const nirRow = by[NIR], leRow = by['Le'], fullRow = by['Albesjan Le Mao'];
  check('redactor-fixed-cases', bad.length === 0 && nirRow && nirRow[0].startsWith('[NIR_') && leRow && fullRow && leRow[0] !== fullRow[0], bad.length ? 'wrong or missing: ' + bad.join(', ') : `${rows1.length} placeholders, NIR as ${nirRow && nirRow[0]}, "Le" as ${leRow && leRow[0]} vs ${fullRow && fullRow[0]}`);
  check('redactor-model-meta', /model checked \d+ unsure name/.test(await text('#anonMeta')) && /tokens, \d+ ms/.test(await text('#anonMeta')), await text('#anonMeta'));

  // 8. a Word file
  if (fs.existsSync(DOCX)) {
    await page.setInputFiles('#anonFile', DOCX);
    await page.waitForFunction(() => /Claire Fontaine/.test(document.querySelector('#anonIn').value), null, { timeout: 30000 });
    await waitText('#anonMeta', /items replaced/);
    const rows2 = await mapRows(), orig2 = rows2.map((r) => r[1]).join('\n');
    const must2 = ['CLM-2026-77120', 'AX-FR-5530018', 'GH-921-TR', 'Claire Fontaine', 'FR76 3000 6000 0112 3456 7890 189', '+33 6 98 76 54 32', 'paul.girard@example.com', '5 rue Pasteur', '33000 Bordeaux', 'Paul Girard', '3 September 2026'];
    const miss2 = must2.filter((s) => !orig2.includes(s));
    check('docx-upload', miss2.length === 0, miss2.length ? 'missed: ' + miss2.join(', ') : `${rows2.length} placeholders from ${path.basename(DOCX)}`);
  } else check('docx-upload', false, `no file at ${DOCX} (python3 test/make_sample_docx.py)`);

  // 9. synthetic variants: seeded and repeatable, no original name left
  await page.fill('#synSeed', '2026'); await page.click('#synRun'); await waitText('#synMeta', /documents generated/);
  const syn1 = await text('#synTable'), leaked = ['Marie Lefebvre', 'Thomas Becker', 'Sophie Wagner', 'Carlos Mendes', 'Jean-Pierre Martin', 'Lucas Garcia', 'Ana Garcia Lopez', 'marie.lefebvre'].filter((n) => syn1.includes(n));
  await page.click('#synRun'); await page.waitForTimeout(300); const syn2 = await text('#synTable');
  await page.fill('#synSeed', '7'); await page.click('#synRun'); await page.waitForTimeout(300); const syn3 = await text('#synTable');
  const nRows = await page.$$eval('#synTable tbody tr', (rs) => rs.length);
  check('synthetic-variants', nRows === 9 && leaked.length === 0 && syn1 === syn2 && syn3 !== syn1, `${nRows} variants; same seed identical: ${syn1 === syn2}; other seed differs: ${syn3 !== syn1}` + (leaked.length ? '; leaked ' + leaked.join(', ') : ''));

  // 10. the usage meter
  const meterRows = await page.$$eval('#meterTable tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
  const modelsSeen = new Set(meterRows.map((r) => r[3]));
  measured.meter = { pill: await text('#meterText'), totals: await text('#meterTotals'), cards: await page.$$eval('#modelCards [data-meter]', (es) => es.map((e) => e.textContent.trim())) };
  check('usage-meter', meterRows.length === 40 && modelsSeen.has('xtremedistil-l6-h256') && modelsSeen.has('all-MiniLM-L6-v2') && meterRows.every((r) => +r[5] > 0 && +r[9] > 0) && /model calls/.test(measured.meter.pill), `${measured.meter.pill}; ${measured.meter.cards.join(' | ')}`);
  await shot('meter');

  // 11. offline
  await context.setOffline(true);
  await waitText('#netText', /Offline/, 10000);
  const b1 = await text('#out-route .json'); await page.click('#w-route [data-run]');
  await page.waitForFunction((b) => document.querySelector('#out-route .json').textContent !== b, b1, { timeout: 30000 });
  check('offline-run', /computed offline/.test(await text('#offBanner')) && /^0 requests/.test(await text('#reqText')), `${await text('#netText')}; ${await text('#reqText')}`);
  await shot('offline');
  await context.setOffline(false);

  // 12. the cached reload: nothing downloaded the second time
  await page.reload({ waitUntil: 'load' }); await waitText('#capTitle', /Can run|lacks/, 15000);
  const t2 = Date.now(); await page.click('#dlBtn'); await waitText('#dlText', /Models ready|Try the download again/, 120000);
  measured.reload_s = +((Date.now() - t2) / 1000).toFixed(1);
  const cards2 = await page.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
  check('cached-reload', cards2.every((c) => /loaded from this browser, nothing downloaded/.test(c)), `${measured.reload_s} s; ` + cards2.join(' | '));
  await shot('full');
  await finish();

  async function finish() {
    check('no-page-errors', errors.page.length === 0, errors.page.join(' | ') || 'none');
    const relevant = errors.console.filter((e) => !/ERR_FAILED|ERR_INTERNET_DISCONNECTED|fonts\.g/.test(e));
    check('no-console-errors', relevant.length === 0, relevant.join(' | ') || (errors.console.length ? `${errors.console.length} from refused off-origin requests only` : 'none'));
    const failed = checks.filter((c) => !c.ok);
    const report = { url: URL, at: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks, measured, errors };
    if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(report, null, 1)); }
    console.log(`\n${report.passed} passed, ${report.failed} failed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
  }
})().catch(async (e) => { console.log('FATAL', e && e.stack || e); console.log(JSON.stringify({ checks, measured, errors }, null, 1)); process.exit(2); });
