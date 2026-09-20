# ThalesGroup/rust-coding-dojo — dossier (Academy web app only)

```
WHAT IT IS      A Rust kata repo; its `academy/` folder is a small React 18 + Vite 8 PWA with a wllama 3.5.1 "Ferris" mentor chat (LFM2.5-350M Q4_K_M from HF).
LICENCE         Apache-2.0 (LICENSE read in full, "Copyright 2025 ThalesGroup", no NOTICE file) -> CAN COPY, WITH CONDITIONS (keep licence text, mark changed files, keep attribution).
BEST TO TAKE    academy/src/llm/localWllama.ts (209 LOC): a working, minimal wllama v3 singleton — WebGPU probe, thread heuristic, HF load with cache, clear-cache-and-retry.
BIGGEST RISK    It is a 1-day hackathon drop, not an "enterprise-grade" app: the chat has zero tests, the "kata context" toggle is dead code, PWA icons are missing, prod runs single-threaded.
SCORES          maturity 2 · code_quality 3 · chat_ux 2 · agentic 1 · mobile_pwa 2
RECOMMENDATION  Take ~250 lines as a reference/seed (wllama loader + vite PWA/COOP-COEP config); do NOT adopt its chat UI, Markdown streaming, persistence or PWA setup as the product's base.
```

Date of review: 2026-09-21. Clone: `/home/edu/.cache/slm-src/ThalesGroup_rust-coding-dojo` (shallow, HEAD `0c6340c`).
All paths below are relative to the repo root unless absolute.

---

## 1. Licence

### What the files say
- `LICENSE` — full, unmodified-looking Apache License 2.0 text (header lines 1-3; appendix at line 178;
  copyright line 189: `Copyright 2025 ThalesGroup`). sha256 `760b6182...a0251`.
- GitHub API agrees: `license.spdx_id = Apache-2.0` (`gh api repos/ThalesGroup/rust-coding-dojo`, 2026-09-21).
- **No `NOTICE` file, no third-party licence file** anywhere in the tree (`find . -iname 'NOTICE*' -o -iname '*third*party*'` -> only `./LICENSE`).
- **No per-file licence/copyright headers** in `academy/` (`grep -rn "SPDX\|Copyright"` over ts/tsx/cjs/js/css/html -> 0 hits outside generated kata data).
- `academy/package.json:3` says `"private": true` and has **no `license` field**. That is an npm-publish guard, not a licence statement; the root LICENSE governs.

### Verdict: **conditions** (copying is allowed, into a private product or an MIT-released one)
Apache-2.0 is permissive and one-way compatible with MIT-licensed *projects*. Conditions that actually bind (Apache-2.0 §4), spelled out:
1. **§4(a)** — ship a copy of the Apache-2.0 licence text with anything you distribute that contains the lifted code. A web app served to browsers is distribution in Object form, so put it in a `THIRD_PARTY_LICENSES`/"Open-source licences" page, not just in the private repo.
2. **§4(b)** — every lifted file you modify must carry a prominent notice that you changed it (e.g. header: `// Derived from ThalesGroup/rust-coding-dojo academy/src/llm/localWllama.ts @0c6340c, Apache-2.0. Modified 2026-09 by <operator>: ...`).
3. **§4(c)** — retain existing copyright/attribution notices. There are none in the source files, so the practical obligation is to carry `Copyright 2025 ThalesGroup` in your attribution entry.
4. **§4(d)** — NOTICE propagation: not applicable, no NOTICE file exists.
5. If the product is released as MIT, the lifted files **stay Apache-2.0**; you cannot relicense them to MIT. State "MIT, except files listed in THIRD_PARTY_LICENSES". Apache-2.0 also carries a patent grant + patent-retaliation clause (§3) that MIT lacks — harmless for the operator.
6. §6 — no right to use the Thales name/marks. Do not imply endorsement.

