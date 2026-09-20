# zrg-team/NoLLMChat — dossier

```
WHAT      Browser-only "visual AI playground": ReactFlow canvas of LLM/prompt/schema/tool/vector-DB nodes, plus 3 mini-apps
          (chat, Plate document editor, WebContainer code editor). WebLLM in a Worker, wllama on the main thread, PGlite+TypeORM in a Worker.
LICENCE   MIT, (c) 2025 ZRG-TEAM (LICENSE read in full). Verdict: YES, copy allowed; condition = keep the copyright + permission notice.
BEST TAKE The WebLLM worker's grammar-constrained tool-calling / structured-output path (services/webllm/worker + utils), and the
          typed Worker RPC envelope (utils/worker-base.ts). Both small, both need fixes before use.
RISK      The headline features are thinner than the README: the wllama path is NOT worker-separated and has no abort; the "Flow Machine"
          executes one node; "agent"/"tool"/"MCP" nodes never execute a tool. No tests, no CI, one author, stale since 2025-09-03.
SCORES    maturity 2 · code_quality 3 · chat_ux 2 · agentic 1 · mobile_pwa 1
VERDICT   Do not adopt as a base. Lift at most ~600 LOC of worker/tool-calling glue, rewritten around an AbortSignal; take nothing for UX, PWA or agents.
```

Date of review: 2026-09-21. Clone: `/home/edu/.cache/slm-src/zrg-team_NoLLMChat` (shallow, HEAD `771248e chore: add pre push hook`).
All `path:line` references are relative to that clone.

---

## 1. Licence

- `LICENSE` (21 lines) is the unmodified MIT text, `Copyright (c) 2025 ZRG-TEAM`. GitHub API reports `license.spdx_id = MIT`.
- No `NOTICE`, no `THIRD_PARTY`, no per-file licence headers. `grep -rli "license\|copyright" src/lib` matches only
  `src/lib/vslite/icons/icon-manifest.json`.
- `CONTRIBUTING.md` is a 0-byte file; there is no CLA, so the single-copyright-holder claim rests on the contributor list
  (137 of 138 commits by `zrg-team`, 1 by `duongtanhung123` — `gh api repos/zrg-team/NoLLMChat/contributors`).

**Verdict: `yes` (with the standard MIT condition).** Code may be copied into a private product or one re-released as MIT, provided the
copyright line and the MIT permission notice travel with "all copies or substantial portions". Practical form: a
`THIRD_PARTY_NOTICES.md` entry plus a header comment in each lifted file (`// Portions (c) 2025 ZRG-TEAM, MIT — from zrg-team/NoLLMChat@771248e`).
No state-changes requirement, no copyleft.

**Provenance caveat (matters for what you lift, not for the licence verdict).** About 42k of the repo's ~53k TS/TSX lines live in `src/lib/`
and are vendored third-party code with the upstream attribution stripped:

| Directory | Lines | Apparent upstream | Status |
|---|---|---|---|
| `src/lib/vslite` | 26,839 | a "VSLite" WebContainer IDE project | UNVERIFIED upstream + licence; no notice in repo |
| `src/lib/plate-ui` | 8,958 | Plate (`@udecode/plate`) registry components | UNVERIFIED; registry code is normally MIT |
| `src/lib/shadcn` (incl. `chat/`) | 5,549 | shadcn/ui + a "shadcn-chat" style kit (`chat-bubble.tsx`, `chat-message-list.tsx`, `chat-input.tsx`) | UNVERIFIED; normally MIT |
| `src/lib/kokonutui` | 611 | kokonutui (README credits it) | UNVERIFIED |
| `src/lib/typeorm-pglite-browser` | 111 | resembles the `typeorm-pglite` npm package | UNVERIFIED |
| `src/services/local-embedding/utils/transformers-embeddings.ts` | 113 | near-copy of LangChain's HF-transformers embeddings class (the doc comment still says "Timeout to use when making requests to OpenAI", line 19) | langchainjs is MIT; attribution missing here |

The ZRG-TEAM MIT grant cannot license code ZRG-TEAM did not write. **Anything under `src/lib/` should be taken from its real upstream, not from here.**

---

## 2. What it actually is

### Manifest (`package.json`)

