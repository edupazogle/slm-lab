# SLM Lab — findings, phase 2

2026-09-21 · supervisor session · machine: Ryzen 7 7800X3D, RTX 4070 12 GB, WSL2 VM with **4 cores / 8 threads and
12 GB RAM** (not 8 cores, as phase 1 recorded), models read from ext4 unless stated.

Read this with two documents beside it: [`../critique/CRITIQUE.md`](../critique/CRITIQUE.md) — the adversarially
verified review of phase 1, which says what the earlier paper got wrong — and
[`../plan/EXPERIMENT-PLAN.md`](../plan/EXPERIMENT-PLAN.md), which says what is still untested and what the pass bar
for each test is. Phase 1's own paper is kept unedited at [`../phase1/FINDINGS.md`](../phase1/FINDINGS.md).

**Every number below is either produced by a script in this repo, with its output file named, or it is labelled as
not measured.** Where a number is provisional (machine under load), it says so.

## 1. What was measured

### 1.1 Fine-tuning needle3 does work — the opposite of phase 1's conclusion

Phase 1 reported 0.72 vs 0.72 for base against tuned on six cases and concluded "data, not tooling, is the
bottleneck". The critique found that eval compared the model against a *different tool schema* than it was trained
on, scored only delivered calls, and ran too few cases to see anything (C-03, C-13).

The redone experiment (`experiments/v2/`) uses 1,200 training rows and **240 held-out cases** (117 French, 123
English) generated from templates disjoint from the training templates, with every string label asserted to be a
verbatim span of its input, and it adds the control phase 1 lacked: **a 4-bit export of the untuned model**, so that
quantisation and fine-tuning are not changed at once.

| condition | tool accuracy | field micro-F1 | 95 % CI | exact | false call on off-topic | median ms |
| --- | --- | --- | --- | --- | --- | --- |
| base, 2-bit (as shipped) | 0.842 | 0.634 | [0.594, 0.675] | 0.317 | 0.109 | 221 |
| base, 4-bit (untuned control) | 0.846 | 0.703 | [0.675, 0.731] | 0.292 | 0.281 | 264 |
| **tuned, 4-bit (LoRA, rank 32)** | **0.942** | **0.879** | [0.852, 0.902] | 0.725 | **0.000** | 340 |

Paired bootstrap, with a system turn (the same picture without one):

- **Fine-tuning alone** (tuned − 4-bit control): field F1 **+0.176**, 95 % CI **[+0.141, +0.210]**; tool accuracy
  +0.096; exact +0.433; P(Δ ≤ 0) = 0.000.
- **Quantisation alone** (4-bit control − 2-bit shipped): field F1 +0.069 [+0.033, +0.106]. This is why phase 1
  could conclude nothing: it compared a 2-bit base with a 4-bit tuned model.
- Where the gain lands: French 0.58 → 0.91 field F1; incomplete-input handling 0.00 → 1.00; callbacks 0.58 → 0.98;
  French amount formats ("1 250,50 €") 0.56 → 0.87. Off-topic input stayed perfect in every condition.
- What did **not** improve: the `flag_for_review` slice is still the weakest (tool accuracy 0.65), and multi-call
  cases sit at 0.85.

**The cost of that accuracy.** Training took 9 min 37 s on the 4070 for 1,200 rows × 4 epochs. Our 4-bit export is
about **2.7× slower and 1.8× larger** than the shipped 2-bit artefact (0.46 → 1.63 s per case natively). Accuracy was
bought with latency and file size, which matters on a phone.

**The constraint that survives from phase 1** (and is now explained): fine-tuning removes the calibrated confidence
head, and the adapter is keyed to the exact tool-schema JSON it was trained with. So "fine-tune it" and "route on its
confidence" cannot be the same model — use the base model for the decision and the tuned one for the call.

Files: `experiments/v2/ft2_score.txt`, `ft2_report.json`, `ft2_pipeline.sh`, `ft2_eval_stage.sh`, `ft2_make_data.py`,
`ft2_score.py`.

### 1.2 Small models really do run in the browser, and the speed is what it is

The landing page's demo was run end to end in headless Chromium against the built site, cache cleared first:

