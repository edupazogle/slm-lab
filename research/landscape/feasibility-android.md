# Feasibility — Android for SLM Lab

**Date:** 2026-09-21 · **Scope:** brief 3 of 3 (web/wllama and AnythingLLM are separate briefs).
**Decisions this serves:** D3 (Android on two tracks), D6 (loopback / secure-context rules), D5 (no unmeasured numbers).

**What was done:** read-only inspection of `slm/app/android-shell/`, `slm/app/web/`, the vendored
`@capacitor/android@8.5.2` Java source, `@wllama/wllama@3.6.1` source, the `anythingllm-mobile` clone;
`gh api` / npm registry queries; web sources fetched today. **Nothing was built, installed, synced or
started** — no `gradlew assembleDebug`, no `npx cap sync`, no `adb`. `./gradlew --version`,
`sdkmanager --list_installed`, `java -version`, `free`, `df` were run (read-only).

Everything below is either (a) a file:line in a repo on this machine, (b) a URL, or (c) marked
**UNVERIFIED**. No performance number is invented: there are **no measurements of wllama on any phone**
in this project yet, and none are stated here.

---

## 0. Verdict

| Track | What it is | Verdict |
|---|---|---|
| **A. Capacitor 8 shell around the PWA** | `android-shell/` as it stands; wllama WASM inside Android System WebView | **Builds and ships today** (all tooling present on this machine). **Single-threaded WASM, no WebGPU** — cross-origin isolation is unavailable in Android WebView, so `SharedArrayBuffer` is absent and both wllama and our own thread heuristic fall back to 1 thread. Good enough for a ≤1 GB model demo and for an honest WASM-vs-native comparison; not the fast path. |
| **A′. TWA (Trusted Web Activity)** *(not in D3, worth one line in the PRD)* | Same PWA, but rendered by the user's **Chrome**, not a WebView | The only Android packaging that can get **multi-thread WASM and WebGPU**, because Chrome honours COOP/COEP. Costs: a public HTTPS origin + Digital Asset Links, a real web manifest + service worker (the current build has neither), and no offline-in-the-APK. |
| **B. Native llama.cpp through a Capacitor plugin** | `@cantoo/capacitor-llama` (MIT, v0.1.6) — a Capacitor port of llama.rn | **Exists and is real**, but 5 stars / 1 org / no releases page — a spike, not a dependency to bet the product on. `llama.rn` itself (MIT, 1,041★, pushed 2026-09-20) is the maintained one, and it is React-Native-only. Cactus is **not MIT** (revenue/funding-capped source-available licence). |
| **C. Fork `anythingllm-mobile`** | Bare RN 0.81 + llama.rn, MIT | Buildable on this machine **except the NDK and CMake are not installed**; needs Firebase + Mintplex endpoints ripped out before any build is shipped. Second codebase, nothing shared with the PWA. |