- `"name": "nochat", "private": true, "version": "0.0.0"`, Vite 6 + React 18 + TS 5.5 strict, Tailwind 3, Zustand 5, React Router 7.
- 150+ runtime dependencies. Heavy ones: `@mlc-ai/web-llm`, `@wllama/wllama ^2.3.3`, `@huggingface/transformers ^3.6`, the whole LangChain family
  (`langchain`, `@langchain/core|community|openai|groq|google-genai|langgraph|mcp-adapters`), `@electric-sql/pglite`, `typeorm` (patched via
  `patches/typeorm+0.3.20.patch`), `monaco-editor`, ~45 `@udecode/plate-*` packages, `@webcontainer/api`, `xterm`, `recharts`, `pdfjs-dist`, `dockview`.
- Declared but never imported in `src/`: `@langchain/langgraph` (`grep -rn langgraph src` = 0 hits outside the README). `uploadthing`/`@uploadthing/react` and `ai` are there for Plate's AI/media plugins.
- Scripts: `dev`, `build` (`patch-package && tsc -b && vite build`), `lint`, `typecheck`, `deploy` (gh-pages). **No `test` script.**

### Thread model — README claim vs code

README (§ "Thread Architecture") lists four threads: Main, Database Worker, LLM Thread, Embedding Thread.

| Claim | Reality | Evidence |
|---|---|---|
| Database in a Worker (TypeORM over PGlite, IndexedDB-backed) | TRUE | `src/services/database/worker/database.worker.ts:18-31` — `new DataSource({ type:'postgres', driver: new PGliteDriver({ dataDir:'idb://local-db', extensions:{uuid_ossp} }).driver, synchronize:true })` |
| LLM in a Worker | TRUE **for WebLLM only** | `src/services/webllm/worker/index.ts` spawns `webllm.worker.ts`; `webllm.worker.ts:34` wraps LangChain's `ChatWebLLM` and then reaches into its protected `engine` with `@ts-expect-error` (lines 36-39) |
| wllama "full support" (commit 2025-09-02) | wllama is instantiated **on the main thread** | `src/services/wllama/wllama.ts:37` `wllama = new Wllama(WLLAMA_CONFIG_PATHS, …)` in a plain module imported by `handlers/llm-handler.ts:7`. There is no `wllama.worker.ts`. (wllama spawns its own internal worker for the WASM, so the UI does not freeze — but that is wllama's doing, not this repo's.) |
| Embedding thread | TRUE | `src/services/local-embedding/worker/embedding.worker.ts:27-43` — transformers.js `pipeline('feature-extraction')` in a Worker |
| Vector DB | LangChain `MemoryVectorStore` or `VoyVectorStore`, serialised to localforage / a data node | `src/utils/vector-storage.ts:1-4`. Not pgvector, despite PGlite being present. Linear scan or Voy k-d tree; fine for hundreds of chunks. |

### The "dual runtime abstraction"

`src/services/local-llm/index.ts` is 32 lines: a `switch` returning one of two singletons, and a type re-export. The shared contract is
`src/services/local-llm/types/openai-compatible.ts` (74 lines): `chatCompletion(messages: BaseMessage[], options) => Promise<Response> | AsyncGenerator<Chunk>`.

Problems found by reading it:

1. **It is LangChain-shaped, not OpenAI-shaped**, despite the file name: input is `BaseMessage[]` (`openai-compatible.ts:58`), chunks carry an `AIMessage`. Lifting it drags `@langchain/core` in.
2. **Two parallel, disagreeing wllama implementations.** `wllama/api.ts` streams properly; `wllama/state.ts:45-73` is a placeholder Zustand store that accumulates the whole reply and yields once, with `loadModel` / `unLoadModel` bodies that are comments ("will be implemented properly later", lines 36-43).
3. **The API object refuses what the handler then does by hand.** `wllama/api.ts:39-45` throws `'Structured output not supported in Wllama yet'` / `'Function calling not supported in Wllama yet'`, while `handlers/local-llm-handler.ts:184-246` routes those same requests to prompt-based `manualStructuredResponse` / `manualFunctionCalling`.
4. **A latent self-destruct.** `local-llm-handler.ts:173-176`:
   ```ts
   const modelInfo = await getCurrentModelInfo(info?.llm?.provider)
   if (modelInfo) {
     await unLoadModel(info?.llm?.provider)   // unloads the model right before chatting with it
   }
   ```
   It only works today because models are loaded through `loadModelFromHF` directly (`handlers/llm-handler.ts:35`), which never sets `WllamaAPIImpl.currentModel`, so `modelInfo` is always `undefined`. Call `wllamaAPI.loadModel()` — the documented entry point — and every chat returns `''`.
