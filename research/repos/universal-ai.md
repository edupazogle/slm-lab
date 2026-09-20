# universal-simulation-ltd/Universal_AI — dossier

```
WHAT IT IS      Svelte 5 + Vite offline chat PWA: WebLLM (WebGPU, in a worker) with wllama (WASM/CPU) fallback behind one
                LLMEngine interface, transformers.js embeddings, IndexedDB + int8 "knowledge pack" RAG, Capacitor 8 iOS/Android shells.
LICENCE         HEAD = AGPL-3.0-or-later + bespoke app-store permission (LICENSE:1-13). BUT every file worth taking is byte-identical
                at commit 3e7cad9 (2026-09-08 07:43Z), which was published under MIT. Verdict: "conditions" — take from 3e7cad9 under MIT.
BEST TO TAKE    (1) the wllama memory-tuned engine + LLMEngine abstraction (438 LOC), (2) the OOM/crash-loop survival logic in stores.ts,
                (3) the int8 knowledge-pack format + builder (pack.ts 247 + script 347), (4) the PWA/mobile dual build + bundle verifier.
BIGGEST RISK    Licence trap: a shallow clone of HEAD is AGPL. Copying from HEAD into a private/MIT product is a copyleft violation.
                Second: the "REAL Capacitor Android project" is an untouched `npx cap add android` template — zero WebView tuning, zero plugins.
SCORES          maturity 2 · code_quality 4 · chat_ux 2 · agentic 1 · mobile_pwa 3
RECOMMENDATION  Lift the engine, crash-resilience and pack code from the MIT commit; do NOT use it as the app shell or as an Android reference.
```

Clone: `/home/edu/.cache/slm-src/universal-simulation-ltd_Universal_AI` (shallow, HEAD `ce4a0ff`, 2026-09-14).
All `file:line` references below are relative to that root. Date of analysis: 2026-09-21.

---

## 1. Licence — read from the file, not the badge

### 1.1 What HEAD says

`LICENSE:1-13`:

```
Universal AI is free software.
It is licensed under the GNU Affero General Public License, version 3 or (at
your option) any later version, WITH the additional permission for application
store distribution reproduced immediately below.
...
Copyright (c) 2026 James Markey
SPDX-License-Identifier: AGPL-3.0-or-later
```

- `LICENSE:17-64` — an "ADDITIONAL PERMISSION FOR APPLICATION STORE DISTRIBUTION" under AGPL section 7. It waives the
  store-rules conflict with sections 4, 5, 6, 10 only; it explicitly keeps section 13 (network source offer) and
  section 6 (corresponding source) — `LICENSE:50-60`.
- `LICENSE:89-91` — the author's own note: "This is a bespoke construction rather than a licence off the shelf." and
  "Worth a solicitor's ten minutes before an actual store submission".
- `LICENSE:93+` — verbatim AGPL v3 text.
- `package.json:5` — `"license": "AGPL-3.0-or-later"`. `CONTRIBUTING.md` requires contributors to grant the same permission.
- GitHub API reports `NOASSERTION` because the preamble before the AGPL text defeats the licence detector — it is not
  "no licence".
- No NOTICE, no CREDITS.md, no third-party licence file in the repo. `LICENSE:90` refers to a `CREDITS.md` section 7.2
  that **does not exist in this repo** (it belongs to a sibling app; the text was pasted across the suite).

Consequence of AGPL for the operator: any product that includes this code must itself be released under AGPL-3.0
(whole combined work), with full corresponding source offered to every user who gets the app **or uses it over a
network**. That is incompatible with both "keep private" and "release as MIT". From HEAD the answer is **no**.

### 1.2 The relicense history changes the answer

`gh api repos/universal-simulation-ltd/Universal_AI/commits?path=LICENSE`:

