# Feasibility — wllama v3 in a production Vite + React + TS app and PWA (desktop and phones)

**Date:** 2026-09-21 · **Brief 1 of 3** · evidence base for `slm/prd/PRD.md` (decisions D1, D2, D6).
**Scope:** what `@wllama/wllama` 3.6.1 can and cannot do in the app being built at `/home/edu/Public/bizloop/slm/app/web`,
with every non-trivial claim carrying a `file:line` or a URL. Anything I could not check is marked **UNVERIFIED**.

**Sources and how to read the citations**

| Short form | Means |
|---|---|
| `W/...` | `/home/edu/Public/bizloop/slm/app/web/node_modules/@wllama/wllama/...` — the **installed 3.6.1** package (it ships `src/`, so these are exact lines of the version we run) |
| `CLONE/...` | `/home/edu/.cache/slm-src/ngxson_wllama/...` at `46af429` (2026-09-03, `package.json` version 3.7.0 — **master, not what we run**; used only for `examples/`, which npm does not ship) |
| `APP/...` | `/home/edu/Public/bizloop/slm/app/...` |
| llama.cpp pin | 3.6.1 pins llama.cpp `83d855c5a6d70487121edbf4020b25c96b7a04e7` (`gh api repos/ngxson/wllama/contents/llama.cpp?ref=3.6.1`); master pins `c7bda030` |

Three things on this page were **measured on this machine today** (instrument and command given each time); everything else is
read from source, from the wllama issue tracker (`gh api repos/ngxson/wllama/issues?state=all&per_page=100`, 286 items pulled
2026-09-21), from a public benchmark dataset, or from vendor documentation.

---

## 0. Verdict

Feasible, with one hard constraint that changes the product plan:

1. **On desktop Chromium this is a solved problem.** Self-host both wasm builds, serve COOP/COEP, and wllama gives streaming
   chat, tool calling, JSON-schema-constrained output, embeddings and rerank through an OpenAI-shaped API.
2. **A phone cannot reach the app over plain `http://<lan-ip>`** — not "slower", but **`new Wllama()` throws**
   (measured, §7.1). Any phone route must be a secure context: HTTPS tunnel, static host, `adb reverse`, or the Capacitor shell
   (Brief 3). This invalidates the current note in `APP/serve.py:12-15` and limit #3 in `APP/web/src/data/findings.json`.
3. **WebGPU is the difference between usable and not on a phone**, and it is available in Chrome on Android and Safari 26 on iOS
   today (§8, with third-party measurements) — but **not inside an Android WebView**, where threads are also unavailable
   (§7.3). CPU-WASM on a phone is a fallback, not a product.
4. Three product-owned gaps wllama does not fill: resumable downloads (§4.4), `navigator.storage.persist()` + quota UI (§4.5),
   and a pre-load "will it fit" estimate (§11).

---

## 1. Versions, and the pin discipline

| Fact | Value | Source |
|---|---|---|
| npm `latest` | `3.6.1`, published 2026-08-27 | `npm view @wllama/wllama version time.modified` (2026-09-21) |
| installed in the app | `@wllama/wllama` **3.6.1**, `@wllama/wllama-compat` **3.6.1** | `W/package.json:3`; `W/../wllama-compat/package.json:3` |
| declared range | `"^3.6.1"` (**not** an exact pin) | `APP/web/package.json` devDependencies |
| repo health | 1267 stars, 123 forks, 48 open issues, last push 2026-09-20 | `gh api repos/ngxson/wllama` |
| releases | 3.6.1 (08-27), 3.6.0 (08-16), 3.5.1/3.5.0 (06-15) | `gh api repos/ngxson/wllama/releases` |
| licence | MIT, © 2024 Xuan Son NGUYEN | `W/LICENCE`; `W/package.json` `"license":"MIT"` |
| default wasm | 8,457,512 B (`W/src/wasm/wllama.wasm`) | `ls -l` |
| compat wasm | 15,369,538 B + 170,982 B JS (`W/../wllama-compat/wasm/`) | `ls -l` |

**D2 says "pinned to 3.6.1, never a fork"; the manifest says `^3.6.1`.** A caret range will pull 3.7.x on the next clean
install, and 3.7.0 on master ships `src/wasm-from-cdn.ts` pointing at jsDelivr URLs for `@wllama/wllama@3.7.0` — a version that
does not exist on npm today. Change both entries to exact `3.6.1` before the first release build.