- **SmolLM2-360M-Instruct Q8_0, 386.4 MB**, downloaded in ~14 s on this connection, 4 threads, no WebGPU.
- One grammar-constrained completion over a 144-token prompt: **116 tokens generated at 13.6 tokens/s**, prompt read
  at 22.2 tokens/s, whole run 15.0 s. Cached re-run: 12.8 tokens/s decode, 21.3 prefill, 15.9 s.
- **All six claim fields were extracted correctly** from a fictional claim note, including a French-style phone
  number and a date written as "14 September 2026".
- A separate benchmark run (`app/bench_results.jsonl`, tag `smoke2`) gives 29 prefill / 12.3 decode tokens/s for the
  same model with a 488-token prompt, engine timings and wall clock agreeing within 2 %.

Those numbers are **provisional**: the machine was running a GPU fine-tune and several agents at the time. They are a
floor, not a benchmark. For scale, published figures for native runtimes on a current phone are two orders of
magnitude better on prefill (LFM2.5-1.2B Q4_0: 335 prefill / 70 decode tokens/s on a Galaxy S25 Ultra), which is why
the WASM-vs-native comparison (E12) matters before anyone promises phone performance.

**Prompt processing, not generation, is the cost in WebAssembly.** At ~22–29 tokens/s of prefill, a 500-token prompt
costs about 20 seconds before the first word. Every skill in the app therefore uses a short system prompt, and long
documents belong on a server.

### 1.3 A phone on plain http does not run slowly — it does not run at all

Measured in Chromium 153 against a non-secure origin: `new Wllama()` **throws "No supported storage backend found"**,
because the OPFS backend needs `navigator.storage`, which a non-secure context does not expose. SharedArrayBuffer,
service workers and WebGPU are absent there too.