| Commit | Date (UTC) | Message |
|---|---|---|
| `c2842e3` | 2026-08-07 08:03 | "Add the MIT licence this repo has been missing" |
| `1dba609` | 2026-08-10 14:32 | "Declare the MIT licence in package.json" |
| `0f665c0` | 2026-09-08 18:05 | "Relicense to AGPL-3.0-or-later, with an app-store exception" |

I fetched `LICENSE` at `3e7cad9` (the direct parent of the relicense commit, 2026-09-08 07:43Z) through the GitHub
contents API: it is the standard MIT text, "Copyright (c) 2026 James Markey", and `package.json` there says
`"license": "MIT"`. The relicense commit message itself confirms it: "MIT let anyone take this app, rebrand it, host
it and share nothing back. The AGPL closes that".

The MIT licence has no revocation clause; a copy obtained under MIT stays MIT. The relicense only binds later versions.

I then compared git blob hashes of the local (AGPL HEAD) files against the tree of `3e7cad9`
(`gh api .../git/trees/3e7cad9?recursive=1` vs `git hash-object`):

```
IDENTICAL src/lib/engine/{index,types,models,wllama,webllm,webllm.worker}.ts
IDENTICAL src/lib/rag/{store,pack,index,embeddings,websearch}.ts
IDENTICAL src/lib/stores.ts
IDENTICAL scripts/build-knowledge-pack.mjs   scripts/verify-mobile-bundle.mjs
IDENTICAL vite.config.ts   capacitor.config.ts
IDENTICAL android/app/build.gradle  android/variables.gradle  android/app/src/main/AndroidManifest.xml
IDENTICAL src/lib/components/ChatView.svelte
DIFFERS   src/lib/components/MessageBubble.svelte   src/lib/settings.ts   src/app.css
```

The compare API (`3e7cad9...ce4a0ff`) lists only 12 changed files in the 6 AGPL-era commits: LICENSE, README,
CONTRIBUTING, index.html, Info.plist, package.json, App.svelte, app.css, CustomiseView, KnowledgeView, MessageBubble,
settings.ts — all cosmetic (theme default, chip styling, a11y labels).

### 1.3 Verdict: **conditions**

1. **Fetch the code from commit `3e7cad99284d00253d4c1199ba03cef5d15bc7bb`, not from HEAD.** e.g.
   `git fetch --depth 1 origin 3e7cad9 && git checkout FETCH_HEAD`. Record that SHA in the vendored file headers. The
   current shallow clone is HEAD-only and therefore AGPL-only as it stands.
2. Keep the MIT notice: "Copyright (c) 2026 James Markey" + the MIT permission text, in a `THIRD_PARTY_NOTICES` /
   per-file header. That is the entire MIT obligation. The result can be private or MIT.
3. Do **not** take the three files that differ (`MessageBubble.svelte`, `settings.ts`, `app.css`) from HEAD; take the
   `3e7cad9` versions if wanted. Nothing in the AGPL-era diffs is worth having.
4. Code before `c2842e3` (2026-06-27 → 2026-08-07) had no licence at all; irrelevant because the MIT grant at
   `c2842e3`..`3e7cad9` covers the whole tree as it stood then.
5. Data is separate from code: `public/knowledge/simplewiki.v1.bin` is derived from Simple English Wikipedia
   (CC BY-SA — share-alike + attribution; UNVERIFIED that the app shows any attribution beyond the pack name). Do not
   ship that pack in a closed product without handling CC BY-SA. The persona/wine `.jsonl` corpora are claimed
   "written from scratch" (`docs/claude-handover.md:435-440`) — almost certainly LLM-authored; provenance UNVERIFIED.
6. Not legal advice; the reasoning (MIT irrevocable for already-published versions) is the standard reading. The
   author clearly *intends* to stop "take, rebrand, share nothing back", so expect no goodwill — just keep the notice
   and the SHA as evidence.

---

## 2. What it actually is (source, not README)

Size: 154 tracked files, ~5,900 LOC of authored code (`wc -l`): `src/` 4,300 (of which Svelte components 2,051,
`stores.ts` 709), scripts 500, `vite.config.ts` 163. No monorepo, no backend.

