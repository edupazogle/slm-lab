# SLM Lab — decision log

Decisions taken on 2026-09-21 by the supervisor session, each with the evidence it rests on. The PRD
(`PRD.md`) and the experiment plan (`../plan/EXPERIMENT-PLAN.md`) are written from these. A decision
changes only by adding a new entry that supersedes it, never by editing history.

## D1 — Do not fork AnythingLLM for the web app. Sit beside it.

**Context.** The operator prefers AnythingLLM as the base "if it is the better fit in quality and community",
enhanced with the best code from the wllama repos. They also require the models to run *in the browser*, on phones.
**Evidence.** `research/repos/anything-llm-architecture.md`: inference is welded to the server —
`provider.handleStream(response, …)` writes to the Express response; there is no client-side LLM path; the frontend
is 138k LOC of untyped JavaScript with zero tests, and mobile layout is decided by user-agent sniffing
(`research/repos/anything-llm-frontend.md`). The maintainers' own answer to on-device models is a *different repo*.
**Decision.** Build our own Vite + React + TypeScript PWA around wllama. Define one `ChatEngine` interface with two
implementations: `WllamaEngine` (on the device) and `ServerEngine` (any OpenAI-compatible endpoint, including stock
AnythingLLM's `/api/v1/openai/chat/completions`). Run **stock, unmodified** AnythingLLM in Docker as the optional
server brain for what a phone cannot do (document ingestion and RAG, MCP tools, agent skills, bigger models on the GPU).
Upgrades stay a `docker pull`. Lift ~1.5k LOC of surgical units from its frontend (stream event reducer, auto-scroll
hook, markdown + purify, thought-tag parsing), MIT, with attribution. Never touch `open-computer/` (AGPL-3.0).
**Consequence.** AnythingLLM's quality and community are kept where they apply (server, RAG, agents, MCP) without
inheriting an architecture that excludes the core requirement.

## D2 — The web base is wllama's own reference app, plus named lifts. No repo in the list is a product base.

**Evidence.** Eleven dossiers in `research/repos/`. The UX ratings in the list the operator pasted did not survive
reading the source: `edge-chat` runs a 15M-parameter toy with streaming as dead code; `cora-archieve`'s wllama path is a
17-line stub and it routes searches through a third-party proxy while claiming data stays local; `Domicile`'s demo
returns a hard-coded answer; `NoLLMChat`'s "agent" nodes never execute a tool; `rust-coding-dojo` is a one-day drop.
**Decision.** Base = `ngxson/wllama` `examples/main` (MIT, maintained by the library author, tracks the API), vendored
at `46af429`. Lifts, each copied with a provenance header and recorded in `app/THIRD_PARTY/NOTICES.md`:

| From | Licence | What | Why |
|---|---|---|---|
| ThalesGroup/rust-coding-dojo | Apache-2.0 | `academy/src/llm/localWllama.ts` | WebGPU probe, thread heuristic, clear-cache-and-retry |
| LocalMode-AI/LocalMode | MIT | `core/src/generation/{schema,generate-object}.ts` | `extractJSON` / `repairJSON` / partial JSON: the fallback when grammar decoding is unavailable |
| LocalMode-AI/LocalMode | MIT | `apps/ui/registry/localmode/{conversation,local-first}/*` (subset) | prompt input, reasoning block, scroll-to-bottom, suggestions, storage meter, capability gate |
| LocalMode-AI/LocalMode | MIT | `core/src/agents/*` (later) | ReAct loop with an abort-raced human-approval gate, with tests |
| kyrillosishak/Domicile | MIT | `rag/{HybridSearch,Chunker,Reranker}.ts` (later) | BM25 + RRF retrieval kit for on-device document Q&A |
| universal-simulation-ltd/Universal_AI | MIT **at commit `3e7cad9` only** | wllama memory-tuned engine, OOM / crash-loop survival | phones run out of memory; this is the only repo that handles it |
| Mintplex-Labs/anything-llm | MIT | stream reducer, `useAutoScroll`, markdown + purify, thought tags | the best streaming-chat spine in the set |

**Not allowed.** `krtarunsingh/webgpu-webllm-app` and `windshadow233/tiny-llm-training` have no licence (all rights
reserved): ideas only. `rclement/cooper` is AGPL-3.0: one pasted file would make the whole bundle AGPL. `Universal_AI`
at HEAD is AGPL: take only from the MIT commit. wllama is an npm dependency pinned to `3.6.1`, never a fork.

## D3 — Android ships on two tracks.

**Evidence.** `Mintplex-Labs/anythingllm-mobile` (MIT, pushed 2026-09-20) is bare React Native 0.81 with `llama.rn`
0.12.9 — native llama.cpp bindings, materially faster than WebAssembly inside a WebView, with RAG and agents already
built. `Universal_AI`'s "real Capacitor project" is an untouched template with no WebView tuning. This machine had no
JDK or Android SDK; both were installed on 2026-09-21 (OpenJDK 21, SDK 35/36, checksum-verified command-line tools).
**Decision.** Track A (now): a Capacitor 8 shell around the PWA — one codebase, every web feature, runs offline;
expect single-threaded WASM speed inside the WebView unless cross-origin isolation can be established. Track B
(premium): fork `anythingllm-mobile`, strip Firebase Analytics, rebrand, add the SLM Lab skills and the receipt. Track B
is the recommended long-term Android app; Track A is how the operator gets something installable today and a fair
WASM-vs-native comparison on the same phone.

## D4 — needle3 is a specialist beside the chat models, not one of them.

**Evidence.** needle3 uses its own `.cact` engine (it ships a 0.75 MB WebAssembly build) and is not a GGUF/wllama model;
it does tool-calls, extraction and embeddings, never free text. Phase-1's conclusions about it were partly wrong (see
`../critique/CRITIQUE.md`): the confidence/completeness claim was an off-by-one misread, and the fine-tune verdict was
an artefact of a mismatched tool schema, ungrounded labels and an exact-match scorer.
**Decision.** Keep needle3 as a separate, measured track (`experiments/v2/`), evaluated on field micro-F1 with
confidence intervals against a 4-bit untuned control. It earns a place in the product only if the v2 numbers say so.
Note the constraint found in forensics: **a tuned needle model is keyed to the exact tool-schema JSON it was trained
with**, and fine-tuning removes the calibrated confidence score — so "fine-tune it" and "route on its confidence" are
mutually exclusive in one model (use the base model for the decision and the tuned one for the call).

