# Mintplex-Labs/anythingllm-mobile - deep-dive dossier

```
WHAT       Bare React Native 0.81 (New Architecture, Hermes, NO Expo/EAS) Android app, v1.1.0 build 85, on Google Play. On-device GGUF inference via llama.rn 0.12.9 (llama.cpp, CPU only), local RAG (nomic embed GGUF + ObjectBox HNSW + cross-encoder rerank), 8 tools, 19 remote providers, pairing with an AnythingLLM server. ~31k LOC TS/TSX + 1.9k LOC Kotlin.
LICENCE    MIT (file `LICENSE`, "Copyright (c) 2025 Mintplex Labs"). Verdict: YES for code - keep the copyright + permission notice. NOT covered: the AnythingLLM name/logo (no trademark grant in MIT), Mintplex's hosted endpoints and the key baked in for them, their Firebase project.
TAKE       The engine-agnostic TypeScript "small-model survival kit": rolling-summary ContextCompactor, AssistantTurn stream reducer + think-tag parser, ToolsManager loop + approval gate, HF GGUF repo browser, thread export (pdf-lib). ~2.5k LOC that ports to a Vite/React/wllama app with type-only surgery.
RISK       (1) README says "No third-party telemetry"; the code ships Firebase Analytics + AD_ID permission with no opt-out, and an unmodified fork build reports into Mintplex's Firebase project. (2) Bus factor 1, 20 public commits, zero tests, no CI. (3) Nothing here is web: UI is RN views, storage is WatermelonDB/ObjectBox/Room, inference is a native module.
SCORES     maturity 3 | code_quality 3 | chat_ux 4 | agentic 4 | mobile_pwa 3
RECOMMEND  Do NOT make the fork the primary path. Lift the pure-TS logic into the shared web core (PWA first, wllama). Keep a rebranded fork as the explicit plan B for a native-speed Android app: ~3-5 days to rebrand + de-Mintplex, but then it is a second codebase that shares no UI with the PWA.
```

Evidence base: shallow clone at `/home/edu/.cache/slm-src/Mintplex-Labs_anythingllm-mobile` (HEAD `10da4dd`, "bump to build 85", 2026-09-13), GitHub API queried 2026-09-21, five Hugging Face URLs HEAD-checked 2026-09-21. **Nothing was installed, built or run** - the machine has no Android SDK (`ANDROID_HOME` unset, `~/Android/Sdk` absent) and the ground rules forbid installs. Every behavioural statement is from reading source unless marked otherwise. Paths are relative to the repo root.

---

## 1. Licence

- `LICENSE`: verbatim MIT, "Copyright (c) 2025 Mintplex Labs". GitHub API reports `MIT`. README footer agrees. `package.json` has `"private": true` and **no `license` field** (cosmetic, the file governs).
- No `NOTICE`, no `THIRD-PARTY`, no per-directory licence files (`git ls-files | grep -iE 'notice|third|copying'` is empty).
- Verdict for the operator (private product OR MIT release): **yes**. Only condition: reproduce the copyright line and the permission notice "in all copies or substantial portions". Practical form: a `THIRD_PARTY_NOTICES.md` entry plus a header comment on each lifted file naming the source repo, commit `10da4dd`, and "modified".
- What MIT does **not** give you:
  - The name "AnythingLLM", the logo files (`src/assets/logo/*`, 5 files), the onboarding art, Play Store listing text (`fastlane/metadata/android/en-US/*`). MIT has no trademark grant. A fork must ship none of it.
  - Mintplex-operated services that the code calls (section 6). Code licence != permission to use their servers.
  - `src/assets/llmprovider/*` (31 provider logos) and `src/components/MonoProviderIcon/index.tsx:5` ("Monochrome brand marks from https://lobehub.com/icons") are third-party trademarks; `@lobehub/icons-static-svg` is a dependency. Licence of those marks: UNVERIFIED.
