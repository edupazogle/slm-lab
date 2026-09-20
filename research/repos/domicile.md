# kyrillosishak/Domicile — deep-dive dossier

```
WHAT IT IS      Browser-side "private AI stack" library (npm @kyrillosishak/domicile 0.2.2): pure-TS HNSW index + IndexedDB store,
                Transformers.js embeddings, WebLLM/wllama provider wrappers, a RAG pipeline (BM25+RRF, cross-encoder rerank), an MCP
                tool registry, plus a Tauri demo shell. Single author, ~12.4k LOC src + 7.3k LOC tests, written in ~4 sessions by an AI agent.
LICENCE         MIT (LICENSE file read, "Copyright (c) 2026 kyrillosishak"). Verdict: YES, copy with attribution (keep the notice).
BEST TO TAKE    The small retrieval kit: src/rag/HybridSearch.ts (BM25 + RRF, 170 LOC), src/rag/Chunker.ts (161), src/rag/Reranker.ts (165),
                src/llm/FallbackLLMProvider.ts (144) and the wllama onToken->AsyncGenerator bridge in src/llm/WllamaProvider.ts:128-201.
BIGGEST RISK    README-ware. The HNSW index is never reloaded from IndexedDB on startup, the "primary" ONNX embedder uses a hash tokenizer,
                the WorkerPool has no worker, the "RAG chatbot demo" returns a hardcoded answer, CI has never run the tests.
SCORES          maturity 1 · code_quality 3 · chat_ux 1 · agentic 2 · mobile_pwa 1
RECOMMENDATION  Do not adopt as a dependency or as an architecture. Lift 5-6 small, self-contained files (~900 LOC) after review; write the rest.
```

Source clone: `/home/edu/.cache/slm-src/kyrillosishak_Domicile` (shallow, HEAD `af2465d`, 2026-06-24).
All `path:line` references are relative to that root. Nothing was executed — there is no `node_modules`
and installing was out of scope — so every behavioural claim below is from reading code, and is marked
UNVERIFIED where it depends on a third-party library's runtime behaviour.

---

## 1. Licence

- `LICENSE` is the standard MIT text, `Copyright (c) 2026 kyrillosishak` (LICENSE:1-21). `package.json:72` says `"license": "MIT"`.
  GitHub API reports `license.spdx_id = MIT`.
- No `NOTICE`, `THIRD_PARTY`, or `COPYING` file exists (searched with `find -iname`). No per-file licence headers, no
  "adapted from / ported from" comments anywhere in `src/`, `desktop/`, `packages/` (grep returned nothing relevant).
- The MIT licence was added in commit `f7ee2dd` (2026-06-21). Commits before that date (Nov 2025, the "Haven" era) were
  published with no licence; the current HEAD is what we would copy, and it is covered.

**Verdict: `yes` (MIT).** Condition that always applies to MIT: keep the copyright + permission notice in "all copies or
substantial portions". Practically: put the MIT text in a `THIRD_PARTY_LICENSES` file and a header comment
(`// Adapted from kyrillosishak/Domicile @af2465d, MIT`) on each vendored file. Works for a private product and for an MIT release.