Two fixes that matter are **already ours**: the streaming tail-loss bug (#263, fixed by #269, merged 2026-08-16 14:24 UTC) and
the "interrupted download bricks the cache" bug (#268, fixed by #271, merged 2026-08-16 22:31 UTC) — both before the 3.6.0 tag
(published 23:07 UTC the same day, `gh api .../releases`), and both visible in the installed source: `getResponse` now emits the
chunk's data *before* honouring `has_more` (`W/src/wllama.ts:1110-1126`), and `CacheManager.download` repairs or deletes a
metadata-less partial file (`W/src/cache-manager.ts:134-167`). Two large-memory PRs are **not** in:
#267 "Raise the Memory64 limit to 16 GiB" and #259 "wasm64 fix" both show `merged_at: null`, and `W/CMakeLists.txt:27` still says
`-sMAXIMUM_MEMORY=4096MB`.

---

## 2. Install and initialise (exact, for Vite 5 + React 18 + TS)

```bash
npm i -E @wllama/wllama@3.6.1 @wllama/wllama-compat@3.6.1
```

### 2.1 Asset paths — the wasm, and the worker

There is **no worker file to host**. The worker is assembled from string constants (`W/src/workers-code/generated.ts`) and
started from a Blob URL as an ES module: `new Worker(URL.createObjectURL(new Blob([code])), { type: 'module' })`
(`W/src/utils.ts:344-351`, called at `W/src/worker.ts:162`). Consequence for CSP: a strict policy needs `worker-src blob:` and
`script-src 'wasm-unsafe-eval'` (derived from that code; exact directive set **UNVERIFIED** in a browser).

Only the `.wasm` needs a URL, and Vite's explicit-URL import is the supported way
(<https://vite.dev/guide/assets#explicit-url-imports>). The app already does this correctly:

```ts
// APP/web/src/config.ts:1-14
import wllamaWasm from '@wllama/wllama/src/wasm/wllama.wasm?url';
import compatConfig from 'virtual:wllama-compat';
export const WLLAMA_CONFIG_PATHS = { default: wllamaWasm };
export const WLLAMA_COMPAT_CONFIG = compatConfig;
```

The compat pair must be imported differently — **wasm as `?url`, worker JS as `?raw`** — which is why
`APP/web/vite.config.ts:23-48` synthesises a virtual module. That asymmetry is not obvious and is the single most-copied
mistake; keep the plugin.

### 2.2 Construction

```ts
const wllama = new Wllama(WLLAMA_CONFIG_PATHS, { logger, parallelDownloads: 3, allowOffline: true });
wllama.setCompat(compat !== 'default' ? compat : null);   // APP/web/src/utils/wllama.context.tsx:78-81
```

- The constructor calls `checkEnvironmentCompatible()` **without awaiting it** (`W/src/wllama.ts:201`), so a machine without wasm
  SIMD or exception handling surfaces as an unhandled promise rejection, not a constructor throw (`W/src/utils.ts:291-298`).
  Add a `window.onunhandledrejection` guard or call the check yourself first.
- The constructor also calls `this.setCompat('default')` (`W/src/wllama.ts:214`), which points compat at **jsDelivr**
  (`W/src/wasm-from-cdn.ts:8-11`). A privacy product must override it: pass the locally built pair, or `null` to disable compat
  entirely. The app does exactly that (`wllama.context.tsx:81`), and the built `dist/` contains both binaries
  (`dist/assets/wllama-CmLUJC6F.wasm` 8.46 MB, `wllama-xnr7mLRC.wasm` 15.37 MB) — nothing is fetched from a CDN.
- `allowOffline` is **dead**: declared (`W/src/wllama.ts:76-78`), forwarded (`:212`), never read. Offline works anyway because
  `getModelOrDownload()` checks the cache before the network (`W/src/model-manager.ts:342-353`).
- **One model per instance.** A second `loadModel` throws `Module is already initialized` (`W/src/wllama.ts:480`); switching
  models means `await wllama.exit()` then a new instance (`W/src/wllama.ts:884`; the demo does this).

### 2.3 Which build runs where

`needCompat() = !isSupportJSPI() || !isSupportMem64()` (`W/src/utils.ts:405`), evaluated in `getWorkerResources()`
(`W/src/wllama.ts:1137-1177`).

| Engine | JSPI | Memory64 | Threads | SIMD | Build wllama picks |
|---|---|---|---|---|---|
| Chrome / Edge | **137** | **133** | 74 | 91 | default (8.46 MB, wasm64, JSPI) |
| Firefox | flag `javascript.options.wasm_js_promise_integration` | 134 | 79 | 89 | compat, or default without WebGPU |
| Safari (macOS/iOS) | flag (STP 238) | flag (STP 251) | 14.1 / iOS 14.5 | 16.4 | **compat** (15.4 MB, Asyncify, wasm32) |

Source: `features.json` in the WebAssembly website repo (`gh api repos/WebAssembly/website/contents/features.json`, read
2026-09-21) — the data behind <https://webassembly.org/features/>. wllama's own warnings match
(`W/src/wllama.ts:1156-1177`).

---

## 3. Loading a model

### 3.1 The three entry points

```ts
loadModelFromHF({ repo, file? | quant?, mmprojFile? | mmprojQuant?, hfToken? }, params)  // W/src/wllama.ts:442
loadModelFromUrl(url | { url, mmprojUrl }, params & { progressCallback, headers, signal, useCache })  // :421
loadModel(Blob[] | Model, params)                                                        // :458
```

**`loadModelFromHF` always hits the network**: it GETs `https://huggingface.co/api/models/{repo}/tree/main?recursive=true`
(`W/src/huggingface.ts:47`), revision hard-coded to `main`, then picks `Q4_K_M`, else `Q8_0`, else the first GGUF
(`:33, :95-101`). An offline-capable PWA must **store the resolved URL itself** and call `loadModelFromUrl`, or load from
`modelManager.getModels()`. Do not use `hfToken` here: the token is appended to the URL query string (`:127-133`), and that URL
becomes the OPFS cache key and is persisted in metadata. Use `loadModelFromUrl(..., { headers: { Authorization: ... } })`
instead — but note `getTotalDownloadSize()` issues its HEADs **without** headers (`W/src/model-manager.ts:234-242`), so a gated
repo reports total size 0 and the progress bar has no denominator.

### 3.2 Split GGUF and parallel shard download

- Pass the **first** shard. `ModelManager.parseModelUrl()` expands `-NNNNN-of-NNNNN.gguf` into the full list
  (`W/src/model-manager.ts:264-284`); `Model.refresh()` runs `parallelDownloads` workers over that list
  (`:160-204`), default 3 (`:9`, overridable via `WllamaConfig.parallelDownloads`, `W/src/wllama.ts:70-72`).
- Split them yourself with llama.cpp's tool, 512 MB chunks as the README recommends (`W/README.md:106, 161-168`):
  `./llama-gguf-split --split-max-size 512M ./my_model.gguf ./my_model`.
- Progress is **aggregated across shards**: each shard's `loaded` is summed against the HEAD-derived total
  (`W/src/model-manager.ts:170-190`), throttled to one callback per 100 ms (`W/src/cache-manager.ts:187-199`). That is the number
  to drive a progress bar with; it is bytes, not percent, and `total` can be 0 (see above).
- mmproj (vision/audio projector) is a separate URL/quant and is downloaded alongside (`W/src/wllama.ts:442-447`).

### 3.3 The 2 GB story, precisely

- `W/README.md:38` still says "Max file size is 2GB, due to size restriction of ArrayBuffer", and
  `W/src/workers-code/llama-cpp.js:161-162` documents the real cause: `ftell()` is limited to `MAX_LONG`.
- That limit is a **wasm32** property. The default 3.6.1 build is `-sMEMORY64=1` + JSPI (`W/CMakeLists.txt:62-71`) and reads the
  GGUF asynchronously through `fopen/fread` hooks rather than materialising it (`W/README-dev.md:64-86`), so the 2 GB ceiling
  does not bind there. A user reports loading `Qwen3-30B-A3B-Instruct-2507-UD-Q2_K_XL.gguf` unsplit on v3.2.3
  (wllama issue #204, comment by thomas-0816, 2026-05-24) — third-party, **UNVERIFIED** here.
- It **does** bind on the compat path (Safari/iOS: wasm32 + Asyncify) and in HeapFS/mmap mode. Issue #204 ("models >2GB crash
  from signed 32-bit pointer wrap") is still **open**.
- Heap ceiling either way: `-sMAXIMUM_MEMORY=4096MB` (`W/CMakeLists.txt:27`), `-sINITIAL_MEMORY=128MB`, `-sSTACK_SIZE=5MB`.
- **Product rule:** ship every model as ≤512 MB shards and keep the total under ~2 GB, so one artefact serves the JSPI path, the
  compat path and the phone. `APP/web/src/config.ts:16` already encodes `MAX_GGUF_SIZE = 2e9`.

### 3.4 Load parameters that matter (defaults from `W/src/wllama.ts:520-588`)

| Param | Default | Note |
|---|---|---|
| `n_ctx` | **1024** | conservative; `n_ctx_auto` is disabled ("not supported for now", `:530`) |
| `n_gpu_layers` | **99999** | all layers to WebGPU when `navigator.gpu` exists; `0` also suppresses adapter init (`:491-494`) |
| `n_threads` | `floor(hardwareConcurrency/2)` | `:484`; forced to 1 when not cross-origin isolated (`:528`) |
| `n_parallel` / `kv_unified` | 4 / true | one shared KV of `n_ctx` tokens across slots (`:550-551`) |
| `cache_type_k` / `cache_type_v` | f16 | `q8_0`…`q4_0` accepted (`W/src/types/types.ts:45-46`) — halves KV memory |
| `flash_attn`, `swa_full`, `ctx_shift`, `n_keep`, `n_cache_reuse` | upstream | `:552-568` |
| `jinja`, `chat_template`, `reasoning`, `reasoning_format`, `reasoning_budget_tokens` | upstream | `:554-558`, `:576-579` |
| `lora_adapters`, `spec_draft_*`, `kv_overrides` | none | `:565-575` |

---

## 4. Caching: OPFS, listing, deleting, quota

### 4.1 What the cache is

**OPFS only** — no Cache API, no IndexedDB (`grep -n "indexedDB\|caches.open" W/src/*.ts` is empty). Files live in the OPFS
directory `cache/`, keyed `sha1(url)_basename`, with a sibling `__metadata__<key>` JSON holding `etag`, `originalSize`,
`originalURL`, `mmprojURL`, `sha256` (`W/src/cache-manager.ts:6, 30-67, 367-377`; `W/src/storage/opfs.ts:74-77`).
Writes go through a throw-away worker using `createSyncAccessHandle()` (`W/src/storage/opfs.ts:79-119` +
`W/src/workers-code/opfs-utils.js`), which is the Safari-safe route.

`CacheManager`'s default backend chain is `[new COSBackend()]` (`W/src/cache-manager.ts:88`). `COSBackend` is the experimental
**Cross-Origin Storage** API (`navigator.crossOriginStorage`, WICG proposal) with OPFS as the private fallback
(`W/src/storage/cos.ts:88-136`). Cost of that default: every download first fetches the HF `/raw/` pointer to learn the file's
sha256 (`W/src/cache-manager.ts:129` → `W/src/huggingface.ts:138-151`). Benefit today: none, unless the visitor has the
Chrome extension. **Integrity is checked by size only** (`W/src/model-manager.ts:139-158`); the sha256 is stored, never verified
against the bytes.

### 4.2 List / delete — the API the UI needs

```ts
const models = await wllama.modelManager.getModels({ includeInvalid: true }); // W/src/model-manager.ts:289
models[0].size; models[0].files; models[0].validate();                        // :100-158  VALID | INVALID | DELETED
await models[0].remove();                                                     // :206-212  deletes all its shards + metadata
await wllama.modelManager.clear();                                            // :358      wipes the cache
await wllama.cacheManager.list();   // raw entries                            // W/src/cache-manager.ts:288
await wllama.cacheManager.delete(nameOrURL);                                  // :331
```
An interrupted download leaves a file with no metadata; `getModels()` skips those (`:295-297`), so they are invisible bytes
until `cacheManager.list()` is used directly. A storage screen should list **cache entries**, not just models.

### 4.3 Quota and eviction (this is browser policy, not wllama)

Per MDN, *Storage quotas and eviction criteria* (<https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>, read 2026-09-21):
Chromium gives an origin up to **60 % of total disk**; Firefox **10 % of disk or 10 GiB** (best-effort) and up to 50 % when
persisted; Safari **~60 % of disk for browser apps but ~15 % for embedded WebViews**, with home-screen web apps getting the
browser-app quota. OPFS, Cache API and IndexedDB all count against it. Default storage is **best-effort → LRU-evictable**;
`navigator.storage.persist()` opts out. Safari additionally deletes script-created storage for an origin with **no user
interaction in 7 days** of browser use — with home-screen web apps exempt.

**wllama never calls `navigator.storage.persist()` or `.estimate()`** (`grep` over `W/src/` returns nothing). A 700 MB model
that vanishes after a week is a support ticket, so the app must:

```ts
if (navigator.storage?.persist) await navigator.storage.persist();      // ask before the first download
const { usage, quota } = await navigator.storage.estimate();            // drive the storage meter
```
(The lifted LocalMode `storage-meter.tsx` already exists at `APP/web/src/lib/localmode/storage-meter.tsx`.)

### 4.4 No resumable download

There is no `Range` request anywhere in `W/src/` (`grep -n "Range\|bytes=" W/src/*.ts` → nothing). A partial file is detected by
size mismatch, deleted, and re-fetched from zero (`W/src/cache-manager.ts:134-167`). Hugging Face *does* support ranges —
`accept-ranges: bytes` on both the API redirect and the CDN object (`curl -sIL` on a `resolve/main/*.gguf`, 2026-09-21) — so
resumption is implementable by us, either by replacing `CacheManager` (it is injectable, `W/src/wllama.ts:74-77`) or by
downloading shards ourselves and calling `loadModel(Blob[])`. Until then, **512 MB shards are the resumption unit**: a dropped
connection costs at most one shard.

### 4.5 What we must add

`storage.persist()` + quota UI · Range-resume or shard-level retry · sha256 verification · an "evicted, re-download" path ·
cache listing including orphaned partials.

---

## 5. Threads ↔ cross-origin isolation

- wllama ships **one** wasm; the thread count is a runtime decision via `-sPTHREAD_POOL_SIZE=Module["pthreadPoolSize"]`
  (`W/CMakeLists.txt:35`, `W/README-dev.md:42-52`).
- The probe is exactly "can I post a `SharedArrayBuffer` through a `MessageChannel`, and do wasm atomics validate"
  (`W/src/utils.ts:219-235`). If not: pool size 0, **single thread** (`W/src/wllama.ts:483-487`, `:528`).
- `SharedArrayBuffer` requires a **secure context** *and* `crossOriginIsolated` (MDN, *SharedArrayBuffer* — "To use shared memory
  your document must be in a secure context and cross-origin isolated"), which means response headers
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (wllama README:37 links the same
  requirement; maintainer in issue #4: *"You need to have the required COOP / COEP headers, it's a browser restriction and we
  can do nothing about it"*).
- **Without isolation nothing errors** — you simply get one thread. That silence is why issue #193 exists (a user's app was
  "a few seconds slower" than the demo; the fix was the missing Vite middleware).
- Under COEP `require-corp`, cross-origin subresources need CORS or CORP. Model downloads are fine: HF answers
  `access-control-allow-origin: *` on the CDN object (measured, §4.4), and the app's own smoke run downloaded 386 MB with
  `crossOriginIsolated: true` (`APP/bench_results.jsonl` line 2, `"crossOriginIsolated": true`). What breaks under COEP is
  everything *else* on the page: third-party fonts, analytics, embedded iframes, social widgets. Keep the marketing landing page
  on a route **without** COEP, and isolate only the app route. (`COEP: credentialless` is the softer variant; not mentioned
  anywhere in wllama; support outside Chromium/Firefox **UNVERIFIED**.)

---

## 6. Serving the headers

### 6.1 Vite dev **and preview**

The app sets the headers only in `configureServer` (`APP/web/vite.config.ts:50-58`), which covers `vite dev` and **not**
`vite preview`. Vite has first-class options for both (`vite/dist/node/index.d.ts:656-732`, `CommonServerOptions.headers` at
:732, inherited by `PreviewOptions` at :755):

```ts
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
export default defineConfig({
  server:  { headers: isolation },
  preview: { headers: isolation },
});
```
Also relevant for tunnels: Vite 5's `server.allowedHosts` defaults to localhost + IPs only
(`vite/dist/node/index.d.ts:673-683`), so a `*.trycloudflare.com` hostname must be added there when tunnelling the **dev**
server. Tunnelling the built `dist/` through `APP/serve.py` avoids that entirely.

### 6.2 `APP/serve.py` (the current, correct dev server)

`serve.py:30-36` sets COOP `same-origin`, COEP `require-corp`, CORP `same-origin`, `X-Content-Type-Options: nosniff`, and maps
`.wasm → application/wasm`. Binds 127.0.0.1 unless `--lan` (D6). Keep it as the reference server.

### 6.3 Static hosts

| Host | How | Evidence |
|---|---|---|
| **Cloudflare Pages** | `_headers` file in the build output directory; `[url]` then `  Name: value`; ≤100 rules, ≤2,000 chars/line; not applied to Pages Functions responses | <https://developers.cloudflare.com/pages/configuration/headers/> |
| **Netlify** | `_headers` in the publish directory, or `[[headers]] for = "/*"` in `netlify.toml`; applies only to files Netlify serves (not proxies/functions) | <https://docs.netlify.com/manage/routing/headers/> |
| **GitHub Pages** | cannot set response headers → **coi-serviceworker** (`<script src="coi-serviceworker.js">`, served from your own origin, not a CDN; it reloads the page once on first load; still requires HTTPS or localhost) | <https://github.com/gzuidhof/coi-serviceworker> |

`_headers` body for either of the first two:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

**coi-serviceworker conflicts with a Workbox service worker** (one SW per scope) and cannot be bundled. If we ever need GitHub
Pages, the app's own SW must do the header injection instead. Prefer Cloudflare Pages/Netlify, where the headers are real.

---

## 7. Phones: the secure-context wall, and the four ways round it

### 7.1 Measured, today, on this machine

Per MDN *Secure Contexts*, only `https`/`wss`/`file`, `127.0.0.0/8`, `::1`, `localhost` and `*.localhost` are potentially
trustworthy — **a LAN IP over http is not**. I measured what that costs wllama:

```
# server: python3 http.server subclass sending COOP/COEP, bound 127.0.0.1:8399   (stopped again after the run)
# client: Playwright Chromium 153.0.8010.12 (APP/web/node_modules/playwright)
#   A) http://localhost:8399/test.html
#   B) http://insecure.test:8399/test.html  with --host-resolver-rules="MAP insecure.test 127.0.0.1"
```

| Probe | `http://localhost` | `http://insecure.test` (same bytes, same headers) |
|---|---|---|
| `isSecureContext` | true | **false** |
| `crossOriginIsolated` | true | false |
| `typeof SharedArrayBuffer` | function | **undefined** |
| post a SAB through a MessageChannel (wllama's own test) | ok | throws `SharedArrayBuffer is not defined` |
| `navigator.storage` / `.getDirectory` | object / true | **undefined / false** |
| `typeof caches` | object | undefined |
| `'serviceWorker' in navigator` | true | **false** |
| `navigator.gpu` | true | **false** |
| `import('@wllama/wllama')` | ok | ok |
| **`new Wllama({default: ...})`** | ok | **throws `No supported storage backend found`** |

The throw comes from `CacheManager`'s constructor: no backend reports `isSupported()` because `OPFSBackend.isSupported()` tests
`navigator.storage?.getDirectory` (`W/src/storage/opfs.ts:6-12`) and `StorageManager` is secure-context-only. So on a LAN over
plain http the app does **not** degrade to single-threaded — it does not construct at all.

The one escape hatch (also measured): passing a stub cache manager makes the constructor succeed
(`new Wllama(paths, { cacheManager: stub })` → `ctorWithStubOk: true` in the same insecure context), which with
`loadModel(File[])` from an `<input type=file>` would run a model with no cache, no threads and no WebGPU. That is a
demo, not a product.

**Action:** correct `APP/serve.py:12-15` and `findings.json` limits[2] — the sentence "the page still runs single-threaded" is
false.

### 7.2 The four practical routes to a phone

1. **HTTPS tunnel to `serve.py`** (fastest to try, works off-LAN):
   `cloudflared tunnel --url http://127.0.0.1:8097` → a `*.trycloudflare.com` HTTPS URL. Origin response headers (COOP/COEP)
   pass through. *Caveat:* the tunnel makes a private dev build reachable by anyone with the URL — treat as public.
   (ngrok's free tier injects a browser interstitial; **UNVERIFIED** whether it preserves COOP/COEP.)
2. **`adb reverse` (best for a wired phone; nothing is exposed):**
   `adb reverse tcp:8097 tcp:8097` then open `http://localhost:8097` on the phone — `localhost` **is** a secure context, so
   threads, OPFS, service worker and WebGPU all come back. Under WSL2 this needs Windows-side adb (`adb.exe reverse ...`) or
   usbipd-win to attach the USB device to WSL; Windows reaches a WSL-bound server through WSL's localhost forwarding
   (<https://learn.microsoft.com/windows/wsl/networking>) — **UNVERIFIED on this machine** (needs a phone).
3. **mkcert + HTTPS on the LAN IP:** `mkcert 192.168.x.y localhost 127.0.0.1` and serve TLS. On Android the root CA installs as
   a *user* root; mkcert's own README says you then "have to install the CA and then enable user roots in the development build
   of your app" (<https://github.com/FiloSottile/mkcert>) — i.e. fine for Chrome, **not** automatically for a Capacitor
   WebView (Brief 3). `rootCA-key.pem` is a machine-compromise key: never copy it around.
4. **Public static hosting** (Cloudflare Pages / Netlify with `_headers`): real HTTPS, real headers, no tunnel — the right answer
   for the operator's demo and for beta testers.

### 7.3 The Capacitor shell is a different environment — and a worse one for wllama

Brief 3 (`feasibility-android.md`) establishes, and I verified the central claim independently: **Android System WebView never
becomes cross-origin isolated.** `crossOriginIsolated` stays `false` and `SharedArrayBuffer` is undefined *even when COOP/COEP
are served correctly*, because the SAB-on-Android work shipped for Chrome and not for WebView
(<https://issues.chromium.org/issues/40914606>; Intent-to-Ship "Shared Array Buffers on Android",
<https://groups.google.com/a/chromium.org/g/blink-dev/c/fxZAUibwfOQ>). WebGPU is likewise absent from WebView
(chromestatus 5119617865613312: desktop 113 / android 121 / **webview null**).

Consequence for the PRD: inside the Capacitor APK, wllama runs **single-threaded CPU-WASM with no GPU** — the slowest
configuration in this whole document, and one for which §12 has no measurement at all. The phone-tier ladder there is the
270M–350M row, and the honest comparison to make is *Capacitor APK vs the same phone's Chrome browser (threads + WebGPU) vs a
TWA*. A browser bookmark or a TWA to an HTTPS origin keeps both capabilities; the APK trades them for offline packaging.

Chrome's `chrome://flags/#unsafely-treat-insecure-origin-as-secure` can whitelist `http://192.168.x.y:8097`
(<https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins/>), but it is per-device,
per-tester, easy to get wrong and impossible to ask a customer to do. Use 1–4.

---

## 8. WebGPU in wllama

**Status: shipped and on by default, gated on JSPI.** `isSupportWebGPU()` is `!!navigator.gpu` (`W/src/utils.ts:269-271`);
`n_gpu_layers` defaults to 99999 (`W/src/wllama.ts:526`); `n_gpu_layers: 0` skips adapter init (`:491-494`). The backend is
llama.cpp's `ggml-webgpu` built against Dawn, needing JSPI for async `WaitAny` (PR #215 description), hence:

- **Chrome/Edge:** works (JSPI 137, Memory64 133).
- **Firefox:** JSPI behind a flag → wllama logs "WebGPU is disabled on Firefox due to missing JSPI support"
  (`W/src/wllama.ts:1174-1177`); `setCompat(x, 'firefox_safari')` enables it via the compat build "with significantly degraded
  performance" (`W/README.md:96-97`).
- **Safari / iOS:** WebGPU ships in Safari 26 (caniuse, read 2026-09-21), and the compat (Asyncify) build is what runs
  there — confirmed by third-party measurements below where iOS Safari 26 rows carry `"buildType": "asyncify"` with
  `nGpuLayers: 999`.
- **Open WebGPU issues at HEAD:** #229 (Intel Gen9/UHD 620 fails: hardcoded `WEBGPU_MAX_WG_SIZE=288` exceeds the device's 256 —
  upstream fix needed), #234 (multimodal image encode: `memory access out of bounds` / `VK_ERROR_DEVICE_LOST` on some GPUs),
  #249 (desktop compositor stalls during prefill; maintainer discussion of inflight-batch tuning, unfixed), #241 (ShaderF16
  assert aborts `wllamaStart()` even with `n_gpu_layers: 0` — closed, "should be fixed upstream").
- wllama's WebGPU tests exist (`W/src/wllama.wgpu.test.ts`) but are **not run in CI**.
- Memory: with HeapFS the model occupies wasm heap **and** GPU buffers ("a 4GB model will still occupy 4GB of main memory, even
  if half of the layers are offloaded", `W/README-dev.md:99`); with the async-read path (JSPI, i.e. Chrome) the file is streamed,
  not held. UNVERIFIED what the resident total is per model — measure.

---

## 9. Streaming, abort, timings

```ts
const stream = await wllama.createChatCompletion({ messages, max_tokens: 512, stream: true, abortSignal: ac.signal });
for await (const chunk of stream) out += chunk.choices[0].delta.content ?? '';
// or: createChatCompletion({ ..., stream: true, onData(chunk) {...} })  → resolves void
```
Three overload shapes at `W/src/wllama.ts:731-762` (non-stream / async-iterable / callback).

- **Pull-driven:** JS polls `get_result` in a loop (`W/src/wllama.ts:1066-1135`); each poll advances the server-context one step.
  A busy main thread therefore *slows generation* — keep markdown re-rendering off the critical path (throttle, or render into a
  detached buffer).
- **Abort:** `abortSignal` is checked once per poll and the slot is freed in a `finally` via `cancelRequest`
  (`:1076-1078`, `:1128-1133`). Granularity is one step, so a long **prompt** batch cannot be interrupted mid-batch.
- **Per-chunk metrics are already there**: `chunk.timings` (`prompt_per_second`, `predicted_per_second`, `cache_n`, …,
  `W/src/types/oai-compat.ts:212-224`) and `prompt_progress` (`:205-211`, enable with `return_progress: true`). That is where an
  honest tok/s readout comes from — not from a wall-clock guess (D5).
- **Errors:** `WllamaError.type` advertises `kv_cache_full` (`W/src/wllama.ts:122`) but nothing ever throws it; context overflow
  arrives as a generic `inference_error` carrying upstream's message (`:1104-1110`). Wasm aborts become `WllamaRuntimeError`
  with a demangled C++ stack (`W/src/debug.ts`).
- Historic bug worth knowing because it will be mentioned in old posts: streamed tails were lost before 3.6.0 (#263) — fixed in
  our version.

---

## 10. Chat templates, tools, constrained output, embeddings

Everything below is upstream llama-server code compiled into the wasm; wllama forwards the request body **verbatim**
(`data_json: JSON.stringify({...options, ...customOpt})`, `W/src/wllama.ts:819`), so llama-server's parser is the contract.

- **Chat template:** taken from the GGUF (`tokenizer.chat_template`), readable via `wllama.getChatTemplate()`
  (`W/src/wllama.ts:400-403`), overridable at load with `chat_template`, and `jinja` defaults to **true** upstream
  (`common.h:638` at the pinned commit). `chat_template_kwargs` (e.g. `{"enable_thinking": false}`) is supported per request
  (`W/src/types/oai-compat.ts:129`).
- **Tool calling:** `tools` + `tool_choice` are parsed and *require* jinja (`server-common.cpp:1140-1152` at the pin; without it:
  `"tools param requires --jinja flag"`). Streaming emits `delta.tool_calls[{index,id,function:{name,arguments}}]`; the correct
  accumulate-by-`index` loop, the `finish_reason === 'tool_calls'` branch and the `role:'tool'` round trip are demonstrated in
  `CLONE/examples/tools/index.html:497-596` (model there: `unsloth/Qwen3.5-0.8B-GGUF` Q4_K_M, `:268`). **Do not lift that file's
  tool executor** — it runs model output through `Function(...)` (`:353`).
  `parallel_tool_calls` is read upstream (`server-common.cpp:1272`) though commented out of the TS type
  (`W/src/types/oai-compat.ts:120`).
- **Constrained output:** `response_format: {type:'json_object'|'json_schema', json_schema:{schema}}`
  (`W/src/types/oai-compat.ts:122-125`) and raw GBNF via `grammar` (`W/src/types/types.ts:119`) both reach
  `server-common.cpp:1161-1181`. Two rules from that code: **`json_schema` and `grammar` cannot be combined** (`:1163-1165`), and
  **a custom `grammar` cannot be combined with `tools`** (`:1299-1302`, "Cannot use custom grammar constraints with tools").
  The app already implements the grammar path with a prompt-and-repair fallback (`APP/web/src/skills/run.ts:3-4, 65, 78-102`) —
  keep the fallback: grammar correctness per model is untested in wllama (no test in `W/src/wllama.test.ts` mentions
  `tools|grammar|json_schema`), and issue #168 ("Grammar Not Accepting the Sampled Tokens") is still open from the v2 era.
- **Embeddings:** need `embeddings: true` at load (`W/src/wllama.ts:642-670`), and an embedding instance cannot also chat →
  two instances = two workers = two heaps. **Call it once per string**: for `input: string[]` the C++ posts one task per string
  while `getResponse` keeps only the last non-stream chunk (`W/src/wllama.ts:1100-1102`) — reported in the earlier dossier,
  **UNVERIFIED** by execution here.
- **Rerank:** `createRerank({query, documents, top_n})` requires `pooling_type: 'rank'` and loops documents **sequentially**
  (`W/src/wllama.ts:678-724`) — cost grows linearly, budget accordingly.
- **No tokenizer API in v3.** `tokenize`/`detokenize` and the KV/session APIs were removed ("Low level API // TODO: add back",
  `W/src/wllama.ts:943-946`). Token budgeting must use `usage`/`timings` after the fact, or an external tokenizer
  (`@huggingface/gguf` is already a dependency for metadata).
- **Prompt cache:** upstream `cache_prompt` defaults true (`common.h:627`), 4 slots over one unified KV, so multi-turn chat
  re-uses the common prefix with no app code. Known gap: PR #285 (open, 2026-09-19) reports that on **recurrent/hybrid**
  architectures (Qwen3.5, LFM2, Granite-hybrid — exactly our small-model set) master reuses 0 prefix tokens where the fix reuses
  878. Until merged, expect a full prompt re-process each turn on those models. **This is the single biggest UX risk in the
  model ladder** and it should be measured per model before the default is chosen.

---

## 11. Memory and context on a 4–6 GB phone

Budget, per instance: **weights + KV + compute buffers + the browser itself**, inside a heap capped at 4 GiB
(`W/CMakeLists.txt:27`) and inside whatever the OS gives the tab.

- KV cache ≈ `2 × n_layer × n_kv_heads × head_dim × n_ctx × bytes_per_elem`. Halve it with `cache_type_k/v: 'q8_0'`, quarter with
  `q4_0` (`W/src/types/types.ts:45-46`). The app caps `n_ctx` at 8192 with the reasoning written down
  (`APP/web/src/config.ts:18-20`).
- **iOS is the tightest target.** wllama allocates shared memory in a retry loop from 4096 MB downwards in 128 MB steps "because
  we have a weird OOM issue on iOS" (`W/src/workers-code/llama-cpp.js:106-138`). Historical data points from the tracker:
  a 6 GB iPhone needed the max lowered to ~1.2 GB (issue #18, felladrin, 2024-05-12), and on an iPhone SE 2023 (4 GB) the retry
  loop settled at 1.6 GB (PR #23). The LlamaWeb paper states flatly: *"on iOS devices Safari tab memory is limited to <500 MB"*
  and *"we found that Safari has especially strict memory usage limits"* (arXiv 2605.20706, §5).
- Safari mobile also disables transferable buffers for every worker message (`W/src/worker.ts:352-360`), so each buffer is copied.
- There is **no pre-flight fit estimate** (`n_ctx_auto` disabled) and no memory-pressure handling. We must compute an estimate
  ourselves (size on disk + KV + ~150-200 MB runtime, the same formula the model catalogue uses in
  `research/models/catalog-general-chat.json` → `wllama_compatibility.required_vram_mb`) and refuse politely above the device
  budget, rather than letting the tab die.
- A killed tab loses the worker; recovery (re-load from OPFS, replay the conversation) is ours. Universal_AI's OOM/crash-loop
  survival code is the named lift for this in D2.

---

## 12. Performance: every number with its instrument

**Nothing here is an estimate.** Rows are labelled with backend, because CPU-WASM and WebGPU differ by an order of magnitude.

### 12.1 Third-party, measured, public dataset — WebGPU

`abhijitramesh/webgpu-bench-leaderboard` on Hugging Face (the dataset behind the llama.cpp WebGPU benchmark site linked from the
release blog). Harness: llama.cpp `b8981-3-gf22c8021d`, Dawn `v20260317.182325`, `n_ctx 2048`, `pp512`, `tg128`, 5 reps,
`nGpuLayers: 999`. Files: `runs/2026-05-*/`. Read 2026-09-21.

| Device (UA) | Browser / build | Model, quant | prefill tok/s | decode tok/s | depth |
|---|---|---|---|---|---|
| iPhone (iOS, `Version/26.4`) | Safari 26, **asyncify** | gemma-3-270m-it Q4_K_M | 413.57 | **36.25** | 0 |
| iPhone | Safari 26, asyncify | gemma-3-270m-it Q4_K_M | 246.04 | 25.92 | 2048 |
| iPhone | Safari 26, asyncify | LFM2.5-350M Q4_K_M | 107.92 | **33.52** | 0 |
| iPhone | Safari 26, asyncify | Qwen3-0.6B Q4_K_M | 76.51 | 20.81 | 0 |
| iPhone | Safari 26, asyncify | Qwen3-0.6B Q4_K_M | 59.04 | **9.18** | 2048 |
| Samsung Xclipse 940 (Galaxy S24 class, Android) | Chrome 147, jspi | Llama-3.2-1B-Instruct Q4_K_M | 59.51 | 6.94 | 0 |
| Samsung Xclipse 940 | Chrome 147, jspi | Qwen3.5-2B Q4_K_M | 29.60 | 4.36 | 0 |
| Samsung Xclipse 940 | Chrome 147, jspi | LFM2.5-350M Q4_K_M | 136.83 | 8.41 | 0 |
| Qualcomm Adreno 7xx (Android) | Chrome 147, jspi | LFM2.5-350M Q4_K_M | 86.38 | 5.81 | 0 |
| Qualcomm Adreno 7xx | Chrome 147, jspi | Qwen3-0.6B Q4_K_M | 30.98 | 2.67 | 0 |
| Qualcomm Adreno 7xx | Chrome 147/148, jspi | Llama-3.2-1B-Instruct Q8_0 | 1.34 | 1.36 | 0 |
| Imagination PowerVR D-series (Android) | Chrome 147, jspi | Qwen3-0.6B Q4_K_M | 12.61 | 1.24 | 0 |
| Imagination PowerVR D-series | Chrome 147, jspi | Qwen3.5-2B Q4_K_M | 7.02 | 1.17 | 0 |

Read it as: **a 270M–350M model is conversational on a phone (≈25–36 tok/s on a recent iPhone, ≈6–8 on a mid Android GPU);
a 0.6B is borderline on Android; a 1B+ is not, except on the best Android GPUs.** Decode at context depth 2048 is 20–60 % slower
than at depth 0 — quote the depth-2048 number to users, not the headline.

### 12.2 Third-party, peer-reviewed — WebGPU across 16 devices

"Llamas on the Web: Memory-Efficient, Performance-Portable, and Multi-Precision LLM Inference with WebGPU", Levine et al.,
arXiv **2605.20706** (2026-05-20), the backend wllama uses:
- low cluster = *"low-power and efficient GPUs from iPhones and Android devices (Adreno, Mali, PowerVR)"* → **decode 4–17 tok/s**,
  and those GPUs *"were only able to fit the four smallest models (lfm, bonsai, gemma3, and qwen3)"*.
- high cluster (e.g. RTX 5080) → above 3k tok/s prefill and >100 tok/s decode on small models, down to 65 / 30 tok/s on
  Gemma4-E2B.
- vs other browser frameworks: 29–33 % less memory, 45–69 % higher decode throughput than WebLLM/Transformers.js.

### 12.3 wllama's own report — WebGPU on a laptop

PR #215 (maintainer, 2026-05-10): *"On the multimodal demo, I got 171 t/s for generation and 592 t/s for prompt processing
(running on latest chrome)"* — MacBook M5, model `LiquidAI/LFM2.5-VL-450M-GGUF` Q4_0 (the demo's model at that commit).

### 12.4 CPU-WASM (no WebGPU) — thin evidence, deliberately

- Issue #4 (2024-04, wllama v1, Chrome 124, laptop, gemma-2b-it **Q4_K_M**): *"roughly 6-7 tokens per second"* in the browser vs
  *"roughly 25 tokens per second"* from LM Studio with GPU acceleration disabled — "roughly 3-4x slower than native". Maintainer's
  explanation: wasm SIMD is AVX-class, not AVX2.
- **This machine, 2026-09-21** (`APP/bench_results.jsonl`, run `smoke2`): SmolLM2-360M-Instruct **Q8_0** (386 MB), headless
  Chromium 153 in WSL2 (4 cores / 8 threads reported, 4 threads used, `crossOriginIsolated: true`, `nGpu: 0`):
  prefill 29.0 tok/s, decode **12.3 tok/s**, load 19.7 s, n=2. **Not publishable** under D5: the machine was not quiet, load was
  not recorded, and the first run in the same file has negative TTFT values (a broken instrument). Treat as a smoke test that the
  path works, and re-measure.
- I found **no published CPU-WASM tok/s for a phone**. The "~30-50 tok/s" figure circulating for wllama comes from LocalMode's
  `estimateSpeed()`, which the LocalMode dossier shows is a formula with no measurement behind it
  (`research/repos/localmode.md:144`). Do not cite it.

**Consequence for the PRD:** the phone story is a WebGPU story. Without WebGPU (no `navigator.gpu`, or a device Dawn rejects) the
phone tier must fall back to the 270M–350M models and say so.

---

## 13. PWA status in this app, and what is missing

- `index.html` and `chat.html` both `<link rel="manifest" href="/manifest.webmanifest">`, but **no manifest exists** — not in
  `APP/web/public/` (only `icon.svg`, `wllama.png`, `favicon.ico`) and not in `APP/web/dist/`. Every load 404s on it and the app
  is not installable.
- `vite-plugin-pwa@1.3.0` and `workbox-build@7.4.1` are installed but **not referenced** in `vite.config.ts`; nothing registers a
  service worker (`grep -rn "registerSW\|serviceWorker" APP/web/src` → nothing).
- When it is wired: Workbox's `maximumFileSizeToCacheInBytes` defaults to **2,097,152 B**
  (`APP/web/node_modules/workbox-build/build/schema/GenerateSWOptions.json:30`), so the 8.46 MB and 15.37 MB wasm files are
  silently dropped from the precache with a warning
  (`workbox-build/build/lib/maximum-size-transform.js:19-23`). Raise it (≈20 MB) or precache the wasm through an explicit
  runtime-caching rule. A PWA that cannot open offline because the wasm was skipped is the classic failure here.
- Offline model loading works only via the cache path (§3.1) — never `loadModelFromHF` at runtime.
- Service workers need a secure context (measured, §7.1), which is one more reason the phone route cannot be plain http.

---

## 14. Recommended model ladder

Tiers follow the app's own thresholds — `tierOf`: < 500 MB phone, ≤ 1.2 GB laptop, else desktop (`APP/web/src/config.ts:45`).
Sizes, licences and GGUF paths are from `research/models/catalog-general-chat.json` (built 2026-09-21); the *speed* column is
only filled where §12 has a real measurement of that exact model.

| Tier | Model | GGUF | Size | Licence | Why | Measured |
|---|---|---|---|---|---|---|
| **Phone — default** | LFM2.5-350M | `LiquidAI/LFM2.5-350M-GGUF` Q4_K_M (catalog lists Q8_0 = 379 MB) | 219 MB (Q4_K_M) | lfm1.0 | tools + JSON + extraction at 350M; fits the "low cluster" that can only hold four models | iPhone Safari 26: 33.5 tok/s decode; Adreno: 5.8; Xclipse: 8.4 (§12.1) |
| **Phone — smallest** | Gemma-3-270M-it | `ggml-org/gemma-3-270m-it-GGUF` Q4_K_M / Q8_0 | 241 / 292 MB | Gemma Terms | fastest thing that still forms sentences; good demo model | iPhone: 36.3 / 25.9 tok/s (depth 0 / 2048) |
| **Phone — stretch** | Qwen3-0.6B | `Qwen/Qwen3-0.6B-GGUF` Q4_K_M (378 MB) or Q8_0 (639 MB) | 378 MB | apache-2.0 | tools/JSON/reasoning, 23.7M downloads/30 d | iPhone 20.8 → 9.2 tok/s (depth 2048); Adreno 2.7 |
| **Phone — tools** | Qwen3.5-0.8B | `unsloth/Qwen3.5-0.8B-GGUF` Q4_K_M | 533 MB | apache-2.0 | the model wllama's own tool demo loads; recurrent arch → **check PR #285 first** | none |
| **Laptop — default** | LFM2.5-1.2B-Instruct | `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` Q4_K_M | 731 MB | lfm1.0 (check terms) | best tools/extraction per byte in the catalogue | none |
| **Laptop — reasoning** | Qwen3-1.7B | `unsloth/Qwen3-1.7B-GGUF` Q4_K_M | 1,107 MB | apache-2.0 | thinking mode, JSON, tools | none |
| **Laptop — permissive** | Granite-4.0-1B | `ibm-granite/granite-4.0-1b-GGUF` Q4_K_M | 1,024 MB | apache-2.0 | IBM, extraction-oriented; hybrid arch → PR #285 caveat | Xclipse (h-1b variant) 4.1 tok/s |
| **Desktop — default** | Qwen3.5-2B | `unsloth/Qwen3.5-2B-GGUF` Q4_K_M | 1,281 MB | apache-2.0 | the quality step users feel | Xclipse 4.4 tok/s, PowerVR 1.2 (i.e. **not** a phone model) |
| **Desktop — long answers** | SmolLM3-3B | `ggml-org/SmolLM3-3B-GGUF` Q4_K_M | 1,915 MB | apache-2.0 | 3B with tools; already in the app's list | none |
| **Desktop — max** | Qwen3.5-4B | `888rok/Qwen3.5-4B-Q4_K_M-wllama-split` (2 shards) | 2,741 MB | apache-2.0 | the only **pre-split** entry — the shape every model should ship in | none |

Notes and cautions:
- Architectures `qwen35`, `lfm2`, `gemma3`, `gemma4`, `smollm3`, `granitehybrid`, `minicpm`, `mistral3/4` are all present at the
  **3.6.1** llama.cpp pin (`src/llama-arch.cpp:41-144` at `83d855c5`, fetched via `gh api`) — the catalogue's arch check was done
  against master's pin, and it holds for ours too.
- The catalogue marks Gemma-4-E2B, Phi-4-mini and BitNet `is_compatible: false`; keep them off the ladder.
- Licences: LFM (`lfm1.0`) and Gemma carry vendor terms — legal check before shipping either as the default.
- Every model above should be **re-published by us as ≤512 MB shards** (§3.3) on a host we control, so the app never depends on a
  third-party repo layout and resumption costs at most one shard.

---

## 15. Pitfalls checklist (each one already bit someone)

1. `^3.6.1` in `package.json` → pin `3.6.1` exactly. Master's CDN defaults point at a version npm does not have.
2. COOP/COEP missing on **preview**/static host → silent single-thread. Test `crossOriginIsolated === true` in CI, not by feel.
3. Plain http on the LAN → `new Wllama()` **throws**; it does not degrade (§7.1).
4. `setCompat` left at its default → Safari users silently download 15.4 MB from jsDelivr, breaking both the privacy claim and
   offline. Always pass local assets or `null`.
5. `loadModelFromHF` in a "works offline" path → needs the network every time. Store resolved URLs.
6. `hfToken` in `loadModelFromHF` → token lands in the URL, the cache key and the stored metadata.
7. Interrupted download → wasted bytes (no Range). Shard at 512 MB and retry per shard.
8. No `storage.persist()` → a 700 MB model can be evicted (Chromium LRU; Safari 7-day rule).
9. Workbox default 2 MiB precache limit → the wasm is dropped and the PWA is not offline-capable.
10. COEP `require-corp` on the marketing page → third-party fonts/embeds break. Isolate only the app route.
11. Heavy markdown re-render per token → slows generation itself (pull-driven loop, §9).
12. `grammar` + `tools` in the same request → upstream throws; so does `json_schema` + `grammar`.
13. Batch embeddings (`input: string[]`) → probably returns only the last vector; call once per string until proven otherwise.
14. Recurrent/hybrid models (Qwen3.5, LFM2, Granite-hybrid) → prompt cache may reuse nothing (PR #285); measure turn-2 latency
    before choosing a default.
15. `navigator.hardwareConcurrency` is spoofed by Brave and others (issue #4, felladrin) → let the user set `n_threads`.
16. Two instances (chat + embeddings) = two wasm heaps on a phone. Sequence them, don't co-host.
17. `n_ctx` defaults to 1024 — silently short. Set it explicitly, and cap by device (`MAX_CONTEXT` 8192 today).
18. `checkEnvironmentCompatible()` is not awaited → catch the unhandled rejection or run the check yourself.
19. Chromium WebGPU on some Intel iGPUs aborts the whole module (#229, #241) → feature-detect, catch, and fall back to
    `n_gpu_layers: 0`.
20. One SW per scope: coi-serviceworker and a Workbox SW cannot both run. Pick the host accordingly.

---

## 16. Open questions to settle with a measurement (not an opinion)

| # | Question | How to answer it |
|---|---|---|
| 1 | Real tok/s for the ladder's phone tier on the operator's actual phone, CPU-WASM **and** WebGPU | `adb reverse` + the existing `bench.html` harness; record load, device, thermal state |
| 2 | Does PR #285 (recurrent prompt cache) bite our default model? | two-turn conversation, compare turn-2 prefill `timings.cache_n` |
| 3 | Resident memory per model on a 4–6 GB phone (HeapFS duplication with WebGPU) | `performance.measureUserAgentSpecificMemory()` where available, plus OS-level reading |
| 4 | Does batch `createEmbedding` return one vector or N? | one call with two strings, compare to two calls |
| 5 | Does a Cloudflare quick tunnel preserve COOP/COEP end to end? | `curl -I` through the tunnel, then `crossOriginIsolated` on the phone |
| 6 | iOS Safari: largest model that loads through the compat build | binary search on the ladder, on a real device |
