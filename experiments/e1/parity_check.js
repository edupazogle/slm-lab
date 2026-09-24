// Parity check: run the page's OWN detector code (slm/app/second-look/index.html, from "personal data: detectors" up to
// `const norm`) under node on every document, and write what it predicts, so compare_parity.py can diff it against the
// Python port. Usage: node parity_check.js <data.jsonl> <out.jsonl> [extra_first_names.txt]
const fs = require('fs'), vm = require('vm'), path = require('path');
const [, , inp, out, extra] = process.argv;
if (!inp || !out) { console.error('usage: node parity_check.js <data.jsonl> <out.jsonl> [extra.txt]'); process.exit(2); }
const html = fs.readFileSync(path.join(__dirname, '../../app/second-look/index.html'), 'utf8');
const a = html.indexOf('/* ---------------- personal data: detectors ---------------- */');
const b = html.indexOf('const norm = (s)');
if (a < 0 || b < 0 || b < a) { console.error('detector block not found in the page'); process.exit(1); }
const ctx = { state: { ready: false } };
vm.createContext(ctx);
vm.runInContext(html.slice(a, b) + '\nthis.detect = detect; this.nameCandidates = nameCandidates; this.FIRST = FIRST;', ctx);
if (extra) for (const n of fs.readFileSync(extra, 'utf8').split(/\s+/).filter(Boolean)) ctx.FIRST.add(n);
const rows = fs.readFileSync(inp, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
if (!rows.length) { console.error('empty input'); process.exit(1); }
(async () => {
  const lines = [];
  for (const r of rows) {
    const { ents } = await ctx.detect(r.text, { useModel: false });
    const cands = ctx.nameCandidates(r.text);
    lines.push(JSON.stringify({ id: r.id, pred: ents.map((e) => [e.type, e.start, e.end]),
      cands: cands.map((c) => [c.start, c.end, c.why]) }));
  }
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`page code: FIRST ${ctx.FIRST.size} names; ${rows.length} documents -> ${out}`);
})();