This corrects a claim this project had been repeating (in `app/serve.py` and in the app's own limits list) that such a
phone "still runs single-threaded". Both are fixed. The practical routes to a phone are HTTPS (a tunnel or a static
host) or `adb reverse` with `http://localhost`, which is a secure origin.

### 1.4 Android: the app builds, and it will always be single-threaded

- A debug APK builds on this machine: OpenJDK 21, Android SDK 35/36, AGP 8.13, Gradle 8.14.3, 93 tasks in 1 min 20 s.
  It contains the web app and **both** wasm builds (8.46 MB single-thread, 15.37 MB multi-thread).
- In the Android System WebView `crossOriginIsolated` is `false` and `SharedArrayBuffer` is undefined **even when
  COOP/COEP are served correctly** — a WebView limitation open since 2023 (Chromium issue 40914606), independently
  confirmed during this review. WebGPU is unavailable there as well.
- Consequence: the Capacitor app (Track A) is the **slowest** configuration we can ship. A Trusted Web Activity,
  which renders the same PWA in the user's Chrome, is the only Android packaging that keeps threads and WebGPU — it
  needs a public HTTPS origin, so it is an operator decision.

### 1.5 The privacy meter's blind spot, stated on the page

The landing page counts the network requests it makes and shows them beside the claim that nothing you type leaves
the device. The instrument has a real limit: **fetches made inside a Web Worker land on the worker's own performance
timeline**, and wllama downloads and runs models in a worker, so a main-thread count cannot see them. wllama exposes
no hook into its worker, so the page now says exactly what the counter sees and what it cannot, and invites the
reader to check DevTools → Network.

Verified against reality during the demo run: the page counted 11 requests (8 own origin, 3 huggingface.co); the
browser actually made 6 huggingface.co + 2 CDN requests, which are those same 3 redirect chains, plus one
worker-fetched `.wasm` the page cannot see. **Zero requests carried a body, and none contained the text typed into
the demo.**

## 2. What phase 1 got wrong

Twelve headline claims fall. In short: the confidence-calibration result was an off-by-one read of its own data file;
"the grounding gate works" rested on one suppressed call against four fabrications delivered live; the CPU speed
table measured a CPU-only build with n=1 and mmap over a 9p mount; "extraction is excellent" was two hand-written
inputs, while the vendor's own chart ranks needle3 below three 2025-era models on extraction benchmarks;
"anonymisation: yes" was one English email whose date of birth the schema could not even hold; and AnythingLLM was
reported as serving while the live instance answered `onboardingComplete: false` with no model attached.

What survives: the observed weaknesses (relative time, confident-but-wrong at 0.99, fabrication on sparse input), the
context-bleed lesson, "fine-tuning kills the confidence head", grammar-constrained output, and the discipline of
saving full response envelopes — without which none of this could have been audited. Details, evidence and status per
finding: [`../critique/CRITIQUE.md`](../critique/CRITIQUE.md) and `verified-findings.json`.

Security actions taken: the phase-1 AnythingLLM container (`--network host`, unauthenticated, plus an undocumented
`*:8888`) and the model server were **stopped**, with their state recorded in
`../critique/evidence/phase1-service-state-before.txt`. The LAN port-proxy the old SETUP.md recommended was never
applied. AnythingLLM returns only loopback-bound and password-protected (DECISIONS D6), and a review of its code
found that with `AUTH_TOKEN`/`JWT_SECRET` unset, `POST /api/system/generate-api-key` mints an **admin** key with no
authentication at all — so those variables are not optional.

## 3. What is still unproven

In-browser numbers on a quiet machine; anything at all on a real phone; anonymisation quality (E1); calibrated
triage (E2); the extraction bake-off against 2026 models (E4); French beyond the needle3 experiment; docling on
anything harder than a born-digital form (E7); retrieval quality (E9); the fleet watchdog classifier (E11); and every
claim about Copilot/MCP integration, which is desk research until something is deployed.

## 4. Instruments that were wrong before they were right

This is kept because the same class of error has now cost this project repeatedly: **if a failure looks identical to
success, the reading is worthless** (DECISIONS D5).

1. A first in-browser benchmark reported `decodeTokS: 0` and a **negative** time-to-first-token: it had measured a
   run that generated exactly one token. Fixed by forcing full-length generation; the negative TTFT was the tell.
2. A "hostile request refused" check in `serve.py` appeared to pass while the server was in fact crashing inside its
   own logging call. The guard was real only after the crash was fixed and each status code was asserted.
3. A background training job reported exit code 0 after CUDA had killed it. The pipeline now checks for the artifact
   of each stage and stops loudly when it is missing.
4. The v2 pipeline's predict stage crashed six times in a row (`int('base')`) because the data-generator module
   parsed `sys.argv` at import time — and the scorer then wrote a **well-formed report about nothing**:
   `{"n_eval": 240, "conditions": {}}`. A report whose emptiness is invisible is the same failure as #2. Fixed by
   confining argv parsing to `__main__` and by asserting each prediction file exists before scoring.
5. A needle smoke test in this session ran **without** `NEEDLE_TELEMETRY=0` and created
   `~/.cactus_needle/telemetry_id` at 01:44 — one usage event (function name, version, OS; no prompts). The pipeline
   scripts set the guard; the ad-hoc test did not. The guard belongs in the shell profile of the venv, not in each
   script.
6. `kill $!` killed a wrapper rather than the listener it started, and a stale server then answered a health check —
   nearly producing a false negative. Kill the pid that `ss -ltnp` shows.
7. Phase 1's own confound, restated because it is the cheapest lesson here: changing two variables at once
   (2-bit → 4-bit *and* untuned → tuned) makes every result uninterpretable. The control cost one extra 9-minute run.

## 5. Where the numbers live

| Claim | File |
| --- | --- |
| needle3 v2 conditions, CIs, slices | `experiments/v2/ft2_score.txt`, `ft2_report.json` |
| needle3 v2 raw predictions | `experiments/v2/ft2_pred_{base,base4bit,tuned}_{sys,nosys}.json` |
| Forensic: is the adapter applied? | `experiments/v2/ft_forensic_{base,tuned}.json` |
| In-browser benchmark runs | `app/bench_results.jsonl` |
| Landing demo, end to end | `app/qa/landing-demo-done.png`, `app/qa/landing-demo-mobile-stamped.png` |
| Chat app QA | `app/qa/chat-*.png` |
| Phase-1 service state before it was stopped | `critique/evidence/phase1-service-state-before.txt` |
| What the app is allowed to display | `app/web/src/data/findings.json` |