```
index.html ─ main.ts ─ App.svelte (tabs: Chat / Saved / Knowledge / Customise + WelcomeGate)
                          │
             src/lib/stores.ts  (709 LOC: all state + orchestration, Svelte writable stores)
              ├── engine/   LLMEngine iface → webllm.ts (worker)  |  wllama.ts (CPU)      [dynamic import]
              ├── rag/      embeddings.ts (transformers.js MiniLM) · store.ts (IndexedDB) · pack.ts (int8 in-memory)
              │             index.ts (chunk/ingest/retrieve/buildContext) · websearch.ts (Wikipedia REST, opt-in)
              ├── settings.ts (localStorage prefs, theme) · personas.ts (8 prompt personas)
              └── universalId.ts (Supabase email-OTP login → settings backup; the ONLY server dependency)
vite.config.ts   web mode = VitePWA; `--mode mobile` = no service worker (Capacitor)
android/ ios/    Capacitor 8.5 shells, no plugins, no native code
```

### README claims vs code

| Claim | Verified? | Evidence |
|---|---|---|
| WebLLM in a Web Worker | yes | `src/lib/engine/webllm.worker.ts:1-8`, `webllm.ts:39-41` (`new Worker(new URL('./webllm.worker.ts', import.meta.url))`) |
| wllama automatic fallback | yes | `src/lib/engine/index.ts:23-38` — `navigator.gpu.requestAdapter()` probe, then dynamic `import('./wllama')` |
| Device downloads only one backend | yes | dynamic imports + `vite.config.ts:113` `globIgnores: ['**/webllm*.js','**/wllama*.js']` |
| IndexedDB vector store | yes, minimal | `src/lib/rag/store.ts` — 122 LOC, 2 object stores, `getAll` per KB + brute-force cosine in JS |
| 25k-article int8 Wikipedia pack | format yes; binary UNVERIFIED | `public/knowledge/simplewiki.v1.bin` in the clone is a 133-byte Git-LFS pointer (`size 17767529`); loader `pack.ts:133-164` |
| "Nothing leaves the device" | **partly false** | `universalId.ts:23-25` ships a Supabase URL + anon JWT and calls `supabase.auth.getSession()` at module load (`:54`); web search hits `en.wikipedia.org` when opted in; weights come from HF CDN |
| Streaming + stop | yes | `wllama.ts:77-111` (AbortController), `webllm.ts:59-86` (`interruptGenerate`) |
| Real Capacitor Android/iOS projects | exist, but template-only | see section 3 |
| "Known follow-ups: real PNG icons" | stale | icons were generated 2026-08-29/30 (commits `f3a6964`, `06b8762`) |
| README dev path `/Users/jamesmarkey/Github/...` | — | `README.md:57,77` — a personal absolute path left in; signals a single-owner repo |

### Engineering process

- **Tests: none.** No `*.test.*`, `*.spec.*`, vitest or playwright config anywhere. Android/iOS test dirs hold only
  Capacitor's `ExampleUnitTest.java`.
- **CI: none.** No `.github/`. The only check is `npm run check` (svelte-check) run by hand; handover claims
  "447 files, 0 errors" (`docs/claude-handover.md:45`) — UNVERIFIED (no `node_modules`, not run here per ground rules).
- **Types:** `strict: true`, `checkJs: true` (`tsconfig.json`). A few deliberate `as any` (`rag/embeddings.ts:17`, `engine/index.ts:10`).
- **History:** 79 commits by 2 identities (`JamesmarkeyUK` 75, `claude` 4), created 2026-06-27, last push 2026-09-14.
  0 stars, 0 forks, 0 issues. Commit bodies and `docs/claude-handover.md` (700 lines) show it is written almost
  entirely through Claude Code sessions for one owner. The last 20 commits are suite-branding chores (SDK bumps, icons,
  chips); the engine has not been touched since 2026-07-05, RAG since 2026-07-06.
