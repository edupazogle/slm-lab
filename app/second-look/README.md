# Second Look · TypeSafe — the in-browser decision page

Published as a claude.ai artifact: https://claude.ai/artifact/5UwCN5TwCUBukmTjmfiSkh (private until shared from its Share menu).
Written 2026-09-24 for the newsletter's "Second Look: TypeSafe" item.

What it is: typed decisions with a probability (TypeSafe Jev's idea) run on two small open models inside the browser,
offline once downloaded. No Jev call anywhere — the point is that the capability is a commodity.

| Part | What |
|---|---|
| Decisions | route a claim (choice, all-MiniLM-L6-v2 similarity to team descriptions), legal-threat flag, vulnerable-customer flag, urgency score, AI-reply guardrail, your own yes/no question (xtremedistil zero-shot NLI) |
| The telling test | 30 synthetic labelled messages: AUC, average probability on true vs false cases, a reliability plot and a threshold slider (straight-through rate vs errors) |
| Redactor | rules (email, phone, IBAN mod-97, card Luhn, French NIR, dates, addresses, postcodes, plates, policy/claim ids) + names (titles, greetings, sign-offs, relations, `Nom:` / `Name:` labels, a first-name list that also reads the first part of a hyphenated name; the model decides the unsure ones at p ≥ 0.8). Pseudonymisation, not anonymisation |
| Synthetic variants | upload .docx/.txt; every detected entity replaced by a same-format fake, consistent within a variant, gender from context, seeded |

Measured in the browser (ONNX Runtime Web 1.17.3, int8) on `test/cases.json`: legal flag AUC 0.98 (true cases average p 0.63,
others 0.01); vulnerable AUC 0.98 (0.38 / 0.06); routing 79 % right, at p ≥ 0.60 76 % straight through and 86 % of those right;
urgency rank correlation 0.44 (weak). Python ONNX Runtime gives routing 83 %: the int8 kernels differ slightly.

Build and test locally:

```bash
./build.sh                                  # fetches the runtime + models, writes ort/ and models/ (git-ignored)
python3 serve_local.py . 8791               # serves index.html wrapped like the artifact, with an artifact-like CSP
# open http://127.0.0.1:8791/ , download, switch the network off, run things
```

Why base64: the artifact host serves `.wasm` and text types only (it refused `application/octet-stream`), so the model
weights ship as base64 `.txt` chunks under the 16 MB text limit (57 MB in total, under the 64 MB version limit) and the page
decodes them, checking the decoded byte count. The runtime fetches its `.wasm` through a wrapped `fetch` that returns the bytes
the page already downloaded (one download, cached in IndexedDB).

Not verified on the live host by the author: the Chrome available to the session was signed into another claude.ai
organisation. Verified end to end in headless Chromium behind an emulated CSP (download, all widgets, offline mode with 0
requests, .docx upload). If the live page fails at "Starting the models", the host's CSP is refusing WebAssembly.

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

Reference numbers in Python (`test/`): `python3 -m venv v && v/bin/pip install onnxruntime tokenizers numpy`, put the two
models at `<dir>/models/xtremedistil/{vocab.txt,model_quantized.onnx}` and `<dir>/models/minilm/model_quantized.onnx`, copy
`cases.json` into `<dir>`, then `v/bin/python test/reference_numbers.py <dir>` (it imports `eval_models.py` from `test/`).