5. **Load parameters are dead code.** `wllama.ts:17-23` declares `nThreads:-1, nContext:4096, nBatch:128`, but `loadModelFromHF` (line 71) passes only `progressCallback`. Context length is therefore whatever wllama defaults to. `DEFAULT_CHAT_TEMPLATE` (line 25) is exported and never referenced (`grep -rnw` = 1 hit, its definition).
6. **No cancellation anywhere.** `grep -rn "interruptGenerate\|AbortController\|abortSignal\|\.abort(" src` (excluding vendored libs) returns one hit, and it is a comment: `webllm.worker.ts:200  // engine.interruptGenerate();  // works with interrupt as well`. There is no Stop button path. For a premium chat product this is disqualifying on its own.

### Worker RPC and "streaming"

`src/utils/worker-base.ts` (149 lines) is a hand-rolled request/response envelope: `{messageId, type, payload}` out, `started | inprogress | complete | error` back.
Reasonable shape. Two defects:

- **Hard 120 s ceiling on every operation, including model download** — `worker-base.ts:74-86` races the handler against
  `setTimeout(…, options?.timeout || 120000)` and emits `TIMEOUT_ERROR`. `webllm.worker.ts:222` and `embedding.worker.ts:50` call
  `listenForMessages(handler)` with no override. A multi-GB model on a normal connection, or a long generation, is reported as failed while it is still running.