- Bundled third-party pieces that a fork redistributes:
  - **llama.rn 0.12.9** - MIT (GitHub API: `mybigday/llama.rn` licence MIT, 1,041 stars, pushed 2026-09-20). Ships prebuilt `librnllama*.so` (llama.cpp, MIT) downloaded at `yarn install` time (README "On-device runtime").
  - **ObjectBox 4.3.0** (`android/build.gradle:9,19`) - the vector store. From memory the Java binding is Apache-2.0 but the native database core is closed-source under ObjectBox's own binary licence: **UNVERIFIED, read objectbox.io terms before shipping**. This is the one non-open runtime dependency in the inference/RAG path.
  - **Firebase / Google Play services** (`android/build.gradle:22`, `android/app/build.gradle:6`) - proprietary Google SDK.
  - **pdfbox-android 2.0.27.0** (`android/app/build.gradle:129`) - Apache-2.0 (UNVERIFIED from the artifact; PDFBox upstream is Apache-2.0).
  - **Plus Jakarta Sans** TTFs, 14 files in `android/app/src/main/assets/fonts/` - upstream is OFL-1.1 (UNVERIFIED: no licence file is committed next to them; OFL requires one to travel with the fonts).
  - `scripts/bundletool-1.18.1.jar` - a 32 MB Google binary (Apache-2.0 upstream) committed to git.

## 2. What it actually is

| Question | Answer | Evidence |
|---|---|---|
| Framework | Bare React Native **0.81.6**, React 19.1.4, New Architecture ON, Hermes ON. Not Expo, not Capacitor, no EAS. | `package.json` deps; `android/gradle.properties` `newArchEnabled=true`, `hermesEnabled=true`; no `app.config.*`/`eas.json` in `git ls-files` |
| Styling / state / nav | NativeWind 4 (Tailwind 3 classes on RN views) + react-native-paper; MobX + mobx-persist-store (AsyncStorage); React Navigation 7 drawer | `package.json`; `App.tsx:29-79` |
| Chat DB | WatermelonDB 0.28 (SQLite), 4 models: Workspace, WorkspaceThread, WorkspaceChat, Document | `src/database/models/*` (332/342/338 LOC) |
| Inference engine | **llama.rn 0.12.9** (pinned exact). `n_gpu_layers: 0`, mmap+mlock, one context, serialised completion queue, 5-min idle unload | `src/utils/AiProviders/onDevice/llamaRn/index.ts:368-384`, `:96-101` |
| GPU/NPU | Deliberately none. Hexagon/OpenCL `.so` variants are excluded from the APK | `android/app/build.gradle:86-103` (`excludes`), `llamaRn/index.ts:379-381` |
| ABI | **arm64-v8a only** | `android/gradle.properties` `reactNativeArchitectures=arm64-v8a`; `app/build.gradle:48-50` |
| Platforms | Android only. `ios/` exists (Podfile, xcodeproj) but README marks iOS unchecked; native Kotlin modules have no Swift twins | README "Supported Operating Systems"; `android/app/src/main/java/com/anythingllm/**` (21 files, 1,868 LOC) |
| Web / PWA | None. No `react-native-web`, no service worker, no manifest | `package.json` |

README drift worth knowing: it says "React Native 0.76" (README:148) and "Node.js >= 18"; the manifest says RN 0.81.6 and `engines.node >= 20.19.4` (`.nvmrc` 20.19.5).

### Native modules written for this app (Kotlin, not reusable on web)

`download/` (WorkManager + Room + OkHttp resumable background downloader, 965 LOC), `vectordb/VectorBox.kt` (201), `storage/StorageModule.kt` (154), `webscraper/WebScraperModule.kt` (144, hidden `WebView` text extraction), `pdfparser/PdfParserModule.kt` (103), `DeviceInfoModule.kt` (86), `KeepAwakeModule.kt` (27).

## 3. Models: what ships, what downloads, from where

Nothing is bundled in the APK. Everything is pulled from `huggingface.co/.../resolve/main/...` on first use, no token, no Mintplex mirror.

