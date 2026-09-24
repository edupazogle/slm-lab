# QA round — Second Look · TypeSafe

Run 2026-09-24 on the v8 page (the Claude Design v7 layout with the meter, the detector fixes and the offline shell) with `test/qa_browser.js` (Playwright 1.56.1, headless Chromium 141, Linux, WebAssembly single-threaded, no GPU) against two deployments of the same `index.html`: the GitHub Pages build (`build_pages.py` → `dist/`, served plainly on 127.0.0.1, where the service worker is allowed) and the artifact-like server (`serve_local.py`, the artifact host's CSP). The runner had no access to the CDNs or to Hugging Face (`--no-net`: every off-origin request refused), so `vendor/` held the npm packages of the same versions (onnxruntime-web 1.17.3, mammoth 1.12.3) and the runtime and model files were read back from the published artifact (the wasm's sha256 equals npm's). Every number below is from those runs; the report files stay in `qa/` (git-ignored). The same script runs in `.github/workflows/pages.yml` before every deploy, its report uploaded as the `qa-report` artifact.

**Result: 55 of 55 checks pass on the Pages build, 54 of 55 on the artifact-like server.**

## Checks

| Check | Pages build | Artifact-like | What was seen (Pages build) |
|---|---|---|---|
| `device-check` | pass | pass | ✓ Can run on this device |
| `scripts-self-hosted` | pass | pass | ONNX Runtime from vendor/, not the CDN |
| `redactor-rules-only` | pass | pass | 15 placeholders; 15 items replaced (2 id, 4 person, 2 date, 1 address, 1 postcode, 1 plate, 1 email, 1 phone, 1 iban, 1 card) in 28 ms. Rules only: download the models to let the model check unsure names. |
| `redactor-output-clean` | pass | pass | Claim reference: [ID_1] Policy number: [ID_2]  Dear Ms [PERSON_2],  Thank you fo |
| `models-download` | pass | pass | 58.9 MB / 58.9 MB in 3.3 s; Ready · downloaded and kept in this browser \| Ready · downloaded and kept in this browser \| Ready · downloaded and kept in this browser |
| `model-bar-live` | pass | pass | Tiny models on · 448 tokens · 0 bytes sent |
| `meter-warm-up` | pass | pass | 11 calls · 448 tokens · 544 ms · 0 requests |
| `widget-route-0` | pass | pass | Motor · 30 tokens · 31 ms (30.5 in the model) · 984 tok/s |
| `widget-route-1` | pass | pass | Home · 24 tokens · 33 ms (32.9 in the model) · 729 tok/s |
| `widget-route-2` | pass | pass | Health (label ✗) · 24 tokens · 32 ms (31.4 in the model) · 764 tok/s · answer Health differs from the label Travel: a model error, not a page fault |
| `widget-route-3` | pass | pass | Liability · 23 tokens · 60 ms (57.8 in the model) · 398 tok/s |
| `batch-route` | pass | pass | Motor (30 tok, 53 ms) · Home (24 tok, 47 ms) · Health (24 tok, 45 ms) · Liability (23 tok, 40 ms) |
| `widget-legal-0` | pass | pass | Yes · 40 tokens · 28 ms (27.1 in the model) · 1476 tok/s |
| `widget-legal-1` | pass | pass | No · 36 tokens · 20 ms (19.9 in the model) · 1809 tok/s |
| `widget-legal-2` | pass | pass | Yes · 44 tokens · 23 ms (22.6 in the model) · 1947 tok/s |
| `batch-legal` | pass | pass | Yes (40 tok, 21 ms) · No (36 tok, 20 ms) · Yes (44 tok, 22 ms) |
| `widget-vuln-0` | pass | pass | Yes · 45 tokens · 24 ms (23.9 in the model) · 1883 tok/s |
| `widget-vuln-1` | pass | pass | Yes · 43 tokens · 28 ms (28.1 in the model) · 1530 tok/s |
| `widget-vuln-2` | pass | pass | No · 45 tokens · 24 ms (23.3 in the model) · 1931 tok/s |
| `batch-vuln` | pass | pass | Yes (45 tok, 23 ms) · Yes (43 tok, 21 ms) · No (45 tok, 39 ms) |
| `widget-urgency-0` | pass | pass | 3.3 / 5 · 132 tokens · 63 ms (62.5 in the model) · 2112 tok/s |
| `widget-urgency-1` | pass | pass | 3.4 / 5 · 137 tokens · 71 ms (71 in the model) · 1930 tok/s |
| `widget-urgency-2` | pass | pass | 3.0 / 5 · 117 tokens · 56 ms (55 in the model) · 2127 tok/s |
| `batch-urgency` | pass | pass | 3.3 / 5 (132 tok, 64 ms) · 3.4 / 5 (137 tok, 66 ms) · 3.0 / 5 (117 tok, 66 ms) |
| `widget-guard-0` | pass | pass | Yes · 30 tokens · 17 ms (16.2 in the model) · 1852 tok/s |
| `widget-guard-1` | pass | pass | No · 27 tokens · 25 ms (25 in the model) · 1080 tok/s |
| `widget-guard-2` | pass | pass | Yes · 25 tokens · 14 ms (13.5 in the model) · 1852 tok/s |
| `batch-guard` | pass | pass | Yes (30 tok, 17 ms) · No (27 tok, 14 ms) · Yes (25 tok, 14 ms) |
| `widget-custom-0` | pass | pass | Yes · 32 tokens · 16 ms (16.2 in the model) · 1975 tok/s |
| `widget-custom-1` | pass | pass | Yes · 28 tokens · 30 ms (29.9 in the model) · 936 tok/s |
| `widget-custom-2` | pass | pass | Yes · 32 tokens · 20 ms (19.8 in the model) · 1616 tok/s |
| `batch-custom` | pass | pass | Yes (32 tok, 18 ms) · Yes (28 tok, 17 ms) · Yes (32 tok, 21 ms) |
| `widgets-label-agreement` | pass | pass | 15 of 16 labelled examples answered as labelled (the page's own routing figure is 79 %) |
| `widget-urgency-order` | pass | pass | 3.31 > 3.41 > 3.04 |
| `widget-decide-button` | pass | pass | legal re-run |
| `tabs-keyboard` | pass | pass | ArrowRight from legal → vuln |
| `threshold-slider` | pass | pass | p 0.795: at 0.95 → No · Normal queue; at 0.30 → Yes · Escalate to a senior handler |
| `test-89-decisions` | pass | pass | legal AUC 0.98, vulnerable AUC 0.98, routing 79 %; Ran 89 decisions in 2.1 s · 3,193 tokens · median 22.8 ms each |
| `test-case-table` | pass | pass | 30 rows |
| `redactor-fixed-cases` | pass | pass | 9 placeholders, NIR as [NIR_1], "Le" as [PERSON_4] vs [PERSON_3] |
| `redactor-model-meta` | pass | pass | 9 items replaced (1 id, 7 person, 1 nir) in 51 ms. The model checked 3 unsure names: 70 tokens, 48 ms in the model. |
| `experience-step-3` | pass | pass | Words read60in this tabItems replaced93 kinds of dataModel checks3unsure names judged · 70 tokensTime51 mson this processorBytes sent0no request made |
| `docx-upload` | pass | pass | 11 placeholders from sample-claim.docx |
| `docx-export` | pass | pass | sample-claim-pseudonymised.docx: 2378 bytes, 4 parts, placeholders inside, no original name |
| `xlsx-upload` | pass | pass | 10 placeholders from sample-claims.xlsx (shared strings, deflated) |
| `synthetic-variants` | pass | pass | 9 variants; same seed identical: true; other seed differs: true |
| `synthetic-zip` | pass | pass | synthetic-variants-seed-7.zip: 10 files |
| `usage-meter` | pass | pass | 148 calls · 5,730 tokens · 4.08 s · 0 requests; 105 calls · 4,640 tokens · median 21.7 ms · 1,773 tok/s \| 43 calls · 1,090 tokens · median 25.8 ms · 764 tok/s |
| `meter-in-model-bar` | pass | pass | 148 calls · 5,730 tok · 23 ms \| 105 calls · 4,640 tok · 22 ms \| 43 calls · 1,090 tok · 26 ms |
| `meter-csv` | pass | pass | second-look-usage.csv: 148 calls |
| `offline-run` | pass | pass | Network: offline · still working; 0 network requests since ready |
| `cached-reload` | pass | pass | button "Turn on · cached"; 1 s; Ready · loaded from this browser, nothing downloaded \| Ready · loaded from this browser, nothing downloaded \| Ready · loaded from this browser, nothing downloaded |
| `offline-reload` | pass | pass | page, scripts and fonts from the service worker, models from IndexedDB: ready in 2.6 s; route → Motor |
| `no-page-errors` | pass | pass | none |
| `no-console-errors` | pass | FAIL | none |

## Each decision widget, each example (Pages build)

The answer, whether it matches the example's label, the probability or score, the wall time of the decision, the time inside the model, the tokens the tokenizer produced, and the throughput. Mechanics are pass / fail; agreement with the label is measured and gated at 75 %.

| Widget | Example | Answer | As labelled | p / score | ms | ms in the model | Tokens in | tok/s |
|---|---|---|---|---|---|---|---|---|
| route | Rear-end collision | Motor | yes | 0.922 | 31 | 30.5 | 30 | 984 |
| route | Leak through the ceiling | Home | yes | 0.945 | 33 | 32.9 | 24 | 729 |
| route | Skiing accident abroad | Health | no | 0.773 | 32 | 31.4 | 24 | 764 |
| route | Dog bite | Liability | yes | 0.999 | 60 | 57.8 | 23 | 398 |
| legal | Deadline and solicitor | Yes | yes | 0.795 | 28 | 27.1 | 40 | 1,476 |
| legal | Polite status question | No | yes | 0.009 | 20 | 19.9 | 36 | 1,809 |
| legal | Ombudsman threat | Yes | yes | 0.855 | 23 | 22.6 | 44 | 1,947 |
| vuln | Bereavement | Yes | yes | 0.421 | 24 | 23.9 | 45 | 1,883 |
| vuln | Elderly, no heating | Yes | yes | 0.206 | 28 | 28.1 | 43 | 1,530 |
| vuln | Windscreen chip | No | yes | 0.022 | 24 | 23.3 | 45 | 1,931 |
| urgency | Roof open to the rain | 3.3 / 5 | – | 3.31 | 63 | 62.5 | 132 | 2,112 |
| urgency | Stolen passport abroad | 3.4 / 5 | – | 3.41 | 71 | 71 | 137 | 1,930 |
| urgency | Sofa stain | 3.0 / 5 | – | 3.04 | 56 | 55 | 117 | 2,127 |
| guard | Promises payment | Yes | yes | 0.659 | 17 | 16.2 | 30 | 1,852 |
| guard | Asks for photos | No | yes | 0.009 | 25 | 25 | 27 | 1,080 |
| guard | Promises an amount | Yes | yes | 0.794 | 14 | 13.5 | 25 | 1,852 |
| custom | Rental car | Yes | yes | 0.9 | 16 | 16.2 | 32 | 1,975 |
| custom | Work laptop | Yes | yes | 0.543 | 30 | 29.9 | 28 | 936 |
| custom | Two passengers | Yes | yes | 0.945 | 20 | 19.8 | 32 | 1,616 |

15 of 16 labelled examples answered as labelled. The one disagreement is the routing example "Skiing accident abroad", which the embedding model sends to Health (the hospital and the bill) rather than Travel: one of the six misrouted messages behind the page's own 79 % routing figure, a model limit, not a page fault.

## Timings and the meter (Pages build)

| | |
|---|---|
| Models downloaded and started (local server) | 3.3 s |
| Second visit, models from IndexedDB | 1 s |
| Reload with no connection (page from the service worker, models from IndexedDB) | 2.6 s to ready |
| The 89-decision test | 2.1 s; Ran 89 decisions in 2.1 s · 3,193 tokens · median 22.8 ms each |
| Legal flag | AUC 0.98, true cases average p 0.63, others 0.01 |
| Vulnerable flag | AUC 0.98, true cases average p 0.38, others 0.06 |
| Routing | 79 % right; 76 % straight through at p ≥ 0.60, 86 % of those right |
| Meter at the end of the run | 148 calls · 5,730 tokens · 4.08 s · 0 requests |
| xtremedistil-l6-h256 | 105 calls · 4,640 tokens · median 21.7 ms · 1,773 tok/s |
| all-MiniLM-L6-v2 | 43 calls · 1,090 tokens · median 25.8 ms · 764 tok/s |
| Model bar chips | 148 calls · 5,730 tok · 23 ms / 105 calls · 4,640 tok · 22 ms / 43 calls · 1,090 tok · 26 ms |

On the artifact-like server the one failure is the fonts: its CSP allows fonts from Google Fonts or `data:` only, so the self-hosted Source Sans Pro and Source Serif 4 are refused and the text falls back to the system sans. Everything else, the models, offline mode and the service worker included, passes there too. The GitHub Pages build is the deployment that carries the design.

## Run it

```bash
cd app/second-look && ./build.sh && python3 build_pages.py          # or copy ort/ and models/ from a previous build
python3 -m http.server 8792 --bind 127.0.0.1 --directory dist &     # the Pages build; python3 serve_local.py . 8791 for the artifact-like CSP
npm install --no-save playwright@1.56.1 && npx playwright install chromium
node test/qa_browser.js --url http://127.0.0.1:8792/ --out qa/report.json --shots qa
python3 test/qa_report_md.py qa/report.json [qa/report-artifact.json] > QA.md
```

A runner without CDN access adds `--no-net` (the page loads its scripts from `vendor/`, which `build.sh` fills); `test/sample-claim.docx` comes from `test/make_sample_docx.py` and `test/sample-claims.xlsx` from `test/make_sample_xlsx.py`. Exit code 0 means every check passed.