### Dependency licences (from `academy/package-lock.json`, verified)
`@wllama/wllama` 3.5.1 MIT (:2871-2874) · `marked` 18.0.5 MIT (:5016-5019) · `dompurify` 3.4.12 MPL-2.0 OR Apache-2.0 (:3453-3456) · `idb` 8.0.3 ISC (:4141-4144) · `vite-plugin-pwa` 1.3.0 MIT (:6442-6446) · `workbox-build` 7.4.1 MIT (:6738-6742). No copyleft in the chat-relevant set.
The default model `LiquidAI/LFM2.5-350M-GGUF` has its own model licence — UNVERIFIED here (not part of this repo; check the HF model card before shipping it as a default).

### Provenance caveat
The entire Academy landed in commits authored by a shared identity **"Hackathon A4I"** with no GitHub login (`820b8a9`, `20a48d9` on 2026-06-24; `0acd70c` on 2026-08-07), merged from a personal fork (`NicolasPayneauT0132431/*`, `nicolasp-thg`). `opencode.json` wires in an AI-coding "superpowers" plugin and `docs/superpowers/specs/` holds an agent-written design spec, so the code is very likely substantially AI-generated. That does not weaken the Apache grant from ThalesGroup (the repo owner publishes it under that licence); it does mean nobody should assume the code was human-reviewed line by line.

---

## 2. Architecture (what is actually there)

Repo = Rust workspace of katas (`katas/`, `Cargo.toml`) + `academy/` (the only part in scope) + `rewards/harness` (opencode agent config, irrelevant).

`academy/` — 22 hand-written source files, ~2,900 LOC of TS/TSX/CSS excluding generated data:

| Area | File | LOC | Notes |
|---|---|---|---|
| LLM engine | `academy/src/llm/localWllama.ts` | 209 | wllama singleton, HF load, streaming completion, prompt building |
| LLM facade | `academy/src/llm/ferris.ts` | 83 | try/catch around the engine + hard-coded regex fallback replies |
| Chat UI + editor | `academy/src/screens/KataScreen.tsx` | 491 | CodeMirror editor, run/tests, chat panel, Markdown render — one component |
| Persistence | `academy/src/store/progress.ts` | 104 | `idb` one-store/one-key + localStorage mirror; XP maths |
| State | `academy/src/store/AppContext.tsx` | 154 | React context, debounced save (500 ms) |
| Remote exec | `academy/src/editor/rustCompiler.ts` | 114 | POSTs learner code to `https://play.rust-lang.org/execute` |
| PWA/build | `academy/vite.config.ts` | 57 | VitePWA + COOP/COEP dev headers + base-path logic |
| Styles | `academy/src/index.css` | 1409 | chat rules at :581-740; 3 media queries at :1381-1409 |
| Data | `academy/src/data/katas.generated.ts` | 10,814 | generated from `katas/**` by `academy/tools/*.cjs` |

Stack per `academy/package.json`: react 18.3, vite ^8.1, typescript ^5.6 (`strict: true`, but `noUnusedLocals/Parameters: false` — `academy/tsconfig.json:15-17`), vitest ^4.1, **no ESLint, no Prettier, no router, no state library, no CSS framework**. 458 packages in the lockfile. There is **no server component** — nothing here helps with the "optionally backed by a server" half of the product.

---

## 3. README claims vs. the code

