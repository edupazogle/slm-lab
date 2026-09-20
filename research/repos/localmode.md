# LocalMode-AI/LocalMode — dossier (2026-09-21)

| | |
|---|---|
| **What it is** | pnpm monorepo of 16 `@localmode/*` npm packages (core, react hooks, 6 inference providers incl. wllama, storage adapters) plus a Next.js 16 app that is a shadcn registry of 147 chat/agent/model-management UI items. Single author. |
| **Licence verdict** | **MIT** (`LICENSE`, "Copyright (c) 2025 LocalMode"). Copying is allowed into a private or MIT product. Only condition: keep the copyright + permission notice with the copied code. |
| **Best thing to take** | The presentational chat/agent UI registry (`apps/ui/registry/localmode/conversation/*`, `local-first/*`) and the ReAct loop with approval gate (`packages/core/src/agents/`). Both are backend-agnostic and small. |
| **Biggest risk** | Bus factor 1, 42 big-bang commits (one is +126k/-52k lines), **no CI**, and README claims that the code does not implement (wllama "tool calling" is a no-op). The wllama runtime is loaded from jsDelivr through `new Function`, which conflicts with offline PWA + strict CSP. |
| **Scores (1-5)** | maturity 2 · code_quality 3.5 (→4 for the parts worth lifting) · chat_ux 3 · agentic 3 · mobile_pwa 3 |
| **Recommendation** | Do **not** adopt as the foundation/dependency. **Lift** the UI primitives, the agent loop, `extractJSON`/`parsePartialJSON`, and the GGUF compat/discovery helpers as vendored source; write your own thin wllama adapter (bundle wllama locally, forward `abortSignal`, pass `tools`/grammar). |

Source: shallow clone at `/home/edu/.cache/slm-src/LocalMode-AI_LocalMode` (HEAD `3ef8bc4`, 2026-09-20). All `path:line` references are relative to that root. Nothing was executed: the clone has no `node_modules` and installing was out of scope, so **"tests pass" is UNVERIFIED** throughout — I only read the tests.

---

## 1. Licence

- `LICENSE` — standard MIT text, `Copyright (c) 2025 LocalMode`. Identical MIT files in `packages/bench/LICENSE` and `packages/mediapipe/LICENSE`. Every `package.json` I opened declares `"license": "MIT"` (root, `packages/core`, `packages/wllama`). npm registry agrees (`@localmode/core` license: MIT).
- No `NOTICE`, no third-party licence bundle. The only non-MIT file is `packages/bench/src/datasets/stsb/LICENSE-CC-BY-SA.md` (a benchmark dataset — **do not lift `packages/bench` datasets** into an MIT product; CC-BY-SA is share-alike).
- GitHub API reports `MIT` as detected licence.

**Verdict: `conditions` (trivial).** Keep the MIT copyright + permission notice in "all copies or substantial portions". Practical form: a `THIRD_PARTY_NOTICES.md` entry plus a header comment in each vendored file (`// Adapted from LocalMode-AI/LocalMode @3ef8bc4, MIT, (c) 2025 LocalMode`). No state-changes requirement, no copyleft, product may stay private or be MIT.

Transitive licences for what the lifted code pulls in (not checked file-by-file, from package metadata knowledge — **UNVERIFIED**): `@wllama/wllama` MIT, `@huggingface/gguf` MIT, `lucide-react` ISC, `shiki` MIT, `radix-ui` MIT, `cmdk` MIT.

**Provenance note.** The conversation components share names and API shape with Vercel's AI Elements (`Conversation`, `Message`, `Response`, `PromptInput`, `Reasoning`, `Sources`, `Tool`, `Task`, `Branch`, `InlineCitation`, `ChainOfThought`, `Actions`, `Suggestions`, `Loader`, `CodeBlock`, `Artifact`). Grepping the registry, READMEs and docs for `ai-elements`/`AI Elements` returns nothing; the only Vercel mentions are an interop doc (`apps/ui/content/docs/use-with-ai-sdk.mdx`). The implementations I read are not copies (e.g. `conversation.tsx` hand-rolls scroll pinning with `scrollTop`/`scrollHeight` at lines 75-95 rather than using `use-stick-to-bottom`; `lib/markdown.tsx` is a hand-rolled parser rather than `streamdown`). I did **not** diff against AI Elements source, so "no copied code" is **UNVERIFIED**; the API naming is clearly borrowed, which is not a licence problem.

