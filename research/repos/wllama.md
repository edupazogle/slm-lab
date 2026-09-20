# ngxson/wllama - deep-dive dossier

```
WHAT       llama.cpp (incl. llama-server's server-context) compiled to WASM + a ~3k-LOC typed TS wrapper: OPFS model cache, worker proxy, OAI-shaped API. v3.7.0 on master, 3.6.1 on npm.
LICENCE    MIT (file `LICENCE`, (c) 2024 Xuan Son NGUYEN). Verdict: YES, copy freely; keep the copyright + permission notice. Bundled wasm also carries llama.cpp MIT + Dawn BSD-3.
TAKE       The library itself as an npm dependency (do NOT fork/vendor the core), plus vendor 3 small pieces: model/cache manager pattern, the React provider, the streamed tool-call loop.
RISK       Bus factor 1 (183 of 198 commits by one author); v3 rewrite is 4 months old; master is ahead of npm and its default CDN URLs 404; Safari/iOS only via a slower 15 MB "compat" build.
SCORES     maturity 4 | code_quality 4 | chat_ux 2 | agentic 3 | mobile_pwa 2
RECOMMEND  Depend on `@wllama/wllama@3.6.1` (pin exact), self-host both wasm builds, write our own chat UI and PWA shell; lift only the glue listed in section 7.
```

Evidence base: shallow clone at `/home/edu/.cache/slm-src/ngxson_wllama` (HEAD `46af429`, 2026-09-03), GitHub API and npm/jsDelivr registries queried 2026-09-21. Nothing was built or run; every behavioural statement below is from reading source unless marked otherwise. Paths are relative to the repo root.

---

## 1. Licence

- `LICENCE` (British spelling, there is no `LICENSE`): standard MIT text, "Copyright (c) 2024 Xuan Son NGUYEN". `package.json:46` says `"license": "MIT"`; npm metadata for 3.6.1 says MIT; GitHub API reports `MIT`.
- No `NOTICE`, no third-party licence file anywhere in the repo (`find` for NOTICE/THIRD/COPYING/LICEN* returns only `./LICENCE`).
- Embedded third-party code, and what it means:
  - **llama.cpp / ggml** - git submodule, MIT, "Copyright (c) 2023-2026 The ggml authors" (LICENSE at the pinned commit). It is compiled into `wllama.wasm`, so shipping the wasm = distributing llama.cpp. llama.cpp's `vendor/` at the pin contains cpp-httplib, miniaudio, nlohmann json, sheredom, stb (all permissive; UNVERIFIED which are actually linked into the wasm).
  - **Dawn / emdawnwebgpu** (`scripts/docker-compose.yml:29-35`, tag `v20260317.182325`) - BSD-3-Clause, linked for the WebGPU backend.
  - **Emscripten runtime JS** (`src/wasm/wllama.js`, 138 KB, generated) - MIT.
  - `src/utils.ts:211-257` - feature-detection byte arrays "Copied from https://unpkg.com/wasm-feature-detect?module (Apache License)". Apache-2.0 snippet with a one-line attribution only.
  - `src/utils.ts:300-339` - UA regexes from DamonOehlman/detect-browser (MIT), attributed by URL.

**Verdict: `yes`.** MIT permits private use, modification, relicensing of our own product as MIT. Obligations: (a) keep the wllama copyright + MIT text with any copied source or "substantial portion"; (b) because we ship the wasm, add llama.cpp's MIT notice and Dawn's BSD-3 notice to our third-party-licences page; (c) if `src/utils.ts` is copied, keep the Apache-2.0 attribution line for the wasm-feature-detect fragment. No copyleft, no patent clause surprises, no CLA.

---

## 2. Project health (verified via API today)

| Fact | Value | Source |
|---|---|---|
| Stars / forks / open issues | 1267 / 123 / 48 | `gh api repos/ngxson/wllama` |
| Created / last push | 2024-03-13 / 2026-09-20 (push was to an autosync branch; master HEAD is 2026-09-03) | same + `commits` |
| Contributors | ngxson 183, felladrin 7, flatsiedatsie 2, six others with 1 each | `gh api .../contributors` |
| Releases | 3.6.1 (2026-08-27), 3.6.0 (08-16), 3.5.1/3.5.0 (06-15), 3.4.x (05-29/30), 3.2.x (05-23) | `gh api .../releases` |
| npm `latest` | **3.6.1**, unpacked 19.6 MB, 89 files, zero runtime deps | registry.npmjs.org |
| master `package.json` | **3.7.0 - not published** | `package.json:3` |
| llama.cpp pin, master | `c7bda030` (upstream commit dated 2026-09-03) | `git ls-tree HEAD llama.cpp` |
| llama.cpp pin, tag 3.6.1 | `83d855c5` (upstream commit dated 2026-08-27) | `gh api .../contents/llama.cpp?ref=3.6.1` |