**The one fact that decides A:** in Android System WebView `crossOriginIsolated` is `false` and
`SharedArrayBuffer` is undefined **even when COOP/COEP are served correctly**
(Chromium issue [40914606](https://issues.chromium.org/issues/40914606), filed 2023-05-26 against Chrome
113 stable, still referenced as unresolved in 2026 — see §A.3). Our own code then picks one thread:
`web/src/lib/thales/localWllama.ts:91` — `if (!crossOriginIsolated) return 1`.

---

## A. Capacitor wrapping the Vite PWA (wllama inside Android System WebView)

### A.1 What the shell is today (inspected, not assumed)

| Thing | Value | Source |
|---|---|---|
| Capacitor | `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` all **8.5.2** | `android-shell/node_modules/@capacitor/*/package.json` |
| App id / name / webDir | `com.bizloop.slmlab` / "SLM Lab" / `www` | `android-shell/capacitor.config.json` (4 lines, no `server`, no `android`, no `plugins` block) |
| Sync + build scripts | `"sync": rm -rf www && cp -r ../web/dist www && npx cap sync android`, `"apk": cd android && ./gradlew assembleDebug` | `android-shell/package.json:7-8` |
| AGP / Gradle | AGP **8.13.0**, Gradle wrapper **8.14.3-all** | `android/build.gradle:10`; `android/gradle/wrapper/gradle-wrapper.properties:3` |
| SDK levels | minSdk **24**, compileSdk **36**, targetSdk **36** | `android/variables.gradle:2-4` |
| Java level | source/target **21** | `android/app/capacitor.build.gradle:4-7` |
| Daemon heap | `org.gradle.jvmargs=-Xmx1536m` | `android/gradle.properties:12` |
| SDK path | `sdk.dir=/home/edu/Android/sdk` | `android/local.properties:1` |
| Activity | `public class MainActivity extends BridgeActivity {}` — **no WebView tuning of any kind** | `android/app/src/main/java/com/bizloop/slmlab/MainActivity.java` |
| Permissions | `INTERNET` only | `android/app/src/main/AndroidManifest.xml:40` |
| Web payload already synced | `android/app/src/main/assets/public/` = 25 MB, same as `web/dist` (two `wllama-*.wasm` files, i.e. default **and** compat build are bundled — no CDN needed offline) | `ls`/`du`; CDN fallback would be `@wllama/wllama/src/wasm-from-cdn.ts:5,9-10` |
| Google Services | classpath `com.google.gms:google-services:4.4.4` declared, plugin applied **only if `google-services.json` exists** (it does not) | `android/build.gradle:11`; `android/app/build.gradle:47-54` |
| Stale generated tests | `app/src/test|androidTest` still use package `com.getcapacitor.myapp` and assert `com.getcapacitor.app` | `ExampleInstrumentedTest.java`. Harmless for `assembleDebug` (tests are not compiled); would break `./gradlew build`/`test`. |

The origin inside the WebView is **`https://localhost`**: `CapConfig.java:38-39` (`hostname = "localhost"`,
`androidScheme = CAPACITOR_HTTPS_SCHEME`) with `Bridge.java:94` (`CAPACITOR_HTTPS_SCHEME = "https"`), and
assets are served from the APK by an in-process interceptor, not a socket
(`Bridge.java:275-276` `localServer.hostAssets(DEFAULT_WEB_ASSET_DIR)`). Consequences:

- **Secure context: yes.** `https://localhost` satisfies the secure-context rule, so service workers,
  OPFS, `crypto.subtle` and (where present) WebGPU are all *permitted* by origin. This is exactly the
  problem D6 describes for a phone hitting `http://<lan-ip>:8097` — the Capacitor shell sidesteps it.
- Nothing listens on a TCP port: `shouldInterceptRequest` answers from APK assets
  (`BridgeWebViewClient.java:22-24` → `WebViewLocalServer.shouldInterceptRequest`). No LAN exposure.

### A.2 Can COOP/COEP headers be set in a Capacitor 8 Android WebView?

**Config: no.** The Capacitor config schema has no header option — `@capacitor/cli/dist/declarations.d.ts`
has `androidScheme`, `hostname`, `url`, `cleartext`, `minWebViewVersion`, `resolveServiceWorkerRequests`
and friends; `grep -in 'header|crossOrigin' declarations.d.ts` returns only an unrelated Swift comment.
The asset handler builds its responses with a header map that only ever gets `Cache-Control: no-cache`
(`WebViewLocalServer.java:99-106`), and every local response reuses that map
(`:374, :409, :420, :455, :486`); the handler is constructed with the no-arg constructor
(`WebViewLocalServer.java:663` + `:90-92`), so nothing else is injectable without patching Capacitor.

**Code: yes, mechanically.** The response object supports arbitrary headers — Capacitor itself already
uses the 6-argument `WebResourceResponse(mime, encoding, status, reason, headers, stream)` form
(`WebViewLocalServer.java:390-396`), and the client is replaceable at runtime:
`Bridge.setWebViewClient(BridgeWebViewClient)` (`Bridge.java:1468-1471`). So a ~25-line
`MainActivity` that subclasses `BridgeWebViewClient`, calls `super.shouldInterceptRequest(...)` and adds
`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` to the returned
response is straightforward. Two caveats: (1) the first navigation is already issued inside
`Bridge.loadWebView()` before `MainActivity.onCreate` returns (`Bridge.java:261-324`), so the client must
be installed and the WebView reloaded, or the very document that needs the headers will not have them;
(2) service-worker fetches do **not** go through your client — they go through
`ServiceWorkerClient` → `getLocalServer().shouldInterceptRequest` directly (`Bridge.java:283-293`,
default on: `CapConfig.java:56`, `declarations.d.ts:263-269`).

**And it does not matter**, because of §A.3: the headers are not what is missing.

### A.3 SharedArrayBuffer / threads — the blocker

- Chromium issue **40914606**, "SharedArrayBuffer is unavailable in Android WebView because
  crossOriginIsolated is false", reported against Chrome 113 stable on Android. Reporter's repro, quoted
  verbatim from the tracker JSON (`https://issues.chromium.org/action/issues/40914606`):
  > 1. Set proper HTTP Headers: Cross-Origin-Embedder-Policy: require-corp / Cross-Origin-Opener-Policy: same-origin
  > … 3. Make sure there is not SharedArrayBuffer in Android WebView `console.log(crossOriginIsolated); // false` `console.log(SharedArrayBuffer); // TypeError`
  Created 2023-05-26, last modified 2025-11-28. Its status field decodes to `8` which in the Issue
  Tracker status enum is *Obsolete* (**UNVERIFIED decoding** — the public page needs a login; no
  Chromium comment saying "fixed" was retrievable).
- Structural reason: Android WebView runs **one renderer process per app**
  ([developer.android.com/…/managing-webview](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview)),
  and cross-origin isolation is built on process isolation; the whatwg/html discussion
  [#6060](https://github.com/whatwg/html/issues/6060) records the same point.
- Chrome's rule the WebView cannot satisfy: SAB returned to Android in Chrome 88 "for pages that are
  cross-origin isolated" ([Chrome for Developers](https://developer.chrome.com/blog/enabling-shared-array-buffer)) —
  that article never mentions WebView.
- **The one crack, unconfirmed:** a third-party spike (logos-fleet/logos-workspace
  [issue #291](https://github.com/logos-fleet/logos-workspace/issues/291), 2026-09-18, Xiaomi / Android 15
  / WebView **152.0.7977.64**) reports that `new WebAssembly.Memory({initial:1,maximum:2,shared:true})`
  *succeeds* and `Atomics.wait` in a Worker executes, while the `SharedArrayBuffer` global stays
  undefined and `crossOriginIsolated` stays false; whether a shared `WebAssembly.Memory` survives
  `postMessage` to a worker (which is what emscripten pthreads needs) was still **open** at that date.
  That is one device, one WebView build, an unresolved issue: treat as **UNVERIFIED**, worth a 1-hour
  spike, never as a plan.

**What this does to our code, concretely:**

- `@wllama/wllama@3.6.1` feature-detects threads by constructing a `SharedArrayBuffer`
  (`src/utils.ts:219-234`) → false in WebView → `useMultiThread = false` (`src/wllama.ts:483-487`) →
  `pthreadPoolSize` 0 (`src/wllama.ts:497`, `workers-code/llama-cpp.js:99`).
- Our lifted heuristic short-circuits even earlier: `web/src/lib/thales/localWllama.ts:91-92`.
- So **Track A runs single-threaded on a phone whose 8 cores are idle**. The honest PRD line is
  "one thread in the app, N threads in Chrome", with the tok/s measured both ways on the same handset
  before any claim.
- `coi-serviceworker` ([gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker), MIT,
  last push 2023-12-09, npm 0.1.7 from 2023-07) re-serves responses with COOP/COEP from a service worker.
  It solves *"my static host won't set headers"*; it cannot solve *"this browser does not implement
  cross-origin isolation"*. Expected result in a Capacitor WebView: **no change** (and its fetches are
  additionally routed through Capacitor's own interceptor, `Bridge.java:283-293`). Do not ship it in the
  APK; it only earns its place on GitHub Pages (brief 1).

### A.4 The WASM features wllama actually needs, in WebView

wllama hard-requires exception handling + SIMD (`src/utils.ts:291-296`, throws otherwise), and picks the
fast build only when **JSPI** and **Memory64** are both present, else falls back to the Asyncify "compat"
build (`src/utils.ts:405`, `@wllama/wllama-compat/README.md:3-9`: *"Compat mode has significantly lower
performance than the default build"*).

| Feature | chromestatus milestones (desktop / android / **webview**) |
|---|---|
| WebAssembly Exception Handling | 95 / 95 / **95** (id 4756734233018368) |
| WebAssembly SIMD | 91 / 91 / **(field empty)** (id 6533147810332672, "Enabled by default") |
| WebAssembly Memory64 | 133 / 133 / **133** (id 5070065734516736) |
| JS Promise Integration (JSPI) | 137 / 137 / **137** (id 5674874568704000) |

(queried today via `https://chromestatus.com/api/v0/features?q=…`). So a phone whose **Android System
WebView is ≥ 137** gets the fast single-thread build; an older WebView silently drops to compat mode, and
one below 95 fails `checkEnvironmentCompatible` outright. Capacitor's own floor is WebView 60
(`Bridge.java:105`, `capacitorjs.com/docs/android`: *"Capacitor requires an Android WebView with Chrome
version 60 or later"*), which is far below ours — **set `android.minWebViewVersion` in
`capacitor.config.json` to something like 137 and give `server.errorPath` a real page**, or the app will
launch and then fail obscurely inside wllama on an old device. SIMD's blank WebView column is a
chromestatus data gap, not evidence of absence (**UNVERIFIED**; the app detects it at runtime anyway).

### A.5 WebGPU in Android WebView

- Chrome on Android: shipped **121** for Android 12+ on Qualcomm/ARM GPUs, Imagination on Android 16+ in
  **139** ([gpuweb Implementation-Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status):
  `"✅ ARM/Qualcomm/Intel, Android 12+: [121]"`, `"✅ Imagination, Android 16+: [139]"`).
- chromestatus "WebGPU on Android" (id 5119617865613312) reports `desktop 113, android 121, **webview
  null**` — no WebView milestone. The Intent-to-Ship thread answers "Will this feature be supported on
  all six Blink platforms (… and Android WebView)?" with **"No"**
  ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/YFWuDlCKTP4)).
- Treat `navigator.gpu` as **absent in WebView** until a device probe says otherwise (wllama's detector is
  `src/wllama.ts:410-412` → `!!navigator.gpu`; Universal_AI's author measured the same absence on iOS
  WKWebView, `research/repos/universal-ai.md:212-215`). Also note Android 16 Advanced Protection can
  disable WebGPU even in Chrome (third-party report, **UNVERIFIED**).
- Net: **Track A is CPU-only, one thread. Track A′ (TWA) is where WebGPU could exist at all on Android.**

### A.6 Memory and the renderer kill

- The wasm32 ceiling still applies to the model file: wllama's own limit is **2 GB per GGUF file**
  (`@wllama/wllama/README.md:38`, `:158` — `ftell()`/ArrayBuffer), mirrored in our
  `web/src/config.ts:16` (`MAX_GGUF_SIZE = 2e9`) and `:20` (`MAX_CONTEXT = 8192`).
- Multi-thread mode probes `WebAssembly.Memory` down from 4096 MiB in 128 MiB steps
  (`workers-code/llama-cpp.js:120-136`) — irrelevant here, since threads are off.
- **If the renderer is killed, the app dies by default.** `BridgeWebViewClient.onRenderProcessGone`
  returns `false` unless some `WebViewListener` returns `true` (`BridgeWebViewClient.java:91-103`), and
  Android's guide is explicit: *"the app itself crashes after detecting that the renderer crashed. If you
  handle the crash more gracefully … you must destroy the current WebView instance … and return `true`"*;
  `!detail.didCrash()` means *"Renderer is killed because the system ran out of memory"*
  ([managing-webview](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview)).
  Capacitor sets **no** renderer priority policy (`grep setRendererPriorityPolicy` over
  `@capacitor/android` source: no hits), so a backgrounded chat is an ordinary OOM candidate.
  **Action for Track A:** register a `WebViewListener` returning `true` on `onRenderProcessGone`, recreate
  the WebView, and surface "the model was unloaded because the phone ran out of memory" — otherwise the
  first 1 GB model on a 4 GB phone shows up as a silent app crash.
- The only measured on-device sizing in our evidence base is a shipping app's, and it is native not WASM:
  RAM < 4 GB → n_ctx 512, < 6 GB → 1024, else 2048
  (`~/.cache/slm-src/Mintplex-Labs_anythingllm-mobile/src/utils/contextLength.ts:12-36`). Universal_AI's
  WebView-tuned wllama loader uses `n_ctx: 2048`, `n_batch: 256`, `cache_type_k: 'q8_0'` with comments
  naming WKWebView jettison as the reason (`~/.cache/slm-src/universal-simulation-ltd_Universal_AI/src/lib/engine/wllama.ts:52-66`,
  clone at HEAD `ce4a0ff`; **lift only from the MIT commit `3e7cad9`**, per D2 — HEAD is AGPL). Start Track A there; measure, do not guess.

### A.7 Storage: Cache API / OPFS in a WebView vs the native filesystem

- **OPFS works in WebView**: chromestatus "Origin Private File System (OPFS) on Android" (id
  5079634203377664) → android **109**, **webview 109**, "Enabled by default". wllama uses OPFS with
  `createSyncAccessHandle` in a worker (`src/workers-code/opfs-utils.js:5-12`, backend guard
  `src/storage/opfs.ts:6-11`), which is the right primitive here.
- Storage lives in the app sandbox: `/data/data/<package>/app_webview` (quoted from the reporter in
  Google issue [316191252](https://issuetracker.google.com/issues/316191252), "Storage quota management
  for Android WebView"). It is wiped by *Settings → App → Clear data*, is not visible to the user as
  files, and cannot be shared with another app.
- **The app cannot set or raise the quota.** That same issue asks for an API and observes that the
  `WebStorage.QuotaUpdater#updateQuota` surface is deprecated. Chromium's general policy (origin may use
  a large fraction of free disk) is documented for the browser, **not** for WebView: what
  `navigator.storage.estimate()` returns inside our WebView is **UNVERIFIED — measure it on the device**
  (the probe in §A.10 does). Attempting to exceed it throws `QuotaExceededError`
  ([MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).
- **Native alternative**, if the quota or the eviction risk bites: download with
  `@capacitor/file-transfer` (v2.0.5, MIT, peer `@capacitor/core >=8`) or `@capacitor/filesystem`
  (8.1.3, MIT) into app storage, then hand the file to the WebView as
  `Capacitor.convertFileSrc(path)` → `https://localhost/_capacitor_file_/…`, which the local server
  serves (`WebViewLocalServer.java:237-239, 399-411`). Two warnings: (1) wllama would `fetch()` that URL
  and copy it into OPFS again unless we call `loadModel(blobs)` with a `File` handle instead — i.e. it
  needs a small engine change, not just a URL swap; (2) the server's `Range` branch
  (`WebViewLocalServer.java:368-397`) writes `Content-Range` from `responseStream.available()` but, as
  written, never advances the stream to the requested offset — **do not rely on ranged reads of
  `_capacitor_file_` URLs without testing** (UNVERIFIED, read from source).

### A.8 Large downloads, resumption, background kill

- Hugging Face is friendly to both CORS and ranges. Checked today with
  `curl -sIL -H 'Origin: https://localhost' https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf`:
  `access-control-allow-origin: https://localhost` on the 302, `access-control-allow-origin: *` +
  `accept-ranges: bytes` + `content-length: 396705472` on the CDN 200.
- **wllama does not resume.** Its OPFS downloader opens the target and truncates it to zero
  (`src/workers-code/opfs-utils.js:9`), then streams a plain `fetch` (`:105-118`); there is no `Range`
  request and no partial-file bookkeeping. A dropped connection or a killed renderer costs the whole
  download again. It does download shards in parallel (`src/model-manager.ts:9,170-171`,
  `DEFAULT_PARALLEL_DOWNLOADS = 3`) and it aborts cleanly (`AbortController`, `:download-abort`).
- **Backgrounding is fatal to an in-flight download** in a WebView: the page keeps running only while the
  renderer lives, and §A.6 says the renderer is an OOM candidate with no priority policy. `@capacitor/file-transfer`'s
  documented options are `url`, `path`, `progress`, headers/timeouts — **resume and background
  continuation are not documented** ([capacitorjs.com/docs/apis/file-transfer](https://capacitorjs.com/docs/apis/file-transfer)),
  so it moves the bytes out of the WebView but does not by itself survive app death.
- The robust shape is a native worker. There is a ready, MIT reference to copy the design from:
  `anythingllm-mobile`'s `android/app/src/main/java/com/anythingllm/download/` — WorkManager + Room +
  OkHttp, 967 lines, with explicit `resumeDownload` (`DownloadModule.kt:226-257`) and unique-work
  enqueueing (`:110`). Porting that as a Capacitor plugin is the Track-A stretch goal; Android's own
  `DownloadManager` is the cheaper (weaker) option (**UNVERIFIED**: its doc page would not render for the
  fetch tool today).

### A.9 The alternative that changes the physics: TWA

A Trusted Web Activity renders the site **in the user's browser**, not in a WebView: *"they're rendered
by the user's browser, in exactly the same way as a user would see it in their browser except they are
run fullscreen"*, with the app/site relationship *"verified using Digital Asset Links"*, falling back to a
Custom Tab with a URL bar when verification fails
([Chrome docs](https://developer.chrome.com/docs/android/trusted-web-activity/overview)).
That means Chrome's rules apply: COOP/COEP from our own HTTPS host → `crossOriginIsolated` → threads, and
WebGPU wherever Chrome 121+/Android 12+ has it (§A.5). Tooling is alive:
[GoogleChromeLabs/bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (Apache-2.0, 3,103★,
`@bubblewrap/cli` 1.25.0, published 2026-07-31).

Costs, stated plainly: a public HTTPS origin (so the "nothing leaves the device" claim needs the network
panel to prove it, not the packaging); the assetlinks handshake; and **the current build is not yet an
installable PWA** — `vite-plugin-pwa` is a devDependency (`web/package.json:52`) but is *not* in
`web/vite.config.ts`, and `web/dist/` contains no `manifest.webmanifest` and no service worker. TWA also
shares storage with Chrome, so a cached model counts against Chrome's site data, not the app's.

Recommendation: keep Track A as the installable artefact (offline, self-contained, no host), and treat
TWA as the *measurement* build that shows what the same code does with threads and a GPU.

### A.10 Exact build recipe for THIS machine

**Present, verified today**

| Tool | Version | How checked |
|---|---|---|
| JDK | OpenJDK **21.0.12** (`/usr/lib/jvm/java-21-openjdk-amd64`), `javac` present | `java -version`, `javac -version` |
| Gradle | wrapper **8.14.3**, distribution already unpacked in `~/.gradle/wrapper/dists/gradle-8.14.3-all/`; `Daemon JVM: /usr/lib/jvm/java-21-openjdk-amd64` | `./gradlew --version` |
| Android SDK | `/home/edu/Android/sdk` — `platforms;android-35`, `platforms;android-36`, `build-tools;35.0.0`, `build-tools;36.0.0`, `platform-tools 37.0.1`, `cmdline-tools/latest` (rev 22.0); licences accepted (`licenses/` populated) | `sdkmanager --sdk_root=… --list_installed`, `ls` |
| adb | `/home/edu/Android/sdk/platform-tools/adb` (37.0.1) | `ls` |
| Node | 22 (per task brief; Capacitor 8 requires "NodeJS 22 or higher", [environment-setup](https://capacitorjs.com/docs/getting-started/environment-setup)) | not re-checked here |
| Machine | 12 GB RAM cap / 8 vCPU / 8 GB swap (`/mnt/c/Users/Mr E/.wslconfig`), 871 GB free on `/` (ext4, **not** `/mnt/c`) | `free`, `df`, `/proc/meminfo` |

**Needed vs present:** AGP 8.13 requires **Gradle ≥ 8.13, JDK ≥ 17, build-tools 35.0.0, max API 36.1**
([AGP 8.13 release notes](https://developer.android.com/build/releases/past-releases/agp-8-13-0-release-notes));
Capacitor compiles at Java 21 (`app/capacitor.build.gradle:4-7`). Everything required is installed.
**No NDK or CMake is needed** for Track A (no native code in the shell) — that is a Track-C requirement
only. Android Studio is not required for a command-line `assembleDebug`.
First build **needs the network**: `~/.gradle/caches` does not exist yet, so AGP 8.13.0,
google-services 4.4.4 and the androidx artifacts in `android/variables.gradle:5-15` all download from
`google()` / `mavenCentral()`.

**Commands, in order** (run as the operator, from a shell in WSL2; nothing here was executed):

```bash
# 0) One-time per shell. local.properties already points gradle at the SDK; these are for adb/cap.
export ANDROID_HOME=/home/edu/Android/sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
# JAVA_HOME is unset and that is fine: ./gradlew --version already resolves java-21-openjdk-amd64.

# 1) Raise the Gradle daemon heap BEFORE the first build (edit android/gradle.properties:12):
#    org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8
#    org.gradle.workers.max=4          # 8 vCPU but only 12 GB, and the cockpit is running

# 2) Build the web app (Vite, 4 entries: index/chat/bench/needle — vite.config.ts:23)
cd /home/edu/Public/bizloop/slm/app/web
npm run build                      # tsc -b && vite build  -> web/dist/

# 3) Copy into the shell and sync the native project
cd /home/edu/Public/bizloop/slm/app/android-shell
npm run sync                       # = rm -rf www && cp -r ../web/dist www && npx cap sync android
                                   # (copies www/ -> android/app/src/main/assets/public/)

# 4) Assemble the debug APK (tests are NOT compiled by this task — leave ./gradlew build alone)
cd android
./gradlew assembleDebug            # add --no-daemon on a tight machine; otherwise ./gradlew --stop after

# 5) The artefact
ls -l app/build/outputs/apk/debug/app-debug.apk
```

**Debug signing** needs no action: AGP generates `~/.android/debug.keystore`
(alias `androiddebugkey`, password `android`) on first use — `~/.android/` exists here but currently holds
only `cache/`, so it will be created by step 4.

**Side-loading from WSL2** — USB is not passed through to the VM by default (the distro is in NAT mode:
`default via 172.20.128.1 dev eth0`), so pick one:

```bash
# (a) Wireless debugging (Android 11+): pair once from Developer options -> Wireless debugging
adb pair 192.168.x.y:PORT          # 6-digit code shown on the phone
adb connect 192.168.x.y:5555
adb devices && adb install -r app/build/outputs/apk/debug/app-debug.apk

# (b) Windows-side adb over USB (no usbipd needed): copy the APK out and use Windows' adb.exe
cp app/build/outputs/apk/debug/app-debug.apk "/mnt/c/Users/Mr E/Downloads/"
#   then in PowerShell:  adb install -r "$env:USERPROFILE\Downloads\app-debug.apk"
#   (no adb.exe was found under /mnt/c/Users/*/AppData/Local/Android/Sdk — UNVERIFIED whether one exists)

# (c) No cable at all: copy the APK to the phone (Drive/USB-MTP/email) and tap it;
#     Android will ask to allow "install unknown apps" for the file manager doing the tap.
# (d) usbipd-win (attach the USB device into WSL2) — not installed here (UNVERIFIED).
```

**Debugging the WebView on device:** Capacitor enables `webContentsDebuggingEnabled` automatically for
debug builds (`CapConfig.java:286`), so `chrome://inspect` from the Windows-side Chrome sees the WebView
once adb is connected — that is how the §A.3/§A.5/§A.7 probe gets run:

```js
// paste into chrome://inspect's console on the device — a positive marker per claim, not an absence
({ ua: navigator.userAgent, isolated: crossOriginIsolated, secure: isSecureContext,
   sab: typeof SharedArrayBuffer, cores: navigator.hardwareConcurrency,
   deviceMemory: navigator.deviceMemory ?? null, gpu: !!navigator.gpu,
   sharedMem: (() => { try { return new WebAssembly.Memory({initial:1,maximum:2,shared:true}).buffer.constructor.name }
                       catch(e) { return 'throws: '+e.name } })(),
   jspi: !!WebAssembly.Suspending, opfs: !!navigator.storage?.getDirectory })
navigator.storage.estimate().then(console.log)   // quota/usage actually granted in this WebView
```

**WSL2 failure modes to expect (each with its mitigation)**

| Step | What goes wrong under WSL2 | Mitigation |
|---|---|---|
| 4 | **Daemon OOM.** 12 GB VM cap, `MemAvailable` was ~6.3 GB while the cockpit and other agents run; `-Xmx1536m` plus a Kotlin daemon plus Node is tight. Gradle's symptom is `Expiring Daemon because JVM heap space is exhausted` or a silent kill. This VM has history: the `.wslconfig` comment records an ffmpeg OOM-kill on 2026-09-08 that took the VS Code server down. | `-Xmx2g -XX:MaxMetaspaceSize=512m`, `org.gradle.workers.max=4`, build when nothing else heavy is running, `./gradlew --stop` afterwards. |
| 2-4 | **`/mnt/c` slowness / file-watch weirdness** — does not apply as long as the project stays on `/home/edu` (ext4). Never move `android-shell/` under `/mnt/c`. | keep paths as they are; only the APK copy crosses to `/mnt/c`. |
| 4 | **First-build network** (AGP + androidx + google-services) via a NAT'd vNIC; a clock-skewed VM after a Windows sleep breaks TLS to `dl.google.com`. | `sudo hwclock -s` (or restart WSL) if Maven downloads fail with certificate/time errors; then re-run. |
| 4 | **aapt2/JVM under WSL** — AGP downloads a Linux aapt2 (`com.android.tools.build:aapt2:…-linux`) and runs it as a normal ELF binary; no known WSL blocker, but a build that fails inside `:app:processDebugResources` is usually this. | re-run with `--stacktrace`; check `~/.gradle/caches/modules-2/files-2.1/com.android.tools.build/aapt2`. |
| 5 | **adb sees no device** — USB is not in the VM. | wireless debugging, Windows adb, or plain file copy (above). |
| 3 | **`cap sync` silently ships a stale UI** — `www/` is a copy, not a link. | always run step 2 before step 3; `du -sh android/app/src/main/assets/public` should match `web/dist`. |
| 4 | `./gradlew build` (instead of `assembleDebug`) compiles the generated tests whose package is `com.getcapacitor.myapp` and whose assertion expects `com.getcapacitor.app`. | use `assembleDebug`; fix or delete those two files before ever enabling `test`. |

---

## B. Native llama.cpp through a plugin (existence and maintenance, checked today)

| Project | Licence | Signals (GitHub / npm, queried 2026-09-21) | Fit |
|---|---|---|---|
| **mybigday/llama.rn** | **MIT** | 1,041★, pushed **2026-09-20**, npm `llama.rn` latest **0.13.0-rc.4** (2026-09-17), 20 open issues | The reference native binding. **React Native only** — it is not usable from a Capacitor WebView app. This is what Track C gets for free (`anythingllm-mobile` pins `llama.rn` 0.12.9, `package.json:56`). |
| **cantoo-scribe/capacitor-llama** (`@cantoo/capacitor-llama`) | **MIT** (`package.json:22`; GitHub shows no licence file → npm metadata is the evidence) | 5★, created 2025-05-26, last commit **2026-08-18** (`chore: release 0.1.6`), npm latest **0.1.6**, peer `@capacitor/core >=6.0.0`, Android + iOS + an Electron bridge | **The only maintained Capacitor llama.cpp plugin found.** API is llama.rn-shaped: `initContext / completion / stopCompletion / releaseContext / tokenize / detokenize / getVocab / addListener('onToken')`. Ships `cpp/` (ggml + llama.cpp sources) and a `postinstall` that downloads prebuilt native artifacts (`install/download-native-artifacts.js`) — same pattern as llama.rn. Bus factor 1 org, 0 open issues, no GitHub releases: **spike it, do not depend on it blindly.** |
| **arusatech/llama-cpp-pro** (`llama-cpp-capacitor`) | MIT | 7★, pushed 2026-07-27, npm 0.1.5 (2026-07-22) | Second candidate, smaller and quieter. Verify it builds before considering. |
| **cactus-compute/cactus** | **NOT MIT.** Source-available: free only for individuals/non-commercial, orgs with **< $2M funding AND < $2M revenue**, students and 501(c)(3)s; anyone else "must obtain a separate commercial license" (LICENSE §2-3) | 6,039★, pushed 2026-09-08, v2.2.0 | **Disqualified for an insurer's product** without buying a licence. Also its own engine/quant format (Kotlin/Flutter/RN bindings), not a GGUF drop-in; `cactus-react-native` on npm is stale (2026-04). |
| **software-mansion/react-native-executorch** | **MIT** (LICENSE: "MIT License, Copyright (c) 2024 Software Mansion") | 1,744★, pushed 2026-09-18, npm 0.10.2 / releases to 0.10.4-libs | Healthy, but **PyTorch ExecuTorch `.pte` models, not GGUF**, and React-Native only. Out of scope unless the model ladder changes. |
| `capacitor-llama` (bare name), `capacitor-llama-cpp`, `@capacitor-community/llama` | — | **404 on npm** | Do not cite these; they do not exist. |

Conclusion for (B): a "Capacitor shell + native llama.cpp plugin" app is *possible* today via
`@cantoo/capacitor-llama`, and it is the only way to keep one React UI **and** get native speed. It costs
an NDK/CMake toolchain, arm64 artefacts in the APK, and a dependency with a bus factor of one. Sequence it
after Track A has produced a measured WASM baseline — the plugin is only worth its risk if the gap is big,
and right now nobody in this project has measured the gap.

---

## C. Forking `anythingllm-mobile` (Track B in D3)

Clone: `~/.cache/slm-src/Mintplex-Labs_anythingllm-mobile`, HEAD `10da4dd` "bump to build 85" (2026-09-13).
Full dossier: `slm/research/repos/anythingllm-mobile.md`. Re-verified here:

- **Framework:** bare React Native 0.81.6 (`package.json:67`), Hermes + New Architecture
  (`android/gradle.properties:38,42`), **arm64-v8a only** (`android/gradle.properties:31`).
- **Engine:** `llama.rn` pinned exactly `0.12.9` (`package.json:56`) — native llama.cpp, CPU only.
- **Toolchain from the manifests:** AGP via RN's plugin, Gradle wrapper 8.14.3, `buildToolsVersion 36.0.0`,
  `compileSdk/targetSdk 36`, `minSdk 24`, **`ndkVersion "27.1.12297006"`**, Kotlin 2.1.20,
  ObjectBox 4.3.0 (`android/build.gradle:3-9,19`), `org.gradle.jvmargs=-Xmx4G`
  (`android/gradle.properties:14`), Node ≥ 20.19.4 / `.nvmrc` 20.19.5, Yarn 1.22.22
  (`package.json:146,148`).
- **JDK:** React Native 0.81 docs say *"React Native currently recommends version 17 of the Java SE
  Development Kit (JDK). You may encounter problems using higher JDK versions."*
  ([reactnative.dev 0.81 set-up-your-environment](https://reactnative.dev/docs/0.81/set-up-your-environment?os=linux&platform=android)).
  This machine has **only JDK 21** — installing JDK 17 alongside (or proving 21 works with Kotlin 2.1.20 +
  kapt + ObjectBox) is the **first** Track-C task. **UNVERIFIED either way.**
- **Missing on this machine for Track C:** `ndk;27.1.12297006` and `cmake` are **not installed**
  (`sdkmanager --list_installed` shows only platforms 35/36, build-tools 35/36, platform-tools). Also a
  `platforms;android-36` is present ✔.

Exact Linux build steps (derived from the repo; **not executed**):

```bash
export ANDROID_HOME=/home/edu/Android/sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
sdkmanager --sdk_root=$ANDROID_HOME "ndk;27.1.12297006" "cmake;3.22.1"   # cmake version UNVERIFIED
# JDK 17 recommended by RN 0.81: apt install openjdk-17-jdk && export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
git clone <your fork> && cd <fork>
nvm use                       # .nvmrc 20.19.5
corepack enable || npm i -g yarn@1.22.22
yarn install                  # runs patch-package AND llama.rn's postinstall, which DOWNLOADS
                              # prebuilt librnllama*.so from a GitHub release (needs network twice;
                              # manual retry: node ./node_modules/llama.rn/install/download-native-artifacts.js --force)
cd android && ./gradlew assembleDebug      # debug.keystore is committed: android/app/debug.keystore,
                                           # alias androiddebugkey (app/build.gradle:52-58)
# release: your own keystore + APP_RELEASE_STORE_PASSWORD / APP_RELEASE_KEY_PASSWORD (app/build.gradle:59-64)
```

**Proprietary / non-ours deps to strip before any build leaves this machine:**

1. **Firebase Analytics.** `@react-native-firebase/{app,analytics} ^23.3.1` (`package.json:38-39`),
   `com.google.gms:google-services:4.4.3` classpath (`android/build.gradle:22`) and the plugin applied
   **unconditionally** (`android/app/build.gradle:6`), with `android/app/google-services.json` **committed**
   (project `anythingllm-mobile`) and `com.google.android.gms.permission.AD_ID` requested
   (`android/app/src/main/AndroidManifest.xml:12`). An untouched build reports into **Mintplex's**
   Firebase project — and the README's "no third-party telemetry" is false as written. Remove: 1 module +
   16 call sites + 2 gradle lines + the JSON + the permission.
2. **Mintplex-operated endpoints and a committed credential**: SearXNG behind a static header key
   (`src/utils/ToolsManager/tools/webSearch/index.ts:74`), `geojson.anythingllm.com`,
   `cdn.anythingllm.com/mobile/latest/version.txt`. Replace all three.
3. **ObjectBox 4.3.0** — Java binding vs closed native core: licence terms **UNVERIFIED**, read
   objectbox.io before shipping. It is the one non-open runtime dependency in the RAG path.
4. **Trademarks**: the AnythingLLM name/logo/onboarding art/Play metadata are not covered by MIT;
   ~153 brand occurrences in `src/` + 30 `com.anythingllm` references under `android/` (renaming 21
   Kotlin files forces an ObjectBox model regeneration).
5. Housekeeping the dossier flags: `allowBackup="true"` with untouched sample backup rules, app-wide
   `cleartextTrafficPermitted="true"`, API keys in AsyncStorage while `react-native-keychain` is never
   imported, ProGuard off.

Cost estimate from the dossier: **3-5 working days** to rebrand + de-Mintplex for someone comfortable with
RN + Gradle, plus a first-build day — **UNVERIFIED**, nothing was built.

---

## D. Blockers and risks (ranked)

1. **No cross-origin isolation in Android WebView ⇒ single-threaded WASM in Track A.** Not fixable by
   headers, by Capacitor config, or by `coi-serviceworker`. (§A.3)
2. **No WebGPU in Android WebView** (chromestatus has no WebView milestone; the Intent-to-Ship says "No"
   for WebView). Track A is CPU-only. (§A.5)
3. **An OOM kill of the renderer crashes the app** because Capacitor's default `onRenderProcessGone`
   returns `false` and no renderer-priority policy is set. This is the most likely first bug on a 4 GB
   phone with a 1 GB model. (§A.6)
4. **Downloads do not resume and do not survive backgrounding** (wllama truncates and refetches;
   `@capacitor/file-transfer` documents neither). A 700 MB model on mobile data is a coin flip. (§A.8)
5. **Storage quota inside the WebView is unknown and unsettable**, and "Clear data" wipes the model. (§A.7)
6. **WebView version floor:** wllama needs SIMD + exceptions (≥95) and silently degrades to the slow
   Asyncify build below JSPI/Memory64 (137/133). `minWebViewVersion` is still Capacitor's default 60. (§A.4)
7. **Gradle daemon vs a 12 GB WSL2 VM** with the cockpit and agents running — the one build-time failure
   this machine has already demonstrated once, with ffmpeg on 2026-09-08. (§A.10)
8. **The PWA is not a PWA yet** (no manifest, no service worker in `web/dist`) — blocks TWA, blocks
   "installable from the browser", and is invisible to Track A because Capacitor doesn't need it. (§A.9)
9. **Track B plugin risk:** the only Capacitor llama.cpp plugin has 5 stars and one maintainer. (§B)
10. **Track C legal/ops risk:** Firebase + a committed third-party credential + an unclear ObjectBox
    native licence must all be removed before a fork build is distributed; RN 0.81 wants JDK 17 and this
    machine has 21. (§C)

## E. Could not verify (do not let these become claims)

- Any tok/s, memory or battery number on any phone. **Nothing has been run on a device.**
- Whether a shared `WebAssembly.Memory` survives `postMessage` in Android WebView (the §A.3 crack).
- The current status of Chromium issue 40914606 (tracker page needs a login; status enum decoded from JSON).
- WASM SIMD's WebView milestone (chromestatus field blank).
- What `navigator.storage.estimate()` returns inside this app's WebView, and whether
  `navigator.storage.persist()` is honoured there.
- Whether `_capacitor_file_` Range requests actually honour the requested offset (§A.7 reading says no).
- Whether a Windows-side `adb.exe` or `usbipd-win` exists on this host.
- ObjectBox native-core licence terms; whether RN 0.81 + Kotlin 2.1.20 + kapt build on JDK 21.
- `cmake;3.22.1` being the right CMake revision for NDK 27.1.12297006.
