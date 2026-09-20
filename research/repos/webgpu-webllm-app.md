# Dossier: krtarunsingh/webgpu-webllm-app

```
WHAT IT IS      : 547-line static demo (vanilla JS, no build) — WebLLM/WebGPU chat with a wllama WASM fallback, a 49-line service worker, a PWA manifest. 2 commits, 1 author, 2 days of life.
LICENCE VERDICT : NO. No LICENSE file, no licence field anywhere, GitHub API license=null -> all rights reserved. Ideas only, zero code.
BEST THING      : Nothing to copy. One idea worth keeping: try/catch around the WebGPU engine init and fall through to wllama (app.js:74-111). That is 5 lines you write yourself.
BIGGEST RISK    : Treating it as a reference. The WASM fallback 404s on its own CDN import, the SW precache list points outside the served root, and the SW double-stores every model shard.
SCORES          : maturity 1 · code_quality 2 · chat_ux 1 · agentic 1 · mobile_pwa 1
RECOMMENDATION  : Skip. Do not vendor, do not cite as a pattern. Take shard caching from wllama's own CacheManager (MIT) and PWA plumbing from vite-plugin-pwa/Workbox instead.
```

Examined 2026-09-21. Clone: `/home/edu/.cache/slm-src/krtarunsingh_webgpu-webllm-app` at
`f34787ad0004d416cc2bacc81983b3837ba72144`. All `file:line` references are relative to that clone.
Claims about browser behaviour that I derived by reading code and specs but did **not** execute in a
browser are marked **(not executed)**. Network probes (`curl`, `gh api`) were run today and are quoted.

---

## 1. Licence — precise situation

| Check | Result | Source |
|---|---|---|
| `LICENSE` / `LICENCE` / `COPYING` / `NOTICE` file in repo | **None.** Root holds only `README.md`, `docs/`, `public/`, `tools/`, `web/` | `gh api repos/krtarunsingh/webgpu-webllm-app/contents` -> `README.md docs public tools web` |
| GitHub licence detection | `"license": null` | `gh api repos/krtarunsingh/webgpu-webllm-app` |
| Licence endpoint | HTTP 404 "Not Found" | `gh api repos/krtarunsingh/webgpu-webllm-app/license` |
| Licence statement in README | None. The only legal-adjacent text is a "Credits" section naming WebLLM and wllama | `README.md:50-52` |
| Licence header in any source file | None | `web/app.js:1`, `web/sw.js:1`, `web/fallback/wllama.js:1`, `tools/quantize.py:1-5` |
| `package.json` with a `license` field | No `package.json` exists at all | file listing, 12 files total |
| Other branches that might carry a licence | Only `main` | `gh api .../branches` |

**Verdict: `no`.** With no licence, default copyright applies: the author (Tarun Singh) holds all
rights, and nobody else has permission to copy, modify or redistribute the code. GitHub's Terms of
Service grant other users only the right to view and to fork *inside GitHub*; that does not extend to
copying the code into another product, private or MIT-released. "Copy with attribution" is not
available here — attribution does not substitute for a licence grant.

What remains free to use: the *ideas* (copyright does not cover techniques). Every idea in this repo
is a generic, widely documented pattern (cache-first `fetch` handler, `navigator.gpu` feature test,
try/catch fallback), so nothing is lost by writing them fresh.

The only route to legal copying would be asking the author to add a licence (the repo has 0 issues, so
no one has asked). Given section 4 concludes there is nothing worth copying, that is not worth doing.

Third-party code: none is vendored. Both runtimes are fetched from CDNs at run time —
`@mlc-ai/web-llm@0.2.79` (Apache-2.0 per the npm registry) and `@wllama/wllama@2.3.5` (MIT per the npm
registry). Those licences govern the libraries, not this repo's glue code.

---

## 2. What is actually in the repo

Whole repo, by `wc -l` (547 lines including the README and two PNGs counted as lines):

| File | Lines | Role |
|---|---|---|
| `web/app.js` | 252 | everything: DOM wiring, runtime detection, WebLLM chat, tool demo |
| `web/index.html` | 72 | markup, settings `<dialog>`, SW registration |
| `README.md` | 52 | |
| `web/sw.js` | 49 | service worker |
| `web/styles.css` | 27 | minified-style dark theme, fixed 920 px column |
| `tools/quantize.py` | 27 | prints llama.cpp commands; converts nothing (says so itself, `tools/quantize.py:3-4`) |
| `web/manifest.json` | 19 | PWA manifest |
| `docs/models.md` | 19 | model notes |
| `web/fallback/wllama.js` | 17 | the WASM fallback |
| `docs/pwa.md` | 4 | |
| `public/icon-192.png`, `icon-512.png` | 913 B / 2,879 B | placeholder icons (README calls them placeholders, `README.md:37`) |

