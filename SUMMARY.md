# SLM Lab — summary

Written 2026-09-24 from the files themselves. The lab has not been touched since 2026-09-21; its files were committed
on 2026-09-23 (`80a5f87`, branch `feat/slm-lab`). Every number below comes from the lab's own documents and names its
source. Start with the lab's [`README.md`](README.md) for the reading order.

## Where it is and what it is

**Location:** `bizloop/slm/` in the main checkout. It is 1.1 GB on disk: git tracks 239 files, and model weights,
`node_modules`, build output and logs are git-ignored. It was moved here from the Valheim repo on 2026-09-21.

**What it is:** a lab for **small language models that run on the user's own device**: in the browser (wllama,
llama.cpp compiled to WebAssembly) and on Android. It has two jobs:
1. **A product prototype:** a landing page, an installable chat app (PWA) and an Android APK. They prove "AI that
   runs on this device" with a receipt and a network meter.
2. **An experiment programme:** measurements that decide where a small model earns a place in BizLoop. It is labelled
   as an *experiment track*, never a production claim.

## State at a glance

| | |
|---|---|
| Milestone | **M0 (foundations) done** 2026-09-21. **M1 (measured) not started**: quiet-machine timings, remaining experiments, APK on the operator's phone |
| Built and verified in a browser | Landing page with a live demo, chat PWA, benchmark page, Android debug APK (Capacitor) |
| Measured | The needle3 fine-tune (solid, n = 240, with confidence intervals). In-browser speed (**provisional**: the machine was busy) |
| Not measured yet | Anything on a real phone, anonymisation quality, triage calibration, extraction bake-off, French beyond needle3, OCR, retrieval, the watchdog classifier |
| Running now | Nothing: both `serve.pid` files point at dead processes |
| Waiting on the operator | 5 open questions (end of this file) |

## What is inside

| Folder | Size | What it holds |
|---|---|---|
| `prd/` | 44 K | `PRD.md`: the product (landing, chat PWA, Android, optional server tier, needle3 track), requirements, architecture, milestones, risks. `DECISIONS.md`: decisions D1–D7 with their evidence |
| `findings/` | 20 K | `FINDINGS-v2.md`: what was measured, what phase 1 got wrong, what is still unproven, and the instruments that were wrong before they were right |
| `critique/` | 372 K | `CRITIQUE.md`: an adversarial review of phase 1 (80 raw findings → 26 merged: 21 confirmed, 5 confirmed but overstated, 0 refuted), plus the evidence of the services that were stopped |
| `plan/` | 28 K | `EXPERIMENT-PLAN.md`: experiments E1–E14, each with a dataset, a metric, a pass bar written before the run, and a "kill rule" (the cheaper baseline that ends the idea if it wins) |
| `research/` | 1.1 M | `repos/`: 17 dossiers on open-source repos (licence, what can be lifted, red flags). `models/slm_models.json`: a **59-model catalog** (params, GGUF size, licence, languages, phone suitability, wllama compatibility). `landscape/`: landscape 2026, BizLoop applications, and feasibility reports (web, Android, AnythingLLM), plus anonymisation / synthetic data / docling / fine-tuning |
| `app/` | 584 M | `web/`: Vite + React + TS, three pages (landing, chat, bench) + a needle3 self-test. `android-shell/`: the Capacitor wrapper. `serve.py`: a loopback server that sets the COOP/COEP headers multi-threaded WASM needs. `THIRD_PARTY/`: provenance and licences of lifted code. `qa/`: screenshots. `bench_results.jsonl`, `BUILD-SPEC.md` |
| `experiments/v2/` | 155 M | The needle3 fine-tune redo: data generator, training + eval pipelines, predictions, scores, adapters and `.cact` models |
| `phase1/` | 300 M | The original phase-1 paper and experiments, kept unedited. Read it with the critique beside it |

## What was built

- **Landing page:** one promise ("AI that runs on this device"). A live demo downloads a 386 MB model into the browser
  and fills in a claim form from a fictional claim note, while a **"your copy" meter** counts the page's real network
  requests. It also has a strengths / weaknesses section and a "measured, not promised" table read from
  `app/web/src/data/findings.json`, where `null` shows as "not measured yet".
- **Chat app (PWA):**
  - A model shelf sized for phone, laptop and desktop.
  - A capability panel (threads, WebGPU, memory).
  - Streaming chat with a **receipt under every answer**: model, where it ran, tokens, speed, network requests,
    cost 0.0000 EUR.
  - Four business **skills**, each with a JSON schema and grammar-constrained output: *pull claim fields*,
    *anonymise*, *triage a claim* and *synthetic claims*.
