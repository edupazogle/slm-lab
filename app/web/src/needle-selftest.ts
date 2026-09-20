// Self-test page for the needle3 specialist engine: loads it in THIS browser and extracts two claims
// (English and French). Results are shown and POSTed to /api/bench like every other measurement.
import { loadNeedle, needleExtract, type JsonSchemaObject } from './lib/needle/needle';
const el = document.getElementById('log')!; const out: string[] = [];
const log = (s: string) => { out.push(s); el.textContent = out.join('\n'); };
const schema: JsonSchemaObject = { type: 'object', properties: {
  policy_number: { type: 'string', description: 'as written, e.g. AXA-77812' }, claimant: { type: 'string', description: 'name with title, as written' },
  incident_date: { type: 'string', description: 'ISO date' }, damage_type: { type: 'string', description: 'as written' },
  amount: { type: 'number', description: 'euros' } }, required: ['policy_number', 'claimant', 'incident_date', 'damage_type', 'amount'] };
const CASES = [
  { lang: 'en', text: 'Policy AXA-77812: Ms Elena Moreau, water damage in the kitchen on 15 September 2026, 4300 euros.',
    want: { policy_number: 'AXA-77812', claimant: 'Ms Elena Moreau', incident_date: '2026-09-15', damage_type: 'water damage', amount: 4300 } },
  { lang: 'fr', text: 'Contrat FR4471200 : Madame Nadia Rousseau, un dégât des eaux le 22 septembre 2026, 3100 euros.',
    want: { policy_number: 'FR4471200', claimant: 'Madame Nadia Rousseau', incident_date: '2026-09-22', damage_type: 'dégât des eaux', amount: 3100 } },
];
(async () => {
  const result: any = { tag: new URLSearchParams(location.search).get('tag') ?? 'needle-selftest', engine: 'needle3-wasm',
    env: { userAgent: navigator.userAgent, crossOriginIsolated: self.crossOriginIsolated, isSecureContext: self.isSecureContext, cores: navigator.hardwareConcurrency }, runs: [] };
  try {
    let last = -1;
    const l = await loadNeedle((loaded, total, c) => { const p = Math.floor((100 * loaded) / total); if (p !== last && p % 20 === 0) { last = p; log(`model ${p}%${c ? ' (from cache)' : ''}`); } });
    result.load = l; log(`loaded in ${l.loadMs} ms (${(l.bytes / 1e6).toFixed(1)} MB${l.fromCache ? ', cached' : ''})`);
    for (const c of CASES) {
      const r = await needleExtract('claim', 'An insurance claim', schema, c.text, 'date: 2026-09-20 Sun');
      const f = (r.fields ?? {}) as Record<string, unknown>;
      const ok = Object.entries(c.want).filter(([k, v]) => String(f[k]).toLowerCase() === String(v).toLowerCase()).length;
      result.runs.push({ lang: c.lang, ms: r.ms, tokens: r.tokens, fieldsCorrect: ok, fieldsTotal: 5, withheld: r.withheld, confidence: r.confidence, fields: r.fields });
      log(`${c.lang}: ${ok}/5 fields correct in ${r.ms} ms · confidence ${r.confidence} · withheld=${r.withheld}\n   ${JSON.stringify(r.fields)}`);
    }
    result.ok = true;
  } catch (e: any) { result.ok = false; result.error = String(e?.message ?? e); log('ERROR ' + result.error); }
  try { await fetch('/api/bench', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }); } catch { /* offline is fine */ }
  document.title = result.ok ? 'NEEDLE DONE' : 'NEEDLE FAILED';
})();