- The handover log is unusually honest about what was *not* verified: "Whether the LLM engine runs inside WKWebView is
  UNCONFIRMED" (`:579`), "owner-to-verify on iPhone" (`:309`, `:375`, `:470`, `:507`). Later entries never record those
  verifications as done. Treat on-device behaviour as **author-untested on real phones beyond "it loads / it crashes"**.

---

## 3. The Capacitor Android project — precisely

This was the advertised reason to look at the repo. It is thin.

### 3.1 Configuration as committed

`capacitor.config.ts` (entire file, 9 lines):

```ts
const config: CapacitorConfig = {
  appId: 'com.universal-ai.app',
  appName: 'Universal AI',
  webDir: 'dist'
};
```

- No `server` block (no `androidScheme`, no `hostname`, no `allowNavigation`), no `android` block
  (no `webContentsDebuggingEnabled`, `allowMixedContent`, `backgroundColor`…), no `plugins` block. With Capacitor 8
  defaults the Android WebView serves `dist/` from `https://localhost` (Capacitor default; not set in this repo).
- **ID mismatch:** `capacitor.config.ts:4` and iOS (`project.pbxproj:309`) use `com.universal-ai.app`; Android uses
  `uk.co.unisim.ai` (`android/app/build.gradle:4,7`, `strings.xml`). A hyphen is not legal in an Android application
  id, so the Android id was hand-changed and the config never updated. The handover doc claims a third value,
  `ltd.universalsimulation.ai` (`docs/claude-handover.md:531,556`). Harmless at build time, but shows nobody reconciled it.
- `android/variables.gradle`: `minSdkVersion 24`, `compileSdkVersion 36`, `targetSdkVersion 36`,
  `androidxWebkitVersion 1.14.0`, `coreSplashScreenVersion 1.2.0`. AGP `8.13.0` (`android/build.gradle:10`), Gradle
  wrapper `8.14.3`, Java 21 (`app/capacitor.build.gradle:6-7`). Commit `df003ba` notes JDK 25 fails, JDK 21 required.
- `android/app/build.gradle`: `versionCode 1`, `versionName "1.0"`, `minifyEnabled false`, no signing config, no ABI
  splits, no `largeHeap`. Stock template including the dead `google-services.json` try/catch.
- `AndroidManifest.xml`: one permission (`INTERNET`, line 39), `allowBackup="true"`, `launchMode="singleTask"`,
  FileProvider with `external-path path="."` (template default). **No `android:largeHeap`, no
  `android:hardwareAccelerated` override, no deep-link intent filter** (iOS got a `unisim-ai` URL scheme; Android did not).
- `MainActivity.java` — 5 lines: `public class MainActivity extends BridgeActivity {}`. **No WebView settings are
  touched anywhere**: no `WebSettings`, no `WebViewCompat`, no renderer-priority policy, no
  `onRenderProcessGone` handling, no plugin registration.
- `capacitor.settings.gradle` includes only `:capacitor-android`. `app/capacitor.build.gradle` has an empty
  `dependencies {}`. `grep -rn "@capacitor" src` finds **zero imports** — the web code never calls a Capacitor API
  (no Filesystem, Preferences, Network, App, StatusBar, Keyboard).
- The only authored Android content: generated launcher icons + a layer-list splash
  (`res/drawable/splash.xml`, `res/values-v31/styles.xml`) from a private generator
  (`backoffice/universal-platform/scripts/app-marks/…`, not in this repo).
- Commit `df003ba` (2026-08-30): "Generated with `npx cap add android` … Builds and installs; verified against a real
  device on Android 16 (API 36)." It claims build+install, **not** model load or inference. No Android entry exists in
  `docs/claude-handover.md` (grep "android" → 0 hits in README, docs/README, handover).

### 3.2 WASM / threads / WebGPU inside the WebView

