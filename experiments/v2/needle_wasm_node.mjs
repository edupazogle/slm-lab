// needle3's WebAssembly engine, driven from Node exactly as a browser would drive it (no Python, no native lib).
// Proves the 688 KB engine + 35 MB model do structured extraction with nothing else installed.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url);
const WASM_DIR = process.env.NEEDLE_WASM_DIR ?? `${process.env.HOME}/.cache/slm-src/needle3-wasm/wasm`;
const CACT = process.argv[2];
const createNeedle = require(`${WASM_DIR}/needle.js`);
const M = await createNeedle({ locateFile: (p) => `${WASM_DIR}/${p}`, print: () => {}, printErr: () => {} });

const put = (s) => { const b = Buffer.from(s + '\0', 'utf8'); const p = M._malloc(b.length); M.HEAPU8.set(b, p); return p; };
const t0 = performance.now();
const model = readFileSync(CACT); const mp = M._malloc(model.length); M.HEAPU8.set(model, mp);
const rcLoad = M._needle_load(mp, BigInt(model.length)); M._free(mp);
const tLoad = performance.now() - t0;

const tools = JSON.stringify([{ name: 'claim', description: 'An insurance claim', parameters: { type: 'object', properties: {
  policy_number: { type: 'string', description: 'as written, e.g. AXA-77812' }, claimant: { type: 'string', description: 'name with title, as written' },
  incident_date: { type: 'string', description: 'ISO date' }, damage_type: { type: 'string', description: 'as written' }, amount: { type: 'number', description: 'euros' } },
  required: ['policy_number', 'claimant', 'incident_date', 'damage_type', 'amount'] } }]);
const sys = put('date: 2026-09-20 Sun; locale: en-GB'), tj = put(tools);
const rcInit = M._needle_init(sys, tj, 0);
console.log(JSON.stringify({ load_rc: rcLoad, load_ms: Math.round(tLoad), init_prefix_tokens: rcInit, model_mb: +(model.length / 1e6).toFixed(1) }));

const CAP = 1 << 16, out = M._malloc(CAP);
for (const q of [
  'Policy AXA-77812: Ms Elena Moreau, water damage in the kitchen on 15 September 2026, 4300 euros.',
  'Contrat FR4471200 : Madame Nadia Rousseau, un dégât des eaux le 22 septembre 2026, 3100 euros.',
]) {
  M._needle_reset();
  const qp = put(q); const t1 = performance.now();
  const n = M._needle_complete(qp, 256, out, CAP); const ms = performance.now() - t1; M._free(qp);
  const txt = M.UTF8ToString(out); let parsed = null; try { parsed = JSON.parse(txt); } catch {}
  console.log(JSON.stringify({ q: q.slice(0, 60), rc_tokens: n, ms: Math.round(ms), calls: parsed?.function_calls ?? null, confidence: parsed?.confidence ?? null, raw: parsed ? undefined : txt.slice(0, 200) }));
}