Dependency licences to be aware of if any of them is pulled in with the code (from the manifests, not from this repo's LICENSE):
`hnswlib-wasm` is described in-repo as Apache-2.0 (src/index/HnswBackedIndex.ts:4) — not needed for anything recommended below.
`@wllama/wllama`, `@mlc-ai/web-llm`, `@huggingface/transformers`, `@modelcontextprotocol/sdk`: licences not re-checked here — UNVERIFIED in this dossier.

**Provenance caveat.** Branch names in the history are `opencode/proud-planet` and `opencode/crisp-meadow`
(commit `ea1fcf9`), and three commits land +5,718 / +4,522 / +2,341 lines each (gh api commit stats). This is AI-agent output
published by one person. That does not change the MIT grant, but it means nobody has vouched for the code line by line,
and there is no way to rule out that a model reproduced third-party code without attribution. For the small, generic
algorithms recommended here (BM25, RRF, sentence chunking) that risk is low.

## 2. Repo facts (GitHub API, 2026-09-21)

| Fact | Value | Source |
|---|---|---|
| Stars / forks / open issues | 9 / 2 / 1 | `gh api repos/kyrillosishak/Domicile` |
| Created / last push | 2025-11-17 / 2026-06-24 | same |
| Contributors | 1 (`kyrillosishak`, 37 commits) | `gh api .../contributors` |
| Only issue | #1, opened by `Copilot` (bot), about WASM bindings | `gh api .../issues?state=all` |
| Tags / releases | none | `gh api .../tags`, `.../releases` |
| npm | `0.2.0`, `0.2.1`, `0.2.2` all published within 34 minutes on 2026-06-21; 42 downloads in the last month | registry.npmjs.org, api.npmjs.org |
| Homepage | https://kyrillosishak.github.io/Domicile/ (GitHub Pages showcase) | repo metadata |

Commit history shape: 10 commits in Nov 2025 (as "Haven"), silence for 7 months, then 27 commits on 2026-06-21..24.
Of the last 30 commits, 14 are logo / README / URL fixes. The final commit is titled "feat: complete all roadmap items —
desktop app, PyScript bindings, quantization, multi-modal CLIP, tests, workflows" (+4,522 lines, 47 files, one commit).
No activity in the 3 months since. npm `0.2.2` predates that last commit, so the published package is not HEAD.

**CI.** Four workflows: `docs.yml`, `pages.yml`, `release.yml`, `tauri.yml`. Type-check, lint and tests run only inside
`release.yml`, which triggers on `v*` tags (.github/workflows/release.yml:3-6). There are no tags, and the last 15 Actions
runs are all "Deploy showcase to Pages" / "Deploy API Docs". **The test suite has never run in CI.**

## 3. Architecture map (what is actually in `src/`)

```
src/core/       VectorDB.ts (1224)  facade: insert/search/delete/update/export/import, filter eval
                factory.ts (84)     createDomicile(): capabilities -> device, wires HnswIndex + IndexedDBStorage + TransformersEmbedding
                capabilities.ts (80) detectCapabilities(): webgpu/wasm/simd/SAB/indexedDB/deviceMemory -> tier
                ModelRegistry.ts (231) hardcoded catalogue + canRun pre-flight
                residency.ts (119)  fetch/XHR monkey-patch host allowlist
src/index/      HnswIndex.ts (516)  pure-TS HNSW   <- the one actually used
                HnswBackedIndex.ts (448), BruteForceBackedIndex.ts (268), BackedIndex.ts, TombstoneLog.ts
                                    hnswlib-wasm backend  <- NOT exported, NOT referenced by core (dead)
src/storage/    IndexedDBStorage.ts (767) three object stores: vectors, index, metadata
src/embedding/  TransformersEmbedding.ts (328)  real; main-thread pipeline('feature-extraction')
                OnnxEmbeddingGenerator.ts (415) NOT real (see 4.3); not exported
src/llm/        WebLLMProvider.ts (265), WllamaProvider.ts (233), FallbackLLMProvider.ts (144), types.ts (25)
src/rag/        RAGPipelineManager.ts (433), HybridSearch.ts (170), Reranker.ts (165), Chunker.ts (161),
                Tokenizer.ts (128), CitationBenchmark.ts (269)
src/mcp/        MCPServer.ts (628)  in-process tool registry + Node-only stdio/SSE/streamable-http
src/performance/ LRUCache, MemoryManager, WorkerPool (187), BatchOptimizer, ProgressiveLoader, Benchmark*, PerformanceOptimizer
src/react/      index.ts (307)      useDomicile/useSearch/useRag/useRagStream/useCapabilities/useIngestProgress
src/cli/        Node CLI (bench/serve/init/export/import) running on fake-indexeddb
desktop/        Tauri shell + 262-line vanilla-TS UI      showcase/  GitHub Pages landing + playground (minified inline JS)
```

Totals: 12,431 LOC non-test TS, 7,257 LOC tests across 45 test files (`find | wc -l`). `tsconfig.json` is `strict` with
`noUnusedLocals`/`noUnusedParameters`. 105 occurrences of `any` casts/annotations in non-test source; `type Wllama = any`
and `type MLCEngine = any` mean both LLM wrappers are untyped against the libraries they wrap
(src/llm/WllamaProvider.ts:8, src/llm/WebLLMProvider.ts:8-11).

The layering (contracts in `core/contracts.ts`, adapters injected by a factory) is clean and readable. The problem is not
the shape; it is that several boxes in the diagram are empty.

## 4. README claims vs. the code

### 4.1 "Persistent client-side storage ... pure-TypeScript HNSW ... Hold and search 100K+ documents" — PARTLY FALSE

The HNSW is real and pure TS (src/index/HnswIndex.ts). But:

**The index is never persisted or rehydrated.** `IndexedDBStorage.saveIndex()/loadIndex()` exist
(src/storage/IndexedDBStorage.ts:508, 541) and are called by nothing:

```
$ grep -rn "loadIndex(\|saveIndex(\|rebuildIndex(" src desktop | grep -v test
src/core/VectorDB.ts:841:          await this.rebuildIndex();      # inside import()
src/core/VectorDB.ts:845:        await this.rebuildIndex();        # inside import()
...declarations only
```

`initializeInjected()` and `initializeDeclarative()` create an empty `HnswIndex` and return
(src/core/VectorDB.ts:90-121, 125-174). After a page reload the records are still in IndexedDB but the graph is empty,
so `search()` returns `[]` until the user re-imports. For a chat app with document memory this is the one feature
that matters, and it is missing. (The repo's own `ANALYSIS_DEEP.md:16-18` lists the unused `INDEX_STORE` as a known defect of v0.1; it is still unused.)

Algorithmic weaknesses in `HnswIndex.ts`, all visible in the source:
- No heap. Candidate and result lists are re-sorted with `Array.sort` inside the inner loop
  (`candidates.sort(...)`, `results.sort(...)` at :419, :422, :440) — O(ef log ef) per expansion.
- Neighbour selection is "keep the m nearest" (:331-341), not the diversity heuristic of the HNSW paper; layer 0 uses `m`, not `2m`.
- Deleted nodes are not traversed (`if (!node || node.deleted) continue;` :429, :434). hnswlib traverses tombstones and only
  hides them from results; skipping them can disconnect the graph, so recall decays with deletes. Deleted nodes are only
  dropped on `serialize()` (:209-211), which nothing calls.
- Upsert bug: re-inserting an existing id sets `deleted = true` on the old node and then does `vectorCount++` without a
  decrement (:280-289); old neighbours still hold the id and now point at a node with a different vector.
- `serialize()` emits one JSON string with `Array.from(n.vector)` for every node (:201-217). At 100K x 384 dims that is
  tens of millions of decimal numbers in a single string. "100K+" is not credible as written; the README's own table only reports 1K and 10K at 128 dims.
- Filter handling: the index cannot see metadata; it over-returns and `VectorDB.idxSearch` does one `storage.get()` IndexedDB
  round-trip **per hit** (src/core/VectorDB.ts:1093-1104).

The README benchmark row "recall@10 = 0.91 (10K, 128-dim)" is measured in Node on random vectors (README "Measured on a Linux/server CPU (Node)"). UNVERIFIED — not re-run.

### 4.2 "Dual LLM Runtime ... automatic fallback" — REAL BUT THIN

- `FallbackLLMProvider` (144 LOC) is genuine and sensible: probe `isAvailable()` in order, init the first that works,
  and on a call-time failure cascade to the next provider **only if nothing has been yielded yet** (src/llm/FallbackLLMProvider.ts:68-88).
- `WllamaProvider.generateStream` correctly bridges wllama's `onToken(Uint8Array)` callback into an `AsyncGenerator` with a
  streaming `TextDecoder` (src/llm/WllamaProvider.ts:140-191). The comment at :143-144 admits the previous version was "a silent no-op stream".
- But both providers are single-prompt text completion. `WebLLMProvider` wraps the prompt as one `user` message
  (:121-123); `WllamaProvider` calls `createCompletion(prompt)` with **no chat template** (:110, :159). There is no message
  history, no system role, no abort/stop-generation (`GenerateOptions` has no `signal`, src/llm/types.ts:5-11), no token/s stats,
  no model cache management. For a chat product these are the hard parts, and none are here.
- wllama defaults: `n_threads: 1` (:73) — the multi-thread build is never selected unless the caller sets it; and
  `new Wllama(this.config.wasmPaths || {})` (:46) passes an empty path map when unconfigured, which wllama v2 cannot load from
  (UNVERIFIED by execution; wllama's constructor expects the `single-thread/wllama.wasm` / `multi-thread/wllama.wasm` URLs).
- The desktop app — the flagship demo — wires **only WebLLM**; the comment says "wllama can be wired here too with a modelUrl"
  (desktop/main.ts:51-68). So the advertised GPU->CPU fallback is not exercised by any shipped UI in `desktop/`.

### 4.3 "Local Embeddings: Transformers.js with WebGPU and WASM fallback" — REAL; the ONNX path is FAKE

- `TransformersEmbedding` works as described: tries the requested device, falls back webgpu -> wasm on first failure, retries
  with backoff, batches through one pipeline call (src/embedding/TransformersEmbedding.ts:42-151). Caveats: it passes
  `quantized: true` (:97), a Transformers.js v2 option; the repo depends on `@huggingface/transformers ^3.1.2` where precision
  is selected with `dtype` (UNVERIFIED whether v3 silently ignores it). It runs on the **main thread** — no worker.
- `OnnxEmbeddingGenerator.ts` describes itself as the "primary text/image embedding pipeline" that "replaces
  @huggingface/transformers" (:1-5). Its tokenizer is this:

  ```ts
  // Minimal whitespace tokeniser producing dummy IDs; suitable only for
  // shape/dimension checks. Real usage requires a Tokenizer ...
  for (...) h = (h * 31 + m[0].charCodeAt(k)) >>> 0;
  ids[i++] = BigInt((h % 30000) + 1000);            // src/embedding/OnnxEmbeddingGenerator.ts:349-365
  ```
  Feeding hashed pseudo-ids to MiniLM yields meaningless vectors. `inferHiddenSize()` returns the constant 384 (:342-347).
  `embedImage()` fills the vector from raw file bytes: `out[i] = (bytes[i % bytes.length] || 0) / 255 - 0.5` (:200-204).
  It is not exported from `src/index.ts`, so it cannot hurt a consumer, but it is 415 lines of filler in the tree.
- "Multi-modal CLIP": `src/multimodal/index.ts:41-45` loads CLIP through `pipeline('feature-extraction', ...)` for both text and
  "vision". UNVERIFIED that this produces aligned image embeddings; Transformers.js uses a separate image-feature-extraction task.

### 4.4 "Worker pool for batched parallelism" — FALSE

`WorkerPool.ts` is a competent generic pool (queue, transferables, error path). There is **no worker script** in the repo
(`find -name "*worker*"` returns only the pool and its test), and nothing ever calls `execute()`. The supposed consumer:

```ts
const url = await importUrlForWorker();
void url; // currently unused — pool is exercised via in-process batch below
void poolSize;
const { createInvocation } = await import('./parallelBatch');
void createInvocation;
...
return this.embedBatch(texts, opts);                 // src/embedding/OnnxEmbeddingGenerator.ts:166-179
```
`importUrlForWorker()` returns `null` (:411-414). The `void x;` lines exist to satisfy `noUnusedLocals`. `PerformanceOptimizer`
constructs the pool (:122) but never calls `initialize(workerScript)`. Consequence for us: embeddings and HNSW inserts all run on
the UI thread.

### 4.5 "RAG with Citations ... linking every claim back to the document that grounded it" — OVERSTATED

`RAGPipelineManager` is a clean 7-stage pipeline and `queryStream()` is a nice shape: it yields a `retrieval` chunk with the
sources first, then `generation` chunks, then `complete` (src/rag/RAGPipelineManager.ts:192-245). But:
- "Citations" are just the ranked source list with a 280-char snippet (:374-389). Nothing parses `[n]` markers from the answer
  or binds a claim to a passage. The streaming path never emits `citations` at all.
- Hybrid bug: a BM25-only hit is returned as `{ id, score, metadata: {} }` (:288-293), and `formatContext` reads
  `result.metadata.content || ''` (:337), so that hit contributes an **empty document** to the prompt.
- The BM25 index is in-memory, not persisted, and only populated if the caller remembers to call `indexDocument()` (:96-98).
- `template.replace('{context}', context)` (:362-365) uses string replacement, so `$&` / `$1` sequences inside a user document are
  interpreted as replacement patterns. Minor, but it is user-controlled text.
- The README number "citation recall@3 = 0.92 (legal known-answer corpus)" comes from a **12-passage, 12-question** corpus
  embedded with a bag-of-words embedder, not a neural model (src/rag/CitationBenchmark.ts:78-107, :110-131, :187). 0.92 = 11 of 12.
- `BM25Index.search` scans every document and rebuilds its term-frequency map per query (src/rag/HybridSearch.ts:106-124);
  `add()` recomputes the average length over the whole corpus each time (:67, :131-139) — O(n^2) bulk ingest. Fine for hundreds of chunks.
  The tokenizer strips everything outside `[a-z0-9]` (:41-45): no accents, no CJK — English-only.

### 4.6 "MCP Integration — wire Domicile into Claude Desktop" — MISLEADING

- The in-process registry (`getTools()` / `executeTool()`) with JSON-schema validation and a non-bypassable "matter scope" filter is
  real (src/mcp/MCPServer.ts:66-135). Tool names are `search_vectors`, `insert_document`, `delete_document`, `rag_query`.
- The wire transports are Node-only (`node:http`, :503-504). In Node the storage is `fake-indexeddb`
  (src/cli/env.ts:15-25), an in-memory shim. So `domicile serve` exposes an **empty, non-persistent, separate** database —
  never the data the user put in their browser. The headline use-case cannot work as described.
- Tools are registered on the SDK server with no input schema: `toolsList.tool(tool.name, tool.description, async (args) => ...)`
  (:610-627), and a bare `catch {}` swallows registration failures. An MCP client therefore sees tools with no parameters.
  In the TS SDK a schema-less `tool()` callback receives the request `extra`, not the arguments, so `executeTool` would fail
  validation on the missing `query` — UNVERIFIED by execution. The vitest transport test only checks that `initialize`
  returns 200 (src/mcp/MCPServer.transports.test.ts:50-62); no test performs a `tools/call` over the wire.
- The HTTP servers call `httpServer.listen(port)` with no host (:573, :601) — all interfaces — with no auth, no `Origin`/`Host`
  check. Insert and delete tools are reachable by anything on the LAN, and by any web page via DNS rebinding.

### 4.7 Capability detection — REAL, with a logic hole

`detectCapabilities()` (src/core/capabilities.ts:25-71) probes WebGPU adapter, WASM, a SIMD feature-test module, SAB,
IndexedDB and `navigator.deviceMemory`. `inferTier()`:

```ts
if (!webgpu) return 'low';
if (memoryGB === undefined) return 'mid';
if (memoryGB <= 4) return 'low';
if (memoryGB <= 8) return 'mid';
return 'high';                                          // :73-79
```
`navigator.deviceMemory` is clamped by spec to a maximum of 8, so `'high'` is unreachable in any browser that reports it, and
every model tagged `minTier: 'high'` in `ModelRegistry` (Qwen2.5-7B, Hermes-8B, bge-large — ModelRegistry.ts:54, 62-63) is refused
on exactly the machines that can run them. Any WASM-only device is `'low'` regardless of RAM. It also calls
`adapter.requestAdapterInfo?.()` (:53), which current Chrome has removed in favour of `adapter.info` (optional-chained, so harmless).
The registry also lists the cross-encoder `Xenova/ms-marco-MiniLM-L-6-v2` as an embedding model with 384 dims (:51).

### 4.8 README quick-start does not match the API

| README | Actual |
|---|---|
| `new RAGPipelineManager(db, llm, embedding)` | constructor takes one config object (RAGPipelineManager.ts:76) |
| `new WllamaProvider({ model: '...' })` | field is `modelUrl` (WllamaProvider.ts:11) |
| `new MCPServer(db, rag)` / `mcp.serve({ transport: 'stdio' })` | `new MCPServer({vectorDB, ragPipeline})` / `serve('stdio')` (MCPServer.ts:42, :506) |
| `await db.stats()` | no such method on `VectorDB` (only `getPerformanceStats()`, VectorDB.ts:976) |
| `npm run benchmark` | no such script in package.json |
| "quota-aware eviction" in IndexedDB | `grep quota\|estimate` finds only an error class; no `navigator.storage.estimate()` anywhere |

### 4.9 The demos

- `examples/rag-chatbot-demo.html` — the only thing in the repo that looks like a chat UI — is a mock:
  `// Simulate RAG query` -> `setTimeout(1500)` -> a hardcoded paragraph about machine learning with invented
  `retrievalTime: 45, generationTime: 1234` (examples/rag-chatbot-demo.html:510-535).
- `showcase/playground.html` is real: it imports the npm build from jsDelivr and runs retrieval, WebLLM RAG and a
  prompt-based ReAct loop (`TOOL:` / `ARGS:` / `ANSWER:` lines parsed by regex, up to 6 rounds, dispatched through
  `mcp.executeTool`) (showcase/playground.html:503-560). It is ~60 lines of minified inline JS; useful as a reference for driving
  tools with a 1B model that has no native function calling, not as liftable code.

## 5. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | **1** | One author, 37 commits in two bursts, no tags/releases, tests never run in CI, 42 npm downloads/month, idle for 3 months, core persistence missing. |
| code_quality | **3** | Strict TS, clear seams and readable files, 7k LOC of tests; offset by dead hnswlib backend, a fake ONNX embedder, `void x;` compiler-appeasement, 105 `any`s, tests that mock the libraries they claim to cover. |
| chat_ux | **1** | No chat UI: one question box, `textContent +=` per token, no history, no markdown, no stop button; the "chatbot demo" is canned. |
| agentic | **2** | A validated in-process tool registry and a working prompt-ReAct loop in the playground; the wire MCP path is schema-less and points at an empty DB. |
| mobile_pwa | **1** | No manifest, no service worker, no offline shell, no mobile layout work; everything runs on the main thread; only packaging is a desktop Tauri shell. |

## 6. Liftable units

Ordered by value. "Deps" lists imports that must come along or be replaced.

### L1 — BM25 + Reciprocal Rank Fusion  ·  `src/rag/HybridSearch.ts` (170 LOC) + `src/rag/HybridSearch.test.ts` (65)
- Deps: none. Pure functions and one class; no imports at all.
- Transplant: **easy**. Drop into `src/lib/retrieval/`. Before shipping: make the tokenizer Unicode-aware
  (`/[^\p{L}\p{N}\s]/gu`) for non-English users, cache per-doc term frequencies instead of rebuilding per query, and make `avgDocLen`
  incremental.
- Why take it: correct Lucene-style BM25 (non-negative IDF, k1=1.5, b=0.75) and weighted RRF (k=60) with dense/sparse rank
  bookkeeping in under 200 lines, with tests. Writing it fresh costs an afternoon plus the same tests.

### L2 — Sentence-aligned sliding-window chunker  ·  `src/rag/Chunker.ts` (161) + `Chunker.test.ts` (46)
- Deps: none.
- Transplant: **easy**. Returns `{text, index, startOffset}` — the offsets are exactly what a citation-highlight UI needs.
- Why: overlap, min-chunk merge and offset tracking are fiddly to get right; this is small and tested. Token counts are a whitespace heuristic; acceptable.

### L3 — Provider cascade + wllama stream bridge  ·  `src/llm/types.ts` (25), `src/llm/FallbackLLMProvider.ts` (144), `src/llm/WllamaProvider.ts:128-201` (~75), tests `FallbackLLMProvider.test.ts` (172)
- Deps: `@wllama/wllama` (peer), optionally `@mlc-ai/web-llm`.
- Transplant: **moderate**. The cascade logic (probe -> init first available -> retry on next provider only if nothing was yielded)
  transplants as-is. The provider interface must be widened first: `messages[]` instead of `prompt`, `AbortSignal`, usage/timing
  stats. Replace `createCompletion` with wllama's chat-completion API so the GGUF chat template is applied, set
  `n_threads` from `hardwareConcurrency` when cross-origin isolated, and type against the real `Wllama` class instead of `any`.
- Why: the "never restart a stream mid-answer" rule and the callback->async-iterator queue with a streaming `TextDecoder`
  (multi-byte tokens split across callbacks) are the two details people get wrong. Do **not** take `WebLLMProvider.ts` — it is a thin
  wrapper with nothing the WebLLM docs do not already show.

### L4 — Lazy cross-encoder reranker with graceful degradation  ·  `src/rag/Reranker.ts` (165) + `Reranker.test.ts` (100)
- Deps: `@huggingface/transformers` (dynamic import, so no cost unless enabled). Default model `Xenova/ms-marco-MiniLM-L-6-v2`.
- Transplant: **easy-moderate**. Swap the `SearchResult` type for ours; move the pipeline into a Web Worker (it blocks the UI as written);
  replace `quantized: true` with the v3 `dtype` option. UNVERIFIED: that `pipeline('text-classification')` accepts
  `{text, text_pair}` objects for this model in Transformers.js v3 — the defensive `extractScore()` (:132-147) suggests the author was not sure either. Test in a browser before relying on it.
- Why: single-flight lazy load, pass-through on any failure, `topN` cost cap. Good skeleton, 1 hour to harden.

### L5 — Streaming RAG orchestration shape  ·  `src/rag/RAGPipelineManager.ts` (433), `src/rag/types.ts` (78), `src/rag/Tokenizer.ts` (128)
- Deps: L1, L4, an embedder, a vector index, an `LLMProvider`.
- Transplant: **moderate**. Take the `queryStream()` generator protocol (`retrieval` -> `generation`* -> `complete`) and the template
  system; fix the empty-metadata hybrid bug (hydrate sparse-only hits from storage), switch `.replace` to a function replacer,
  emit citations in the stream, and feed chat history in. `useRagStream` (src/react/index.ts:167-212, ~45 LOC) is the matching React hook;
  it re-allocates the chunk array on every token (`[...prev, chunk]`) — batch with `requestAnimationFrame` instead.
- Why: a reasonable reference implementation; roughly equal effort to adapt or to rewrite. Take it as a template, not verbatim.

### L6 — Capability probe  ·  `src/core/capabilities.ts` (80) + `capabilities.test.ts` (59)
- Deps: none.
- Transplant: **easy**, but rewrite `inferTier()`: drop the `deviceMemory > 8` branch (unreachable), use WebGPU adapter limits
  (`maxBufferSize`, `maxStorageBufferBindingSize`), `crossOriginIsolated`, and `navigator.storage.estimate()`; use `adapter.info`.
- Why: the inline SIMD feature-test byte array and the cached single-source probe are handy. 30 minutes saved, no more.

### Considered and rejected
- **`src/index/HnswIndex.ts` (516)** — the repo's headline. Not best-in-class: sort-based queues, naive neighbour selection,
  tombstones that break connectivity, upsert count bug, JSON serialization, string-keyed `Map` graph. For a chat app's document
  memory (hundreds to a few thousand chunks) a flat Float32Array brute-force cosine scan is faster to write, exact, trivially
  persistable, and quick enough; past ~50K vectors use a maintained WASM HNSW. If a pure-TS HNSW is wanted anyway, this file is a
  readable starting point (**moderate** transplant: deps on `../errors` InputValidator and `../core/contracts` types) but budget for a
  binary heap, heuristic neighbour selection, typed-array storage and a binary serializer — i.e. most of the file.
- **`src/storage/IndexedDBStorage.ts` (767)** — hand-rolled promise wrappers around raw IDB with a cursor-scan `filter()`. `idb`/Dexie do this better. The `stream()` cursor generator (:302-375) is the one nice part.
- **`src/performance/*`** — WorkerPool has no worker; MemoryManager/PerformanceOptimizer are scaffolding around it. `LRUCache.ts` (187) is fine but commodity.
- **`src/mcp/MCPServer.ts` (628)** — the in-process registry + JSON-schema validator (:378-480) is a usable pattern for exposing
  tools to an in-browser agent loop, but the wire half is wrong (4.6). If we need MCP, write a proper server against the SDK with Zod schemas, bound to 127.0.0.1.
- **`src/embedding/OnnxEmbeddingGenerator.ts`, `src/multimodal/`, `src/quantization/`, `packages/*`, `desktop/`** — filler or out of scope.

## 7. Red flags

1. **README-ware.** Seven headline claims checked, four are false or materially overstated (4.1, 4.4, 4.5, 4.6). The quick-start snippets do not compile against the real API (4.8).
2. **Simulated demo presented as an example** — canned answer and invented latency numbers (4.9).
3. **Placeholder code shipped as implementation** — hash tokenizer, byte-hash image embedding, constant `inferHiddenSize`, `void x;` stubs (4.3, 4.4).
4. **Abandoned-looking.** No commits since 2026-06-24; burst-then-silence twice; sole maintainer; only issue is from a bot.
5. **Tests give false comfort.** 7.3k LOC of tests, but `src/test/mocks/` replaces transformers, WebLLM and hnswlib, the "integration" tests are excluded from `npm test` (package.json:27), and CI never runs any of it.
6. **MCP HTTP server binds all interfaces without auth or Origin check** and exposes insert/delete (4.6).
7. **`ResidencyGuard` is off in production by default** — `this.enabled = config.enabled ?? !isProduction()` (src/core/residency.ts:54) — and only patches `fetch`/`XHR` (not WebSocket, `sendBeacon`, workers, `<img>`). It is a dev-time assertion, not the "architectural boundary" the README sells. Its allowlist is exact-hostname (`huggingface.co`, `cdn-lfs*.huggingface.co`, :21-28); UNVERIFIED whether current Hugging Face download redirects stay inside it.
8. **Unescaped HTML in the playground**: search results are injected with ``el.innerHTML = `...${meta.content}...` `` (showcase/playground.html:355). Self-XSS only (the user's own documents), but it is the pattern to avoid; the RAG citation path next to it does use `escapeHtml`. No `eval`, no `dangerouslySetInnerHTML`, no secrets, no telemetry/analytics found (grep for gtag/plausible/analytics: none).
9. **Dependency hygiene.** `fake-indexeddb` and `hnswlib-wasm` are *runtime* dependencies of a browser library although one is a Node test shim and the other backs dead code; `onnxruntime-web` is a direct dep for the fake embedder. Anyone installing the package pays for all three. The showcase loads everything from jsDelivr at runtime, including the library itself.
10. **Version drift.** `package.json` says 0.2.2, `src/index.ts:180` exports `VERSION = '0.2.0'`, the MCP server announces `0.2.0`, the ONNX cache global is still `__havenOnnxSessionCache`.
11. **Internal strategy docs in the repo** (`COMPETITOR_MATRIX.md`, `docs/MARKET_ANALYSIS.md`, `ANALYSIS_DEEP.md` with the author's local path `/Users/kyrillos/Haven`) — harmless, but confirms this is a solo product experiment aimed at legal-tech, not a maintained library.

## 8. Recommendation for the chat product

Domicile contributes nothing to the premium chat surface, the PWA shell, or Android. Its value is a handful of small retrieval
utilities that are MIT, dependency-free and tested. Vendor L1 + L2 verbatim with attribution, take L3's cascade and stream bridge
while rewriting the provider interface around chat messages and `AbortSignal`, use L4/L5/L6 as templates. Skip the vector DB:
for on-device document memory start with a brute-force typed-array index persisted as one binary blob, run embeddings in a worker,
and revisit HNSW only if a measured corpus size demands it. Total lift: roughly 900 LOC plus ~400 LOC of their tests.
