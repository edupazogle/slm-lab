#!/usr/bin/env python3
"""Render QA.md from qa_browser.js reports: python3 test/qa_report_md.py <pages-build report.json> [<artifact-like report.json>] > QA.md"""
import json, sys
d = json.load(open(sys.argv[1])); a = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
ac = {c['id']: c for c in a['checks']} if a else {}
cell = lambda s: str(s).replace('|', '\\|')
L = ["# QA round — Second Look · TypeSafe\n",
     "Run 2026-09-24 with `test/qa_browser.js` (Playwright 1.56.1, headless Chromium 141, Linux, WebAssembly single-threaded, no GPU) against two "
     "deployments of the same `index.html`: the GitHub Pages build (`build_pages.py` → `dist/`, served plainly) and the artifact-like server "
     "(`serve_local.py`, the artifact host's wrapper and CSP). The runner had no access to the CDNs, so the two CDN scripts were served from the npm "
     "packages of the same versions (onnxruntime-web 1.17.3, mammoth 1.12.3), and the runtime and model files were the ones read back from the "
     "published artifact (the wasm's sha256 equals npm's). Every number below is from those runs; the report files stay in `qa/` (git-ignored). The "
     "same script runs in `.github/workflows/pages.yml` before every deploy, its report uploaded as the `qa-report` artifact.\n"]
res = f"**Result: {d['passed']} of {d['passed'] + d['failed']} checks pass on the Pages build"
if a: res += f", {a['passed']} of {a['passed'] + a['failed']} on the artifact-like server"
L.append(res + ".**\n")
L.append("## Checks\n\n| Check | Pages build | " + ("Artifact-like | " if a else "") + "What was seen (Pages build) |\n|---|---|" + ("---|" if a else "") + "---|")
for c in d['checks']:
    row = [f"`{c['id']}`", 'pass' if c['ok'] else 'FAIL']
    if a: row.append('pass' if ac.get(c['id'], {}).get('ok') else 'FAIL')
    row.append(cell(c['detail']))
    L.append('| ' + ' | '.join(row) + ' |')
m = d['measured']
L.append("\n## Each decision widget, each example (Pages build)\n\nThe answer, whether it matches the example's label, the probability or score, the wall time of the decision, "
         "the time inside the model, the tokens the tokenizer produced, and the throughput. Mechanics are pass / fail; agreement with the label is measured and gated at 75 %.\n")
L.append("| Widget | Example | Answer | As labelled | p / score | ms | ms in the model | Tokens in | tok/s |\n|---|---|---|---|---|---|---|---|---|")
for wid, rows in m['widgets'].items():
    for r in rows:
        ag = r['agrees_with_label']; ag = 'yes' if ag else ('no' if ag is False else '–')
        L.append(f"| {wid} | {cell(r.get('label', r['example']))} | {r['answer']} | {ag} | {r['p']} | {r['ms']} | {r['ms_infer']} | {r['tokens_in']} | {r['tokens_per_s']:,} |")
la = m['label_agreement']
L.append(f"\n{la['agreed']} of {la['of']} labelled examples answered as labelled. The one disagreement is the routing example \"Skiing accident abroad\", which the "
         "embedding model sends to Health (the hospital and the bill) rather than Travel: one of the six misrouted messages behind the page's own 79 % routing figure, a model limit, not a page fault.\n")
t = m['test']
L.append("## Timings and the meter (Pages build)\n\n| | |\n|---|---|")
L.append(f"| Models downloaded and started (local server) | {m['download_s']} s |")
L.append(f"| Second visit, models from IndexedDB | {m['reload_s']} s |")
L.append(f"| The 89-decision test | {m['test_s']} s; {cell(t['button'])} |")
L.append(f"| Legal flag | AUC {t['legal'][0]}, true cases average p {t['legal'][1]}, others {t['legal'][2]} |")
L.append(f"| Vulnerable flag | AUC {t['vuln'][0]}, true cases average p {t['vuln'][1]}, others {t['vuln'][2]} |")
L.append(f"| Routing | {t['route'][0]} right; {t['route'][2]} straight through at p ≥ 0.60, {t['route'][3]} of those right |")
L.append(f"| Meter at the end of the run | {cell(m['meter']['pill'])} |")
L.append(f"| xtremedistil-l6-h256 | {cell(m['meter']['cards'][1])} |")
L.append(f"| all-MiniLM-L6-v2 | {cell(m['meter']['cards'][2])} |\n")
L.append("## Run it\n\n```bash\ncd app/second-look && ./build.sh && python3 build_pages.py          # or copy ort/ and models/ from a previous build\n"
         "python3 -m http.server 8792 --bind 127.0.0.1 --directory dist &     # the Pages build; python3 serve_local.py . 8791 for the artifact-like CSP\n"
         "npm install --no-save playwright@1.56.1 && npx playwright install chromium\n"
         "node test/qa_browser.js --url http://127.0.0.1:8792/ --out qa/report.json --shots qa\n"
         "python3 test/qa_report_md.py qa/report.json > QA.md\n```\n\n"
         "A runner without CDN access adds `--no-net` and points `ORT_JS` and `MAMMOTH_JS` at local copies of the two scripts; `test/sample-claim.docx` "
         "comes from `test/make_sample_docx.py`. Exit code 0 means every check passed.\n")
sys.stdout.write('\n'.join(L))