- **Threads: off by design, everywhere.** `vite.config.ts:46-48`: "we deliberately do NOT enable cross-origin
  isolation (COOP/COEP)". `wllama.ts:13-19` passes both wasm URLs but comments that wllama "falls back to
  single-thread". So on web, PWA and native the CPU path is **single-threaded llama.cpp**. `models.ts:40`: "3B on
  single-thread WASM is too slow/heavy to recommend".
  External context: Android WebView does not support cross-origin isolation at all, so `SharedArrayBuffer` /
  multi-thread wllama is unavailable inside a Capacitor Android app regardless of headers (Chromium issue 40914606;
  Capacitor issue #6182 closed unresolved). This repo contains no workaround — and none exists in a stock WebView.
- **WebGPU on iOS WKWebView: absent**, measured by the author: "WebGPU confirmed absent in WKWebView — the app detects
  this and shows 'CPU mode'" (`docs/claude-handover.md:537-541`, iOS 26.3 simulator).
- **WebGPU in Android System WebView: UNVERIFIED.** Chrome-for-Android has WebGPU since v121 on Android 12+
  Adreno/Mali (developer.chrome.com/blog/new-in-webgpu-121); caniwebview.com lists WebView WebGPU as unknown/unsupported.
  The repo records no Android measurement. The code copes either way through `navigator.gpu.requestAdapter()`
  (`engine/index.ts:7-15`), so in the APK the realistic path is **single-thread wllama with a 0.5B–1B Q4 model**.
- **Service worker:** stripped from native builds (`vite.config.ts:70,85` `isNative ? [] : [VitePWA(...)]`), enforced
  by `scripts/verify-mobile-bundle.mjs:60-62`. Motivated by iOS (`capacitor://` has no SW); on Android it means the
  `wasm-runtime` / `engine-js` / `knowledge-packs` runtime caches do not exist, but those assets are inside the APK anyway.

### 3.3 Model storage on device

No native storage. Everything lives in the WebView's origin storage:

| Data | Where | Evidence |
|---|---|---|
| GGUF weights (wllama) | wllama `CacheManager`, OPFS by default | `wllama.ts:53` `loadModelFromHF`, `:119-130`; wllama `src/cache-manager.ts:80` "Defaults to OPFS" |
| MLC weights (WebLLM) | WebLLM's own Cache Storage/IndexedDB | `webllm.ts:93-112` `hasModelInCache` / `deleteModelAllInfoInCache` |
| Embedding model | transformers.js browser cache | `embeddings.ts:5` `env.allowLocalModels = false` |
| User KB chunks + Float32 vectors | IndexedDB `universal-ai` | `rag/store.ts:25-48` |
| Knowledge packs | re-fetched into RAM every launch (`pack.ts:167-202`); SW-cached on web only | `stores.ts:312` `loadPacksIntoMemory` |
| Chat, saved answers, settings, flags | `localStorage` | `stores.ts:91,152,387,669` |

Consequences: weights are downloaded from Hugging Face on first run (nothing bundled in the APK), are evictable by
the OS, are wiped by "Clear storage", count against WebView quota, and cannot be shared with another app or sideloaded
from a file. `navigator.storage.persist()` is never called (grep: 0 hits). There is no resumable/chunked download logic
beyond what wllama provides. For an Android product that wants reliable multi-GB model storage this design is the
thing to *replace* (Capacitor Filesystem / native llama.cpp), not copy.

**Bottom line on the focus question:** as an Android reference it proves only that `npx cap add android` + a
`--mode mobile` build without a service worker produces an installable APK. There is no WebView configuration to
learn from, because there is none.

---

## 4. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | 2 | 12 weeks old, one owner, 0 stars/forks/issues, no tests, no CI, on-device inference repeatedly "owner-to-verify"; engine untouched since July. |
| code_quality | 4 | Small, strict-TS, well-factored modules with comments that state measured reasons (`wllama.ts:54-67`); dragged down by a 709-line god-store and zero tests. |
| chat_ux | 2 | Plain-text bubbles only — **no Markdown, no code blocks, no syntax highlight** (`MessageBubble.svelte:209-214` renders `{s.v}`); single conversation in `localStorage`; no edit/regenerate/branch; nice touches: citations chips, confidence dot, long-press menu, pin-question-to-top scroll. |
| agentic | 1 | No tool calling, no function schema, no agent loop; "web search" is a fixed pre-retrieval step against Wikipedia REST (`websearch.ts:33-49`). |
| mobile_pwa | 3 | Good PWA config (split precache/runtime cache, safe-area CSS, 16px input floor, no zoom lock) and a working dual build; native shells are unconfigured templates, no threads, no native storage, Android never exercised with a model. |

---

## 5. Liftable units (take from commit `3e7cad9`, MIT)

### U1 — wllama engine with measured memory tuning + `LLMEngine` abstraction  ★ best thing here
- Paths: `src/lib/engine/types.ts` (65), `index.ts` (38), `models.ts` (53), `wllama.ts` (161), `webllm.ts` (113),
  `webllm.worker.ts` (8) — **438 LOC**.
- Deps: `@wllama/wllama@2.4.0`, `@mlc-ai/web-llm@0.2.84` (lockfile), Vite `?url` wasm imports. No Svelte imports at all.
- Transplant: **easy** — pure TypeScript, framework-free; drop into a React app unchanged. Only Vite-specific bits are
  `?url` imports and `new Worker(new URL(...), {type:'module'})`, both of which a Vite+React app supports.
- Why it beats fresh: the load parameters encode on-device failures that cost the author real crash cycles —
  ```ts
  n_ctx: 2048,          // wllama.ts:59  — KV cache is what gets WKWebView to jettison the page
  n_batch: 256,         // wllama.ts:64  — default 2048 costs "hundreds of MB at load time"
  cache_type_k: 'q8_0', // wllama.ts:67  — V must stay f16: quantized V needs flash-attn
  ```
  plus UTF-8-safe streaming by diffing `currentText` instead of concatenating pieces (`wllama.ts:87-98`), abort that
  returns already-streamed text (`:102`), cache probing/deletion through a throwaway `Wllama` instance
  (`:119-160`), and a uniform `isDownloaded/deleteModel` across both backends. Caveat: the memory claims are the
  author's observations on one iPhone, not benchmarks — no numbers are recorded.
- Must change when lifting: it hard-codes single-thread. For the *web/PWA* target the operator should enable COOP/COEP
  (`credentialless`) and let wllama use multi-thread; keep single-thread only for the Capacitor build.

### U2 — page-death / OOM survival logic
- Paths: `src/lib/stores.ts:84-131` (throttled chat persistence + "streaming message at boot = we crashed" notice),
  `:380-452` (load sentinel + re-entrancy guard in `loadModel`), `:592-601` (`MAX_HISTORY = 8`);
  `src/App.svelte:60-100` (startup order: probe cache → refuse auto-load after interrupted load → warm embedder
  *before* the LLM); `src/lib/rag/embeddings.ts:12-44` (do not cache a rejected pipeline promise; `warmEmbeddings`).
  ~**200 LOC** of logic spread over three files.
- Deps: Svelte `writable/get` only — trivially replaced by zustand/React state.
- Transplant: **moderate** — not a file copy; it is interleaved with the god-store. Port the four mechanisms by hand,
  citing the source. Each is 10–40 lines.
- Why: these are non-obvious failure modes of in-WebView inference on phones (crash loop on auto-load, ORT heap
  allocation failing *after* the LLM has grown, async `onMount` leaking the cleanup) with the diagnosis written down
  in `docs/claude-handover.md:269-311`. A fresh implementation would rediscover them on a device.

### U3 — int8 knowledge-pack format, loader, search and builder
- Paths: `src/lib/rag/pack.ts` (247), `scripts/build-knowledge-pack.mjs` (347), `scripts/build-persona-packs.sh` (50).
  Supporting: `src/lib/rag/index.ts` (160: chunker, ingest, merged `retrieve`, `buildContext` citation prompt),
  `embeddings.ts` (69), `websearch.ts` (73). **~950 LOC.**
- Deps: `@huggingface/transformers@3.8.1` (large: ORT-web wasm); builder needs `hyparquet`, `hyparquet-compressors`.
- Transplant: **easy** — framework-free TS + a Node script. Strip the persona registry (`pack.ts:62-94`).
- Why: a compact, documented binary layout (`pack.ts:9-18`, magic `UWK1`, header + `int8[N*dim]` + length table +
  UTF-8 block), zero-copy `Int8Array` view over the fetched buffer (`:147`), streaming download with progress
  (`:174-196`), allocation-free top-k scan (`:218-247`), and a builder with four sources incl. local parquet. 25k × 384
  int8 = 9.6 MB of vectors searched by brute force — adequate at this size. Author reports "int8 ranking matches
  float32" on two queries (`handover:681-682`) — anecdotal, not an eval.
- Weakness: search runs on the **main thread** and the whole pack is re-fetched and decoded on every launch.

### U4 — PWA + native dual build and the bundle guard
- Paths: `vite.config.ts` (163; PWA block `:85-155`, mode switch `:49-70`, build-SHA plugin `:10-44,76-83`),
  `scripts/verify-mobile-bundle.mjs` (77), `package.json` scripts `build:mobile` / `cap:sync` / `check:mobile-bundle`.
- Deps: `vite-plugin-pwa@^0.21.1`, Capacitor CLI.
- Transplant: **easy** — swap `svelte()` for `react()`; everything else is framework-neutral.
- Why: a correct Workbox split for an in-browser-LLM app — precache only the shell (`maximumFileSizeToCacheInBytes`
  2 MB, `globIgnores` for engine chunks), `CacheFirst` runtime caches for same-origin `.wasm`, engine JS and packs — and
  a verifier that fails the native build if `sw.js`/`registerSW.js`/`workbox-*.js` leak into the copied bundle or an
  asset URL does not resolve. Cheap insurance against the "BUILD SUCCEEDED, blank screen on phone" class of bug.

### U5 — small UX pieces (optional)
- `src/lib/components/MessageBubble.svelte:68-86` (`parse()` — turn `[n]` into chips, drop out-of-range/hallucinated
  refs), `:20-47` (long-press with movement cancel), `ChatView.svelte:17-64` (pin the question to the top instead of
  chasing the stream; jump-to-latest), `src/app.css` safe-area + `max(16px,1em)` input floor on `pointer: coarse`.
- Transplant: **moderate** (Svelte 5 runes → React hooks; rewrite, ~150 LOC of ideas). Take the `3e7cad9` versions.

### Do NOT lift
- `android/`, `ios/` — regenerate with `npx cap add`; the committed projects add only another company's icons and ids.
- `src/lib/universalId.ts`, `UniversalIdBackup.svelte` — bound to the author's Supabase project.
- `rag/store.ts` — 122 LOC of plain IndexedDB with whole-KB `getAll` and JS cosine; fine, but not best-in-class
  (no worker, no ANN, Float32 per chunk). Other candidates in this survey should be compared before choosing it.
- Personas, persona packs, Simple Wikipedia pack (data-licence and provenance questions, section 1.3 item 5).

---

## 6. Red flags

1. **Licence trap (highest).** HEAD is AGPL-3.0-or-later with a home-made section-7 permission the author himself says
   needs a solicitor (`LICENSE:89-91`). MIT → AGPL flip happened 13 days ago with the stated goal of stopping exactly
   what the operator intends. Only the pinned MIT commit is safe; never `git pull` and re-copy.
2. **Hard-coded third-party backend credentials.** `src/lib/universalId.ts:23-25` embeds the author's Supabase project
   URL and anon JWT (`role: anon`, exp 2036). It is a publishable key, not a secret leak, but lifting that file would
   point the operator's users at someone else's auth server. The module also calls `supabase.auth.getSession()` at
   import time — contradicting "no network until the user signs in" only in the narrow sense that the client
   initialises eagerly (whether that emits a request without a stored session is UNVERIFIED).
3. **No tests, no CI, no releases, no users.** 0 stars / 0 forks / 0 issues; verification is "browser preview" by an
   AI session plus an owner's phone. Android inference never recorded as tested.
4. **Single-thread WASM by policy** (`vite.config.ts:46-48`). Sensible inside WebViews, but it also cripples the
   desktop/PWA CPU path, where cross-origin isolation is available and wllama multi-thread is several times faster.
5. **Main-thread work:** embeddings (`embeddings.ts`), IndexedDB cosine scan and the 25k-vector pack scan all run on
   the UI thread; README lists the worker move as a follow-up (`README.md:133`). wllama itself runs in its own worker.
6. **Chat state in `localStorage`** as one JSON blob rewritten every 400 ms while streaming (`stores.ts:118-131`) —
   fine for one short chat, wrong for multi-conversation history (5 MB quota, synchronous writes).
7. **Default `clearOnClose` wipes the chat on `pagehide`** (`App.svelte:103-109`, on unless `clearOnClose === false`)
   — closing or reloading the tab/app discards the conversation by default. A deliberate privacy decision, but the
   opposite of a "premium chat" expectation of durable history. (Whether Android WebView fires `pagehide` when the
   app is merely backgrounded is UNVERIFIED.)
8. **Suite coupling / private generators.** Icons, splash, chips CSS and several comments reference a private
   monorepo (`backoffice/universal-platform`, `@unisim/sdk`, sibling apps). `index.html:43` canonical points to
   `opensource.unisim.co.uk/ai/` while `docs/README.md` says it is not served there.
9. **Heavy dependency set for the feature level:** `@mlc-ai/web-llm` (~6 MB chunk per `vite.config.ts:109`),
   `@huggingface/transformers` (ORT-web wasm), `@supabase/supabase-js`, `@wllama/wllama`. Mitigated by dynamic imports.
10. **Security:** no `{@html}`, `innerHTML`, `eval` or `new Function` anywhere in `src/` (grep: 0 hits) — model output
    is rendered as text, so there is no XSS surface; outbound links use `noopener,noreferrer` behind a confirm. No CSP
    meta tag. No analytics/telemetry found (grep for gtag/sentry/posthog/plausible/beacon: 0 hits).
11. **LFS:** knowledge-pack binaries are Git-LFS objects; a normal clone yields 131–133-byte pointers and the app 404s
    on pack download (`README.md:45-50`).
12. **Provenance:** AI-generated code and corpora (commit trailers "Co-Authored-By: Claude", a `claude` contributor,
    a 700-line Claude handover log). Not a legal problem under MIT, but nothing here has had a second human reviewer.

---

## 7. Recommendation

Use this repo as a **parts bin, not a base**. From commit `3e7cad9` (MIT), vendor U1 (engine) and U4 (PWA/mobile
build + verifier) essentially verbatim, port the U2 crash-resilience mechanisms by hand, and consider U3 if bundled
offline knowledge packs are in scope. Re-enable cross-origin isolation for the web/PWA target. Look elsewhere for the
chat UI (Markdown, code blocks, conversations), for agent/tool-calling, and for any real Android WebView or native
model-storage engineering — this repo has none of the three.

Sources used beyond the clone: GitHub API (`repos/universal-simulation-ltd/Universal_AI` — commits, contributors,
compare `3e7cad9...ce4a0ff`, trees, contents at `3e7cad9`); https://developer.chrome.com/blog/new-in-webgpu-121 ;
https://issues.chromium.org/issues/40914606 (via search summary) ; https://github.com/ionic-team/capacitor/issues/6182 ;
https://caniwebview.com/features/web-feature-webgpu/ ; wllama `src/cache-manager.ts` (master).