- **Android:** a debug APK builds on this machine (Track A, a Capacitor shell around the PWA). Track B, a fork of
  `anythingllm-mobile` with native llama.cpp, is planned but not started.
- **Run it:** `cd slm/app/web && npm install && npm run build`, then `python3 ../serve.py --port 8097 --dir dist` →
  http://127.0.0.1:8097/ (the full commands, including Android, are in [`README.md`](README.md)).

## What was measured (source: `findings/FINDINGS-v2.md`)

1. **Fine-tuning needle3 works.** This reverses phase 1's conclusion. On 240 held-out cases (117 FR / 123 EN), with a
   4-bit untuned control so that quantisation and tuning are not changed at once:

   | condition | tool accuracy | field micro-F1 [95 % CI] | false call on off-topic | median ms |
   |---|---|---|---|---|
   | base, 2-bit (as shipped) | 0.842 | 0.634 [0.594, 0.675] | 0.109 | 221 |
   | base, 4-bit (control) | 0.846 | 0.703 [0.675, 0.731] | 0.281 | 264 |
   | **tuned, 4-bit (LoRA r32)** | **0.942** | **0.879** [0.852, 0.902] | **0.000** | 340 |

   - Tuning alone adds **+0.176 field F1 [+0.141, +0.210]**. French goes 0.58 → 0.91.
   - The price: the tuned export is ~2.7× slower and 1.8× larger than the shipped model. Tuning also removes the
     calibrated confidence score, so the same model cannot both be tuned and route on its confidence.
   - Training took 9 min 37 s on the RTX 4070. Files: `experiments/v2/ft2_score.txt`, `ft2_report.json`.
2. **Small models do run in the browser.** SmolLM2-360M (386 MB) reads the prompt at ~22–29 tokens/s and generates at
   ~12–14 tokens/s, and extracted all 6 claim fields correctly in the demo.
   - These numbers are **provisional**: a GPU fine-tune was running at the same time.
   - The real cost is prompt reading: a 500-token prompt takes ~20 s before the first word, so prompts must stay short.
   - For comparison, published native figures on a flagship phone are about 100× faster at prompt reading.
3. **On plain http the model does not load at all.** It does not merely run slower: `new Wllama()` throws "No supported
   storage backend found". A phone needs HTTPS or `adb reverse` + localhost.
4. **In the Android WebView (Track A) it is always single-threaded**, with no WebGPU. That is a WebView limit (Chromium
   issue 40914606). Track A is therefore the slowest thing the lab can ship. A Trusted Web Activity would keep threads
   but needs a public HTTPS origin.
5. **The privacy meter has a blind spot**, and the page now says so: it cannot see requests made inside the model's
   Web Worker. Checked against the browser's own log: zero requests carried a body, and none contained typed text.

## What phase 1 got wrong (source: `critique/CRITIQUE.md`)

Twelve headline claims fell:
- **Confidence tracking:** the calibration result was an off-by-one misread of its own data file.
- **"The grounding gate works":** that rested on one suppressed call, while four fabricating calls went through live.
- **The CPU speed table** was a setup artefact: no GPU build, n = 1, files read over a 9p mount.
- **"Anonymisation: yes"** came from one English email.
- **The fine-tune "no effect"** came from comparing against a different tool schema, with only 6 cases.
- **Security:** AnythingLLM was left unauthenticated on every network interface. It was **stopped on 2026-09-21**; the
  suggested LAN port-proxy was never applied.

What survived: the observed weaknesses (relative dates, confident-but-wrong answers, fabrication on sparse input),
"fine-tuning kills the confidence head", grammar-constrained output, and the habit of saving full responses.

## The seven decisions (source: `prd/DECISIONS.md`)

| # | Decision |
|---|---|
| D1 | Do not fork AnythingLLM (its inference is server-only). Build a Vite/React/TS PWA around wllama, with an optional **stock** AnythingLLM server beside it for RAG, tools and big models |
| D2 | Base on wllama's own reference app (MIT) plus named, attributed code lifts. No AGPL code and no unlicensed repos |
| D3 | Android on two tracks: A = Capacitor shell now, B = native `anythingllm-mobile` fork later |
| D4 | needle3 (a tool-calling / extraction specialist with its own engine) is a separate measured track, not a chat model |
| D5 | Every number is measured, with its instrument checked first; `null` means "not measured yet" |
| D6 | Loopback by default: nothing unauthenticated on the LAN |
| D7 | The lab lives in the BizLoop repo under `slm/` |

## The experiments (source: `plan/EXPERIMENT-PLAN.md`)

