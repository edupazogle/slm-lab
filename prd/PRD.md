# SLM Lab — product requirements (v1)

2026-09-21 · supervisor session · status: **draft for the operator's review**

Companion documents: [`DECISIONS.md`](DECISIONS.md) (why each choice was made, with evidence) ·
[`../plan/EXPERIMENT-PLAN.md`](../plan/EXPERIMENT-PLAN.md) (what we test, with pass bars) ·
[`../critique/CRITIQUE.md`](../critique/CRITIQUE.md) (what phase 1 got wrong) ·
[`../findings/FINDINGS-v2.md`](../findings/FINDINGS-v2.md) (what has been measured) ·
[`../research/`](../research/) (17 repo dossiers, the model catalog, landscape and feasibility reports) ·
the BizLoop refactor PRDs in [`../../docs/copilot-experience/`](../../docs/copilot-experience/) and
[`../../docs/refactor/mvp_bizloop_refactor/`](../../docs/refactor/mvp_bizloop_refactor/).

Priority tags follow the Experience PRD v2: **P0** = in this release, **P1** = next, **P2** = later.

## 1. Summary

SLM Lab is a premium chat product that runs small language models **on the user's own device** — in the browser
through WebAssembly (wllama, llama.cpp compiled to WASM) and on Android — plus the experiment programme that decides
where such models earn a place in BizLoop.

It ships as three things that share one codebase:

1. **A landing page** that proves the promise on the spot: a live demo fills in a claim form with a 386 MB model
   running in the visitor's browser, while a meter built from the page's real network requests shows that nothing
   the visitor typed left the device.
2. **An installable chat app (PWA)** with a model shelf sized for phones, laptops and desktops, four business
   "skills" (pull claim fields, anonymise, triage a claim, generate synthetic claims), and a **receipt** under every
   answer: which model, where it ran, tokens, speed, network requests during generation, cost.
3. **An Android app**, first as a Capacitor shell around the same PWA (Track A, built), later as a native-speed fork
   of Mintplex-Labs/anythingllm-mobile (Track B).