| Role | Repo / file | Size (content-length, checked today) | Evidence |
|---|---|---|---|
| Preset "Lightweight" | `unsloth/Qwen3.5-0.8B-GGUF` Q8_0 | 811,843,840 | `src/utils/models/defaults.ts:21-30` |
| Preset "Balanced" | `unsloth/Qwen3.5-2B-GGUF` Q8_0 | 2,012,012,800 | `defaults.ts:31-39` |
| Preset "Powerful" | `unsloth/Qwen3.5-4B-GGUF` Q6_K | 3,525,956,768 | `defaults.ts:40-48` |
| Embedder | `nomic-ai/nomic-embed-text-v1.5-GGUF` Q4_K_M (768-d) | 84,106,624 | `defaults.ts:60-70`; dimension hard-coded in `VectorBox.kt` `@HnswIndex(dimensions = 768)` |
| Reranker | `sinjab/ms-marco-MiniLM-L6-v2-Q8_0-GGUF` | 25,281,216 | `defaults.ts:51-58` |
| Vision | `mmproj-F16.gguf` per Qwen3.5 / Qwen3-VL repo (205-819 MB) | not checked | `src/utils/models/index.ts:296-300, 326-330, 388-392` |
| Catalogue extras | gemma-3-1b-it, Qwen3-0.6B/1.7B, Llama-3.2-1B, granite-3.3-2b (all unsloth quants) | not checked | `src/utils/models/index.ts:12-423` |

All five checked URLs returned HTTP 200; the three repos whose API I queried carry `license:apache-2.0` tags. Note `defaults.ts` labels the reranker "22.6MB" while the file is 25.3 MB - the UI string is slightly wrong.

Plus a Hugging Face browser: search `?filter=gguf`, parse repo id from pasted URLs, list quants with sizes, skip `mmproj-*` and sharded files, flag gated repos (`src/utils/api/hfGguf.ts:1-120`). README claim "Download direct from HuggingFace" is **implemented**.

Context window defaults are RAM-tiered and small on purpose: <4 GB -> 512, <6 GB -> 1024, else 2048 (`src/utils/contextLength.ts:12-36`); `DEFAULT_N_PREDICT = 2048`, image capped at 512 tokens (`llamaRn/index.ts:63, 91`).

## 4. RAG, agents, server sync - checked against the README

| README claim | Implemented? | Where |
|---|---|---|
| On-device RAG | Yes. RecursiveCharacterTextSplitter (`@langchain/textsplitters`, chunk 1024 / overlap 20) -> llama.rn embedding context -> ObjectBox HNSW cosine, per-workspace filter -> optional wide search + cross-encoder rerank -> chunks injected in system prompt, capped at 35% of prompt budget | `src/utils/TextSplitter/index.ts:24-34`, `src/utils/Embedder/onDevice/index.ts`, `src/utils/VectorDB.ts`, `baseOpenAILikeProvider/index.ts:393-434`, `llamaRn/index.ts:80` |
| "Agentic memory" rolling summary | Yes, and it is the best code in the repo (section 7, unit A) | `src/utils/chat/contextCompaction.ts` (288 LOC) |
| "Smart tool selection" | Yes. When > 4 tools on-device (> 10 cloud) the MiniLM cross-encoder scores each tool definition against the prompt; model loaded on demand and released | `src/utils/ToolsManager/toolReranker.ts:52-55`, `ToolsManager/index.ts:199-221` |
| Built-in tools | 8: web_search, web scraping, location, summarize, draft email, draft text, calendar create, calendar read. "time" was removed and folded into the system prompt (commit 2026-09-11) | `src/utils/ToolsManager/index.ts:67-76` |
| Tool calling | Native llama.cpp jinja tool calling when the template supports it (`chatTemplates.jinja.toolUse`), `tool_choice: 'auto'`; results merged into the previous message for small models, proper `tool_calls` echo for cloud | `llamaRn/index.ts:231-238, 609-612`; `ToolsManager/index.ts:262-301` |
| Tool approval | Yes: in-process approve/reject card, 60 s timeout, settles on abort | `src/utils/ToolsManager/toolApproval.ts:1-50` |
| Vision | Yes via `initMultimodal` + mmproj; refuses to guess for unknown models | `llamaRn/index.ts:135-140, 345` |
| Speech-to-text | Yes, OS recogniser via `@react-native-voice/voice` (patched: `patches/@react-native-voice+voice+3.2.4.patch`) | `src/hooks/useSpeechToText.ts` |
| Export PDF/MD/JSON/TXT | Yes, PDF built with `pdf-lib` + `marked` in pure JS | `src/utils/chat/export/**` (1,320 LOC) |
| 19 providers | Yes; 16 provider classes are thin subclasses of one 792-LOC base + hand-rolled OpenAI (186 LOC) and Anthropic Messages (649 LOC) SSE clients | `src/utils/AiProviders/*`, `src/utils/openai`, `src/utils/anthropic` |
| MCP | **No.** `grep -ri mcp src` finds nothing. Tools are a fixed in-repo list | - |
| "No third-party telemetry" | **False as written.** See section 6 | `src/utils/Telemetry/index.ts` |