- **Streaming is polling.** `src/services/webllm/utils/fake-streaming.ts` (the name is the author's) loops on a shared array with
  `await new Promise(r => setTimeout(r, options?.interval || 50))` (line 44) instead of resolving on message arrival. Adds up to 50 ms latency per batch and burns a timer for the whole generation.

### "Flow Machine" — README claim vs code

README: "sophisticated two-phase execution system … Dynamic Dependency Resolution … Topological Sorting … with cycle detection", and an integration table saying the chat, document editor and code editor all run through it.

Code (`src/services/flow-machine/flow-machine.ts`, 546 lines):

- `collectUpstreamNodes` (lines 283-294) is commented "Only get direct incoming nodes (one level)". `runPreparePhase` (206-237) calls `prepare()` on those direct parents; `runExecutePhase` (242-266) calls `execute()` on **the target node only**.
- So a "run" is: gather config from the nodes wired directly into a Thread node into a `Map`, then call the LLM once. There is no multi-node execution, no branching, no loops, no data passing between executed nodes. Topological sort exists (lines 467-546) but only orders the list returned by `context.getConnectedNodes`.
- Only `use-flow-chat.ts:157-163` and `MessageNode/hooks/use-actions.ts:82-83` construct a `FlowMachine`. The ChatApplication page does not: `components/pages/ChatApplication/hooks/use-send-message.ts:13` calls `llmHandler` directly. The README's integration table is aspirational.
- `ToolNodeHandler` exists (`Nodes/llm/ToolNode/handler.ts`) but is **never registered** — the registration block in `use-flow-chat.ts:157-163` omits it, with a stale comment "SchemaNodeHandler removed - not implemented yet" directly under the line that registers it.

This is an honest 30 %-done project (the README's own progress bar says `[■■■□□□□□□□] 30%`), not a workflow engine.

### Tools, agents, MCP

- **No tool is ever executed.** `grep -rn "ToolMessage\|bindTools\|\.invoke(" src` (non-lib) yields: one worker `model.invoke`, and `langchain-llm-handler.ts:114`. The only consumer of `tool_calls` is a renderer: `Nodes/chat/MessageNode/components/AIMessage.tsx:62-64`. The model's chosen function + args are displayed; nothing runs, nothing is fed back.
- **"Basic agent"** (commit 2025-07-27 "feat: basic agent implement"): `Nodes/llm/BasicAgentNode/hooks/use-actions.ts` is 20 lines whose only action is `createThread(node)`. No loop.
- **MCP**: `src/services/mcp/index.ts` lists tools from an SSE MCP server via `MultiServerMCPClient`; its sole caller is `MCPNode.tsx:34`, which displays them. They are never bound to a model.
- **Cloud handler ignores tools**: `langchain-llm-handler.ts:66` destructures `schemas, onMessageUpdate, onMessageFinish` — `tools` is dropped. And line 114 `model.bindTools([searchRetrievalTool])` discards the return value (`bindTools` returns a new runnable), so the Google-search option is a no-op.

What *is* real and decent: the **tool-call *generation*** path for WebLLM. `webllm.worker.ts:78-148` builds a Zod schema
`{tool_calls:[{name, parameters}]}`, converts it with `zod-to-json-schema`, and passes it as `response_format: {type:'json_object', schema}` so
WebLLM's grammar engine (XGrammar) forces syntactically valid JSON out of a 1-3B model. That is the right technique for SLMs, and it is ~70 lines.
The wllama equivalent (`wllama/utils/manual-function-calling.ts`) is prompt-only: a Llama-3.1-style system prompt with a hard-coded
`Today Date: 23 Jul 2024` (line 8) and a `<function>…</function>` regex. wllama supports GBNF grammars; this repo does not use them.

### Chat UX

`components/pages/ChatApplication` — 2,126 lines total. Threads are labelled `` `Thread ${index + 1}` `` (`ChatPanel.tsx:151`); sidebar is
`collapsible="none"` (line 124); `grep -c "md:\|sm:\|useIsMobile"` over the directory = 0. Markdown via lazy `@uiw/react-markdown-preview`
with a custom `<think>` renderer (`MarkdownViewer/index.tsx:19-24`) — a nice touch for R1/Qwen3 reasoning models, 6 lines.
No stop, no regenerate, no edit-and-resend in this page, no token/s readout, no attachment, no search. TTS helper exists (`utils/text-to-speech.ts`, easy-speech).
The model picker does one useful thing: `CreateLLMCard/index.tsx:266-270` hits `https://huggingface.co/api/models/<user>/<repo>` and filters `siblings` for `.gguf` to let the user pick a quant.

### Mobile / PWA

None. `grep -rniE "serviceWorker|webmanifest|vite-plugin-pwa|workbox|capacitor"` matches nothing relevant (only a VS Code icon manifest).
`index.html:6` sets `maximum-scale=1.0, user-scalable=no` (an accessibility regression, not mobile support). The primary UI is a pan/zoom node canvas.
One transferable detail: `public/_headers` and `vite.config.ts:55-60` set `COOP: same-origin` + `COEP: require-corp`, which multi-thread wllama needs — but note `COEP: require-corp` breaks cross-origin images/iframes without CORP headers and GitHub Pages (their `deploy` target) cannot send these headers at all, so the gh-pages build silently runs single-thread. UNVERIFIED at runtime; follows from the config.

### Engineering hygiene

| Item | Finding |
|---|---|
| Tests | **Zero.** No `*.test.*`, `*.spec.*`, `__tests__`, vitest or jest config anywhere. |
| CI | **None.** `.github/` contains only `pull_request_template.md`; no `workflows/`. Gate is a local husky `pre-commit` (prettier, lint, typecheck). |
| Types | `strict: true`, `noUnusedLocals/Parameters` (`tsconfig.app.json`). 16 `any`, 12 `@ts-expect-error/@ts-ignore`, 33 `eslint-disable`, 11 TODO/FIXME across 53k lines — good discipline. |
| History | 138 commits, 2024-09-30 → 2025-09-03, effectively one human. Several commits authored as `jitera-agent` (2025-03), i.e. machine-authored (UNVERIFIED what Jitera contributed). One "Upgrade main packages" + immediate Revert (2025-07-20). Last 5 commits pushed straight to main in two days, ending with "finally the webllm and wllama support". 0 open issues, 5 forks, 56 stars. |
| Releases | None; `version: 0.0.0`. |
| Repo weight | GitHub `size` = 477 MB, mostly GIFs under `public/docs/`. |

---

## 3. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | **2** | 138 commits by one author, no tests/CI/releases, self-declared 30 % complete, untouched for 12 months, last push was a rushed refactor leaving duplicate half-implemented wllama layers. |
| code_quality | **3** | Strict TS, clean naming, sensible separation — undermined by real logic bugs (inverted unload, infinite-recursion JSON retry, dead config, discarded `bindTools`), zero tests, and README-vs-code drift. |
| chat_ux | **2** | Functional bubble list with markdown and `<think>` rendering; no stop/regenerate/edit, "Thread N" titles, not responsive; the product's centre of gravity is the node canvas, not chat. |
| agentic | **1** | Tool calls are generated and *displayed* only; no execution, no loop, no `ToolMessage`; "agent" node creates a thread; MCP tools are listed, never bound; LangGraph is an unused dependency. |
| mobile_pwa | **1** | No manifest, no service worker, no responsive classes in the chat page, pinch-zoom disabled, canvas-first UI. |

---

## 4. Liftable units

Ranked by value to a Vite + React + TS chat PWA built on wllama. LOC from `wc -l`.

### 4.1 Grammar-constrained tool calling + structured output for WebLLM — TAKE (if WebLLM is in scope)

- Paths: `src/services/webllm/worker/webllm.worker.ts` (228), `src/services/webllm/worker/type.ts` (42),
  `src/services/webllm/utils/manual-function-calling.ts` (157), `src/services/webllm/utils/manual-structured-response.ts` (68),
  `src/utils/json.ts` (17). ~510 LOC.
- Deps: `@mlc-ai/web-llm`, `zod`, `zod-to-json-schema`; currently also `@langchain/community` (`ChatWebLLM`) and `@langchain/core` messages.
- Transplant: **moderate.** The valuable 70 lines are `webllm.worker.ts:78-148` (schema → `response_format` → streamed JSON → `tool_calls`).
  Strip LangChain: call `MLCEngine` / `CreateWebWorkerMLCEngine` directly rather than poking `ChatWebLLM`'s protected field. Then port the *idea* to wllama with a GBNF grammar, which this repo never did.
- Why over fresh: it encodes the working trick (constrain the whole reply to a tool-call schema, fall back to a tagged-prompt parser for models without grammar support) and the system-prompt placement rules (`{{tools}}` substitution vs. injected assistant turn, lines 102-119).
- Must fix on the way in:
  - `utils/json.ts:12` — `tryOptions.filter((item) => item === 'retryWithMissingBracket')` keeps the flag it means to remove, so any unparseable JSON recurses, appending `}` each time, until `RangeError: Maximum call stack size exceeded`. Should be `!==`.
  - `webllm.worker.ts:138-139` — `safeParseJSON(content)` can return `undefined`; `.tool_calls.map` then throws a `TypeError`.

### 4.2 Typed Worker RPC envelope — TAKE AS A PATTERN, or use Comlink instead

- Paths: `src/utils/worker-base.ts` (149), `src/utils/promise.ts` (28), `src/services/webllm/utils/fake-streaming.ts` (53). 230 LOC, zero dependencies beyond a logger.
- Transplant: **easy** mechanically. But replace the 50 ms polling generator with a push-based async queue, remove or parametrise the 120 s timeout (`worker-base.ts:76`), and add a `cancel` message type — at which point perhaps 80 original lines survive.
- Why over fresh: marginal. Its one advantage over Comlink is first-class `inprogress` events for token streaming. Honest assessment: **a fresh 100-line version with `AbortSignal` is better than the transplant.**

### 4.3 Embedding Worker + LangChain-compatible wrapper — TAKE only if LangChain is already in the stack

- Paths: `src/services/local-embedding/worker/embedding.worker.ts` (54), `…/utils/worker-embeddings.ts` (151), `…/utils/transformers-embeddings.ts` (113), `…/state/actions.ts` (387). ~700 LOC.
- Deps: `@huggingface/transformers`, `@langchain/core`, Zustand, plus 4.2.
- Transplant: **moderate** — coupled to the Zustand store and the worker envelope. The worker itself (54 lines) is trivially rewritten.
- Note `transformers-embeddings.ts` is LangChain's class with a changed import; take it from langchainjs with correct attribution instead.

### 4.4 GGUF picker + curated small-model list — TAKE (tiny, easy)

- Paths: `src/components/molecules/CreateLLMCard/index.tsx:250-290` (the HF `siblings` → `.gguf` filter), `src/constants/local-llm.ts` (26; 15 GGUF repos: LFM2 350M/700M/1.2B, Qwen3 0.6B/1.7B/4B, gemma-3 270m/1b, SmolLM3-3B, Llama-3.2-1B, Phi-4-mini-reasoning, R1-distill-1.5B).
- Transplant: **easy** — 40 lines, `fetch` only. List is a year old; verify each repo still exists before shipping (UNVERIFIED today).

### 4.5 `<think>` block renderer — TAKE (6 lines)

- `src/components/molecules/MarkdownViewer/index.tsx:19-24`. Depends on raw HTML passing through the markdown pipeline — pair it with `rehype-sanitize` and an allow-list containing `think` (see red flags).

### 4.6 PGlite + TypeORM in a Worker — DO NOT TAKE

- Paths: `src/lib/typeorm-pglite-browser/` (111), `src/services/database/` (1,923), `patches/typeorm+0.3.20.patch`.
- Transplant: **hard.** Needs `reflect-metadata`, decorators + `emitDecoratorMetadata`, a patched TypeORM, `vite-plugin-node-polyfills`, `entitySkipConstructor`, and a JSON bridge to serialise `FindOptions` operators across `postMessage` (`utils/serialize.worker.ts`). `synchronize: true` in production means schema changes are applied destructively with no migrations. For chat history, Dexie/IndexedDB or PGlite with plain SQL is a fraction of the weight. Provenance of the driver shim is UNVERIFIED.

### 4.7 Flow Machine / ReactFlow canvas — DO NOT TAKE

- Paths: `src/services/flow-machine/` (944), `src/components/flows/` , `src/hooks/flows/` (1,601).
- Not a workflow engine (§2). Bound to the TypeORM entities and ReactFlow instance. A chat product does not need it.

### 4.8 Crypto helpers — DO NOT TAKE

- `src/utils/aes.ts` (128), `src/utils/secure-session.ts` (74), `src/utils/rsa.ts`, `src/utils/passphrase.ts`. See red flags.

---

## 5. Red flags

1. **Stale and single-maintainer.** Last push 2025-09-03; final commits are a hurried two-day refactor. Dependencies pinned to mid-2025 (`@wllama/wllama ^2.3.3`, `web-llm ^0.2.79`, LangChain 0.3.x); expect API drift.
2. **README overstates.** "Flow Machine … orchestrates" chat/editor/code apps (it does not), "Tool Handlers" box in the architecture diagram (there are none), LangGraph listed under AI frameworks (never imported). Not generated filler — the app builds and a demo is deployed — but claims must be checked against code, as above.
3. **`new Function` on remote-derived input.** `src/services/mcp/index.ts:63-66`:
   ```ts
   const zodObject = new Function('z', `return (${jsonSchemaToZod(tool.schema as JsonSchema)});`)(z)
   ```
   The JSON Schema comes from whatever MCP server URL the user typed. Safety rests entirely on `json-schema-to-zod` escaping every string it emits. Treat as a code-injection surface; also incompatible with a strict CSP (`unsafe-eval`).
4. **Unsanitised model output rendered as HTML-capable markdown.** `@uiw/react-markdown-preview` is used with no `rehype-sanitize`, no `skipHtml`, no DOMPurify (`grep` for all three = 0 hits). Exploitability through React's renderer is UNVERIFIED, but RAG content and cloud-model output flow into it, and the `<think>` feature depends on raw tags passing.
5. **Weak home-grown crypto guarding API keys.** `utils/aes.ts`: key = bare `SHA-256(passphrase)` (no salt, no PBKDF2/Argon2), mode AES-CBC (no authentication), and `getIvFromPassphrase` (lines 44-48) sets **IV = first 16 bytes of the key**, constant for every message. `utils/secure-session.ts:39,58` uses AES-GCM with a **fixed all-zero 12-byte nonce** for every `set()` under one key — nonce reuse voids GCM's guarantees. OpenAI/Groq/Gemini keys are stored this way in IndexedDB.
6. **Operational bugs that would surface in production:** 120 s worker timeout on downloads (§2), no abort, inverted unload (§2 item 4), infinite-recursion JSON retry (§4.1), wllama context params never applied (§2 item 5).
7. **Dependency mass.** 150+ runtime packages; Monaco + ~45 Plate packages + WebContainer + xterm + pdfjs + LangChain ×8 for features a chat product does not need. `build.sourcemap: true` and the bundle visualizer with `open: true` are on for every non-dev build (`vite.config.ts:29-36,39`).
8. **Vendored third-party code without attribution** (§1 table) — 80 % of the line count.
9. **A committed `.env`** (`VITE_BASE_URL`, `VITE_ROUTE_MODE` only — no secrets; verified by reading it). No telemetry/analytics found (`react-scan` is a dev script only).

---

## 6. Recommendation

For the operator's product (premium chat, PWA + Android, wllama/GGUF first):

- **Base app: no.** Wrong centre of gravity (node canvas), no PWA, no mobile, no abort, no tests.
- **wllama integration: no.** 130 lines around `wllama.createChatCompletion` with dead config and no worker/abort story; wllama's own examples are a better starting point.
- **Take, with attribution and the fixes listed:** §4.1 (constrained tool-call generation, as the reference for a GBNF port to wllama), §4.4 (GGUF picker + model list), §4.5 (`<think>` renderer). Optionally §4.2 as a sketch.
- **Net liftable value: roughly 300-600 lines**, all of which need modification. This repo is more useful as a catalogue of what to avoid (LangChain types as the inter-thread contract, polling "streams", ORM-in-the-browser) than as a source of code.