---

## 2. What is actually there

### 2.1 Repo shape (measured)

| Fact | Value | Source |
|---|---|---|
| Stars / forks / open issues | 35 / 3 / 0 | `gh api repos/LocalMode-AI/LocalMode` |
| Created / last push | 2025-12-30 / 2026-09-20 | same |
| Total commits | 42 | `Link: …page=42; rel="last"` on `commits?per_page=1` |
| Contributors | 1 (`MuathJ`, 42) | `gh api …/contributors` |
| Issues+PRs ever | 1 (the author's own v2.0.0 PR) | `gh api …/issues?state=all` |
| GitHub releases | 0 (versions go to npm via changesets) | `gh api …/releases` |
| CI | **none** — `.github/` contains only `assets/hero-stat.svg` | `ls -R .github` |
| npm last-month downloads | core 806 · wllama 371 · react 73 (2026-08-21→09-19) | `api.npmjs.org/downloads/point/last-month/...` |

Commit shape (sampled with `gh api …/commits/<sha>`):

| sha | date | +add / -del | message |
|---|---|---|---|
| `030fd04` | 2025-12-30 | +7,530 / 0 (2 files) | Initial commit |
| `2856232` | 2026-05-24 | +44,923 / -1,904 | "add MediaPipe, LiteRT providers; Kokoro TTS; audit log; live transcription; migrate to Transformers.js v4; PWA support" |
| `0a5d5a7` | 2026-07-09 | **+126,133 / -52,067** | "ship @localmode/ui registry + blocks; fix RAG round-trip…" |
| `a298bc9` | 2026-07-11 | +1,568 / -351 | structured output + ui refinements |
| `3ef8bc4` | 2026-09-20 | +283 / -41 | bench protocol v4 |

Work arrives in dumps after long silences (nothing between 2026-07-15 and 2026-09-18, then 8 bench commits in 3 days). Development history is not in this repo; you cannot bisect anything. The last three weeks of activity are entirely the `bench` package, not chat.

### 2.2 Size per package (`find … | xargs cat | wc -l`, tests excluded)

| Package | src LOC | test files / LOC | Notes |
|---|---|---|---|
| `core` 2.4.2 | 61,562 | 94 / 24,451 | zero runtime deps (`packages/core/package.json` has only devDependencies) |
| `react` 2.4.0 | 11,180 | 38 / 8,582 | 52 hooks |
| `wllama` 3.4.0 | 3,488 | 7 / 2,352 | deps: `@wllama/wllama ^3.5.1`, `@huggingface/gguf ^0.1.14` |
| `transformers` 4.1.2 | 8,332 | 9 / 1,815 | |
| `webllm`, `litert`, `mediapipe`, `chrome-ai` | 1.0k–2.8k each | 1–4 files each | |
| `bench` 0.6.0 | 6,172 | 12 | where the recent effort went |
| `apps/ui` | 147 registry items (106 component, 37 block, 3 lib, 1 hook) | 43 e2e files | `apps/ui/registry.json` |

`core` is a 35-domain kitchen sink (`audio`, `vision`, `ocr`, `translation`, `security` 3.7k LOC, `sync`, `quantization`, …). For a chat product ~90% of it is dead weight. TypeScript is `strict` with `noUnusedLocals/Parameters` (`tsconfig.base.json`); only 13 `any` hits across core+react+wllama src.

### 2.3 Architecture

```
LanguageModel interface (core/src/generation/types.ts)
   doGenerate(opts) / doStream(opts) -> AsyncIterable<{text, done, usage}>
        ^ implemented by each provider: wllama | webllm | transformers | litert | chrome-ai
core: generateText / streamText / generateObject / streamObject   (prompt+parse+retry)
core/agents: createAgent -> executeReActLoop (generateObject per step) -> ToolRegistry
core: VectorDB (db.ts 1,248 LOC) -> HNSWIndex + IndexedDB/Memory storage + WAL
react: useChat / useAgent / useModelLoad / useGenerateObject … (call core via dynamic import)
apps/ui registry: presentational components (plain props) + "blocks" that wire hooks to providers
```

It is the Vercel AI SDK design transplanted to on-device providers. The layering is clean and the provider interface is small; that part of the "composable foundation" claim holds. What does not hold is covered next.

---

## 3. README claims vs code

### 3.1 wllama "tool calling" — NOT implemented (README-ware)

Claim — `packages/wllama/README.md:22` "**Tool calling** via `providerOptions.wllama.tools` and `tool_choice`", `:234-265` with a full example ending "The result includes a `toolCalls` array when the model invokes tools." Root `README.md:48` and `:424` repeat it; `packages/wllama/CHANGELOG.md:66` says tools are "forward[ed] … to v3's OAI-compatible `createChatCompletion()`".

Code — `grep -rn "toolCalls\|tool_choice\|wllamaOpts.tools\|\.tools" packages/wllama/src packages/core/src/generation` returns **zero hits**. In `packages/wllama/src/model.ts` the only `providerOptions.wllama` keys ever read are the sampling list (`:297-315`), `response_format` (`:364`, `:530`), `cache_prompt`/`chat_template_kwargs` (`:425-432`) and `raw` (`:451`). `createChatCompletion` is called with `messages, max_tokens, response_format?, passthrough, sampling` (`:366-372`, `:543-550`) — no `tools`. `DoGenerateResult` returned at `:380-389` has no `toolCalls` field.

The test that "covers" it cannot fail (`packages/wllama/tests/wllama.test.ts:882-900`):

```ts
// Tool calling (providerOptions accepted, forwarded via prompt)
it('should accept tool providerOptions without error', async () => {
  ...providerOptions: { wllama: { tools, tool_choice: 'auto' } },
  expect(result.text).toBeDefined();
  expect(mockState.createChatCompletion).toHaveBeenCalledTimes(1);
```

It asserts only that unknown options do not throw. Tool use in this repo exists **only** as the prompt-JSON ReAct loop in core (section 3.3), never as native llama.cpp function calling.

### 3.2 Structured output / grammar — half true

- `grammar` (GBNF) and `response_format` are genuinely passed through to wllama when the **caller** supplies them (`model.ts:314`, `:364-369`). Real, 2 lines each.
- But `generateObject()` never uses them. `grep -rn "response_format\|grammar" packages/core/src/generation packages/core/src/agents` → no hits outside a test comment. `packages/core/src/generation/generate-object.ts:93-170` is: build a system prompt containing the JSON Schema + an example, call `generateText`, run `extractJSON`, `schema.parse`, on failure append "Your previous response failed validation: …" and retry (default 3). So the headline "reliable on-device structured output" is prompt-and-retry, not constrained decoding, unless you hand-wire `providerOptions.wllama.response_format` yourself (the hook doc at `packages/react/src/hooks/use-generate-object.ts:27-28` tells you to).
- `/no_think` is hard-coded into every structured system prompt and user prompt (`schema.ts:308`, `generate-object.ts:113`). Correct for Qwen3, literal noise for every other model.

The prompt engineering and `extractJSON` fallbacks are nevertheless good and clearly battle-tested against sub-2B models (comments cite concrete failures, e.g. schema-echoing at `schema.ts:334-336`, the `{"oneOf":[…]}` parroting unwrap at `agents/loops.ts:56-67`).

### 3.3 Agent framework (ReAct, approval, memory) — real, modest

`packages/core/src/agents/` = 1,666 LOC src, 1,500 LOC tests (72 `it(` across 6 files).

- **ReAct loop** `loops.ts:336-612`. One `generateObject` call per step against a hand-written `tool_call | finish` discriminated union (no Zod dependency). Guards: `maxSteps`, `maxDurationMs`, identical-call loop detection with a nudge on the first repeat and termination on the second (`:483-513`), char/4 history truncation to 80% of `contextLength` (`:233-264`), tool errors fed back as observations (`:584-587`). `ACTION_MAX_TOKENS = 2048` with a documented reason (`:124-134`).
- **Human-in-the-loop approval** `loops.ts:297-323, 515-570`. Decision promise raced against the abort signal; approval wait time is excluded from the timeout budget (`:383, :397, :546`); denial becomes an observation telling the model not to retry. It **fails closed** at config time: `agent.ts:104-108` throws if a tool has `requiresApproval: true` and no `onToolApproval` callback exists. `useAgent` exposes `pendingApproval / approve() / deny(reason)` (`packages/react/src/hooks/use-agent.ts:68-81, :285-289`) and `conversation/tool-approval/tool-approval.tsx` (133 LOC) renders it. This chain is the best-designed thing in the repo.
  - Weakness: approval is requested on the **raw** model args; schema validation happens later inside `toolRegistry.execute` (`tools.ts`, `execute` → `tool.parameters.parse`). The user can be asked to approve a call that then fails validation.
- **Memory** `memory.ts` 172 LOC. `createVectorDB({ name, dimensions, storage: 'memory' })` is hard-coded (`memory.ts:57`). README `:327` says "VectorDB-backed memory" — true, but it is **in-RAM only and lost on reload**; there is no option to persist. FIFO eviction at `maxEntries`. Retrieval is cosine ≥ 0.7, top 5, injected once at loop start (`loops.ts:362-374`).
- **No streaming inside agent steps.** Each step is a blocking `generateObject`; the UI gets `onStep` only after the step completes. With a 1–4B GGUF in WASM that is many seconds of spinner per step.
- The error hint itself recommends "Qwen3 8B" (`loops.ts:455`) — i.e. the author's own finding is that small in-browser models are marginal for this loop.

### 3.4 VectorDB / HNSW — works, not best-in-class

`packages/core/src/hnsw/index.ts` 753 LOC + `gpu/` (WebGPU batch distance). Textbook HNSW on `Map<string, HNSWNode>` with `Map<number, Set<string>>` connections.

- `selectNeighbors` is `candidates.slice(0, maxConnections)` (`:627-635`, comment: "Simple selection") — no diversity heuristic from the paper, so recall degrades on clustered data.
- Updating an existing id replaces the vector but **does not relink** (`:264-268`) — the graph goes stale.
- `delete` removes back-links but does not repair neighbours, and on deleting the entry point it picks `this.nodes.keys().next().value` (first-inserted node, arbitrary level) and sets `maxLevel` to that node's level (`:534-542`) — upper layers can become unreachable.
- `hnsw.test.ts` is 153 lines; I saw no recall-vs-brute-force test. **Recall numbers: none found.**

For chat RAG over a few thousand chunks none of this matters and brute-force cosine would do. The surrounding `db.ts` + `storage/` (IndexedDB, WAL, migrations, quota; 4.5k LOC) is more than a chat app needs. Do not lift this as "best in class"; lift only if you want zero-dependency and accept the caveats.

### 3.5 Model management — real and useful

`packages/wllama/src/utils.ts`: `isModelCached`, `preloadModel`, `deleteModelCache`, `listCachedModels`, `clearAllModelCache`, `refreshModel` against OPFS. `isModelCached` re-derives wllama's private cache filename (SHA-1 of URL + basename, `utils.ts:95-104, :123-137`) — it silently returns `false` if wllama changes its naming scheme (the `catch { return false }` makes that failure indistinguishable from "not cached").

`gguf.ts` (357) parses GGUF headers over HTTP Range via `@huggingface/gguf`; `compat.ts` (358) cross-checks RAM/storage/cross-origin isolation; `discovery.ts` (383) searches HF for GGUF repos with typed rate-limit/network errors. `preloadModel` correctly uses wllama's `ModelManager` rather than `loadModelFromUrl`, with a documented reason (encoder-only GGUFs abort the WASM on causal warm-up — `wllama-loader.ts:90-96`).

Caveat: `compat.ts:138-178` `estimateSpeed()` returns strings like `~N-M tok/s multi-thread` from an invented formula (`30 / params_B × quantFactor × deviceFactor × 3.0`). There is no measurement behind it; for a 1B Q4 model on an ≥8 GB device it prints roughly "~65-130 tok/s", which is not a number I would show a user. Drop it when lifting.

### 3.6 useChat — a probable duplicated-turn bug

`packages/react/src/hooks/use-chat.ts:187-196`:

```ts
const currentMessages = [...messages, userMessage];      // already contains the new user turn
const coreMessages = currentMessages.map(...);
const result = await streamText({ model, prompt: text, messages: coreMessages, ... });
```

and every provider appends `prompt` as another user turn after `messages` — wllama `model.ts:499` `if (prompt) oaiMessages.push({ role: 'user', content: prompt });`, webllm `model.ts:134-136` the same. `streamText` forwards both untouched (`core/src/generation/stream-text.ts:120-131`). `regenerate()` has the same shape (`use-chat.ts:284-292`: `messages.slice(0, lastAssistantIdx)` still contains the last user message, and `prompt` repeats it). Net effect from reading the code: **the latest user message reaches the chat template twice.** `packages/react/tests/use-chat.test.ts` asserts only on hook state, never on what the model received, so nothing would catch it. CONFIRMED by reading three files; **not confirmed by execution** (could not run).

Otherwise `useChat` is competent: abort-on-resend, unmount guard, `status` lifecycle, per-turn and cumulative usage, regenerate-into-variants with restore on cancel, IndexedDB persistence (`core/chat-persistence.ts`, 98 LOC, single key = whole transcript rewritten on every token because the persist effect depends on `messages` — `use-chat.ts:144-147`; on a long chat that is an IndexedDB write per streamed chunk).

### 3.7 Cancellation does not reach llama.cpp

`model.ts` never passes `abortSignal` into `createChatCompletion`/`createCompletion`. `doGenerate` checks `throwIfAborted()` only before the call (`:353-355`); `doStream` just `break`s out of the iterator (`:557`). So "Stop" during an agent step or `generateObject` does nothing until up to 2,048 tokens have been decoded. Whether breaking the async iterator makes wllama 3.5 halt decoding is **UNVERIFIED** (runtime not installed).

---

## 4. Scores

| Axis | Score | Why |
|---|---|---|
| maturity | **2** | 9 months old, 1 author, 42 dump commits, 0 outside issues/PRs, no CI, ~800 npm downloads/month on core; recent work is a benchmark, not chat. |
| code_quality | **3.5** | Strict TS, consistent structure, comments that record real failures, 24k LOC of unit tests in core. Pulled down by can't-fail tests, doc/code drift (3.1), the useChat duplication, swallowed errors (`catch { return false }`), and sheer unfocused volume. |
| chat_ux | **3** | Broad, presentational, shadcn-themable primitive set (branching, reasoning, citations, tool cards, scroll pinning, stop button). But the markdown renderer has no tables, nested lists, task lists, math or in-markdown highlighting; `PromptInput` has no IME guard; the flagship block is a 2,889-line single file. |
| agentic | **3** | Honest, guarded ReAct + a properly designed approval gate + React hook + UI. No native tool calling, no parallel calls, no streaming steps, non-persistent memory, approval before validation. |
| mobile_pwa | **3** | Real Serwist SW + manifest + offline fallback, and a genuinely valuable COOP/COEP recipe incl. the WebKit `require-corp` override. But it is Next.js-specific, the wllama runtime is fetched from a CDN, and there is no Android wrapper (no Capacitor/TWA anywhere). |

---

## 5. Liftable units

Target assumed: Vite + React 19 + TypeScript + Tailwind 4 + shadcn/ui.

### U1 — Conversation UI primitives (take)
- **Paths:** `apps/ui/registry/localmode/conversation/{conversation,message,response,prompt-input,prompt-input-attachments,reasoning,chain-of-thought,tool,tool-approval,task,agent-step-timeline,actions,branch,sources,inline-citation,source-citation-list,suggestions,loader,scroll-to-bottom-button,in-message-error,system-notice-banner,structured-output-viewer,code-block}/*.tsx` + `conversation/lib/markdown.tsx` + `lib/utils.ts`.
- **LOC:** ~5,100 without `*-demo.tsx` (7,087 with demos).
- **Deps:** `react`, `lucide-react`, `clsx`/`tailwind-merge`/`cva`, shadcn `button`/`badge`/`avatar`/`progress`; `shiki` for `code-block` only. Import tally over the family: 37× react, 27× `lib/utils`, 17× lucide, 13× `ui/button` — one stray `@localmode/webllm` import and two `@/lib/browser-utils`.
- **Transplant:** **easy.** They take plain props and own no model state. Delete `'use client'`, remap the `@/registry/localmode/*` alias, regenerate the shadcn primitives with your own `components.json`. The official route (`npx shadcn add @localmode/ui/conversation`, `apps/ui/README.md:69-70`) depends on their registry host staying up — vendor the files instead.
- **Must fix on the way in:** replace `lib/markdown.tsx` (233 LOC, regex; no GFM tables/nested lists/math; links rendered with unvalidated `href` at `:65-70` — add an `http(s):`/`mailto:` allowlist or swap in `react-markdown`+`remark-gfm`/`streamdown` as its own header suggests); add `if (e.nativeEvent.isComposing) return;` to `prompt-input.tsx:252-258`; on touch devices Enter should insert a newline.
- **Why not write fresh:** ~25 coordinated components with a consistent prop vocabulary that already maps to both a local hook and AI-SDK message parts. Two to three weeks of UI work.

### U2 — Agent loop + approval gate (take, then extend)
- **Paths:** `packages/core/src/agents/{loops,agent,tools,types,memory,index}.ts` (1,666 LOC), `packages/react/src/hooks/use-agent.ts` (334), tests `packages/core/tests/agents/*` (1,500).
- **Deps:** `generateObject` (U3), `LanguageModel` type from `core/src/generation/types.ts`, `AgentError` from `core/src/errors`; `memory.ts` additionally drags `embeddings/embed.ts` + `db.ts` + HNSW — **leave `memory.ts` behind** or rewrite it against your own store.
- **Transplant:** **moderate.** Needs a 2-method model interface (`doGenerate`, `contextLength`) and three error classes; untangling `errors/index.ts` (1,546 LOC) down to what you use is the chore.
- **Why:** the abort-raced approval promise, timeout accounting that excludes human wait, loop detection and small-model output unwrapping are the fiddly parts, and they come with tests. Add: validate args **before** asking for approval; stream step tokens.

### U3 — Structured-output helpers (take)
- **Paths:** `packages/core/src/generation/schema.ts` (596), `generate-object.ts` (173), `stream-object.ts` (148); tests `packages/core/tests/generate-object.test.ts` (624).
- **Deps:** none at runtime (Zod is duck-typed via `_def`).
- **Transplant:** **easy.** Pure functions: `jsonSchema()` Zod→JSON Schema, `buildStructuredPrompt`, `extractJSON` (think-tag strip → direct parse → code fence → balanced-brace scan), `parsePartialJSON`, `repairJSON`.
- **Improve:** make `/no_think` conditional on the model family; when the provider is wllama pass the same JSON Schema as `response_format: { type: 'json_schema', … }` so decoding is grammar-constrained and the retry loop becomes a fallback.

### U4 — GGUF metadata, compat and discovery (take selectively)
- **Paths:** `packages/wllama/src/{gguf,compat,discovery,utils,models}.ts` (357+358+383+305+474 = 1,877 LOC); tests `gguf.test.ts` 468, `discovery.test.ts` 480.
- **Deps:** `@huggingface/gguf`, `fetch`, OPFS.
- **Transplant:** **easy** (framework-free). Drop `estimateSpeed`. Treat `isModelCached` as coupled to wllama internals and add a positive check. `models.ts` is a 30-entry catalog (SmolLM2, Qwen2.5, Llama 3.2, Phi-3.5/4-mini, Gemma 2/4, Qwen3, DeepSeek-R1 distills, 3 embedders, 2 rerankers) — reuse the shape, re-curate the list.
- **Pair with UI:** `apps/ui/registry/localmode/local-first/{model-selector (313), model-downloader (234), model-loading-panel, model-metadata-card, model-search-browser, capability-gate (133), storage-meter (111), browser-compat-card, context-usage-meter}`.

### U5 — wllama provider (`model.ts`, `wllama-loader.ts`) — read, do not copy
- **Paths:** `packages/wllama/src/model.ts` (622), `wllama-loader.ts` (128), `embedding.ts` (223), `reranker.ts` (178).
- Worth **stealing as knowledge**, all documented inline: cap default `n_ctx` at 8192 because wasm32 has a 4 GiB heap (`model.ts:36-49`); wllama ≥3.5 offloads all layers to WebGPU by default so `useWebGPU:false` must pin `n_gpu_layers: 0` (`:75-95`); detect real offload by parsing the llama.cpp log line (`wllama-loader.ts:68-88`); `useCache:false` when an mmproj is present (`:237`); `reasoning_content` fallback (`:376, :565`); 3.5.1 is the first version with `createRerank` (`wllama-loader.ts:20-23`).
- **Why not copy:** no tools, no abort forwarding, reasoning and answer tokens merged into one text stream (`:566` — the UI cannot separate "thinking" from the reply), a CDN import via `new Function`, and heavy `as never` / `as unknown as` casting (5 in `model.ts`). A clean adapter is ~250 lines.

### U6 — Cross-origin isolation + service worker recipe (copy the idea)
- **Paths:** `apps/ui/next.config.mjs:126-160`, `apps/ui/src/app/sw.ts` (64), `src/components/sw-registrar.tsx` (21), `src/app/manifest.ts` (37), `scripts/build-sw.mjs`.
- The valuable, non-obvious part is the header comment: `COEP: credentialless` so Hugging Face downloads work, **overridden to `require-corp` for iOS/Safari UAs** because WebKit lacks `credentialless` and otherwise "wllama's shared 4 GB WASM memory cannot be created at all" (`next.config.mjs:143-151`). Also: model hosts are `NetworkOnly` in the SW so weights are not double-stored next to OPFS (`sw.ts:25-43`).
- **Transplant:** **moderate** — Next/Serwist-specific; re-express as `vite-plugin-pwa` config + server/edge headers.

### Not worth lifting
`core/src/hnsw` + `db.ts` + `storage/` (3.4: adequate, not best-in-class, 7k+ LOC); `apps/ui/src/app/blocks/chat/chat.tsx` (2,889-line monolith wiring four providers, Next-specific `useSearchParams` — use as a reference for composition only); `packages/bench` (CC-BY-SA dataset inside); everything audio/vision/security/sync in core.

---

## 6. Red flags

1. **README-ware on a headline feature** — wllama tool calling (3.1), backed by a test that cannot fail. Treat every other README bullet as a claim until grepped.
2. **Runtime code from a CDN via `new Function`** — `packages/wllama/src/wllama-loader.ts:24, :123-127` imports `https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js` and the `.wasm` from the same host at run time (same trick in `packages/react/src/hooks/use-provider-fallback.ts:453`). Consequences: requires CSP `script-src 'unsafe-eval'` + jsDelivr; third-party supply-chain exposure with no SRI; first run is not offline-capable; inside an Android WebView/TWA it needs network. The stated reason (Turbopack/Webpack break wllama's worker) does not apply to Vite, where `?url` asset imports work. Version pinned exactly, which limits but does not remove the risk.
3. **No CI** despite 196 unit-test files under `packages/` and 43 files under `apps/ui/e2e`; nothing proves they pass at HEAD. I could not run them either.
4. **Bus factor 1, opaque history** (2.1). If the author stops, there is no community; 0 external issues in 9 months means few real users have exercised it.
5. **Likely functional bug in the main chat hook** (3.6) and **Stop that does not stop** (3.7).
6. **Invented numbers shown to users** — `estimateSpeed` (3.5).
7. `new Function` calculator tools in `apps/ui/src/app/blocks/chat/chat.tsx:721` and `blocks/agents/research-agent/research-agent.tsx:361`. Input is reduced to `[0-9+\-*/().%\s]` first, so it is not an injection hole, but it is another `unsafe-eval` dependency; and the JSDoc example in `packages/core/src/agents/agent.ts:186` literally teaches `String(eval(expression))`.
8. `dangerouslySetInnerHTML` in `conversation/code-block/code-block.tsx:121,125` — fed by Shiki output (escaped by Shiki); acceptable, keep it that way.
9. **Telemetry:** `@vercel/analytics` + `@vercel/speed-insights` exist only in the site chrome (`apps/ui/src/app/layout.tsx:2-3, :96-97`), and a build tripwire (`apps/ui/scripts/check-no-shipped-telemetry.ts`) fails the registry build if analytics reaches a shipped component. No telemetry found in `packages/*/src`. Good practice. `@upstash/redis` is for the bench leaderboard API only.
10. **Giant dependency if adopted whole:** `@localmode/core` is 61k LOC for a chat app that needs ~3k of it; `apps/ui/src/lib/block-source.generated.ts` is a checked-in generated blob.
11. **Heavy AI-assisted authorship is likely** (decision tags `D1…D6` in comments, 126k-line commits by one person, exhaustive JSDoc everywhere). Not a defect by itself — many comments cite real browser failures — but it explains the doc/code drift and means volume is not evidence of review.

---

## 7. Verdict on "the best composable foundation"

As an **architecture** it is the right shape: a tiny provider interface, headless functions, hooks, and presentational UI that does not know where tokens come from. As a **dependency** it is not ready: single maintainer, no CI, a headline wllama feature that is documentation only, a chat hook that appears to double the user turn, cancellation that does not propagate, and a CDN-loaded runtime that fights the PWA/Android goal. MIT makes the right move cheap: vendor U1–U4 with attribution (~9–10k LOC of focused code), take the lessons from U5/U6, and own the wllama adapter yourself.