Defect I would fix before lifting the tool loop: in cloud mode (`mergeToolCallResults = false`) already-called tools are **not** removed (`index.ts:292` only runs in merge mode) and the `do/while` at `:278-299` has no iteration cap, so a model that keeps calling the same tool loops until the user aborts.

### Sync with an AnythingLLM server

It is pairing + remote control, not data sync.

1. QR code / URL must end in `/api/mobile` (`src/utils/AnythingLLMExternal/index.ts:43-52`).
2. `POST {url}/register` with a temporary bearer token -> device token; admin approves on the server; app polls `GET {url}/auth` with header `x-anythingllm-mobile-device-token` (`:60-103`).
3. `POST {url}/send/{command}` for `workspaces | workspace-content | model-tag | reset-chat | new-thread | unregister-device` (`:4-25, 105-119`).
4. "Import" creates a local **replica** of the workspace, threads and chat history flagged `isRemote` (`src/screens/ConnectToInstance/Import/WorkspaceItem/sync.ts:16-117`). Re-import deletes and recreates (`:28-32`). It is one-way, pull-only, no merge.
5. Chatting in a remote workspace streams over SSE (`react-native-sse`) through `DelegatedProvider`; inference, RAG and documents stay on the server; closing the SSE aborts server-side (`src/utils/AiProviders/delegatedProvider/index.ts:24-29`). Images cannot be sent to the remote API (`src/hooks/useChatHandler/index.tsx:244-245`).

The device token is stored in plaintext inside each workspace/thread `remoteConfig` row (`sync.ts:43-48, 64-70`).

## 5. Android build on Linux - exact requirements (derived from the repo, NOT executed)

| Item | Version | Source |
|---|---|---|
| Node | >= 20.19.4 (`.nvmrc` 20.19.5) | `package.json` `engines`, `.nvmrc` |
| Yarn | classic 1.22.22 | `package.json` `packageManager`, `.yarnrc.yml` |
| JDK | 17 is what RN 0.81 documents (UNVERIFIED, from memory). This machine has OpenJDK 21.0.12 only; whether AGP/Gradle 8.14.3 + kapt + ObjectBox build cleanly on 21 is UNVERIFIED | `java -version` |
| Gradle | 8.14.3 via wrapper | `android/gradle/wrapper/gradle-wrapper.properties` |
| Android SDK | compileSdk 36, targetSdk 36, minSdk 24, build-tools 36.0.0 | `android/build.gradle:3-6` |
| NDK | 27.1.12297006 (+ CMake, needed by New-Arch codegen; exact CMake version UNVERIFIED) | `android/build.gradle:7` |
| Kotlin | 2.1.20, kapt, Room 2.8.5 | `android/build.gradle:8`, `app/build.gradle:4,121-124` |
| JVM heap | `-Xmx4G` | `android/gradle.properties` |

Steps (none needs a cloud service or a paid key):