| Claim (README.md) | Reality | Evidence |
|---|---|---|
| :92 "**contextual** chat assistant powered by `@wllama/wllama`" | wllama: TRUE. Contextual: **FALSE in the shipped UI.** `send()` always passes `skipContext = true`, which drops both the kata context and the chat history; every message is a stateless single-turn prompt. | `KataScreen.tsx:321-323` (`..., true)`); `localWllama.ts:62-63` |
| CHANGELOG :10 "toggle contexte kata" | Checkbox is rendered and its state is **never read**. Dead UI. | `KataScreen.tsx:122` (state), `:432` (checkbox); `grep useKataContext` -> only those 2 lines |
| :92 "streaming answers" | TRUE — `stream: true` + `onData` appends tokens. No abort/stop button, no `AbortSignal`. | `localWllama.ts:66-82` |
| :92 "Markdown rendering" | TRUE but naive: `marked.parse` + `DOMPurify.sanitize` over the **whole text of every message on every token** (no memo, render function is recreated each render, list keyed by index). O(n^2) per reply; fine at 350M-model reply lengths, not a technique worth lifting. No syntax highlighting, no incomplete-fence handling, no copy button. | `KataScreen.tsx:342-350`, `:417-421` |
| :93 "PWA support: installable app with service-worker caching" | **Half true.** Workbox SW is generated and auto-registered by the plugin (`registerType: 'autoUpdate'`, no manual `registerSW` import anywhere). But the manifest references `pwa-192x192.png` / `pwa-512x512.png` and `includeAssets` lists `favicon.ico`, `apple-touch-icon.png`, `masked-icon.svg` — **none exist**; `academy/public/` contains only `favicon.svg` and a second, orphaned `manifest.json` (`start_url: "/"`, wrong under the GitHub Pages sub-path, and never linked from `index.html`). With no valid PNG icon, Chrome's install criteria are not met — installability UNVERIFIED and unlikely. | `vite.config.ts:36-55`; `ls -R academy/public`; `academy/public/manifest.json:8`; `academy/index.html` |
| :99 "Persistence: IndexedDB + localStorage" | TRUE for one `UserProgress` object under key `'progress'`. **Chat history is not persisted at all** — it lives in `useState` and is reset on every kata change. | `progress.ts:41-65`; `KataScreen.tsx:108-110`, `:136` |
| "model caching" (task focus) | Not implemented by this repo. It is wllama's own cache (`useCache: true`, `allowOffline: true`); Workbox only precaches app assets + the wllama `.wasm` (50 MB cap). That division is correct, but there is nothing to lift. | `localWllama.ts:92`, `:111`; `vite.config.ts:51-54` |
| multi-thread / WebGPU | Code probes both. But COOP/COEP headers are set only for `vite dev` / `vite preview`; production is GitHub Pages, which cannot send them, and there is no `coi-serviceworker` shim -> `crossOriginIsolated` is false in production -> `getThreadCount()` returns 1. The header shows "single-thread" honestly. | `vite.config.ts:22-33`; `localWllama.ts:206-209`; `grep -ri coi-` -> 0 hits |
| CHANGELOG :13 "tests unitaires ... couverture élargie" | 5 test files, 161 LOC, pure helper functions only (XP maths, stderr parser, kata lookup, tree state). **Zero tests touch `llm/`, the chat, Markdown/sanitisation, IndexedDB or the PWA.** | `academy/src/**/*.test.ts`; `academy/vitest.config.ts` |

Other correctness defects found while reading:
- `localWllama.ts:73` `max_tokens: 10000` against `n_ctx: 4096` (:108) — generation can overrun the context; behaviour then depends on wllama internals (UNVERIFIED which: truncation, shift or error).
- `localWllama.ts:105-145` — the load call is copy-pasted twice for the retry instead of a helper. The retry itself (clear `cacheManager`, reload) is a genuinely useful idea: a corrupt partial download otherwise bricks the chat until the user clears site data.
- `localWllama.ts:149` `loadPromise ??=` is never reset on failure, so after one failed load every later call returns the same rejected promise -> permanent fallback replies until page reload.
- `KataScreen.tsx:147-153` — download progress is surfaced by **polling a module-level variable every 500 ms** rather than a callback/subscription.
- `ferris.ts:32-56` — `explainCode` / `reviewCode` are exported and never called (`grep` -> definitions only).
- `ferris.ts:58-83` — when the model fails, the user gets canned regex-matched answers presented as if Ferris had replied; failure is only `console.warn`ed. Silent degradation: in a product this is the wrong behaviour.
- `AppContext.tsx:119-131` — typing the first name "Nathan" unlocks all katas (hackathon easter egg shipped in v1.0.0).
- `GraalScreen.tsx:59` — reward link points to a **personal fork** (`github.com/NicolasPayneauT0132431/...`), not the Thales repo.
- `index.html:2` `lang="fr"` while the UI was translated to English; fonts are hot-linked from Google Fonts (`index.html:9-11`), which both leaks IPs and breaks the offline PWA look.