Inside the BizLoop × Copilot refactor, SLM Lab is an **experiment track**, labelled as such and never mixed with
production claims (Experience PRD v2 §1, "Experiments"). Its job is to answer, with measurements, three questions the
refactor keeps asking: *where does my data go?* (Experience PRD v2 §8, trust scenes), *what did this cost?* (§7, a
cost line on every skill run), and *can a small model do this part of the job?* (Implementation PRD v2 §5, "small
model first, escalate on rejection").

## 2. Why this, why now

**First, what the SLM case is *not*.** The refactor already solves residency on the server: supervisor and PM run on
Azure OpenAI GPT-5.x Data Zone Standard (EU) (Implementation PRD v2 D3) and the target architecture labels the
partners "Partner SaaS EU" (§4). "We need a small model for residency" is therefore mostly false, and this PRD does
not argue it. What is left for on-device models is narrower and real: **data minimisation** before partners,
experiment providers and trace stores; **zero-marginal-cost checks** that can run on every event; and **inputs that
start on the user's device** and never have to leave it. The same honesty applies to the phrase "it never left your
device": it holds only for BizLoop's own client surfaces. Anything a user attaches in Copilot Chat has already
reached Microsoft 365 before any tool runs, and Copilot's cloud cannot call a model on a laptop
(`../research/landscape/bizloop-applications.md` §0, §7.3).

| Need (source) | What an on-device model changes |
| --- | --- |
| "Where does my data go?" answered in two lines (Experience PRD v2 §8) | On BizLoop's own surfaces, an on-device run has a one-sentence answer — *nowhere; it ran on this device* — and a receipt that states what its instrument can and cannot see. |
| Data minimisation before partner tools and experiment providers (Implementation PRD v2 §5; Experience PRD v2 §7) | A pseudonymisation gate on the device can replace names and identifiers *before* the text reaches a partner, an experiment provider or a trace store (experiment E1). |
| Every skill run shows a cost line (Experience PRD v2 §7) | An on-device run bills nothing, on the same receipt format as a paid run: "0.0000 EUR — nothing billed; your device's electricity is not counted". |
| Small model first, escalate on rejection (Implementation PRD v2 §5, routing) | A calibrated small router or extractor is the cheap first tier of the cascade (E2, E3, E4). |
| Experiments labelled and graded (Experience PRD v2 §1, §9) | The lab's measurement discipline (D5) produces numbers the bake-off can use. |
| Offline and in the field (Experience PRD v2 §4, reach everyone where they are) | A phone that runs a 0.4–1 GB model works without a network. |

Phase 1 of this work (2026-09-20) set up a server-side stack and published a findings paper. Its adversarial review
(`../critique/CRITIQUE.md`) found that its headline conclusions were mis-measured or misread, and that the core of
the request — models running *in the browser*, *on phones* — had not been built. This PRD is the correction.

## 3. Goals and non-goals

**Goals (P0).**
- G1. A visitor on a laptop or phone sees a real on-device inference within one click and one download, and can
  check for themselves that nothing left the device.
- G2. An innovation-team member can load a curated model sized for their device, chat with it, run the four skills,
  and read an honest receipt for every answer.
- G3. The same app installs on Android.
- G4. Every number the product shows is measured, with its instrument checked (D5).
- G5. An experiment plan with written pass bars decides which small models, if any, move into BizLoop.

**Non-goals.**
- Not a replacement for the BizLoop supervisor, PM or workers; those stay on the models of record
  (Implementation PRD v2 §5, D3).
- Not a fork of AnythingLLM (D1). Stock AnythingLLM is an optional server tier, reached over its API.
- No AXA data in this release. All demo content is fictional and labelled so.
- No iOS build in this release (the PWA runs in Safari with the slower compat build; noted, not tested).

## 4. Users and their jobs

| User | Job | Where |
| --- | --- | --- |
| Innovation-team member (primary) | "Try the newest small models on my laptop and phone and see what they are good for, without sending data anywhere." | Chat app |
| Business owner in a showcase | "Show me it is safe before I care how it works." | Landing demo, receipt |
| IT / security reviewer | "Prove nothing leaves the device, and show me what runs where." | The meter, DevTools, receipt, THIRD_PARTY notices |
| Lab operator | "Run the experiments, keep the numbers honest, decide what goes into BizLoop." | Bench page, `experiments/`, this repo |

## 5. Product requirements

### 5.1 Landing page — P0

| # | Requirement | Acceptance |
| --- | --- | --- |
| L1 | Opening states the promise in one line ("AI that runs on this device.") with two actions: open the chat, measure this device. | Visible above the fold at 390 px and 1280 px. |
| L2 | **"Your copy" meter** (the canary sheet): requests the page has made, grouped by host, third parties counted apart; model loaded; characters typed that left the device (0, true by construction); session cost 0.0000 EUR. Built from `PerformanceObserver` entries, not from constants. | Before loading a model: only the page's own origin. After: only huggingface.co and its CDN, incoming. |
| L3 | **Live demo**: a fictional claim note → an empty claim form; one button downloads a 386 MB model (real progress, cached afterwards), runs one grammar-constrained completion and types the values into the form; the stamp lands on the canary sheet; the engine's own tokens/s is shown with "Small models make mistakes: compare the form with the note." | End-to-end run in headless Chromium with a screenshot (`app/qa/landing-demo-done.png`). |
| L4 | Strengths and weaknesses side by side, in plain language. | Both columns present; limits come from `findings.json`. |
| L5 | "Measured, not promised": the measured table from `findings.json`; `null` renders "not measured yet". | No hard-coded performance number in the source. |
| L6 | "Where it fits in BizLoop": three scenes (where does my data go; the anonymisation gate; the 0.0000 EUR cost line), the section labelled as an experiment track. | Label present. |
| L7 | "Put it on your phone": Add to Home screen; the APK link appears only when the file is in the build; the secure-context caveat for plain http on a LAN. | APK link absent when the file is absent. |
| L8 | No third-party requests of any kind (fonts self-hosted, no analytics, no CDN). | Request log shows the page origin only until a model is requested. |

### 5.2 Chat app (PWA) — P0 unless marked

| # | Requirement |
| --- | --- |
| C1 | **Model shelf** grouped by where it runs — Phone (< 500 MB), Laptop (0.5–1.2 GB), Desktop (> 1.2 GB) — from wllama's curated list plus catalog models verified to load; each with size, plain-language note (good for, languages, licence when verified), download progress in bytes and %, cached state, delete, total storage used; custom model by Hugging Face URL. |
| C2 | **Capability panel**: cross-origin isolated yes/no and what it means (threads), threads in use, WebGPU adapter present, device memory. |
| C3 | **Chat**: streaming with stop; regenerate; copy; edit and resend the last message; Markdown with code highlighting and **no raw HTML** (links http(s)/mailto only, `rel="noopener noreferrer"`); reasoning tokens rendered apart when present; auto-scroll that does not fight the reader; conversations persisted locally with rename and delete. |
| C4 | **The receipt** under every answer (label/value pairs): Model · Ran on (this device / a named host) · Tokens in / out · Speed (decode tok/s from the engine's own timings, wall-clock fallback labelled) · Time to first token · Network requests during generation · Cost (0.0000 EUR on device). This is the Experience PRD's cost line and "which model is doing this, and where?" made literal. |
| C5 | **Skills** — presets a business user picks instead of writing a prompt, each with a short system prompt, a JSON schema, grammar-constrained decoding (fallback: tolerant JSON repair lifted from LocalMode) and a validation badge: **Pull claim fields** (rendered as a filled form); **Anonymise** (the model finds spans; the *app* replaces them with stable placeholders, shows original and redacted side by side, keeps the reversible mapping in memory only, and says detection is incomplete and must be checked); **Triage a claim** (line, urgency, missing information, next step; rendered as a decision card with the act / confirm / refuse bands); **Synthetic claims** (N fictional claims as a table, copy as JSON, labelled FICTIONAL). |
| C6 | **Settings**: temperature, max tokens, context size (capped at 8,192: the wasm32 heap is 4 GiB), system prompt, use GPU when available (with an honest note). |
| C7 | Works at 390 px: sidebar as a drawer; composer above the on-screen keyboard (`100dvh`, safe-area insets); visible focus; both themes legible. |
| C8 (P1) | **Ask a bigger model**, off by default: an OpenAI-compatible endpoint (for instance the stock AnythingLLM server tier, §5.4) with a key stored only in this browser; an approval sheet shows *exactly* the text that would leave the device, pre-filled with the Anonymise redaction; sends only on approval; the receipt then names the host and the bytes sent. |
| C9 (P1) | On-device document Q&A: chunking + BM25/embedding hybrid retrieval (lifted from Domicile, MIT) with an embedder chosen by E9. |
| C10 (P2) | needle3 as an in-page tool-calling specialist through its own WebAssembly engine (E10). |

### 5.3 Android — P0 (Track A), P1 (Track B)

- **Track A (built):** Capacitor 8 shell (`app/android-shell/`, app id `com.bizloop.slmlab`) around the built PWA;
  debug APK produced on this machine (OpenJDK 21, Android SDK 35/36, AGP 8.13, Gradle 8.14.3). Side-load:
  `adb install -r app-debug.apk`, or copy the file to the phone and open it.
  **Known ceiling, and it is not a bug we can fix:** in Android System WebView `crossOriginIsolated` is `false` and
  `SharedArrayBuffer` is undefined *even when COOP/COEP are served correctly* (Chromium issue 40914606, open since
  2023), so Track A runs **single-threaded WASM with no WebGPU** — our own thread heuristic then picks one thread
  (`web/src/lib/thales/localWllama.ts`). The app must say so on the capability panel rather than look slow for no
  reason. Evidence: `../research/landscape/feasibility-android.md`.
- **Track A′ (new option, P1):** a Trusted Web Activity — the same PWA rendered by the user's Chrome instead of a
  WebView. It is the only Android packaging that keeps **multi-threaded WASM and WebGPU**, because Chrome honours
  COOP/COEP. Cost: a public HTTPS origin and a Digital Asset Links file, which makes it an operator decision
  (open question 1). If the operator wants speed on Android sooner than Track B, this is the cheaper route.
- **Track B (P1):** fork of Mintplex-Labs/anythingllm-mobile (MIT, React Native 0.81 + llama.rn): strip Firebase
  Analytics and the AD_ID permission, remove Mintplex endpoints and keys, rebrand (the AnythingLLM name and logo are
  not covered by the MIT grant), add the skills and the receipt. Decided by E12 (WASM vs native on the same phone).

### 5.4 Optional server tier — P1

Stock, unmodified AnythingLLM in Docker (D1), for what a phone cannot do: document ingestion and RAG over many files,
MCP tools, agent skills, bigger models on the RTX 4070. Requirements (D6): bound to `127.0.0.1` only
(`-p 127.0.0.1:3001:3001`, never `--network host`), password or multi-user mode on, telemetry off, provider
preconfigured by environment variables, storage on a named volume. The chat app reaches it through the
OpenAI-compatible endpoint behind the C8 approval sheet. Exact command and API: `../research/landscape/feasibility-anythingllm-integration.md`.

### 5.5 needle3 specialist track — P2

needle3 (Cactus Compute, 121 M parameters, own `.cact` engine, not GGUF) stays a separate, measured track (D4). It
enters the product only through E2 / E3 / E10 pass bars. Constraint: a tuned needle model is keyed to the exact
tool-schema JSON it was trained with and loses its calibrated confidence, so routing uses the base model.

## 6. Architecture

```
                         ┌──────────────────────────── the device ─────────────────────────────┐
  index.html (landing)   │  React + TypeScript (Vite)                                          │
  chat.html  (chat)  ───►│   ChatEngine interface ──► WllamaEngine  (wllama 3.6.1, WASM, worker)│──► GGUF from huggingface.co
  bench.html (bench)     │        │                    └ OPFS model cache, grammar / JSON schema│     (download once, cached)
                         │        └──────────────► ServerEngine (OpenAI-compatible; P1, approval)│──► AnythingLLM :3001 (loopback)
                         │   Skills registry (schema + prompt + renderer)                      │
                         │   Receipt = engine timings + PerformanceObserver + cost             │
                         │   Conversations in IndexedDB · service worker (PWA) · COOP/COEP     │
                         └──────────────────────────────────────────────────────────────────────┘
  Android Track A: the same build inside a Capacitor WebView (android-shell/)
```

- **Base code** (D2): wllama's own reference app (`examples/main`, MIT, by the library's author) vendored at
  `46af429`; wllama itself is an npm dependency pinned exactly, never forked; both wasm builds self-hosted.
- **Lifted code** is copied with a provenance header and recorded in `app/THIRD_PARTY/NOTICES.md` (repo, commit,
  licence, files, changes). Never from repos without a licence (webgpu-webllm-app, tiny-llm-training) or under AGPL
  (cooper, Universal_AI after commit `3e7cad9`).
- **Serving** (D6): `app/serve.py` binds 127.0.0.1, sets COOP/COEP (needed for multi-threaded WASM), refuses
  cross-origin and non-JSON POSTs; LAN only with an explicit `--lan` flag. Phones: HTTPS (static host or tunnel) or
  `adb reverse`, because plain http on a LAN is not a secure context.

## 7. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Privacy | No third-party request except the model download the user starts; no analytics; typed text never leaves the device unless C8's approval sheet is used; the reversible anonymisation mapping lives in memory only. |
| Security | Markdown without raw HTML; no `eval` / `new Function` / `dangerouslySetInnerHTML`; API keys (C8) stored only in this browser and excluded from any export; loopback by default (D6). |
| Honesty (D5) | Numbers only from `app/web/src/data/findings.json` or live measurement; `null` → "not measured yet"; strengths and weaknesses shown together; experiments labelled. |
| Performance limits (known) | A single GGUF file must stay under 2 GB (ArrayBuffer limit; larger models need split shards). Context capped at 8,192 tokens (4 GiB wasm32 heap). Prompt processing in WASM is slow, so prompts stay short. Without cross-origin isolation the engine runs single-threaded. Measured throughput: see FINDINGS-v2 and E5. |
| Accessibility | Visible keyboard focus; body text contrast ≥ 4.5 : 1 in both themes; touch targets ≥ 44 px; `prefers-reduced-motion` respected (the stamp is the only animation). |
| Identity | The carbonless duplicate claim form (BUILD-SPEC §2): carbon-blue on form stock, one canary-yellow "your copy", Archivo for structure, Courier Prime only for typed values; none of the generated-page tells. |
| Licences | Every dependency and lifted file MIT / Apache-2.0 / BSD / ISC, recorded. Model shelf policy: **no non-commercial model at all** (cc-by-nc excludes Hammer2.1 and xLAM-2); defaults Apache-2.0 or MIT; vendor licences with use restrictions (Gemma terms, Llama 3.2, the LFM Open Licence with its commercial-revenue threshold) may be listed only with the restriction visible on the model card. |
| Offline | After the first model download the chat works with the network off (PWA cache for the app, OPFS for models). |

## 8. How SLM Lab plugs into the BizLoop refactor

- **A sixth model role, experiment-only.** Implementation PRD v2 §5 defines five roles in `config/models.yaml`
  (supervisor, PM, workers, skills runner, post-mortem arms). SLM Lab proposes an **`edge` role** — models that run
  on the user's device — bound to nothing in production and visible only as a labelled experiment track, exactly as
  the Mistral and Scaleway tracks are (Implementation PRD v2 D5; Experience PRD v2 §1).
- **The trust scene.** For BizLoop's own surfaces, "Where does my data go?" gets a demonstrable answer; the receipt
  format (model · where · tokens · cost) is the same one the PM uses for cloud runs, so the two compare on one card.
  The residency sentence itself stays templated from `bizloop.get_models`, never generated by a model
  (Experience PRD v2 §6.4).
- **The pseudonymisation gate** before partners, experiment providers and trace stores (E1) is the most valuable
  candidate; if it meets its pass bar it becomes a proposal for the APIM egress path (Implementation PRD v2 D1), not
  a product claim. It would most likely run in the tenant rather than on a device, since Copilot's cloud cannot call
  a laptop — the lab's job is to prove the model, not to place it.
- **Three candidates to run first**, from the ranked list: the fleet **garble / pane-state watchdog classifier**
  (zero token cost, data already on disk), the **pseudonymisation gate**, and **claim extraction for the review
  digest** (demote-only: it may never promote a claim to "verified"). Each has a kill rule against a cheaper
  baseline — if a regex or a lookup table matches it, the model loses.
- **A binding, not a special case.** Before any of this, a half-day spike puts a self-hosted small model in
  `config/models.yaml` as an ordinary binding, and every server-side small model must beat the first-party nano-class
  models before it earns a model card.
- **Where such a model would actually run.** Microsoft's own documentation settles this: declarative agents run on
  Copilot's orchestrator and models — no bring-your-own model — so only a **custom engine agent** (which is what
  Implementation PRD v2 D8 already chooses for the PM) can use one; and Foundry Local "isn't designed as a server
  inference stack", so a model on a user's laptop cannot be called by cloud Copilot. A small model that serves
  BizLoop therefore sits **behind an MCP service inside the EU perimeter**, not on a device. On-device inference
  stays what this product is: BizLoop's own client surfaces, and the lab bench that proves a model before it is
  deployed anywhere. Sources: `../research/landscape/slm-landscape-2026.md`.
