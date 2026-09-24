# Second Look · TypeSafe — the in-browser decision page

Live on GitHub Pages: **https://edupazogle.github.io/slm-lab/** (repo https://github.com/edupazogle/slm-lab, deployed by
`.github/workflows/pages.yml`; `build.sh` fetches the runtime, the Word reader and the models at build time, `build_pages.py`
copies them into `dist/` beside the page).
Also published as a claude.ai artifact (private): https://claude.ai/artifact/5UwCN5TwCUBukmTjmfiSkh.
Written 2026-09-24 for the newsletter's "Second Look: TypeSafe" item.

What it is: typed decisions with a probability (TypeSafe Jev's idea) run on two small open models inside the browser,
offline once downloaded. No Jev call anywhere — the point is that the capability is a commodity.

| Part | What |
|---|---|
| Decisions | route a claim (choice, all-MiniLM-L6-v2 similarity to team descriptions), legal-threat flag, vulnerable-customer flag, urgency score, AI-reply guardrail, your own yes/no question (xtremedistil zero-shot NLI) |
| The telling test | 30 synthetic labelled messages: AUC, average probability on true vs false cases, a reliability plot and a threshold slider (straight-through rate vs errors) |
| Design | the Claude Design "Second Look v7" layout (BrowserLLM · "TinyLLM. Huge Possibilities."): floating sidebar, AXA blue on a soft ground, KPI cards, a four-step anonymiser in the hero, decision tabs, a black model bar pinned to the bottom that glows mint when the models are on, a guided first-visit tour. Headings in Publico Headline when the device has it installed, otherwise Source Serif 4 (OFL, shipped): Publico is a commercial face and is not published here. Body in Source Sans Pro (OFL, shipped) |
| Redactor | rules (email, phone, IBAN mod-97, card Luhn, French NIR, dates, addresses, postcodes, plates, policy/claim ids) + names (titles, greetings, sign-offs, relations, `Nom:` / `Name:` labels, a first-name list that also reads the first part of a hyphenated name; the model decides the unsure ones at p ≥ 0.8). Pseudonymisation, not anonymisation |
| Files | read in the tab: .docx (mammoth, with the page's own reader as fallback), .xlsx (every sheet, one row per line, cells tab-separated), .pptx, .txt/.md/.csv/.tsv/.json/.eml. The pseudonymised text saves as a .docx; the synthetic variants save as a .zip (one .txt per variant plus `variants.jsonl`) |
| Synthetic variants | upload files; every detected entity replaced by a same-format fake, consistent within a variant, gender from context, seeded |
| Meter | every model call timed and counted in the tab, the way a LiteLLM-style gateway logs an API call: a receipt under each result (model, tokens in, output, ms with the model's share, tok/s, calls, 0 requests / 0 bytes / €0), live counters in the model bar's chips (calls · tokens · median ms per model), a "Usage meter" section (totals, median and p95 in the model, tok/s, per-model cards with a latency sparkline) and a usage log (last 40 calls, copy as JSON lines, save every call as .csv, reset). Times are `performance.now()` around the tokenizer and around the model run |

Measured in the browser (ONNX Runtime Web 1.17.3, int8) on `test/cases.json`: legal flag AUC 0.98 (true cases average p 0.63,
others 0.01); vulnerable AUC 0.98 (0.38 / 0.06); routing 79 % right, at p ≥ 0.60 76 % straight through and 86 % of those right;
urgency rank correlation 0.44 (weak). Python ONNX Runtime gives routing 83 %: the int8 kernels differ slightly.

Offline, for real: the models (and the tokenizer's vocabulary) are kept in IndexedDB, and the page asks the browser to keep
them (`navigator.storage.persist()`); a service worker (`sw.js`) keeps the page, the two scripts (served from `vendor/`, with
the CDN as a fallback) and the fonts. So a second visit says "Turn on · cached" and starts in about a second, and a reload
with no connection at all still opens the page and starts the models. The page is installable (`manifest.webmanifest`).
Nothing on the page calls a third party once it is loaded: the Google Fonts request of the design is gone.

Build and test locally:

```bash
./build.sh                                  # fetches the runtime, the scripts and the models: ort/, vendor/, models/ (git-ignored)
python3 build_pages.py                      # dist/: the site as GitHub Pages serves it
python3 -m http.server 8792 --bind 127.0.0.1 --directory dist   # open http://127.0.0.1:8792/ (the service worker needs localhost or https)
python3 serve_local.py . 8791               # the same page behind an artifact-like CSP
```

Why base64: the artifact host serves `.wasm` and text types only (it refused `application/octet-stream`), so the model
weights ship as base64 `.txt` chunks under the 16 MB text limit (57 MB in total, under the 64 MB version limit) and the page
decodes them, checking the decoded byte count. The runtime fetches its `.wasm` through a wrapped `fetch` that returns the bytes
the page already downloaded (one download, cached in IndexedDB).

Verified live on GitHub Pages 2026-09-24 in headless Chromium: download + start 6.5 s, all widgets, offline mode with 0
requests, .docx upload. The claude.ai artifact copy was verified only behind an emulated CSP (Chrome was signed into another
organisation); if it fails at "Starting the models", that host is refusing WebAssembly.

Changed 2026-09-24, from E1a's parity run over 900 documents (`../../experiments/e1/REPORT.md`, addendum): `Nom:` / `Name:` /
`Prénom:` labels are a name cue; the name pattern and the place skip use a Unicode-aware boundary (JS `\b` is ASCII-only,
so "Édith" was never a candidate); the first part of a hyphenated given name is checked against the list; names of up to 6
words; a surname alone never takes a placeholder through a particle ("Le"); NIR is tried before CARD (a 15-digit NIR can
pass Luhn). Re-scored on those documents: FR leak rate 0.87 → 0.76, PERSON recall 0.32 → 0.42, NIR recall 0.82 → 0.92 on
the synthetic claims. Verified again after the change in headless Chromium behind the same CSP, with the runtime and model
files read back from the published artifact (the wasm's sha256 equals npm's onnxruntime-web 1.17.3 file): download, the six
decisions, the 89-decision test reproducing the numbers above, the redactor on each fixed case, synthetic variants, and
offline mode with 0 requests.

Licences: xtremedistil-l6-h256-zeroshot-v1.1-all-33 MIT (Moritz Laurer); all-MiniLM-L6-v2 Apache-2.0 (sentence-transformers,
ONNX by Xenova); ONNX Runtime Web MIT; mammoth.js BSD-2-Clause (loaded from cdnjs); UI patterns after LocalMode (MIT).

QA round (`test/qa_browser.js`, Playwright): the device check, the self-hosted scripts, the rules-only redactor, the download,
every decision widget on every example (mechanics pass / fail, label agreement measured) and each "Run all" table, keyboard
tabs, the threshold slider, the 89-decision test, the redactor with the model on the E1a cases, a .docx upload
(`test/sample-claim.docx`, from `test/make_sample_docx.py`) and the .docx export, an .xlsx upload (`test/sample-claims.xlsx`,
from `test/make_sample_xlsx.py`), synthetic variants (same seed, same output) and their .zip, the meter, its model-bar chips
and its .csv, offline mode, the cached reload and a reload with no connection: 55 checks. Results and how to run it: [`QA.md`](QA.md).
The Pages workflow runs it before every deploy and uploads the report as the `qa-report` artifact.

Reference numbers in Python (`test/`): `python3 -m venv v && v/bin/pip install onnxruntime tokenizers numpy`, put the two
models at `<dir>/models/xtremedistil/{vocab.txt,model_quantized.onnx}` and `<dir>/models/minilm/model_quantized.onnx`, copy
`cases.json` into `<dir>`, then `v/bin/python test/reference_numbers.py <dir>` (it imports `eval_models.py` from `test/`).

Changed 2026-09-24 (v8): the page now carries the Claude Design v7 layout (see Design above), rebuilt on this page's logic,
so the meter, the E1a detector fixes and the QA survive the redesign. A technical review of v7 found, and this version fixes:
the design read the models from the live site (`BASE` hard-coded) instead of beside the page; it loaded Google Fonts for two
faces it no longer used (a third-party request on a page that promises none); it shipped a commercial font file; the
runtime and Word reader came from CDNs, so the "works offline" claim broke on the first reload; the vocabulary was never
cached, so even a cached start needed the network; every visit offered the 57 MB download again; its detectors had lost the
`Prénom:` cue, the Unicode place boundary and the particle rule; and PLATE / POSTCODE matched across tabs and line breaks
(found on a spreadsheet, fixed in the page and the Python port, parity 0/900, `experiments/e1/REPORT.md` addendum 2). Also
added: .xlsx / .pptx / .csv reading, .docx export of the pseudonymised text, a .zip of the variants, the usage-meter section
and .csv, token counts in the "Run all" tables, arrow-key decision tabs, live regions for results, focus that follows the tour,
the right shortcut label per platform (⌘↵ / Ctrl ↵), and the install button.