## D5 — Every number on a page is measured, with its instrument checked first.

**Evidence.** Phase 1 published a CPU-speed table that was a setup artefact (GGUF files mmapped from an NTFS drive over
9p, 8 threads on a 4-core VM, no warm-up, n = 1, tokens/s computed over total wall time) and an eval that could not
detect an effect (n = 6). During this session three of my own instruments were wrong before they were right: a
benchmark that measured zero generated tokens, a "refused" HTTP guard that was really a crashing log line, and a
background job that reported exit 0 for a crashed training run.
**Decision.** The app reads performance numbers only from `web/src/data/findings.json` or measures them live; `null`
renders as "not measured yet". Benchmarks record the engine's own timings *and* a wall-clock cross-check. Pipelines
check for the artifact of each stage. Timed runs happen on a quiet machine, and the load is recorded with the result.

## D6 — Loopback by default; nothing unauthenticated on the LAN.

**Evidence.** Phase 1 left AnythingLLM on all interfaces with no password and `onboardingComplete: false`, plus its
collector on :8888, both reflecting any `Origin`; and recommended a port-proxy to the LAN. Closed on 2026-09-21
(`../critique/evidence/phase1-service-state-before.txt`).
**Decision.** `serve.py` binds 127.0.0.1 and refuses cross-origin and non-JSON POSTs; LAN is an explicit `--lan` flag.
AnythingLLM returns only as `-p 127.0.0.1:3001:3001`, password-protected, telemetry off, provider preconfigured by
environment. For phones: HTTPS (static host or tunnel) or `adb reverse`, because plain http on the LAN is not a secure
context and the browser then withholds SharedArrayBuffer, service workers and WebGPU.

## D7 — Where the work lives.

The BizLoop product repo is `edupazogle/Bizloop`, cloned at `/home/edu/Public/bizloop`. The SLM
lab lives there under `slm/` and the refactor docs under `docs/refactor/`. Nothing of either stays in the Valheim repo.