```
sdkmanager "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "platform-tools"   # + cmake
export ANDROID_HOME=...; nvm use; corepack enable || npm i -g yarn@1.22.22
yarn install          # runs patch-package AND llama.rn's postinstall, which downloads prebuilt librnllama*.so from a GitHub release
cd android && ./gradlew assembleDebug        # debug.keystore is committed (android/app/debug.keystore)
# release: own keystore + APP_RELEASE_STORE_PASSWORD / APP_RELEASE_KEY_PASSWORD in .env, then `yarn build:android:release`
```

Things that will bite:

- **`google-services.json` is committed** (`android/app/google-services.json`, project `anythingllm-mobile`, package `com.anythingllm`) and the `com.google.gms.google-services` plugin is applied unconditionally (`app/build.gradle:6`). An untouched debug build compiles - and sends analytics to Mintplex's Firebase project. After you change `applicationId` the plugin fails the build until you supply your own `google-services.json` or remove Firebase (known plugin behaviour; not reproduced here).
- The release script hard-codes the keystore filename and alias `anythingllm-keystore` (`scripts/buildAndroidRelease.js:89-91`, `app/build.gradle:59-63`).
- arm64-only means **no x86_64 emulator** without editing `gradle.properties`; on WSL2 that means a physical phone over `adb` (usbipd or Windows-side adb).
- `enableProguardInReleaseBuilds = false` (`app/build.gradle:21`; open issue #65 "Enable Proguard for Google Play").
- `yarn install` needs network twice (npm + GitHub release artefacts); README documents a manual re-run: `node ./node_modules/llama.rn/install/download-native-artifacts.js --force`.
- `.env.example` references `APPCHECK_DEBUG_TOKEN_*` but no App Check code exists in `src/` (only an unused `AppCheckError` class, `src/utils/errors.ts:20-26`). Dead config, and the iOS line carries what looks like a real debug token value.

## 6. Red flags

1. **Telemetry contradicts the README.** README: "Privacy-first ... No third-party telemetry." Code: `@react-native-firebase/analytics` initialised at import (`src/utils/Telemetry/index.ts:51-55, 71`), 16 call sites, events include `chat_completed {llmProvider, llmModel}` (`src/hooks/useChatHandler/index.tsx:232-235`), `tool_called {tool}` (`ToolsManager/index.ts:189`), `llm_settings_updated {provider, model}`, survey answers. The manifest requests `com.google.android.gms.permission.AD_ID` "for Firebase Analytics" (`android/app/src/main/AndroidManifest.xml:11-12`). `grep -ri "setAnalyticsCollectionEnabled\|opt.out"` finds **no opt-out**. No prompt text or chat content is sent (verified by reading every call site), but this is third-party telemetry by any definition. A fork must rip it out: 1 module + 16 call sites + 2 gradle lines + 1 JSON + 1 permission.
2. **Hard dependencies on Mintplex infrastructure, with a credential in source.**
   - Web search falls back to a Mintplex-hosted SearXNG behind a static header key committed at `src/utils/ToolsManager/tools/webSearch/index.ts:74` (URL at `:175`). Primary path is You.com's keyless tier, "100 queries/day per IP" per the code comment (`:115-118`, UNVERIFIED against You.com's terms). A fork may not use Mintplex's instance; you need your own search backend.
   - IP geolocation: `https://geojson.anythingllm.com` (`tools/getLocation/index.ts:49`).
   - Update check: `https://cdn.anythingllm.com/mobile/latest/version.txt` (`src/utils/paths.ts:18`).
   - Favicons via `google.com/s2/favicons` (`CitationsActionSheet/Favicon/index.tsx:14`) - leaks cited domains to Google.
   - OpenRouter requests send `HTTP-Referer: https://anythingllm.com` (`OpenRouterProvider/index.ts:69`).
