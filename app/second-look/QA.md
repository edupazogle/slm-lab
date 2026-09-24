# QA round — Second Look · TypeSafe

Run 2026-09-24 with `test/qa_browser.js` (Playwright 1.56.1, headless Chromium 141, Linux, WebAssembly single-threaded, no GPU) against two deployments of the same `index.html`: the GitHub Pages build (`build_pages.py` → `dist/`, served plainly) and the artifact-like server (`serve_local.py`, the artifact host's wrapper and CSP). The runner had no access to the CDNs, so the two CDN scripts were served from the npm packages of the same versions (onnxruntime-web 1.17.3, mammoth 1.12.3), and the runtime and model files were the ones read back from the published artifact (the wasm's sha256 equals npm's). Every number below is from those runs; the report files stay in `qa/` (git-ignored). The same script runs in `.github/workflows/pages.yml` before every deploy, its report uploaded as the `qa-report` artifact.

**Result: 39 of 39 checks pass on the Pages build, 39 of 39 on the artifact-like server.**

## Checks

| Check | Pages build | Artifact-like | What was seen (Pages build) |
|---|---|---|---|
| `device-check` | pass | pass | ✓ Can run on this device |
| `redactor-rules-only` | pass | pass | 11 placeholders; 12 items replaced (2 id, 1 date, 1 plate, 2 postcode, 2 person, 1 iban, 1 phone, 1 email, 1 address) in 31 ms. Rules only: download the models to let the model check unsure names. |
| `redactor-output-clean` | pass | pass | Dear Sir or Madam,  I am writing about claim number [ID_1] under policy [ID_2].  |
| `models-download` | pass | pass | 58.9 MB / 58.9 MB in 3.9 s; Ready · downloaded and kept in this browser \| Ready · downloaded and kept in this browser \| Ready · downloaded and kept in this browser |
| `meter-warm-up` | pass | pass | 11 model calls · 448 tokens · 403 ms |
| `widget-route-0` | pass | pass | Motor · 30 tokens · 28 ms (26.4 in the model) · 1136 tok/s |
| `widget-route-1` | pass | pass | Home · 24 tokens · 28 ms (26.5 in the model) · 906 tok/s |
| `widget-route-2` | pass | pass | Health (label ✗) · 24 tokens · 34 ms (32.3 in the model) · 743 tok/s · answer Health differs from the label Travel: a model error, not a page fault |
| `widget-route-3` | pass | pass | Liability · 23 tokens · 18 ms (17.6 in the model) · 1307 tok/s |
| `widget-legal-0` | pass | pass | Yes · 40 tokens · 32 ms (31.2 in the model) · 1282 tok/s |
| `widget-legal-1` | pass | pass | No · 36 tokens · 21 ms (20 in the model) · 1800 tok/s |
| `widget-legal-2` | pass | pass | Yes · 44 tokens · 25 ms (24.1 in the model) · 1826 tok/s |
| `widget-vuln-0` | pass | pass | Yes · 45 tokens · 29 ms (27.5 in the model) · 1636 tok/s |
| `widget-vuln-1` | pass | pass | Yes · 43 tokens · 18 ms (16.6 in the model) · 2590 tok/s |
| `widget-vuln-2` | pass | pass | No · 45 tokens · 16 ms (14.6 in the model) · 3082 tok/s |
| `widget-urgency-0` | pass | pass | 3.3 / 5 · 132 tokens · 50 ms (49 in the model) · 2694 tok/s |
| `widget-urgency-1` | pass | pass | 3.4 / 5 · 137 tokens · 45 ms (44.1 in the model) · 3107 tok/s |
| `widget-urgency-2` | pass | pass | 3.0 / 5 · 117 tokens · 44 ms (41.6 in the model) · 2813 tok/s |
| `widget-guard-0` | pass | pass | Yes · 30 tokens · 17 ms (15.7 in the model) · 1911 tok/s |
| `widget-guard-1` | pass | pass | No · 27 tokens · 11 ms (9.5 in the model) · 2842 tok/s |
| `widget-guard-2` | pass | pass | Yes · 25 tokens · 11 ms (9.6 in the model) · 2604 tok/s |
| `widget-custom-0` | pass | pass | Yes · 32 tokens · 13 ms (11.2 in the model) · 2857 tok/s |
| `widget-custom-1` | pass | pass | Yes · 28 tokens · 10 ms (9.2 in the model) · 3043 tok/s |
| `widget-custom-2` | pass | pass | Yes · 32 tokens · 12 ms (10.7 in the model) · 2991 tok/s |
| `widgets-label-agreement` | pass | pass | 15 of 16 labelled examples answered as labelled (the page's own routing figure is 79 %) |
| `widget-urgency-order` | pass | pass | 3.31 > 3.41 > 3.04 |
| `widget-decide-button` | pass | pass | legal re-run |
| `threshold-slider` | pass | pass | p 0.795: at 0.95 → Nop(yes) = 0.80 Normal queue; at 0.30 → Yesp(yes) = 0.80 Escalate to a senior handler |
| `test-89-decisions` | pass | pass | legal AUC 0.98, vulnerable AUC 0.98, routing 79 %; Ran 89 decisions in 1.4 s · 3,193 tokens · median 13.4 ms each |
| `test-case-table` | pass | pass | 30 rows |
| `redactor-fixed-cases` | pass | pass | 9 placeholders, NIR as [NIR_1], "Le" as [PERSON_4] vs [PERSON_3] |
| `redactor-model-meta` | pass | pass | 9 items replaced (1 id, 7 person, 1 nir) in 37 ms. The model checked 3 unsure names: 70 tokens, 31 ms in the model. |
| `docx-upload` | pass | pass | 11 placeholders from sample-claim.docx |
| `synthetic-variants` | pass | pass | 9 variants; same seed identical: true; other seed differs: true |
| `usage-meter` | pass | pass | 128 model calls · 4,799 tokens · 2.22 s; 128 calls through the runtime · 2.20 s inside the models \| 89 calls · 3,810 tokens · median 12.5 ms · 2,988 tok/s \| 39 calls · 989 tokens · median 18.2 ms · 1,065 tok/s |
| `offline-run` | pass | pass | Offline · still working; 0 requests since ready |
| `cached-reload` | pass | pass | 0.7 s; Ready · loaded from this browser, nothing downloaded \| Ready · loaded from this browser, nothing downloaded \| Ready · loaded from this browser, nothing downloaded |
| `no-page-errors` | pass | pass | none |
| `no-console-errors` | pass | pass | 2 from refused off-origin requests only |

## Each decision widget, each example (Pages build)

The answer, whether it matches the example's label, the probability or score, the wall time of the decision, the time inside the model, the tokens the tokenizer produced, and the throughput. Mechanics are pass / fail; agreement with the label is measured and gated at 75 %.

| Widget | Example | Answer | As labelled | p / score | ms | ms in the model | Tokens in | tok/s |
|---|---|---|---|---|---|---|---|---|
| route | Rear-end collision | Motor | yes | 0.922 | 28 | 26.4 | 30 | 1,136 |
| route | Leak through the ceiling | Home | yes | 0.945 | 28 | 26.5 | 24 | 906 |
| route | Skiing accident abroad | Health | no | 0.773 | 34 | 32.3 | 24 | 743 |
| route | Dog bite | Liability | yes | 0.999 | 18 | 17.6 | 23 | 1,307 |
| legal | Deadline and solicitor | Yes | yes | 0.795 | 32 | 31.2 | 40 | 1,282 |
| legal | Polite status question | No | yes | 0.009 | 21 | 20 | 36 | 1,800 |
| legal | Ombudsman threat | Yes | yes | 0.855 | 25 | 24.1 | 44 | 1,826 |
| vuln | Bereavement | Yes | yes | 0.421 | 29 | 27.5 | 45 | 1,636 |
| vuln | Elderly, no heating | Yes | yes | 0.206 | 18 | 16.6 | 43 | 2,590 |
| vuln | Windscreen chip | No | yes | 0.022 | 16 | 14.6 | 45 | 3,082 |
| urgency | Roof open to the rain | 3.3 / 5 | – | 3.31 | 50 | 49 | 132 | 2,694 |
| urgency | Stolen passport abroad | 3.4 / 5 | – | 3.41 | 45 | 44.1 | 137 | 3,107 |
| urgency | Sofa stain | 3.0 / 5 | – | 3.04 | 44 | 41.6 | 117 | 2,813 |
| guard | Promises payment | Yes | yes | 0.659 | 17 | 15.7 | 30 | 1,911 |
| guard | Asks for photos | No | yes | 0.009 | 11 | 9.5 | 27 | 2,842 |
| guard | Promises an amount | Yes | yes | 0.794 | 11 | 9.6 | 25 | 2,604 |
| custom | Rental car | Yes | yes | 0.9 | 13 | 11.2 | 32 | 2,857 |
| custom | Work laptop | Yes | yes | 0.543 | 10 | 9.2 | 28 | 3,043 |
| custom | Two passengers | Yes | yes | 0.945 | 12 | 10.7 | 32 | 2,991 |

15 of 16 labelled examples answered as labelled. The one disagreement is the routing example "Skiing accident abroad", which the embedding model sends to Health (the hospital and the bill) rather than Travel: one of the six misrouted messages behind the page's own 79 % routing figure, a model limit, not a page fault.

## Timings and the meter (Pages build)

| | |
|---|---|
| Models downloaded and started (local server) | 3.9 s |
| Second visit, models from IndexedDB | 0.7 s |
| The 89-decision test | 1.4 s; Ran 89 decisions in 1.4 s · 3,193 tokens · median 13.4 ms each |
| Legal flag | AUC 0.98, true cases average p 0.63, others 0.01 |
| Vulnerable flag | AUC 0.98, true cases average p 0.38, others 0.06 |
| Routing | 79 % right; 76 % straight through at p ≥ 0.60, 86 % of those right |
| Meter at the end of the run | 128 model calls · 4,799 tokens · 2.22 s |
| xtremedistil-l6-h256 | 89 calls · 3,810 tokens · median 12.5 ms · 2,988 tok/s |
| all-MiniLM-L6-v2 | 39 calls · 989 tokens · median 18.2 ms · 1,065 tok/s |

## Run it

```bash
cd app/second-look && ./build.sh && python3 build_pages.py          # or copy ort/ and models/ from a previous build
python3 -m http.server 8792 --bind 127.0.0.1 --directory dist &     # the Pages build; python3 serve_local.py . 8791 for the artifact-like CSP
npm install --no-save playwright@1.56.1 && npx playwright install chromium
node test/qa_browser.js --url http://127.0.0.1:8792/ --out qa/report.json --shots qa
python3 test/qa_report_md.py qa/report.json > QA.md
```

A runner without CDN access adds `--no-net` and points `ORT_JS` and `MAMMOTH_JS` at local copies of the two scripts; `test/sample-claim.docx` comes from `test/make_sample_docx.py`. Exit code 0 means every check passed.