Security check: the two `dangerouslySetInnerHTML` sites (`KataScreen.tsx:419`, `:469`) are both fed through `DOMPurify.sanitize` after `marked`; user text is HTML-escaped (`:343`, `:352-354`). On a `marked` exception the kata-description path returns **raw markdown unsanitised into innerHTML** (`:94-96`) — low risk because the input is repo-generated, but it is the wrong fallback. No `eval`/`new Function`, no secrets (`sonar-project.properties` has a `<SONAR_TOKEN>` placeholder), no analytics/telemetry. Outbound network: HuggingFace (model), Google Fonts, and **learner code POSTed to play.rust-lang.org** (`rustCompiler.ts:15-35`) — irrelevant to a chat product but note it is a third-party data flow with no consent UI.

---

## 4. Process quality: CI, history, contributors

- **CI for the Academy** = `.github/workflows/academy.yml`: `npm ci` + `npm test`, then `tsc && vite build`, deploy to Pages. Triggers: **push to `main` and manual only — no `pull_request` trigger**, so Academy PRs are not tested or type-checked before merge. No lint, no e2e, no Lighthouse/PWA audit, no bundle-size check. The richer CI (`ci.yml`, `deny.yml`, `msrv.yml`, `nightly.yml`) is all for the Rust katas.
- `SECURITY.md` in full: "Not really applicable for this repository because it is only a resources storage." `sonar-project.properties` analyses `katas` only and points at a private IP (`172.17.0.1:9000`).
- **History shape** (`gh api .../commits?per_page=100` -> 51 commits total): 2025-04..07 = kata imports; then nothing until **2026-06-24, when one commit `820b8a9` "feat: kata expansion, CI, quality, security, releases v0.1.0 to v0.4.0" and one commit `20a48d9` "release: v1.0.0" arrive the same day** — i.e. five "releases" of changelog written in one drop. Commits touching `academy/` (`?path=academy`): 5 in total — 2 hackathon, 1 i18n, 2 dependabot. The CHANGELOG's PR numbers (#53, #58, #61, #64, #65) do not exist in the upstream repo (upstream PRs top out at #56 and those numbers are dependabot bumps) — they refer to the contributor's fork. The changelog is real work described against the wrong tracker.
- **Contributors** (`gh api .../contributors`): Sebastienlejeune 27 (almost all merge commits), dependabot 14, 0xPraedico 5, nicolasp-thg 3. One person wrote the Academy.
- "Pushed 2026-09-19" is a **dependabot branch push** (PR #56). Last human commit on `main`: 2026-08-07. npm dependabot PR #50 has sat open since 2026-08-10. Not archived; effectively dormant since the hackathon.
- 31 stars, 3 forks, 3 open issues (API, 2026-09-21).

"Enterprise-grade (Thales)" is not supported by the evidence. This is an internal-hackathon artefact published under the corporate org.

---

## 5. Scores (1-5)

| Axis | Score | Justification |
|---|---|---|
| maturity | **2** | One-day hackathon drop + one i18n fix; 5 commits ever touch `academy/`; dormant since 2026-08-07; deployed to Pages but no release discipline for the app. |
| code_quality | **3** | Strict TS, small readable modules, sanitised HTML, sensible try/catch around storage; offset by dead toggle, duplicated load block, polling, sticky rejected promise, a 491-line god component, no lint, no tests on anything that matters. |
| chat_ux | **2** | Streams tokens, shows download %, typing dots, Markdown bubbles. No stop/regenerate/edit/copy, no code highlighting, no conversation list, no history persistence, no model picker, stateless single-turn in practice. |
| agentic | **1** | None: no tools, no function calling, no RAG, no multi-step. The only "context injection" (`buildPrompt`) is disabled by the caller. |
| mobile_pwa | **2** | vite-plugin-pwa is configured and the SW precaches the wasm, but icons are missing, a stray manifest has a wrong `start_url`, fonts are remote, three coarse media queries, no touch/keyboard-inset handling, no Android wrapper. |

---

## 6. Liftable units

Honest framing: nothing here is "best-in-class". Two units are *correct, small and current* (wllama **v3** API, vite **8**, vite-plugin-pwa **1.x**), which has value because most public wllama examples still target the v1/v2 API. Treat them as seeds to be hardened, under Apache-2.0 attribution.

### U1 — wllama v3 engine singleton  (TAKE, then fix)
- **Path:** `academy/src/llm/localWllama.ts` — 209 LOC, of which ~110 are generic (lines 1-9, 23-56, 87-162, 206-209); the rest is Rust-kata prompt text.
- **Deps:** `@wllama/wllama` ^3.5.1 only (+ Vite's `?url` import for the wasm, line 2). No React.
- **What is good:** single lazy instance + shared `loadPromise` (no double download under React StrictMode); `loadModelFromHF` with `useCache`, `allowOffline`, `parallelDownloads: 3`; `n_gpu_layers` gated on `isSupportWebGPU()` (:110); thread count gated on `crossOriginIsolated` with a half-the-cores clamp 2..8 (:206-209); **clear-cache-and-retry on first load failure** (:122-145); capability report for the UI (`getModelInfo`, :45-52).
- **Must fix on transplant:** parameterise `MODEL`; dedupe the load block; reset `loadPromise` on failure; replace module-level `downloadProgress` + polling with a subscriber/callback; add `abortSignal`; make `max_tokens` <= remaining context; add `exit()`/unload for model switching; move it into a Web Worker-friendly wrapper if the UI thread janks (UNVERIFIED whether wllama 3.5.1 already runs fully off-thread in all modes).
- **Transplant difficulty:** **easy** — framework-free TS, one dependency, already written for Vite.
- **Why it beats writing fresh:** marginally. It saves roughly an hour of reading wllama v3 docs and encodes two non-obvious behaviours (crossOriginIsolated gate, corrupt-cache retry). wllama's own `examples/` are the more authoritative source; use this file as the second reference.

### U2 — Vite config: PWA + wasm precache + COOP/COEP + sub-path base  (TAKE as a snippet)
- **Path:** `academy/vite.config.ts` — 57 LOC.
- **Deps:** `vite-plugin-pwa` ^1.3.0, `@vitejs/plugin-react`.
- **What is good:** `globPatterns` includes `wasm` with `maximumFileSizeToCacheInBytes: 50 MiB` (:51-54) — the default 2 MiB limit silently drops the wllama wasm from the precache, which is a common first-day bug; COOP/COEP on both `server` and `preview` (:22-33); `normalizeBasePath` for GitHub Pages sub-paths (:5-19).
- **Must fix:** supply the real icon files (or fix the manifest), delete the orphan `academy/public/manifest.json`, self-host fonts, add `runtimeCaching` if any remote asset remains, and **add COOP/COEP in production** (real headers on the operator's host, or a `coi-serviceworker` shim) or multithreading never turns on.
- **Transplant difficulty:** **easy** (copy-paste config).
- **Why it beats fresh:** it does not meaningfully — it is ~15 useful lines. Worth copying only for the wasm-precache detail.

### U3 — Pairing GitHub Pages workflow  (OPTIONAL)
- **Path:** `.github/workflows/academy.yml` — 66 LOC. test -> build with `VITE_BASE_PATH` -> `deploy-pages`. Add a `pull_request` trigger if used.
- **Difficulty:** easy. **Value:** low; standard boilerplate.

### Explicitly NOT worth lifting
| Thing | Path | Why not |
|---|---|---|
| Chat UI | `academy/src/screens/KataScreen.tsx:312-325, 342-360, 396-450` | Entangled with the kata editor in one 491-line component; index-keyed list; no stop/regenerate/copy; message identity by `Date.now()` timestamp (`:316-322`). |
| "Streaming Markdown" | `KataScreen.tsx:342-350` | It is `marked.parse()+DOMPurify` on every token for every bubble. Six lines; any dedicated streaming-markdown library is better. The one correct habit to keep: sanitise, and escape user text. |
| IndexedDB persistence | `academy/src/store/progress.ts:27-65` | One object store, one key, no schema/migrations, no conversations/messages model. A chat product needs conversations + messages + model metadata stores; nothing transfers. |
| Fallback replies | `academy/src/llm/ferris.ts:58-83` | Canned regex answers masquerading as the model — an anti-pattern for a premium chat. |
| Chat CSS | `academy/src/index.css:581-740` | ~160 lines of dark-theme bubble styling tied to this app's CSS variables; trivial and not mobile-first. |

Total realistically liftable: **~130-170 lines** (U1 generic part + U2).

---

## 7. Red flags

1. **Hackathon-ware under a corporate logo.** Whole app in two same-day commits by a shared "Hackathon A4I" identity; five changelog "releases" written at once; changelog PR numbers refer to a fork. Do not read "Thales" as a quality signal.
2. **Headline feature is wired off.** Contextual mentoring is the README pitch; the caller hard-codes `skipContext = true` and the toggle is dead (`KataScreen.tsx:122, 321-323, 432`). Nobody tested the chat end to end after the last refactor (CHANGELOG :29 "restauration useKataContext" was a build fix, not a behaviour fix).
3. **PWA is not verifiably installable.** Manifest icons and `includeAssets` files are absent from `academy/public/`.
4. **Production is single-threaded** (no cross-origin isolation on GitHub Pages, no shim) — the multithread/WebGPU code paths are effectively exercised only in `vite dev`.
5. **No tests on the LLM, chat, sanitisation, storage or SW.** Academy CI does not run on pull requests.
6. **Silent degradation**: model failure -> canned answers, error only in the console.
7. **Dormant**: last human commit 2026-08-07; npm dependabot PR open since 2026-08-10; the "pushed 2026-09-19" timestamp is a bot branch.
8. **Likely AI-generated code** (`opencode.json`, `docs/superpowers/specs/`, `rewards/harness/.opencode`) with thin human review — consistent with the dead code and duplicated blocks found.
9. Minor: Google Fonts hot-link breaks offline look and leaks IPs; `lang="fr"` on an English UI; reward link to a personal fork; "Nathan" unlock easter egg.

Not found (checked): secrets, telemetry/analytics, `eval`/`new Function`, unsanitised model output in the DOM, copyleft dependencies in the chat path, giant dependencies beyond CodeMirror + chart.js (both irrelevant to the chat product).

---

## 8. Recommendation

Use `academy/src/llm/localWllama.ts` and the Workbox/COOP-COEP lines of `academy/vite.config.ts` as an attributed Apache-2.0 seed for the product's wllama engine module — about 150 lines, easy transplant, fix the six defects listed under U1/U2 on the way in. Take nothing else. For the chat UI, streaming Markdown, conversation persistence and a PWA that really installs, this repo offers no code that is better than a careful fresh write, and other candidates in this research set should be preferred for those layers.

Attribution entry to carry if U1/U2 are lifted:

```
Portions derived from ThalesGroup/rust-coding-dojo (academy/), commit 0c6340c
Copyright 2025 ThalesGroup — Licensed under the Apache License, Version 2.0
https://github.com/ThalesGroup/rust-coding-dojo — files modified; see headers.
```