3. **Secrets at rest are plaintext.** Provider API keys go through `uiStore.setToStorage` -> AsyncStorage (`src/contexts/LLMPreferenceContext.tsx:51`, `src/store/UIStore.ts:75`). `react-native-keychain` is in `package.json` but **never imported** (`grep -rn Keychain src` is empty). Combined with `android:allowBackup="true"` and backup-rule files that are still the untouched Android Studio samples (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`), keys and device tokens are eligible for cloud backup.
4. **Cleartext HTTP allowed globally**: `<base-config cleartextTrafficPermitted="true">` (`res/xml/network_security_config.xml`). Understandable for LAN Ollama, but it is app-wide, not LAN-scoped (the `domain-config` below it is redundant).
5. **Zero tests, no CI.** `jest`, `@testing-library/react-native` are devDependencies and `"test": "jest"` exists, but there is no test file in `src/` and no jest config; no `.github/`. `turn.ts:34` says "Kept free of React so it stays unit-testable" - nobody tested it. Only `husky` + commitlint.
6. **Type safety is loose**: `noImplicitAny: false` (`tsconfig.json`), 55 `@ts-ignore`, ~291 `any` annotations, 131 `console.log` in non-asset `src/`.
7. **Bus factor 1, opaque history.** Contributors API: `timothycarambat` 20 commits, nobody else. Public history starts 2026-06-02 "Initial commit" although the repo was created 2025-05-20 and versionCode is 85 - the real history is private/squashed. Releases on main land as large squash PRs ("1.1.0 (#61)", "Rn 0.81 migration (#62)"). Active though: branch `1.2.0` (PR #73 open) already merged memory system, scheduled jobs, office-format parsing, locked-phone notifications (PRs #76-#86, 2026-09-16..18). The "pushed 2026-09-20" in the metadata is that branch; `main` HEAD is 2026-09-13.
8. **Heavy / odd dependencies**: `moment` + `dayjs` + `date-fns` together; two markdown renderers (`react-native-markdown-display`, `react-native-marked`) + `marked` + `react-native-render-html`; both `react-native-fs` and `@dr.pogodin/react-native-fs`; `yarn` and `add` listed as runtime dependencies (accidental `yarn add yarn add`); `@langchain/textsplitters` pinned to `0.0.0`; a 32 MB jar in git.
9. No `eval`, `new Function`, or HTML injection sink found in `src/` (grep clean). The scraper's hidden `WebView` runs remote JS by design; settings not audited line by line.

## 7. Liftable units

Transplant target: Vite + React + TypeScript + wllama. "Easy" = copy, fix imports/types. "Moderate" = replace a storage or engine adapter. "Hard" = rewrite.

| # | What | Paths | LOC | Runtime deps | Difficulty | Why it beats writing fresh |
|---|---|---|---|---|---|---|
| A | **Rolling-summary context compactor** | `src/utils/chat/contextCompaction.ts` | 288 | none (type imports of chat row + 2 static calls to `WorkspaceThread.get/setContextSummary`) | **Easy-moderate**: swap the two persistence calls for an injected store (IndexedDB), replace `DynamicChatMessage` with your type. Engine is already injected (`countTokens`, `complete`). | Encodes hard-won small-window behaviour: trigger at 50% / target 30% of prompt budget, never fold the newest turn, incremental summary-on-summary, batch that must fit the summariser's own window, middle-truncation fallback with 6 halvings, stale-summary detection after delete/retry/fork (`:123-137`), serialised background runs (`:165-172`). wllama exposes tokenisation and chat formatting, so `countTokens` maps directly. |
| B | **Assistant turn reducer + think-tag/JSON parser** | `src/hooks/useChatHandler/turn.ts`, `parser.ts` | 280 + 172 | none | **Easy**: pure TS, only type imports. | One reducer for 14 stream events (`baseOpenAILikeProvider/index.ts:58-74`) producing an ordered activity timeline (thoughts, statuses, tool calls, approvals) with re-parse once per UI flush instead of per token. Parser handles `<think>/<thinking>/<thought>` open-without-close while streaming and models that wrap answers in `{"response": ...}` (`parser.ts:116-150`). |
| C | **Tools manager + approval gate** | `src/utils/ToolsManager/index.ts`, `toolApproval.ts` | 303 + 131 | type import from `llama.rn` (`NativeCompletionResult`), `uiStore`, Telemetry | **Easy-moderate**: delete the telemetry line, replace one type, inject settings storage. Add an iteration cap (section 4 defect). | The two-mode loop is the insight: small local models get tool results **merged into the previous message** and the used tool removed (`:288-295`); cloud models get a proper `tool_calls` echo with generated ids and Gemini `extra_content` passthrough (`:229-248`). Per-result `maxToolResultChars` with middle truncation. Approval settles exactly once on tap / abort / 60 s timeout. |
| D | **Hugging Face GGUF browser API** | `src/utils/api/hfGguf.ts`, `constants.ts` (+ `hf.ts` uses axios) | 245 + 13 (+152) | `fetch` only | **Easy** | Paste-anything repo id parser, quant label regex incl. `UD-`/`IQ`/`MXFP4`, filters mmproj + shards, gated detection, typed errors. Exactly what a wllama model picker needs. Note wllama *can* load shards, so relax `isLoadableGGUF`. |
| E | **Thread export (PDF/MD/JSON/TXT)** | `src/utils/chat/export/{json,markdown,text,types}.ts`, `export/pdf/{index,renderer,encoding}.ts` | ~1,030 (renderer 599) | `pdf-lib`, `marked` - both run in browsers | **Moderate**: `export/index.ts` (208) is RN share-sheet glue - rewrite as a Blob download; drop `pdf/branding.ts` + `pdf/logo.ts` (Mintplex brand). | A markdown->paginated-PDF writer with WinAnsi fallback and embedded images is tedious to get right; this one exists and is dependency-light. |
| F | **Tool selection by cross-encoder rerank** | `src/utils/ToolsManager/toolReranker.ts`, `src/utils/DocumentReranker/index.ts` | 227 + 110 | `llama.rn` rank pooling, RNFS, NetInfo, `Alert` | **Hard-ish**: the idea and thresholds port; the code is llama.rn + filesystem. Whether wllama exposes `pooling_type: rank` is UNVERIFIED. | Take the design (thresholds 4/10, load-score-release, fall back to full tool set on any failure), not the file. |
| G | **llama.rn wrapper: budget arithmetic** | `src/utils/AiProviders/onDevice/llamaRn/index.ts` | 709 | llama.rn | **Moderate, partial**: lift the constants and `fitMessagesToContext` / `n_predict` sizing logic (35% reply reserve, 16-token safety margin, min 64 predict, 35% RAG cap, 25% per-tool-result cap, 3.5 chars/token - `:57-91`); the context lifecycle is engine-specific. | These ratios are tuned on real phones by a team shipping to Play; they are a better starting point than guesses. |
| H | **Provider layer (OpenAI-like base + Anthropic SSE client)** | `src/utils/openai/index.ts`, `src/utils/anthropic/index.ts`, `src/utils/streamingFetch/index.ts` | 186 + 649 + 59 | RN fetch polyfill | **Moderate**, low value: in a browser native `fetch` streams already; `readSSEDataLines` is the only reusable bit. The 792-LOC base provider is welded to Workspace/VectorDB/Embedder. | Only if the server-backed mode needs many vendors without an SDK. |
| - | **Entire RN UI** (`src/screens/**`, `src/components/**`, ~12k LOC) | - | - | RN, NativeWind, gorhom bottom-sheet, reanimated | **Hard / rewrite** for web. | Useful as a UX reference (activity chain, approval card, model-fit hints, download surface), not as code. |

Attribution template for every lifted file:
`// Adapted from Mintplex-Labs/anythingllm-mobile@10da4dd (MIT, (c) 2025 Mintplex Labs) - <path>. Modified.`

## 8. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | 3 | Shipping on Google Play at build 85 with weekly feature PRs, but Android-only, 20 public commits from one person, zero tests, no CI, ProGuard off. |
| code_quality | 3 | Architecture and comments are excellent (every constant explains *why*); undermined by `noImplicitAny:false`, 55 ts-ignores, ~291 `any`, no tests, duplicate dependencies. |
| chat_ux | 4 | Activity chain with shimmer status, CoT collapse, tool approval cards, citations sheet, fork/retry/delete, export, voice, vision, tok/s metrics, model-fit hints; but code blocks have no highlighting or copy button (`TextResponse/rules.tsx:9-19`), colours are hard-coded dark, portrait-locked. |
| agentic | 4 | Real native tool calling with a small-model-aware loop, reranked tool selection, approval gate, abort everywhere, rolling memory; no MCP, fixed tool list, uncapped cloud loop. |
| mobile_pwa | 3 | Best-in-class *native Android* on-device app among MIT repos seen so far; contributes nothing to web landing or PWA, and iOS is not there. |

## 9. Verdict: fork this, or wrap a wllama PWA in Capacitor?

**What a fork buys:** native llama.cpp with ARM dotprod/i8mm kernels, mmap + mlock, no WASM memory ceiling, resumable background downloads that survive app death (WorkManager), native speech/camera/calendar, a vector DB with HNSW, and a UX already tuned on phones. The 3.5 GB "Powerful" preset is realistic here; in a WebView through WASM it is not (wasm32 address space and per-buffer limits - general platform facts; I have **no measured numbers** for wllama inside an Android WebView, so any speed ratio would be invented).

**What a fork costs:**

- Rebrand surface: 80 files mention the brand; 153 occurrences in `src/` + `App.tsx`; 30 `com.anythingllm` references under `android/` (package rename of 21 Kotlin files + ObjectBox model regeneration); logos, onboarding art, fonts manifest, Play metadata, PDF branding, settings links (`src/screens/UserSettings/Main/index.tsx:62-96`, including Mintplex's Stripe donate link at `:72`).
- De-Mintplex: remove Firebase (item 6.1), replace search/geo/update endpoints (6.2), move keys to Keystore (6.3), fix backup rules. Estimate **3-5 working days** for someone comfortable with RN + Gradle, plus a first-build day on this machine (no SDK yet, JDK 21 vs 17). UNVERIFIED estimate - nothing was built.
- Ongoing: a second codebase. None of the ~12k LOC of RN UI is shared with the Vite/React PWA. Every feature is built twice. Upstream moves fast with squash merges, so rebasing a rebranded fork will be painful; treat it as a hard fork.
- Feature addition itself is comfortable: adding a tool is one ~60-LOC file + one line in `configurableTools`; adding a provider is a ~20-LOC subclass.

**What Capacitor-around-PWA buys:** one UI, one codebase, landing + PWA + Play Store APK from the same build. Costs: WASM inference inside the system WebView (threads need cross-origin isolation - whether Capacitor's local server can send COOP/COEP on Android is UNVERIFIED), small models only, no mlock, download resilience depends on the WebView staying alive.

**Recommendation.**

1. Build the PWA first on wllama and lift units A-E (and the constants from G) into a shared `core/` package. That is where this repo pays off immediately, legally cleanly, in days.
2. Ship Android v1 as the PWA in Capacitor (or a TWA) limited to the <= 1 GB presets. Measure tokens/s on a real phone before deciding anything else.
3. Only if that measurement is unacceptable, open the native track - and then **forking this repo is the right way to do it**; nothing else MIT-licensed seen in this research has a comparable on-device chat/RAG/tool stack. A middle path - Capacitor shell + a native llama.cpp plugin so the web UI is kept - is worth a spike first (existence/quality of such a plugin: UNVERIFIED).
4. Whatever path: do not ship their `google-services.json`, their SearXNG key, their endpoints, or their name.

## 10. Could not verify

- Any build or runtime behaviour (no SDK, no install allowed). Build steps in section 5 are derived from manifests.
- ObjectBox native-core licence terms; Plus Jakarta Sans and lobehub icon licences as shipped.
- You.com keyless-tier terms and limits (only the code comment).
- Whether the `APPCHECK_DEBUG_TOKEN_IOS` value in `.env.example` is live.
- Performance of any model on any device: the repo contains no benchmarks, and none were run.
- Contents of the `1.2.0` branch beyond PR titles.