- **Two facts to keep the claims sober.** (1) On-device processing is *not* anonymisation: EDPB Opinion 28/2024
  states a model trained on personal data cannot in all cases be considered anonymous, and pseudonymised data
  remains personal data — so E1's gate is data minimisation, never a GDPR exit. (2) Tool-calling ability at this
  size is limited: the best open model ≤ 4 B on the Berkeley Function-Calling Leaderboard V4 scores 51.4 % against
  77.5 % for a frontier model, and multi-turn tool use collapses (Qwen3-1.7B 11 %, Llama-3.2-1B 0 %). The skills are
  single-turn and schema-constrained for that reason.
- **The bake-off.** Small models enter BizLoop's evaluation discipline (Implementation PRD v2 §5: metrics scored in
  Langfuse, decision rules written in advance) through E3, E4 and E5.
- The full ranked list of application candidates, with the PRD requirement each serves:
  `../research/landscape/bizloop-applications.md`.

## 9. Milestones

| Milestone | Content | Status |
| --- | --- | --- |
| M0 — foundations | Research (17 dossiers, 59-model catalog in the operator's schema, landscape and feasibility reports), adversarial critique of phase 1, decisions D1–D7, this PRD and the experiment plan; landing, chat PWA and Android debug APK built and verified in a browser; docs moved out of the Valheim repo. | 2026-09-21 — see FINDINGS-v2 "State of the build" for what was verified and how |
| M1 — measured | E3 scored, E5 timed on a quiet machine, E1 baselines; `findings.json` filled; APK on the operator's phone. | Next |
| M2 — useful | E1 and E2 decided; C8 (bigger model with approval) and C9 (document Q&A); server tier back, loopback and password-protected. | Later |
| M3 — Track B | anythingllm-mobile fork decided by E12. | Later |

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Small models make confident mistakes on business fields | Every skill shows a validation badge and "compare with the source"; nothing is automatic until E1 / E2 pass bars are met. |
| wllama's bus factor is one; npm lags master | Pin exact versions; self-host the wasm; the `ChatEngine` interface keeps a second engine possible (WebLLM on WebGPU). |
| Phones run out of memory | Phone shelf < 500 MB by default; the OOM / crash-loop survival logic from Universal_AI (MIT commit) is on the lift list. |
| Licence contamination (AGPL, no licence) | Provenance rule, notices file, and a review lens that diffs each lifted file against its claimed source. |
| Model licences with use restrictions (Gemma, Llama, LFM) | Licence shown on each model card; Apache-2.0 / MIT models preferred as defaults. |
| Numbers that are artefacts (phase 1) | D5; timed runs on a quiet machine with load recorded; the critique stays in the repo as a warning. |
| Secure-context limits on phones over a LAN | Documented; HTTPS hosting or `adb reverse` for tests. |

## 11. Open questions for the operator

1. **Hosting.** A public static host (for example Cloudflare Pages, with COOP/COEP headers) would let phones use the
   PWA over HTTPS with threads; the app contains no data and makes no calls, but publishing is your call.
2. **Track B.** Fork anythingllm-mobile now, or wait for E12's WASM-vs-native numbers from your phone?
3. **French first?** Make French the default UI language for the pilot audience, or keep English with French skills?
4. **E1 data.** Hand-building 60 French claim narratives with NIR / IBAN / plates is the most valuable dataset in the
   plan; do you want a teammate to review them for realism?
5. **Server tier.** Restart AnythingLLM (loopback-only, password-protected) now, or only when C8 / C9 are built?
