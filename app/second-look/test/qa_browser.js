#!/usr/bin/env node
/* QA round for the Second Look page in headless Chromium (Playwright): device check, the rules-only redactor, the model
   download, every decision widget on every example, the threshold, keyboard tabs, the 89-decision test, the redactor with
   the model, a .docx and an .xlsx upload, the pseudonymised .docx export, synthetic variants (repeatable by seed) and their
   .zip, the usage meter and its .csv, offline mode, the cached reload, and a reload with no connection (the service worker).
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
  const click = (sel) => page.$eval(sel, (e) => e.click());        // a DOM click: the fixed model bar may sit over the target
  const mapRows = () => page.$$eval('#anonMap tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
  const waitText = (sel, re, timeout = 60000) => page.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s).textContent), [sel, re.source], { timeout });
  const shot = async (name) => { if (args.shots) { fs.mkdirSync(args.shots, { recursive: true }); await page.screenshot({ path: path.join(args.shots, name + '.png'), fullPage: name === 'full' }); } };
  const download = async (sel) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), click(sel)]); return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) }; };
  const unzipNames = (buf) => { const out = []; let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--; let p = buf.readUInt32LE(e + 16); for (let k = 0; k < buf.readUInt16LE(e + 10); k++) { const nl = buf.readUInt16LE(p + 28); out.push(buf.slice(p + 46, p + 46 + nl).toString()); p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32); } return out; };

  // 1. the device check
  await page.goto(URL, { waitUntil: 'load' });
  await waitText('#capTitle', /Can run|lacks/, 15000);
  check('device-check', /Can run/.test(await text('#capTitle')), await text('#capTitle'));
  check('scripts-self-hosted', await page.evaluate(() => typeof ort === 'object' && [...document.scripts].some((s) => /vendor\/ort\.wasm\.min\.js$/.test(s.src))), 'ONNX Runtime from vendor/, not the CDN');

  // 2. the redactor with the rules alone (before any model), on the built-in sample letter
  await waitText('#anonMeta', /items replaced/);
  const rows0 = await mapRows(), orig0 = rows0.map((r) => r[1]).join('\n');
  const must0 = ['CLM-2026-004871', 'MOT-77-341902', 'Camille Dubois', '12 rue des Lilas', '69003 Lyon', 'FR-482-XZ', 'camille.dubois@example.fr', '+33 6 12 34 56 78', 'FR76 3000 6000 0112 3456 7890 189', '4242 4242 4242 4242', 'Thomas Leclerc', '03/07/1988', 'Sophie Marchand', '14 September 2026'];
  const miss0 = must0.filter((s) => !orig0.includes(s));
  check('redactor-rules-only', miss0.length === 0 && /Rules only/.test(await text('#anonMeta')), miss0.length ? 'missed: ' + miss0.join(', ') : `${rows0.length} placeholders; ` + await text('#anonMeta'));
  const out0 = await text('#anonOut');
  check('redactor-output-clean', !/Dubois|Leclerc|Marchand|example\.fr/.test(out0), out0.slice(0, 80).replace(/\n/g, ' '));

  // 3. the download, from the button in the model bar
  const t0 = Date.now(); await click('#dockBtn');
  await waitText('#dlText', /Models ready|Try the download again/, 240000);
  measured.download_s = +((Date.now() - t0) / 1000).toFixed(1);
  const cards = await page.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
  const dlTotal = await text('#dlTotal'), m = dlTotal.match(/^([\d.]+) MB \/ ([\d.]+) MB$/);
  check('models-download', /Models ready/.test(await text('#dlText')) && cards.every((c) => /^Ready/.test(c)) && m && m[1] === m[2], `${dlTotal} in ${measured.download_s} s; ` + cards.join(' | '));
  if (!/Models ready/.test(await text('#dlText'))) { await finish(); return; }
  check('model-bar-live', await page.$eval('#dock', (d) => d.dataset.live) === 'on' && (await page.$$eval('.dm[data-st="on"]', (e) => e.length)) === 3, await text('#dsTitle') + ' · ' + await text('#dsSub'));
  check('meter-warm-up', /\d+ calls · [\d,.k]+ tokens/.test(await text('#meterTotals')), await text('#meterTotals'));
  await shot('models-ready');

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
  await waitText('#testRun', /Ran 89 decisions/, 300000);
  measured.test_s = +((Date.now() - t1) / 1000).toFixed(1); measured.test = { button: await text('#testRun') };
  for (const k of ['legal', 'vuln', 'route']) {
    await click(`#testTabs [data-k="${k}"]`);
    measured.test[k] = await page.$$eval('#testStats .stat .n', (es) => es.map((e) => e.textContent.trim()));
  }
  const aucL = +measured.test.legal[0], aucV = +measured.test.vuln[0], acc = parseInt(measured.test.route[0], 10);
  check('test-89-decisions', aucL >= 0.95 && aucV >= 0.95 && acc >= 75 && /tokens · median/.test(measured.test.button), `legal AUC ${aucL}, vulnerable AUC ${aucV}, routing ${acc} %; ${measured.test.button}`);
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

  // 13. the cached reload: nothing downloaded the second time
  await page.reload({ waitUntil: 'load' }); await waitText('#capTitle', /Can run|lacks/, 15000);
  await page.waitForFunction(() => /cached/.test(document.querySelector('#dockBtnText').textContent), null, { timeout: 10000 }).catch(() => {});
  const label2 = await text('#dockBtnText');
  const t2 = Date.now(); await click('#dockBtn'); await waitText('#dlText', /Models ready|Try the download again/, 120000);
  measured.reload_s = +((Date.now() - t2) / 1000).toFixed(1);
  const cards2 = await page.$$eval('#modelCards [data-status]', (es) => es.map((e) => e.textContent.trim()));
  check('cached-reload', /cached/.test(label2) && cards2.every((c) => /loaded from this browser, nothing downloaded/.test(c)), `button "${label2}"; ${measured.reload_s} s; ` + cards2.join(' | '));

  // 14. a reload with no connection at all: the service worker serves the page, IndexedDB the models
  const swOn = await page.evaluate(async () => { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); return !!(r && r.active); });
  if (swOn) {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' }); await waitText('#capTitle', /Can run|lacks/, 15000);
    const t3 = Date.now(); await click('#dockBtn'); await waitText('#dlText', /Models ready|Try the download again/, 120000);
    measured.offline_reload_s = +((Date.now() - t3) / 1000).toFixed(1);
    await page.waitForFunction(() => document.querySelector('#out-route .trc-v'), null, { timeout: 60000 });
    check('offline-reload', /Models ready/.test(await text('#dlText')) && /offline/i.test(await text('#netText')), `page, scripts and fonts from the service worker, models from IndexedDB: ready in ${measured.offline_reload_s} s; route → ${await text('#out-route .trc-v')}`);
    await context.setOffline(false);
  } else check('offline-reload', false, 'no active service worker (served over plain http from a host other than localhost?)');
  await shot('full');
  await finish();

  async function finish() {
    check('no-page-errors', errors.page.length === 0, errors.page.join(' | ') || 'none');
    const relevant = errors.console.filter((e) => !/ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(e));
    check('no-console-errors', relevant.length === 0, relevant.join(' | ') || (errors.console.length ? `${errors.console.length} from refused off-origin or offline requests only` : 'none'));
    const failed = checks.filter((c) => !c.ok);
    const report = { url: URL, at: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks, measured, errors };
    if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(report, null, 1)); }
    console.log(`\n${report.passed} passed, ${report.failed} failed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
  }
})().catch(async (e) => { console.log('FATAL', e && e.stack || e); console.log(JSON.stringify({ checks, measured, errors }, null, 1)); process.exit(2); });