Commit shape: v3.0 ("Reuse llama-server source code - huge breaking changes ahead!", #213) landed 2026-05-08; WebGPU (#215) and the single-wasm build (#214) on 05-09/05-11; async file read (#221) 05-17; Safari compat package (#223) 05-23; rerank (#238) 05-26; storage backends + Cross-Origin Storage (#247/#248) June; `n_parallel` + partial-download fix (#270/#271) 08-16; "remove pre-built wasm from git" (#274) 08-23; weekly agent-driven upstream autosync (#277-#280) 09-02/03. Between 2025-12-17 and 2026-04-27 there is one commit. The author is a llama.cpp core maintainer (UNVERIFIED here beyond his authorship of the server-context reuse); the WebGPU backend is credited to Reese Levine (`README.md`, last section).

Reading: actively maintained, fast-moving, single-maintainer. The whole v3 architecture is ~4 months old.

---

## 3. Architecture (from source)

```
main thread                                   dedicated Worker (Blob URL)
-----------                                   ---------------------------
Wllama (src/wllama.ts, 1183)                  src/workers-code/llama-cpp.js (551)
  ModelManager (model-manager.ts, 361)          + emscripten glue src/wasm/wllama.js (generated)
    CacheManager (cache-manager.ts, 377)        + wllama.wasm  (8.46 MB default / 15.4 MB compat)
      StorageBackend: COSBackend -> OPFSBackend     cpp/wllama.cpp (188)  exports wllama_start/action/exit
  ProxyToWorker (worker.ts, 451)  <-- GLUE binary msgs -->  cpp/wllama-context.h (1267)
  glue/glue.ts (291) + glue/messages.ts (834, generated from cpp/glue.hpp)   -> llama.cpp server_context
```

Key design points, all checked in source:

1. **v3 = llama-server without HTTP.** `CMakeLists.txt:102-108` compiles `server-context.cpp`, `server-task.cpp`, `server-chat.cpp`, `server-common.cpp`, `server-schema.cpp`, `server-stream.cpp` from upstream, but **not** `server-queue.cpp`: wllama re-implements `server_queue` / `server_response` / `server_response_reader` single-threaded, without mutexes, inside `cpp/wllama-context.h:860-1267`. This is the coupling point that breaks on upstream refactors and is why a weekly coding-agent sync job exists (`.github/workflows/sync-upstream.yml`, `AGENTS.md` "Syncing llama.cpp upstream").
2. **Pull-driven generation.** JS polls `get_result`; each poll runs exactly one `update_slots()` iteration (`wllama-context.h:772-775`, `start_loop` override at `:1015-1037`). Consequence: a token is only produced when the main thread asks, abort is just "stop polling + send `cancel`", and UI-thread stalls slow generation.
3. **Request JSON is passed through verbatim** to upstream's OAI parser: `data_json: JSON.stringify({...options, ...customOpt})` (`src/wllama.ts:819`) -> `oaicompat_chat_params_parse` + `server_schema::eval_llama_cmpl_schema` (`wllama-context.h:282-313`). So anything llama-server accepts works even if the TS type omits it (e.g. `stop` is commented out of `ChatCompletionParams`, `src/types/oai-compat.ts:112`, but upstream parses it).
4. **GLUE**: home-grown binary protocol, TS types generated from `cpp/glue.hpp` by `cpp/generate_glue_prototype.js`; a CI job (`verify-generated-code.yml`) checks generated code is in sync.
5. **Worker is built from strings**: emscripten JS + worker code are embedded as string constants (`src/workers-code/generated.ts`, 161 KB) and started via `URL.createObjectURL(new Blob([...]))` with `{type:'module'}` (`src/utils.ts:344-351`, `src/worker.ts:157-162`). No separate worker file to host, but see CSP note in section 8.
6. **Two file-access modes** (`README-dev.md` "File access", implemented in `llama-cpp.js:165-301` + `cpp/wllama-fs.h`):
   - *Async file read* (JSPI or compat/Asyncify): `fopen/fread/fseek/ftell` are link-time wrapped (`CMakeLists.txt:40-44`); `fread` suspends the wasm, posts `fs.read_req`, main thread answers with `Blob.slice(offset, offset+size).arrayBuffer()` (`src/worker.ts:292-307`). 1 MB read-ahead cache for small reads (`wllama-fs.h:19,121-146`). The GGUF is never materialised as one ArrayBuffer; `use_mmap` is false.
   - *HeapFS/mmap* (no JSPI, no compat): whole file streamed into the wasm heap and `mmap` patched to return a pointer into it (`llama-cpp.js:211-225`). Model occupies heap 1:1 even when layers are offloaded to GPU.

---

## 4. The v3 API, precisely

### 4.1 Construction and loading
```ts
new Wllama(pathConfig: { default: string }, cfg?: { suppressNativeLog?, logger?, parallelDownloads? /*3*/, allowOffline?, cacheManager?, modelManager? })
loadModelFromHF({ repo, file? | quant?, mmprojFile? | mmprojQuant?, hfToken? }, params)   // wllama.ts:442
loadModelFromUrl(url | { url, mmprojUrl? }, params & { progressCallback, headers, signal, useCache? })  // :421
loadModel(Blob[] | Model, params)                                                        // :458
exit()   // terminates the Worker outright (worker.ts:227-239)
```
- `pathConfig` is the wasm URL only. Pre-3.1 two-path configs (`single-thread/...`, `multi-thread/...`) are deprecated (`wllama.ts:94-98`, `guides/intro-v3.1.md`).
- HF resolution hits `https://huggingface.co/api/models/{repo}/tree/main?recursive=true`, revision hard-coded to `main`; default quant order `Q4_K_M`, then `Q8_0`, then first GGUF (`src/huggingface.ts:32-33,47,95-101`). **It needs the network every time**, so an offline PWA must call `loadModelFromUrl` with the stored URL or `loadModel(model)` from `modelManager.getModels()`.
- **Split GGUF**: pass the first shard; siblings are derived from the `-NNNNN-of-NNNNN.gguf` suffix (`src/utils.ts:55-99`), downloaded `parallelDownloads` at a time (`model-manager.ts:165-199`), sorted, renamed `model-0000i-of-0000n.gguf` in the wasm FS (`utils.ts:189-194`). mmproj is detected by sniffing `general.architecture == clip` in the first 128 KB (`utils.ts:116-148`). README recommends 512 MB shards.
- Important `LoadModelParams` defaults (`src/wllama.ts:520-588`, `src/types/types.ts`): `n_ctx` **1024**, `n_gpu_layers` **99999** (all, if WebGPU present; `0` also suppresses adapter init, `worker.ts:143-148`), `n_threads` = `floor(hardwareConcurrency/2)`, `n_parallel` **4** slots with `kv_unified: true`, plus `cache_type_k/v` (f16..q4_0), `flash_attn`, `swa_full`, `ctx_shift`, `n_keep`, `n_cache_reuse`, `cache_idle_slots`, `jinja`, `chat_template`, `reasoning`, `reasoning_format`, `reasoning_budget_tokens`, `lora_adapters`, `spec_draft_*`, `kv_overrides`, `default_template_kwargs`. `n_ctx_auto` is gone ("not supported for now", `:529`).
- One model per `Wllama` instance; a second `loadModel` throws "Module is already initialized" (`:479-481`). Switching model = `exit()` + new instance (the demo does exactly this, `examples/main/src/utils/wllama.context.tsx:198-204`).

### 4.2 Size limits - what is actually true
- README says "Max file size is 2GB, due to size restriction of ArrayBuffer". The reasoning is **stale** for the default build: in async-read mode the file is never one ArrayBuffer (section 3.6). The historic limit is documented in source as an `ftell()`/`long` limit (`llama-cpp.js:160-163`), which disappears when `long` is 64-bit under `-sMEMORY64=1` (`CMakeLists.txt:63-70`).
- It **still applies** in the compat build (wasm32, `long` = 32 bit; this is the Safari/iOS path) and in HeapFS mode. The demo keeps `MAX_GGUF_SIZE = 2 GB` but has the enforcement commented out (`examples/main/src/config.ts:16`, `custom-models.tsx:60-64`).
- Heap cap: `-sMAXIMUM_MEMORY=4096MB` even with MEMORY64 (`CMakeLists.txt:27`). CPU-only inference therefore needs weights + KV + compute buffers < 4 GB. With WebGPU, weights live in GPU buffers. Issue #249 shows a user loading a single-file Qwen3-30B-A3B `UD-Q4_K_XL` on desktop Chromium + WebGPU (user report, UNVERIFIED by me).
- Open issue #204 (2026-02): >2 GB models crash from signed 32-bit pointer wrap in the worker. It predates the MEMORY64 default (v2.4.0, 2026-04-27); still open, status UNVERIFIED.
- **Practical rule for the product: shard everything to <= 512 MB and keep total <= ~2 GB so the same artefacts work on the compat path.**

### 4.3 Caching
- **OPFS only.** No Cache API, no IndexedDB (grep for `indexeddb|caches.open` in `src/` is empty). Files live in OPFS dir `cache/`, key `sha1(url)_basename`, metadata in sibling `__metadata__<key>` JSON with `etag`, `originalSize`, `originalURL`, `mmprojURL`, `sha256` (`src/cache-manager.ts:6,30-67,367-377`).
- Writes go through a throw-away worker using `createSyncAccessHandle()` (`src/workers-code/opfs-utils.js:4-19`, `src/storage/opfs.ts:79-119`) - the sync-access-handle route rather than `createWritable()` (Safari historically lacked the latter; current Safari behaviour UNVERIFIED).
- Experimental **Cross-Origin Storage** backend (`navigator.crossOriginStorage`, non-standard) keyed by the HF LFS sha256, falling back to OPFS (`src/storage/cos.ts`). `CacheManager` defaults to `[new COSBackend()]` (`cache-manager.ts:88`), which costs one extra fetch of the HF `/raw/` pointer per file before every download (`cache-manager.ts:127-130`, `huggingface.ts:138-151`).
- Integrity = size match only (`model-manager.ts:139-156`). The sha256 is fetched but never verified against the bytes.
- **No resumable download**: no `Range` request anywhere in `src/`. An interrupted file is detected by size mismatch, deleted and re-downloaded from zero (`cache-manager.ts:141-167`); the relevant test is `test.skip` (`model-manager.test.ts:93`). On mobile data this is a real UX cost; sharding limits the loss to one shard.
- No `navigator.storage.persist()` / `estimate()` call anywhere - eviction protection and quota UI are ours to add.
- `allowOffline` is **a dead option**: declared and forwarded (`wllama.ts:74-78,212`, `model-manager.ts:59`) but never read. Offline works anyway because `getModelOrDownload` checks the cache first with no network (`model-manager.ts:342-353`); the `allowOffline` test passes for that reason, not because of the flag.

### 4.4 Threads, COOP/COEP, WebGPU, browser matrix
- One wasm since 3.1; thread count is a runtime choice via `-sPTHREAD_POOL_SIZE=Module["pthreadPoolSize"]` (`CMakeLists.txt:35`). `isSupportMultiThread()` tests that a `SharedArrayBuffer` can be posted + wasm atomics validate (`utils.ts:219-235`); if not, pool size 0 = single thread (`wllama.ts:483-497`).
- So **COOP `same-origin` + COEP `require-corp` are required for multi-thread CPU**, not for running at all. Both dev servers set them (`examples/main/vite.config.ts:49-57`, `scripts/http_server.js:16-17`). Under COEP every cross-origin subresource needs CORS/CORP (HF `resolve` URLs are fetched with CORS `fetch`, fine; third-party images, fonts, analytics and iframes on a landing page are what break). `credentialless` is not mentioned in the repo.
- **WebGPU**: on by default when `navigator.gpu` exists; ggml-webgpu built with `-DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON` against emdawnwebgpu. Tests exist (`src/wllama.wgpu.test.ts`, 3 cases) but are **not run in CI** ("TODO ... current missing ShaderF16 support", `.github/workflows/ci.yml`). Open issues: #229 (Intel Gen9 needs an upstream patch), #234 (multimodal image slice slow / OOB).
- **Compat build** (`@wllama/wllama-compat`): Asyncify instead of JSPI, no MEMORY64, 15.4 MB wasm vs 8.46 MB. Selected when `!JSPI || !Memory64` (`utils.ts:405`). Own matrix (`compat/README.md`): Chromium good; Firefox acceptable but no WebGPU (JSPI behind a flag); Safari acceptable via compat incl. WebGPU; Safari without compat "does not run at all". **By default compat assets are fetched from jsDelivr at runtime** (`src/wasm-from-cdn.ts`, warning at `wllama.ts:1151-1161`) - self-host via `setCompat({wasm, worker:{code}})` with Vite `?url` / `?raw` imports (`compat/README.md`, demo `vite.config.ts:26-46`).
- Android Chrome: no evidence either way in the repo for JSPI/Memory64/WebGPU on Android; treat as UNVERIFIED and measure on a device.

### 4.5 Chat completion, streaming, abort
```ts
createChatCompletion(opts & {stream?: false})           -> Promise<ChatCompletionResponse>
createChatCompletion(opts & {stream: true})             -> Promise<AsyncIterable<ChatCompletionChunk>>
createChatCompletion(opts & {stream: true, onData})     -> Promise<void>
createCompletion(...)  // same three shapes, raw prompt
```
(`src/wllama.ts:731-790`.) Types are hand-written OAI look-alikes (`src/types/oai-compat.ts`, 353 lines), including llama-server extras: `cache_prompt`, `timings_per_token`, `return_progress` (prompt-processing progress in chunks, `:206-211,234`), `chat_template_kwargs`, `timings` with tokens/s. `reasoning_content` is absent from the TS delta type (grep is empty) though upstream emits it when `reasoning_format` is set - cast needed.
- **Abort**: `abortSignal` is checked once per poll; on abort, a `cancel` action frees the slot in a `finally` (`wllama.ts:1074-1132`, `wllama-context.h:817-831`). Granularity is one `update_slots()` step, so a long prompt batch cannot be interrupted mid-batch (issue #249 is the same root cause: system unresponsive during prompt processing). Tested (`wllama.test.ts:181`).
- **Errors**: `WllamaError.type` lists `kv_cache_full`, advertised in `guides/intro-v3.md`, but it is **never thrown** (only occurrence is the type union, `wllama.ts:122`). Context overflow arrives as a generic `inference_error` carrying upstream's message. Wasm aborts become `WllamaRuntimeError` with a demangled stack decoded from a gzip'd symbol map (`src/debug.ts`, `scripts/build_source_map.js`) - unusually good for a wasm library.
- `checkEnvironmentCompatible()` is `async` but called without `await` in the constructor (`wllama.ts:201`), so a missing SIMD/exceptions feature surfaces as an unhandled rejection, not a constructor throw.

### 4.6 Tool calling, grammar, JSON schema
- Handled entirely by upstream code at the pin: `tools` / `tool_choice` require jinja, which defaults to true (`server-common.cpp:1146-1151`, `common.h:638`); `response_format` of `json_object` / `json_schema`, top-level `json_schema`, and raw GBNF `grammar` are parsed (`server-common.cpp:1162-1177`, `server-schema.cpp:251-283`); `parallel_tool_calls` is read upstream (`server-common.cpp:1273`) though commented out of the TS type (`oai-compat.ts:120`).
- Streaming emits OAI-style `delta.tool_calls[{index,id,function:{name,arguments}}]` fragments; `examples/tools/index.html:486-596` shows the correct accumulate-by-index loop with `finish_reason === 'tool_calls'` and `role:'tool'` replies, capped at 5 iterations.
- **None of this is covered by wllama's own tests**: grep for `tools|grammar|json_schema|response_format|cache_prompt|image` in `src/wllama.test.ts` and `src/wllama.wgpu.test.ts` returns nothing. Correctness rests on upstream llama.cpp and on the per-model chat template. Open issue #168 "Grammar Not Accepting the Sampled Tokens" (2025-04, v2-era) is still open.

### 4.7 Embeddings and rerank
- `createEmbedding({input})` needs `embeddings: true` at load (`wllama.ts:642-670`); `createRerank({query, documents, top_n})` needs `pooling_type:'rank'` and loops documents sequentially (`:678-724`). Both tested with single inputs.
- **Probable bug**: for `input: string[]` the C++ side posts one task per string (`wllama-context.h:699-707`) and wraps each result separately (`:781-789`), while `getResponse` keeps only the last non-stream chunk (`wllama.ts:1101-1102`). Read as written, a batch returns only the last embedding. Not executed here, so UNVERIFIED - call it once per string until tested.
- A model loaded for embeddings cannot also chat; two instances = two workers = two heaps.

### 4.8 KV reuse
- Upstream slot prompt cache: `cache_prompt` defaults true (`common.h:627`), 4 slots over one unified KV, slot picked by prompt similarity (`slot_prompt_similarity = 0.1`, `common.h:695`), context checkpoints default 32 (`common.h:629`). Multi-turn chat on one instance re-uses the common prefix with no app code. `n_cache_reuse` (KV shifting) and `ctx_shift` (default false upstream, `common.h:571`) are exposed at load.
- **Known gap for hybrid/recurrent models** (Qwen3.5, LFM2, Granite-hybrid - exactly the 2026 small-model set): open PR #285 (2026-09-19, third-party) reports master reuses 0 stable-prefix tokens on Qwen3.5-0.8B where the fix reuses 878, because chat message boundaries are not passed to tasks. The C++ already reads `n_ctx_checkpoints` / `checkpoint_min_step` (`wllama-context.h:468-471`) but `src/wllama.ts` never sends them. Until merged, expect full prompt re-processing each turn on those architectures.
- v2's manual KV ops, `tokenize`/`detokenize`, and session save/restore were **removed** in v3 (`guides/intro-v3.md` "Removed low-level APIs"; "Low level API // TODO: add back", `wllama.ts:943-946`). No token counting API: budget context from `usage` / `timings` after the fact.

### 4.9 Memory behaviour on phones (what the code does; nothing measured)
- Shared `WebAssembly.Memory` is allocated with a retry loop stepping max from 4096 MB down in 128 MB steps "because we have a weird OOM issue on iOS" (`llama-cpp.js:116-139`); only used in multi-thread mode.
- Safari mobile: transferables disabled for all worker messages (`worker.ts:352-360`, `opfs.ts:103-106`) - every buffer is copied.
- Default threads = half the logical cores (no big.LITTLE awareness); default `n_ctx` 1024 is conservative; `cache_type_k/v: 'q8_0'` is available to halve KV.
- No memory-pressure handling, no pre-flight "will it fit" estimate (`n_ctx_auto`/fit removed), no `visibilitychange` handling. A tab kill on Android/iOS loses the worker; recovery is ours.
- Demo README lists "Warning limitations on mobile" as TODO (`examples/main/README.md`).

---

## 5. Architectures supported at the pinned commit

Extracted from `src/llama-arch.cpp` `LLM_ARCH_NAMES` at llama.cpp `c7bda030` (149 named entries). Relevant to on-device chat/embedding in 2026:

`llama`, `llama4`, `qwen2`, `qwen3`, `qwen3moe`, `qwen3next`, **`qwen35`**, `qwen35moe`, `qwen3vl`, `gemma2`, `gemma3`, **`gemma3n`**, **`gemma4`**, `gemma-embedding`, `phi3`, `phimoe`, **`smollm3`**, **`lfm2`**, `lfm2moe`, `granite`, **`granitehybrid`**, `nemotron_h`, `falcon-h1`, `mamba2`, `bitnet`, `minicpm3`, `olmo2`, `exaone4`, `ernie4_5`, `hunyuan-dense`, `gpt-oss`, `mistral3`, `mistral4`, `deepseek2`, `glm4`, `rwkv7`; embedders `bert`, `modern-bert`, `nomic-bert`, `jina-bert-v3`, `eurobert`, `neo-bert`, `llama-embed`; TTS `qwen3tts`, `pockettts`.

Caveats: (1) this is the **master** pin; npm 3.6.1 pins `83d855c5` (one week older) - I did not diff the two lists. (2) An arch in this table means the CPU path loads it; WebGPU needs every op of that graph in ggml-webgpu, which for SSM/conv-heavy hybrids is UNVERIFIED. (3) README advises against IQ quants (slow) and for Q4/Q5/Q6.

---

## 6. `examples/main` - the chat UI, reviewed as liftable code

Stack: Vite 5, React 18, Tailwind 3 + daisyUI 4, FontAwesome, `react-markdown` 9 + `remark-gfm` + `remark-breaks`. 2,362 lines total incl. assets; ~1,900 of TS/TSX.

Good:
- `utils/wllama.context.tsx` (333) - a complete provider: model list merged with cache state, download progress per URL, load/unload with instance reset on failure, streaming via async iterator + `AbortController`, image/audio parts.
- `config.ts` + `vite.config.ts` - the correct Vite recipe: `wllama.wasm?url`, virtual module for compat `?url` + `?raw`, COOP/COEP dev middleware.
- `components/MarkdownMessage.tsx` - `react-markdown` with `skipHtml` (line 50), links `target=_blank rel=noreferrer`. No `dangerouslySetInnerHTML` anywhere in `examples/main`.
- `utils/custom-models.tsx` - validates a user URL by ranged fetch of the GGUF magic, sums shard sizes by HEAD.

Not premium, by inspection:
- Whole conversation map is `JSON.stringify`'d into **localStorage on every streamed token** (`utils/messages.context.tsx:35-41` via `ChatScreen.tsx:85-87`). 5 MB quota, synchronous, O(history) per token. Image `ArrayBuffer`s serialise to `{}` and blob URLs die on reload.
- Entire message re-parsed as markdown per token; no code highlighting, no copy button, no math, no reasoning/think block, no tool-call rendering, no regenerate/edit/branch, no system prompt, no token/s display (the data is in `chunk.timings`, unused).
- Scroll = `setInterval` 500 ms smooth-scroll to bottom while generating (`ChatScreen.tsx:32,282-288`); no "user scrolled up" detection.
- Errors via `alert()`; abort errors swallowed with `catch (_) {}` (`wllama.context.tsx:244-246`); `e.keyCode == 13`; module-level mutable singletons (`:72-77`).
- No router, no manifest, no service worker, no install prompt, no i18n, no a11y work. README's TODO list still has "Load local gguf", "Switching theme", "Warning limitations on mobile".

Verdict: a competent **demo**, useful as wiring reference. It is not the UI to copy for a premium product.

---

## 7. Liftable units

| # | What | Paths | LOC | Deps | Transplant | Why better than fresh |
|---|---|---|---|---|---|---|
| 1 | **The inference library (as a dependency, not a copy)** | npm `@wllama/wllama@3.6.1` + `@wllama/wllama-compat@3.6.1` | ~3.1k TS + 2.1k C++ + generated | none at runtime | **easy** - `npm i`, import wasm with `?url`, self-host compat with `?raw` | Rebuilding needs Docker + emsdk 4.0.20 + Dawn, and tracking llama.cpp server internals weekly. Nobody should own that. |
| 2 | Vite integration recipe | `examples/main/vite.config.ts`, `examples/main/src/config.ts:1-14`, `examples/main/src/vite-env.d.ts` | ~70 | vite, @vitejs/plugin-react | **easy** - paste | Encodes three non-obvious facts: wasm via `?url`, compat worker via `?raw` not `?url`, COOP/COEP middleware. |
| 3 | React provider for model lifecycle + streaming | `examples/main/src/utils/wllama.context.tsx`, `utils/displayed-model.tsx`, `utils/types.ts`, `utils/custom-models.tsx` | 333 + 106 + 47 + 96 | react, @wllama/wllama | **moderate** - replace module singletons, `alert()`, localStorage params; add error surface and reasoning/tool deltas | Already correct on the awkward parts: reset instance after failed load, guard concurrent download/load, progress fan-in across shards, abort. |
| 4 | Streamed tool-call agent loop | `examples/tools/index.html:486-596` (loop) and `:290-345` (tool schema shape) | ~110 | none | **easy** - lift into a TS hook; **drop the `calculator` executor** (section 8) | Correct accumulation of `delta.tool_calls` by `index`, assistant/tool message round-trip, iteration cap. Exactly the bit people get wrong. |
| 5 | Safe markdown bubble | `examples/main/src/components/MarkdownMessage.tsx` | 55 | react-markdown, remark-gfm, remark-breaks | **easy** | Safe defaults (`skipHtml`, `rel=noreferrer`). Small; a premium UI will outgrow it (highlighting, streaming-aware parsing). |
| 6 | OPFS model store with pluggable backend | `src/cache-manager.ts`, `src/model-manager.ts`, `src/storage/{index,opfs,cos}.ts`, `src/workers-code/opfs-utils.js`, `src/huggingface.ts` | 377+361+40+119+171+150+151 = 1,369 | Web APIs only | **n/a if #1 is used** - already exported (`wllama.modelManager`, `cacheManager`, injectable via `WllamaConfig`). Copy only to add Range-resume / sha256 verification; then **moderate** because `opfs.ts` imports the generated worker-code bundle. | Safari-safe OPFS writes through a sync-access-handle worker, shard fan-out, metadata sidecar, partial-file recovery. |
| 7 | OAI-compatible TS types for llama-server | `src/types/oai-compat.ts`, `src/types/types.ts` | 353 + 139 | none | **easy** | Lets one chat store speak to wllama and to a remote llama-server / OpenAI-compatible backend with one type set - directly serves the "optionally backed by a server" requirement. Add `reasoning_content`, `stop`, `parallel_tool_calls`. |
| 8 | Wasm crash-to-stack-trace pipeline | `src/debug.ts`, `scripts/build_source_map.js`, abort hook `cpp/wllama-context.h:53-66` | 111 + 269 + 14 | DecompressionStream | **hard** outside wllama (tied to its build) - comes free with #1 | Reference only. |

Not worth taking: `examples/main` components (`ChatScreen`, `ModelScreen`, `Sidebar`, `Navbar`, `GuideScreen`) - daisyUI demo chrome; `utils/messages.context.tsx` - the localStorage-per-token store; `utils/benchmark.ts` - dead: the whole file is commented out and calls APIs removed in v3 (`tokenize`, `_testBenchmark`, `_testPerplexity`), yet is still imported by `App.tsx:10`.

---

## 8. Red flags

1. **Model output executed as JavaScript** in the tools demo: `Function('"use strict"; return (' + args.expression + ')')()` (`examples/tools/index.html:351-356`). The argument string is produced by the LLM. Never lift this executor; use a real expression parser.
2. **master != npm.** `package.json` says 3.7.0, npm `latest` is 3.6.1, and `src/wasm-from-cdn.ts` on master points at `@wllama/wllama@3.7.0` / `wllama-compat@3.7.0` on jsDelivr - the first returns **HTTP 404** today (3.6.1 URLs return 200). Building from git master gives a broken compat/CDN default. Also README contradicts itself: "Wasm binaries do not come pre-built with this repo" vs "This repository already come with pre-built binary"; since #274 the first is true for git, the second only for npm.
3. **Runtime third-party CDN by default** for Safari/compat users (jsDelivr). Supply-chain and offline-PWA problem; fix with `setCompat` + self-hosting (15.4 MB wasm + 171 KB JS).
4. **Bus factor 1**, and the core now depends on non-public-API llama-server internals with a hand-rewritten `server_queue`. Upstream sync is done weekly by a coding agent with human review (`sync-upstream.yml`, `AGENTS.md`); autosync skips the compat build (`SKIP_COMPAT=1`), so compat JS can lag until a release. API churn is real: v2->v3 removed tokenizer/KV/sampling APIs; 3.0->3.1 changed `pathConfig`.
5. **Agentic features untested in-repo** (section 4.6); WebGPU tests not in CI; one skipped test for interrupted downloads; one skipped OOB stack-trace test.
6. **HF token placed in the URL query string** (`src/huggingface.ts:127-133`); that URL is then persisted as `originalURL` in OPFS metadata and used as the cache key. Do not pass user tokens through `loadModelFromHF`; use `headers` on `loadModelFromUrl`. Note `Model.getTotalDownloadSize` HEAD requests ignore `headers` (`model-manager.ts:234-242`), so gated repos report size 0.
7. **Dead / misleading surface**: `allowOffline` unused; `kv_cache_full` never thrown; `joinBuffers` writes every buffer after the second at the wrong offset (`src/utils.ts:1-9`, test covers only two buffers; function is unused in `src/`); `parseModelUrl` exists three times (`utils.ts`, `model-manager.ts`, demo `custom-models.tsx`); test-only hooks compiled into production C++ (`pooling_type: 'test_stack_trace_abort'`, `wllama-context.h:133-143`).
8. **CSP**: worker from a `blob:` URL plus wasm compile means a strict policy needs `worker-src blob:` and `script-src 'wasm-unsafe-eval'` (derived from `utils.ts:344-351`; exact directives UNVERIFIED in a browser).
9. No telemetry found (no analytics endpoints; network calls are huggingface.co, the model URL, and jsDelivr for compat). No secrets in the tree. Zero runtime npm deps; bundle is 326 KB min JS + 8.46 MB wasm (uncompressed; compressed size not measured).
10. Provenance is clean: single author history since 2024-03, real browser test suite (vitest browser mode, Playwright Chromium + Firefox in CI; about 50 cases by my count, PR #285 reports "47 passed, 2 skipped"), strict tsconfig (`strict`, `exactOptionalPropertyTypes`, `noImplicitOverride`). Not README-ware.

---

## 9. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | **4** | 2.5 years, 1267 stars, regular releases, browser CI; minus for bus factor 1 and a 4-month-old core rewrite with breaking API churn. |
| code_quality | **4** | Small, strict-typed, readable, generated glue verified in CI, excellent crash diagnostics; minus for dead options, a duplicated helper, an un-awaited env check, a probable batch-embedding bug. |
| chat_ux | **2** | Working demo with safe markdown and media input; persistence, streaming render, scrolling, error handling are demo-grade. |
| agentic | **3** | Full llama-server tool calling, JSON-schema and GBNF constraint, streamed tool deltas, a correct reference loop; zero tests for any of it, no tokenizer, recurrent-model cache gap. |
| mobile_pwa | **2** | Safari compat build, iOS memory and transferable workarounds exist; no manifest/SW, no resumable download, no `storage.persist()`, no memory guard, Android unverified. |

---

## 10. Recommendation for the product

1. Add `@wllama/wllama` and `@wllama/wllama-compat` at **exact** 3.6.1; do not build from master. Serve both wasm files from our origin; call `setCompat({...})` explicitly so nothing loads from jsDelivr.
2. Ship COOP/COEP on the **app** route only; keep the marketing landing page on a route without COEP so third-party embeds keep working.
3. Publish our model set as <= 512 MB shards, <= ~2 GB total, Q4_K_M/Q4_0, so one artefact serves JSPI, compat and phone paths. Store the resolved URL ourselves; never call `loadModelFromHF` at runtime offline.
4. Write our own: chat store (IndexedDB, throttled writes), streaming markdown renderer, PWA shell (manifest, SW precache of app + wasm, `storage.persist()`, quota UI), resumable shard downloads, a pre-load fit estimate, and a device test matrix. Lift units 2, 3, 4, 7 (and 5 as a stopgap) with the MIT notice kept.
5. Track PR #285 before committing to Qwen3.5 / LFM2 as the default model - without it every turn re-processes the whole prompt on those architectures.
6. Before relying on them, write our own tests for: tool calling per chosen model, `response_format: json_schema`, batch embeddings, abort during prompt processing, and a 2 GB+ model on the compat path.