| Id | What it tests | Status |
|---|---|---|
| E1 | **On-device anonymisation / pseudonymisation gate** before text reaches partners (highest value) | not run |
| E2 | Confidence-gated claims triage (act / confirm / refuse) | not run |
| E3 | needle3 fine-tune v2 | **measured** (table above) |
| E4 | Structured-extraction bake-off against 2025–26 small models | not run |
| E5 | Throughput done properly (CPU, GPU, browser, phone) | provisional browser numbers only |
| E6 | French stress test | partly (the French slice of E3) |
| E7 | Document understanding: docling → small extractor, including scanned pages | not run |
| E8 | Synthetic claims for testing AI systems | not run |
| E9 | Retrieval for document Q&A (embedders) | not run |
| E10 | needle3 in the browser (WASM) vs native | not run (engine wrapper exists) |
| E11 | **Local watchdog classifier for the agent fleet** (garbled / idle / waiting, zero token cost), ranked to run first | not run |
| E12 | WASM (Track A) vs native (Track B) on the same phone | not run (needs the operator's phone) |
| E13 | Claim extraction for the review digest (demote-only) — run first | not run |
| E14 | Half-day spike: a self-hosted small model as an ordinary `config/models.yaml` binding (E1 and E13 need it) | not run |

**Planned order:** week 1 = finish E3, E5 on a quiet machine, the E14 spike and the E11 dataset. Then E11 decided → E1
baselines → E13 → E2 / E6 → E4, E8, E10 → E7, E9, E12.

## How it connects to BizLoop

Source: `prd/PRD.md` §8 and `research/landscape/bizloop-applications.md`.
- **Role:** a proposed sixth, **experiment-only `edge` model role**, bound to nothing in production.
- **Most valuable candidate:** the **pseudonymisation gate** (E1). If it passes, it becomes a proposal for the tenant's
  egress path. That is data minimisation, **not** a GDPR exit: pseudonymised data is still personal data (EDPB
  Opinion 28/2024).
- **Where it would run:** cloud Copilot cannot call a model on a laptop, so a small model that serves BizLoop would sit
  **behind an MCP service inside the EU perimeter**. On-device inference stays for BizLoop's own client surfaces and
  as the lab bench.
- **Limits:** small models (≤ 4 B) are weak at tool calling — about 51 % vs 78 % for a frontier model on the Berkeley
  leaderboard, and multi-turn collapses — so every skill is single-turn and schema-constrained.
- **Related work outside `slm/`:**
  - `gateway/services/edge_redact.py`, the catalogue's C3 redaction service. It is deterministic regex with **no
    model**.
  - The portal plan's on-device voice input, ruling RP9: Whisper in a Web Worker, so audio never leaves the browser.
  - `docs/refactor/03-EVIDENCE-v2.md` 2.11: the phone-speed yardstick is AMBER, allowed only with "LiquidAI's number,
    not ours".

## Open questions for the operator (source: `prd/PRD.md` §11)

1. **Hosting:** publish the PWA on a static HTTPS host (for example Cloudflare Pages) so phones get threads?
2. **Track B:** fork `anythingllm-mobile` now, or wait for E12's WASM-vs-native numbers?
3. **Language:** make French the default UI language for the pilot?
4. **E1 dataset:** should a teammate review the 60 hand-built French claim narratives (NIR / IBAN / plates) for
   realism?
5. **Server tier:** restart AnythingLLM now (loopback-only, password-protected), or only when document Q&A and
   "ask a bigger model" are built?

## Caveats worth knowing

- The in-browser numbers are a floor, not a benchmark. Nothing has run on a real phone yet.
- The lab has been idle for three days. Its milestone M1 depends on a quiet machine and the operator's phone.
- A tuned needle3 model is tied to the exact tool-schema JSON it was trained with.
- Model licences are policed: no non-commercial models; Gemma, Llama and LFM are shown only with their restrictions
  visible.
- Always export `NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1` before running needle. An ad-hoc test without it once created a
  telemetry id.

## Added 2026-09-24

`app/second-look/` — the newsletter's "Second Look: TypeSafe" page: typed decisions with a probability on two small open
models in the browser, offline (claim routing, legal and vulnerable-customer flags, urgency, an AI-reply guardrail, your own
yes/no question), a calibration test on 30 labelled messages, a document redactor and synthetic claim variants from Word files.
Published as https://claude.ai/artifact/5UwCN5TwCUBukmTjmfiSkh. See its README for the measured numbers and how to rebuild.
Later the same day the six redactor defects E1a's parity run found were fixed in the page and its Python port, re-scored on
the 900 documents (`experiments/e1/results_v2.json`: FR leak rate 0.87 → 0.76, PERSON recall 0.32 → 0.42, NIR recall 0.82 →
0.92 on the synthetic claims; parity still 0/900), and the artifact republished.