No `package.json`, no lockfile, no bundler, no TypeScript, no tests, no CI (`.github/` absent), no
linter config. No releases, no tags, no GitHub Pages site (`gh api .../pages` -> 404), `homepage: null`.

### Architecture

```
index.html ──> app.js (ES module)
                 │  init()  app.js:72
                 ├─ navigator.gpu ? ──> import("https://unpkg.com/@mlc-ai/web-llm@0.2.79?module")
                 │                      CreateMLCEngine(model)          app.js:103
                 │                      any throw ──> fall through      app.js:108-110
                 └─ else / on throw ──> import(unpkg .../wasm-from-cdn.js?module)   app.js:121
                                        import("./fallback/wllama.js")               app.js:124
                                          └─ import(esm.sh/@wllama/wllama@2.3.5)     wllama.js:2
                                             loadModelFromUrl(stories260K.gguf)      wllama.js:5-7
index.html:64-70 ──> navigator.serviceWorker.register("./sw.js")
sw.js: install = precache 7 URLs · fetch = cache-first for "model-ish" URLs, network-first for the rest
```

State is three module-level `let`s (`engine`, `runtime`, `messages`, `app.js:25-27`). Nothing is
persisted: no IndexedDB, no localStorage, conversation is lost on reload.

### History and people

- `gh api .../commits`: **2 commits**, `57333ab` 2025-09-05 ("Add comprehensive documentation and
  initial implementation…") and `f34787a` 2025-09-06 ("Update CDN URLs and enhance WASM fallback model
  loading…"). Created 2025-09-05, last push 2025-09-06. Nothing in the 12 months since.
- `gh api .../contributors`: one account, `tarunepiuse` (2 contributions; 0 public repos, 0 followers).
  Repo owner `krtarunsingh` (30 public repos, 9 followers). Same display name "Tarun Singh".
- 8 stars, 3 forks, 0 issues ever (open or closed), 0 PRs.

---

## 3. README claims vs the code

| README claim | Reality | Evidence |
|---|---|---|
| "OpenAI-compatible WebLLM with streaming output" (`README.md:6`) | **True.** Streams deltas into a bubble's `textContent` | `app.js:151-163` |
| "Function calling demo" (`README.md:7`) | **Present but fails on the default model, and the protocol is wrong.** See 3.1 | `app.js:215-251` |
| "Service Worker caching (static assets + model shards)" (`README.md:8`) | **Present; install very likely fails under the README's own quick-start; double-stores shards.** See 3.2 | `web/sw.js` |
| "PWA packaging (installable, offline-first UX)" (`README.md:9`) | **Not offline-first.** The wllama JS is never cached; icons resolve outside the served root | 3.2, 3.3 |
| "WASM fallback using wllama" (`README.md:10`), "auto-switch to WASM" (`README.md:19`) | **Broken as committed, today.** Its first import is a 404 | 3.4 |
| Folder map shows `/fallback` at repo root (`README.md:29-30`) | Actually `web/fallback/` | file listing |
| `docs/models.md:5-8` lists four WebLLM model IDs | **None of the four exists in WebLLM 0.2.79's prebuilt list** (0 matches each when grepping the published `lib/index.js` for `TinyLlama-1.1B-Chat-v0.4-q4f16_1`, `Phi-2-q4f16_1`, `Mistral-7B-Instruct-v0.2-q4f16_1`, `Llama-3.1-8B-Instruct`). The same dead IDs are hard-coded in `index.html:47-50`; the app only works because `app.js:80-89` overwrites the dropdown from `prebuiltAppConfig` at run time | unpkg `@mlc-ai/web-llm@0.2.79/lib/index.js` |

### 3.1 Function calling

```js
// app.js:235-240
const msg = reply.choices?.[0]?.message;
if (msg && msg.tool_calls && msg.tool_calls.length > 0) {
  const call = msg.tool_calls[0];
  const toolRes = toolRouter(call.function.name, ...);
  messages.push({ role: "tool", content: JSON.stringify(toolRes), tool_call_id: call.id || "tool-1" });
  const final = await engine.chat.completions.create({ messages });
```

- The assistant message carrying `tool_calls` is never pushed before the `role:"tool"` message, so the
  history sent on the second call is not a valid OpenAI-style tool exchange.
- WebLLM 0.2.79 only accepts `tools` for five Hermes model IDs (`functionCallingModelIds`,
  `lib/index.js:898-904`) and throws `UnsupportedModelIdError` otherwise (`lib/index.js:9827-9828`).
  The app's default model is whatever is first in the prebuilt list — `Llama-3.2-1B-Instruct-q4f32_1-MLC`
  (`lib/index.js:913-917`) — so pressing "Demo: getTime()" on a fresh load yields "Error: … is not
  supported for ChatCompletionRequest.tools" **(not executed; follows from the two code paths)**.
- One tool, no arguments, no loop, first call only. On the WASM path it prints "Tool-calling demo
  requires WebLLM path." (`app.js:221-224`).

### 3.2 Service worker — the requested focus

The entire shard-caching logic:

```js
// web/sw.js:25-41
const isModel =
  url.hostname.includes("huggingface.co") || url.href.includes(".gguf") ||
  url.href.includes("mlc-ai") || url.href.includes("web-llm") || url.href.includes(".wasm");
if (isModel) {
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const res = await fetch(event.request);
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  }));
```

Problems, in order of severity:

1. **Precache list escapes the served root.** `APP_ASSETS` contains `"../public/icon-192.png"` and
   `"../public/icon-512.png"` (`sw.js:9-10`). The README quick-start serves `web/` as the site root
   (`cd web && python -m http.server 8000` / `npx http-server web`, `README.md:14-15`). Resolved against
   `http://localhost:8000/sw.js`, `../public/icon-192.png` becomes `http://localhost:8000/public/icon-192.png`
   (checked with `urllib.parse.urljoin`), which that server does not have -> 404. `Cache.addAll()` rejects
   if any response is non-OK, so `install` rejects and the worker never activates — **no caching at all**
   when following the README **(not executed in a browser; follows from URL resolution + the Cache API
   contract)**. Same broken paths in `manifest.json:10,15` and `index.html:8-9`. It only works if the repo
   root is served and the page is opened at `/web/`, which the README does not say.
2. **It duplicates storage the libraries already manage.** WebLLM 0.2.79 caches weights itself in the
   Cache API (`useIndexedDBCache: false` default, `lib/index.js:912`, branch at `:10242`). wllama ships
   its own `CacheManager` (OPFS-backed by default in the local clone, `ngxson_wllama/src/cache-manager.ts:77-81`
   — that clone is v3.7.0; I did not check 2.3.5's backend). Because those libraries' fetches pass through
   this worker, every shard is written a second time into `webllm-cache-v1`. On a phone with a 1–2 GB
   model this doubles quota use for no benefit.
3. **No cache lifecycle.** `CACHE = "webllm-cache-v1"` (`sw.js:2`) is never versioned against anything;
   `activate` only calls `clients.claim()` (`sw.js:18-20`) and never deletes old caches. No
   `navigator.storage.persist()`, no `estimate()`, no quota-exceeded handling; `cache.put` is not awaited
   and its rejection is unhandled (`sw.js:38`).
4. **The heuristic is substring matching on the whole URL.** Any URL containing `.wasm`, `mlc-ai` or
   `web-llm` — including in a query string — is served cache-first forever. Conversely the wllama JS
   (`https://esm.sh/@wllama/wllama@2.3.5/esm/index.js`, `wllama.js:2`) matches none of the five tests
   ("wllama" is not "web-llm"), so it takes the network-first branch, which **never writes to the cache**
   (`sw.js:46-48`). Offline, the WASM path cannot even import its runtime. "Offline-first" is false.
5. **No method/status guards.** The handler runs for every request method; `res.ok` is true for a `206`
   and `cache.put` rejects on partial responses, so any Range-based loader silently caches nothing.
   No download progress, no resumable/partial download, no integrity check.
6. `skipWaiting()` + `clients.claim()` with app assets served **network-first** means the precached app
   shell is only ever used when the network is down — acceptable, but there is no update prompt either.

There is no "shard" logic anywhere: no manifest of parts, no parallel part download, no per-part
verification. "Model shards" in the README means "whatever URLs the libraries happen to request".

### 3.3 PWA

`manifest.json` has `name`, `short_name`, `start_url`, `display`, two colours, two icons. Missing: `id`,
`scope`, `purpose: "maskable"` icons, screenshots, `description`. Icons are sub-3 KB placeholders located
outside the web root (3.2 #1). No install prompt handling (`beforeinstallprompt` does not appear in the
repo), no update flow, no iOS splash handling. CSS is a single fixed layout: `.messages{height:60vh}`
(`styles.css:12`), a 64 px "who" gutter (`styles.css:14`), no media queries, no `dvh`/safe-area handling,
single-line `<input type="text">` for the prompt (`index.html:34`).

### 3.4 WebGPU -> WASM fallback — the requested focus

Detection is `if (navigator.gpu) { try { … CreateMLCEngine … return; } catch { warn } }` then fall
through (`app.js:74-111`). Crude but it does cover the important case where `navigator.gpu` exists yet
no adapter is available, because `CreateMLCEngine` throws. It also falls back on *any* failure — a
network error or an out-of-memory during weight load silently lands the user on a toy model with no
message in the UI (only `console.warn`, `app.js:109`).

The fallback itself does not run as committed:

```js
// app.js:5 and :121
const WLLAMA_URL = "https://unpkg.com/@wllama/wllama@2.3.5/esm/wasm-from-cdn.js?module";
const { default: WasmFromCDN } = await import(WLLAMA_URL);
```

- `curl -sIL` on that URL today -> **HTTP 404** ("Not found: /@wllama/wllama@2.3.5/esm/wasm-from-cdn.js").
  Without `?module`: also 404.
- The published 2.3.5 tarball contains `esm/wasm-from-cdn.d.ts` but **no `esm/wasm-from-cdn.js`**: both
  `https://unpkg.com/@wllama/wllama@2.3.5/?meta` and jsDelivr's package listing show only the `.d.ts`,
  `src/wasm-from-cdn.ts` and `scripts/generate_wasm_from_cdn.js`.
- That `import()` sits outside any try/catch (`app.js:113-129`), so the rejection is unhandled and the
  badge stays on "WASM (wllama) — initializing…" forever.
- The defensive `typeof WasmFromCDN === "function" ? WasmFromCDN() : WasmFromCDN` (`app.js:122`) and the
  comment "it can be a function … OR a ready assets object" (`app.js:119`) read as guessing at an API
  rather than having run it. Whether this ever worked on the author's machine is UNVERIFIED.
- The two halves of the same library are fetched from two different CDNs (unpkg for the asset map,
  esm.sh for the runtime, `wllama.js:2`).

Even if the import worked, the fallback is a stub, not a chat backend (`web/fallback/wllama.js`, 17 lines):

- Hard-coded model `tinyllamas/stories260K.gguf` (1,185,376 bytes per today's `content-length`) — a
  260 K-parameter story generator, not a chat model. The HF URL now goes through two redirects
  (`ggml-org/models` -> `ggml-org/models-moved` -> CDN).
- `createCompletion(prompt, …)` on the raw user string: no chat template, no history (`messages` is never
  passed, `app.js:172`), no system prompt.
- **No streaming** on this path: awaits the whole completion, then sets `textContent` once
  (`app.js:171-173`). No abort either way.
- Temperature/seed settings are ignored (`app.js:172` hard-codes `temp: 0.7`); model cannot be changed
  (`reloadModel` alerts and returns, `app.js:134`).
- The user message is never pushed to `messages` on this path (only the assistant reply is,
  `app.js:174`), so history is inconsistent if the runtime ever changed.
- Single-thread only (README is upfront about this, `README.md:10,48`); no COOP/COEP handling.

For the operator's product the priority is inverted anyway: wllama/GGUF is the primary engine, not a
degraded fallback. This repo has nothing to say about that case.

---

## 4. Liftable units

**None.** Two independent reasons, either of which is sufficient:

1. **Legal:** no licence, so no file may be copied (section 1).
2. **Technical:** there is no unit here that beats writing it fresh. The largest coherent piece is a
   49-line service worker with the defects listed in 3.2; the fallback is 17 lines around a toy model
   behind a 404.

Ideas present in the repo, and where to get a real implementation instead:

| Idea here | Where in this repo | Take it from instead |
|---|---|---|
| try/catch the GPU engine, fall through to WASM | `app.js:74-111` | Write it (5 lines). Add what this lacks: `requestAdapter()` probe up front, distinguish "no GPU" from "download failed", tell the user which runtime they got and why |
| Cache model files for repeat loads | `sw.js:22-43` | wllama's own `CacheManager`/`ModelManager` (MIT) — already covered in `research/repos/wllama.md`. Do **not** add a second SW cache layer on top |
| App-shell precache + installability | `sw.js:3-16`, `manifest.json` | `vite-plugin-pwa` (Workbox `generateSW`), which produces a hashed precache manifest and an update prompt; exclude `*.gguf` and the wllama cache from Workbox routes |
| Populate the model picker from the library's own list | `app.js:80-89` | Trivial; only relevant if WebLLM is kept as a second engine |
| Runtime badge in the header | `app.js:45-49`, `index.html:27` | Worth having in the product UI (which engine, which model, threads); write fresh |

Transplant difficulty into Vite + React + TS is moot. For the record: the code is un-typed,
DOM-id-driven (`els` map, `app.js:9-23`) and imports by CDN URL, so nothing would carry over except the
control flow.

---

## 5. Scores

| Axis | Score | Justification |
|---|---|---|
| maturity | **1** | 2 commits over 2 days in Sept 2025, one author, no tests/CI/releases/issues, no activity since |
| code_quality | **2** | Small and readable, safe DOM writes; but dead code, broken indentation from pasted edits, unused imports, a headline path that 404s, no types |
| chat_ux | **1** | Plain-text bubbles, single-line input, no markdown, no stop button, no history persistence, no conversations, no copy/regenerate/edit |
| agentic | **1** | One zero-argument `getTime` demo that errors on the default model and sends a malformed tool history |
| mobile_pwa | **1** | Minimal manifest with placeholder icons outside the web root, SW install likely fails under README instructions, not offline-capable, no responsive CSS |

---

## 6. Red flags

- **No licence** — the decisive one.
- **Headline feature does not run:** `app.js:121` imports a file absent from the npm package (HTTP 404 today).
- **Abandoned:** last push 2025-09-06; WebLLM pinned at 0.2.79 (npm `latest` is 0.2.85) and wllama at 2.3.5
  (npm `latest` is 3.6.1; the local upstream clone is already 3.7.0) — a major version behind.
- **Signs of unreviewed generated/pasted code:** duplicated comment lines (`app.js:113-114`), a stray
  instruction left as a comment — `// inside init(), WASM fallback block in app.js` (`app.js:120`) — with
  the following block at the wrong indent (`app.js:121-125`); `/* below is legacy */` above an empty body
  (`app.js:192-195`); `const webllm = await import(WEBLLM_URL)` imported and never used in two places
  (`app.js:148`, `:225`); `stream_options: { include_usage: true }` requested and never read
  (`app.js:154`); `reloadModel` drops the `appConfig` that `init` passes (`app.js:137` vs `:98-101`). The
  first commit message is "Add comprehensive documentation and initial implementation". Provenance as
  AI-generated is an inference, UNVERIFIED.
- **Supply chain:** all executable code comes from `unpkg.com` and `esm.sh` via dynamic `import()` at run
  time, with no SRI possible and no self-hosted copy; the SW then pins whatever it received, cache-first,
  indefinitely.
- **Docs list model IDs that do not exist** in the pinned WebLLM version (section 3).
- **Storage doubling** by the SW on top of library-level caches (3.2 #2).
- **Not flagged (checked, clean):** no `innerHTML` with model or user text — all message rendering uses
  `textContent` (`app.js:36,39,162`); the only `innerHTML` writes are clears (`app.js:82`, `:208`). No
  `eval`/`new Function`. No secrets, no analytics, no telemetry, no network calls other than the two CDNs
  and Hugging Face.

---

## 7. Recommendation

Drop this repo from the candidate list. It is a two-day demo whose two features of interest to us —
shard caching and GPU-to-WASM fallback — are respectively a generic cache-first handler that fights the
libraries' own caches, and a stub that fails on its first import. It cannot legally be copied, and there
is nothing in it that would be worth copying if it could.

Carry forward only two design notes for our own implementation:

1. Do not put a service-worker cache in front of wllama/WebLLM downloads; let the engine's cache own the
   model bytes and keep Workbox for the app shell only.
2. When falling back between engines, surface the reason to the user and keep fallback out of the
   catch-all path — a failed 1 GB download must not silently turn into a different model.
