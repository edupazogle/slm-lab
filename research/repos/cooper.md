# rclement/cooper — dossier

> | | |
> |---|---|
> | **What it is** | "Agent Cooper": a single-author Rust agent harness (loop + OpenAI-compatible provider + tool trait, ~2.2k LOC of Rust core) compiled to WASM, driven by a no-framework, no-build-step vanilla-JS web app (~6.1k LOC JS + 2.5k CSS) with 11 sandboxed browser tools (OPFS files, isomorphic-git, Pyodide, DuckDB-Wasm, fetch, SVG charts) and wllama 3.5.1 local inference. Also a native CLI and an axum static server that sets COOP/COEP. |
> | **Licence verdict** | **AGPL-3.0** (full text in `LICENSE`, no "or later" wording, no per-file headers, no NOTICE). **can_copy = NO** for a product that is kept private or released as MIT. Any copied file makes the combined web app a covered work: full corresponding source must be offered to every user under AGPL-3.0. Only escape: a separate licence from the sole copyright holder (107/107 commits are his, so one person can grant it). |
> | **Best thing to take** | Legally nothing, as-is. Technically the best units are `web/www/workspace-fs.js` (OPFS helpers + Safari write fallback + isomorphic-git fs shim, 519 LOC) and the `worker.js` wllama lifecycle (194 LOC). Both are worth a relicensing request; failing that, they are a specification to re-derive from the upstream MIT docs, not code to paste. |
> | **Biggest risk** | Licence contamination. One pasted file from this repo converts the operator's whole browser bundle to AGPL. Second: it is not a PWA (no manifest, no service worker) and the agent loop has no round cap and rejects non-string tool arguments, which small models emit constantly. |
> | **Scores (1-5)** | maturity 2 · code_quality 4 · chat_ux 3 · agentic 4 · mobile_pwa 2 |
> | **Recommendation** | **Do not copy. Email the author for an MIT/Apache grant on 3 files; otherwise use it only as a design reference** and take the same capabilities from the MIT/Apache/MPL upstreams it vendors (wllama, isomorphic-git, Pyodide, DuckDB-Wasm, marked, DOMPurify). |

Examined: shallow clone at `/home/edu/.cache/slm-src/rclement_cooper` (HEAD `9d1de26`, 2026-07-16) plus the GitHub
API and one `curl -I` against the live demo on 2026-09-21. Nothing was built or run (ground rules: no installs,
no services), so every statement about runtime behaviour is read from source and is marked UNVERIFIED where the
source alone cannot settle it.

---

## 1. Licence

`LICENSE` is the unmodified GNU AGPL v3 text (`LICENSE:1-2`: "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3,
19 November 2007"; §13 "Remote Network Interaction" at `LICENSE:540`). README confirms it
(`README.md:222-226`: "Licensed under GNU Affero General Public License v3.0 (AGPLv3) / Copyright (c) 2026 -
present Romain Clement"). GitHub's detector agrees (`license.spdx_id: AGPL-3.0`).

- No `NOTICE`, no `THIRD_PARTY`, no SPDX or copyright header in any first-party file
  (`grep -rn "SPDX\|Copyright"` over `*.rs *.js *.toml *.html` outside `vendor/` returns nothing).
- None of the three `Cargo.toml` manifests has a `license =` field.
- No "or any later version" statement anywhere, so treat as **AGPL-3.0-only**.
- The licence was added late: commit `ae72dea` "chore: add agpl-3.0 license" is dated 2026-07-09, eight weeks
  after the first commit (`bfbc816`, 2026-05-14). Earlier commits had no licence at all (all rights reserved),
  so there is no older permissive snapshot to fall back on.

### Verdict: NO (for the operator's stated options)

What taking code from this repo would oblige the operator to do, concretely:

1. **The whole combined work becomes AGPL-3.0.** AGPL §5(c) requires that a work "based on" the program be
   licensed, as a whole, under the AGPL. Pasting `workspace-fs.js` or `worker.js` into a Vite + React bundle
   makes that bundle a derived work. It cannot then be released as MIT, and it cannot be kept closed.
2. **Serving the web app is already distribution.** A browser app ships its JS/WASM to every visitor, which is
   "conveying" object code under §6. The operator would owe every visitor the complete corresponding source
   (their own React app, build scripts and all), independently of §13.
3. **§13 closes the server-side loophole too.** If any modified Cooper code ran behind an API, every remote
   user must be "prominently offer[ed]" the source (`LICENSE:542-547`). There is no SaaS exemption.
4. **The Android app is the same.** An APK wrapping the same bundle (TWA/Capacitor) is a conveyed copy; source
   offer, licence text and copyright notices must accompany it. App-store terms that restrict redistribution
   are a known practical conflict with (A)GPL (general knowledge, UNVERIFIED for the operator's store).
5. **Mandatory hygiene if they accepted AGPL anyway:** keep the copyright notice, ship the full licence text,
   mark modified files with a change notice and date (§5(a)), and publish source at no charge.

What is still allowed without any obligation: reading the code, learning the architecture, and re-implementing
the same ideas against the upstream libraries. Copyright does not cover the design (a JS-callback tool bridge,
an OPFS fs shim for isomorphic-git, a two-stage stop button). It does cover the expression, including the
long explanatory comments, so a "rewrite" done with the file open in the next pane is not a clean one.

**The realistic way to get this code:** the repo has exactly one contributor (`gh api .../contributors` →
`rclement 107`), no CLA and no outside PRs (all 5 PRs are his own). He holds 100% of the copyright and can
grant a separate MIT/Apache licence on specific files with one email. That is cheap to ask and is the only
route consistent with the operator's "copy with attribution, not inspired-by" rule.

### Vendored third-party code (all permissive, all takeable from upstream instead)

`web/www/vendor/README.md:8-14` lists versions and licences; each directory carries its licence file, which I
opened: marked 18.0.5 (MIT), DOMPurify 3.4.11 (Apache-2.0; upstream is dual Apache-2.0/MPL-2.0), wllama 3.5.1
(MIT, "Copyright (c) 2024 Xuan Son NGUYEN"), Pyodide 0.29.4 (MPL-2.0), duckdb-wasm 1.29.0 (MIT). These are not
Cooper's code; take them from npm, not from this repo. `vendor/update.sh` (the re-vendoring script, including
the esbuild step that folds `apache-arrow` into duckdb's ESM entry) **is** Cooper's and is AGPL.

---

## 2. What is actually there

### Shape

| Part | Paths | LOC | Role |
|---|---|---|---|
| Core | `core/src/agent.rs`, `core/src/tools.rs`, `core/src/providers/*` | 2,172 (about 60% is inline tests) | loop, `Tool`/`Provider` traits, OpenAI SSE wire types + stream accumulator |
| WASM bindings | `web/src/lib.rs` | 421 | `WasmAgent`, `JsTool`, `JsBridgeProvider`, event DTOs |
| Web UI | `web/www/*.js`, `index.html`, `style.css` | 6,079 JS + 520 HTML + 2,485 CSS | vanilla ES modules, no framework, no bundler |
| Server/CLI | `src/*.rs` | 2,159 | clap CLI, YAML config, sessions, native tools, axum `cooper web` |
| Test infra | `mock-server/`, `e2e/`, `tests/cli/` | 641 + 1,110 + 748 | scripted SSE mock, headless-Chromium e2e, CLI integration |
| Vendored binaries | `web/www/vendor/` | ~91 MB (duckdb 71 MB, pyodide 12 MB, wllama 7.7 MB) | committed to git |

Total first-party: 15,972 lines (`wc -l`). No TypeScript anywhere; the JS has no JSDoc types and no type-check.

### Data flow (browser)

`app.js` (main thread) → `postMessage` → `worker.js` (module worker) → `WasmAgent.run_prompt` (Rust/WASM)
→ `agent_loop_stream` → provider → either HTTP SSE (`openai_completions.rs`) or the JS bridge to wllama
→ tool calls come back into JS via `js_sys::Function` → results return to Rust → events stream to the UI as JSON.

The loop itself is 80 lines (`core/src/agent.rs:152-231`) and is a conventional tool-calling loop:

```rust
loop {
    let (mut result, finish_reason) = provider.complete_stream(messages.as_slice(), &tool_schemas, handler).await?;
    ...
    for tc in tool_calls {
        let tool_call_result = match tool_registry.get(&tc.name) {
            Some(tool) => tool.execute(&tc.arguments).await,
            None => Err(format!("tool not found: {}", tc.name)),
        };
```

Tools run sequentially; an unknown tool is reported back to the model as an error rather than aborting
(tested: `agent.rs` has 20 tests against a scripted `MockProvider`).

### README claims versus source

| Claim (`README.md`) | Status | Evidence |
|---|---|---|
| Agent loop is Rust compiled to WASM, client-side (`:30-32`) | TRUE | `web/src/lib.rs:277-339` calls `agent::agent_loop_stream`; `worker.js:21` imports `./pkg/cooper_web.js` |
| 11 browser tools (`:66-74`) | TRUE, all 11 exist | `workspace-tools.js:31,51,69,94,133`; `python-tool.js:52`; `duckdb-tool.js:102`; `chart-tool.js:10`; `media-tools.js:19,49`; `builtin-tools.js:9` |
| wllama GGUF in-browser "with a curated model catalog" (`:78-83`) | TRUE but the catalog is **3 entries, 22 lines** | `local-models.js:6-22`: LFM2.5-230M Q8_0, LFM2.5-230M Q4_K_M, Qwen3-0.6B Q8_0. No size/RAM metadata, no capability flags, no chat-template hints |
| "accelerated by WebGPU when available" (`:40`) | PARTLY: Cooper only *detects* and shows a badge | `settings.js:312-341` requests an adapter and renders "GPU offloading supported". No `n_gpu_layers` or backend option is passed in `worker.js:71-80`; offload is left to wllama's defaults. UNVERIFIED whether wllama 3.5.1 offloads by default |
| "no API key, no network call, ever" (`:40-41`) | OVERSTATED | model is fetched from huggingface.co (`local-models.js:10`); isomorphic-git is imported **at runtime from esm.sh** (`workspace-fs.js:470-471`); Pyodide packages come from jsDelivr (`python-tool.js:12`); git falls back to `cors.isomorphic-git.org` (`workspace-fs.js:443`) |
| COOP/COEP for SharedArrayBuffer (`:92-96`) | TRUE, **server headers only** | `src/web.rs:271-279`. Verified live: `curl -I https://agent-cooper.vercel.app/` returned `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: require-corp`, `cache-control: no-store` on 2026-09-21 |
| Same-origin git CORS proxy (`:95-96`) | TRUE | `src/web.rs:61-143`, 18 unit tests in the file |
| GitHub OAuth, token kept client-side (`:144-146`) | TRUE | `src/web.rs:197-247` does only the code exchange; `git-accounts.js:116-125` stores tokens in `localStorage` |
| Session persistence | TRUE | `sessions.js:1-60`, IndexedDB store holding the WASM-exported `Vec<Message>` JSON |
| "isomorphic-git" listed as a tool runtime (`:69`) | TRUE but **not vendored**, unlike the other five libs | `vendor/README.md:8-14` has no isomorphic-git row |

Not README-ware: everything advertised has a real implementation, and the screenshots are generated by the
e2e harness against the real WASM build (`e2e/examples/screenshots.rs`, 145 LOC).

### Tests, types, CI

- Rust unit + integration tests: roughly 137 `#[test]`/`#[tokio::test]` attributes across `core`, `src`,
  `mock-server`, `tests/cli` (counted with `grep -c`; e.g. `agent.rs` 20, `src/tools.rs` 19, `src/web.rs` 18,
  `openai_completions.rs` 15).
- 10 browser e2e tests (`e2e/tests/*.rs`) driving headless Chromium over CDP via `chromiumoxide`, with a
  scripted OpenAI-compatible SSE mock (`mock-server/`, YAML fixtures). The Pyodide and DuckDB tools run for
  real in those tests. The one test that exercises real wllama inference is `#[ignore]`d
  (`e2e/tests/local_provider.rs:18`, 153 MB download, 900 s timeout), so **local inference is not covered by CI**.
- CI (`.github/workflows/cicd.yml`): fmt check → clippy → tests with llvm-cov → e2e → release build (linux,
  macOS) → Docker → Vercel. Last 5 runs all `success` (latest 2026-09-17 on the feature branch).
- Small CI defect: the build job uploads `target/release/agent-cooper` (`cicd.yml:144`) but the binary is
  named `cooper` (`Cargo.toml` `[[bin]] name = "cooper"`), so the artifact is likely empty. UNVERIFIED (not run).
- **Zero JS tests, zero JS typing.** All 6k lines of browser code are covered only indirectly via e2e.

### History

- 107 commits, one author, 2026-05-14 → 2026-07-16 on `main` (about nine weeks). The "pushed 2026-09-17"
  timestamp is branch `feat/anthropic-messages-api-provider` (`1e6b5c5`, open PR #5), not `main`.
  `main` has been idle for two months.
- 1 star, 0 forks, 0 releases, version `0.0.0` in every manifest, 1 open issue (the PR). No external users
  are visible.
- Conventional-commit messages, small focused commits, fix-ups for layout regressions. None of the 100
  most recent commit messages contains an AI co-author trailer (checked via the API). The comment density
  and one reference to "`scripts/validate_palette.js` in the dataviz skill" (`chart-common.js:13-14`) suggest
  AI-assisted authoring; that is an inference, UNVERIFIED, and irrelevant to the licence.

---

## 3. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | **2** | Nine weeks old, v0.0.0, 1 star, no releases, single author, `main` idle since July; CI is green and a demo is deployed, which keeps it off 1. |
| code_quality | **4** | Clean separation (target-agnostic core / wasm shim / JS tools), unusually honest comments explaining *why*, fmt + clippy + coverage + real-browser e2e; loses a point for untyped, untested JS and the defects in section 5. |
| chat_ux | **3** | Good typed timeline (reasoning / tool / response / chart blocks, collapsible, durations, token usage, stick-to-bottom autoscroll, two-stage stop); but no message edit/regenerate/copy, no code highlighting, full markdown re-parse on every chunk, a single "Run" textarea, developer-tool aesthetics rather than premium. |
| agentic | **4** | Real multi-round tool loop with 11 working sandboxed tools, per-session tool selection, templated system prompt, AGENTS.md injection, repo-scoped working dir; no round cap, no tool approval, string-only arguments, sequential tools, no context compaction. |
| mobile_pwa | **2** | Responsive CSS is real (drawers, bottom sheet, `100dvh`, `env(safe-area-inset-*)` at `style.css:2207-2383`), but there is **no web manifest, no service worker, no offline shell, no install prompt** (`grep -i "serviceworker\|manifest"` over `index.html` and all JS: no hits) and `Cache-Control: no-store` on everything defeats caching of a 91 MB vendor tree. |

---

## 4. Liftable units

All units below are **AGPL-3.0 and therefore blocked** unless the author grants another licence. They are
listed because the task is to identify what is worth asking for, and because each one documents a real
browser pitfall that the operator will otherwise rediscover.

### 4.1 OPFS workspace + isomorphic-git fs shim — the best unit in the repo

- **Paths:** `web/www/workspace-fs.js` (519), `web/www/opfs-writer-worker.js` (27). Agent-facing wrappers:
  `web/www/workspace-tools.js` (167).
- **Dependencies:** none for the OPFS half (pure platform API). The git half needs `isomorphic-git` (MIT) and
  a CORS proxy.
- **Why it beats writing fresh:** three things that cost days to find:
  1. Safari has OPFS but no `createWritable()`; sync access handles only open inside a Worker. The file
     detects this and routes main-thread writes through a 27-line worker, posting the structured-cloneable
     `FileSystemFileHandle` (`workspace-fs.js:115-191`).
  2. A complete `fs.promises` shim for isomorphic-git over OPFS with Node-style `.code` errors
     (`ENOENT`, `ENOSYS`) so isomorphic-git's own retry/mkdirp logic works (`workspace-fs.js:306-441`).
     I know of no maintained MIT package that does this; LightningFS is IndexedDB-backed, not OPFS.
     (UNVERIFIED: I did not search npm for alternatives in this pass.)
  3. Path hygiene for model-supplied paths: `..` rejected, `.` dropped, depth-limited tree listing
     (`workspace-fs.js:65-76`, `284-304`).
- **Transplant difficulty: easy.** Plain ES module, no DOM, works in window and worker. In Vite: replace the
  runtime `import("https://esm.sh/isomorphic-git@1.27.1")` (`:470`) with an npm dependency and change
  `new Worker("opfs-writer-worker.js")` to `new Worker(new URL(..., import.meta.url), {type:"module"})`.
  Add types by hand.

### 4.2 wllama worker lifecycle + OpenAI-shaped completion bridge

- **Paths:** `web/www/worker.js` (194); model list `web/www/local-models.js` (22); GPU badge
  `web/www/settings.js:303-341`.
- **Dependencies:** `@wllama/wllama` 3.5.1 (MIT). The Rust/WASM agent is optional for this unit: the
  `localCompletion(requestJson, onChunk)` contract (`worker.js:97-128`) is a plain OpenAI
  `chat.completions` request in, `chat.completion.chunk` JSON strings out.
- **Why it matters:** encodes four non-obvious wllama facts, each with the reason in a comment:
  - the bundle reads `document.baseURI`, which does not exist in a worker → stub it (`worker.js:27-33`);
  - an instance cannot load a second model ("Module is already initialized") → `exit()` and recreate, and
    null the instance after a failed load (`:52-90`);
  - default `n_ctx` is 1024, unusable for tool schemas → 16384 (`:72-76`);
  - `cache_prompt: true` so tool rounds do not re-prefill from token zero (`:111-115`);
  - omit `tools` entirely when empty, because an empty array still triggers tool formatting in some chat
    templates (`:107-109`).
  Plus abort semantics: a user stop resolves normally so the partial turn stays in history (`:121-127`), with
  main-thread escalation to `worker.terminate()` (`app.js:586-614`).
- **Transplant difficulty: easy to moderate.** The wllama half is ~100 lines and framework-free. Moderate
  only because it is interleaved with `WasmAgent` construction; the operator would extract
  `ensureLocalModel` + `localCompletion` and drive them from a TS loop.
- **Honest caveat:** the same knowledge is in wllama's own MIT docs/examples and in the sibling dossier
  `wllama.md`. The value here is the consolidated checklist, which is an idea, not protected expression.
  The catalog is too small to be worth anything (3 models, no metadata).

### 4.3 Rust agent core + WASM bridge

- **Paths:** `core/src/agent.rs` (1,015; loop is `:152-231`, the rest is tests), `core/src/tools.rs` (32),
  `core/src/providers/openai_wire.rs` (646), `core/src/providers/openai_completions.rs` (459),
  `web/src/lib.rs` (421).
- **Dependencies:** `wasm-bindgen`, `wasm-bindgen-futures`, `js-sys`, `futures-channel`, `minijinja`,
  `chrono`, `reqwest`, `web-time`, `serde`; toolchain `rustup target add wasm32-unknown-unknown` + `wasm-pack`.
- **Why it is interesting:** `JsBridgeProvider` (`web/src/lib.rs:119-187`) solves a real borrow problem
  (a `'static` JS closure feeding a borrowed handler) with an unbounded channel drained by
  `futures_util::select!`, then flushes queued chunks after the promise resolves. `ChatStreamAccumulator`
  (`openai_wire.rs:244-395`) handles both `reasoning` and `reasoning_content` deltas (`:209-211,304-306`),
  index-keyed tool-call argument fragments, and measures reasoning versus response time separately.
- **Transplant difficulty: hard, and not worth it.** A Vite + React + TS app gains nothing from an 80-line
  loop living in Rust: it adds a Rust toolchain, a `wasm-pack` build step, a JSON-string boundary on every
  event, and the two defects in section 5 (string-only args, no round cap). A TypeScript loop is the same
  80 lines with none of that. The author's reason for Rust is sharing the core with his CLI, which the
  operator does not have. **Skip regardless of licence.**

### 4.4 Tool-run / reasoning timeline

- **Paths:** `web/www/app.js:165-482` (block model, streaming, tool-result routing) and `:711-740`
  (history replay through the same code path); styles in `web/www/style.css` (2,485, not separable by section
  without reading it all).
- **Dependencies:** none (DOM API), `marked` + `DOMPurify` via `markdown.js` (12).
- **Why it is good:** one block model for live events and replayed history (`app.js:473-480,717-740`);
  `<details>` blocks for reasoning and tools with a one-line preview and a pulsing icon only while active;
  inline renderers (`render_chart`, `show_image`, `show_svg`) get an *additional* block while the raw tool
  call stays inspectable, with the late tool result routed back to the right block via
  `pendingToolResultBlock` (`:294-417`); persistence is message-level, not delta-level (`:484-497`), and
  "done" is only shown after the IndexedDB write commits (`:543-550`).
- **Transplant difficulty: hard.** It is imperative DOM mutation around module-level mutable state
  (`current`, `roundBlocks`, `pendingToolResultBlock`). None of it survives a move to React; only the data
  model and the UX decisions carry over, and those are ideas. **Re-implement; do not port.**

### 4.5 Sandboxed tool adapters (Pyodide, DuckDB-Wasm, charts, SVG)

- **Paths:** `web/www/python-tool.js` (103), `web/www/duckdb-tool.js` (179), `web/www/chart-common.js` (85)
  + `chart-render.js` (522) + `chart-tool.js` (34), `web/www/svg-sanitize.js` (70),
  `web/www/media-tools.js` (75) + `media-render.js` (35), `web/www/vendor/update.sh`.
- **Dependencies:** `pyodide` 0.29.4 (MPL-2.0), `@duckdb/duckdb-wasm` 1.29.0 (MIT) + `apache-arrow`.
- **Why it is good:** `python-tool.js:28-46` mounts OPFS into Pyodide with `mountNativeFS("/mnt/opfs")`,
  `chdir`s into it so relative writes land in the workspace, preloads `micropip`, and `syncfs()`es after each
  run; `duckdb-tool.js` explains why `registerFileHandle` across nested workers fails and uses
  `registerFileBuffer` instead (`:32-46`), enables `autoinstall_known_extensions` for httpfs (`:80-84`), and
  makes BigInt JSON-safe (`:93-100`). `chart-render.js` is a dependency-free SVG bar/line/scatter renderer
  with a table toggle, tooltips and `textContent`-only labelling.
- **Transplant difficulty: easy** for python/duckdb/svg-sanitize (self-contained modules with a
  `{schema, execute(argsJson) → Promise<string>}` contract); **moderate** for the chart renderer (DOM-imperative,
  tied to this app's CSS variables; in a React app Recharts or visx is the normal choice).
- **Product fit:** weak. These are coding/data-analyst agent tools. DuckDB-Wasm is 71 MB on disk and Pyodide
  12 MB before packages; on a phone running a 150-640 MB GGUF they compete for the same memory. A premium
  consumer chat does not need them at launch.

### 4.6 COOP/COEP handling — nothing to lift

`src/web.rs:271-279` is two static axum header layers. The equivalent for the operator is three lines in
`vite.config.ts` (`server.headers`) plus host config (Vercel/Netlify/nginx). Cooper has **no service-worker
COI shim**, so it offers nothing for hosts where headers cannot be set (GitHub Pages) and nothing for a PWA.
The `eh` fallback reasoning for DuckDB when `crossOriginIsolated` is false (`duckdb-tool.js:9-27`) is the
only reusable thought. UNVERIFIED: whether `worker.js` degrades to single-thread wllama cleanly when not
isolated; the code never checks `crossOriginIsolated` itself and relies on wllama.

---

## 5. Red flags

1. **AGPL-3.0.** Covered in section 1. This alone decides the outcome.
2. **Non-string tool arguments kill the turn.** Arguments are typed `HashMap<String, String>`
   (`core/src/agent.rs:78`, `core/src/tools.rs:31`) and parsed with
   `serde_json::from_str::<HashMap<String, String>>(&tool_call_acc.arguments)?` (`openai_wire.rs:377-379`).
   A model that emits `{"depth": 2}` or `{"files": ["a.csv"]}` produces a serde type error, which propagates
   out of `finish()` and fails the whole round instead of returning a tool error to the model. The schema
   type even advertises `Number` and `Boolean` (`core/src/tools.rs:7-11`). Cooper works around this by
   making every parameter a string, including JSON-encoded arrays (`chart-common.js:32-38`,
   `duckdb-tool.js` `files`). Sub-1B models, the operator's target, are the most likely to violate it.
   (Read from source; not executed.)
3. **No round cap, no tool approval, no context management.** `loop { ... }` at `agent.rs:178` has no
   iteration limit (`grep "max_iter\|max_rounds\|max_steps"` → nothing). A small model stuck calling the same
   tool runs until the user hits Stop. `FinishReason::Length` is a hard error (`agent.rs:195`), and there is
   no truncation/compaction against the 16k context.
4. **Plausible stored XSS in the Workspace view.** File names are interpolated into `innerHTML`:
   `workspace.js:498` (`<img ... alt="${name}">`), `:504` (`title="${name}"`), `:587`
   (`for "${entry.name}"`). Names come from model tool calls and cloned repos; `toSegments`
   (`workspace-fs.js:65-76`) rejects only `..`, and `validEntryName` (`:53-58`) only slashes. A file named
   `a" onerror="...".png`, opened by the user, would run script in an origin whose `localStorage` holds
   provider API keys (`settings.js:41`) and GitHub OAuth tokens with `repo` scope (`git-accounts.js:125`,
   `README.md:138-139`). Not exploited or executed here; flagged from source. By contrast the chat path is
   done properly: markdown goes through DOMPurify (`markdown.js:9-12`), SVG through an allowlist sanitizer
   (`svg-sanitize.js`), chart labels through `textContent` (`chart-render.js:28`). No `eval`/`new Function`.
5. **Constrained SSRF in the git proxy when hosted publicly.** `src/web.rs:86` builds
   `https://{rest}` from the request path with no host allowlist; the only guard is that the path ends in
   `/info/refs?service=git-upload-pack` or `/git-upload-pack` (`:61-65`). Any internal HTTPS host is
   reachable with that suffix, and arbitrary headers except a short skip-list are forwarded (`:93-109`).
   Low severity (https only, fixed suffix) but the live demo exposes it.
6. **Supply chain at runtime.** isomorphic-git is loaded from `esm.sh` with no SRI and no pin beyond the
   version string (`workspace-fs.js:470-471`), in a worker that holds the GitHub token (`:483-487`). The
   default git fallback sends clone traffic, including `Authorization` for private repos, through the public
   `cors.isomorphic-git.org` when `/git-proxy` is absent (`:451-457,511,517`).
7. **Secrets in `localStorage`**, readable by any script in the origin: API keys and OAuth tokens. Normal for
   BYO-key browser apps, but it raises the cost of item 4.
8. **Performance:** `appendResponse` re-parses and re-sanitizes the whole accumulated message on every
   streamed chunk (`app.js:290-291`), O(n²) over a long answer; acceptable at 10 tok/s on wllama, visible on a
   fast remote provider. `Cache-Control: no-store` on all assets (`web.rs:279`) means the 35 MB DuckDB wasm
   and 7.6 MB wllama wasm re-download on every load where used.
9. **Minor correctness bug:** `edit_file` uses `current.replace(old_text, new_text)`
   (`workspace-tools.js:127`); with a string pattern JS still expands `$&`, `$1`, `$$` in the replacement, so
   code containing `$` sequences is silently mangled.
10. **Repo weight:** ~91 MB of vendored binaries committed to git (`du -sh web/www/vendor/*`); GitHub reports
    `size: 22217` KB compressed.
11. **Telemetry: none found.** `analytics.js` (361) is a local dashboard over the device's own IndexedDB
    (`analytics.js:1-4`); no beacon, no third-party script tag. External hosts contacted are only those in
    item 6, Hugging Face, jsDelivr, and the GitHub API.
12. **Not abandoned, but not alive either:** one author, two months without a `main` commit, one open
    feature branch. Expect no support.

---

## 6. Recommendation for the operator

1. **Do not copy any first-party file from this repo** into the product while the intent is "private or MIT".
   Record it in the project's licence ledger as AGPL / reference-only so a delegate does not paste from it.
2. **Send one relicensing request** to the author for `web/www/workspace-fs.js`,
   `web/www/opfs-writer-worker.js` and `web/www/worker.js` (740 lines total) under MIT or Apache-2.0. He is
   the sole copyright holder, so a yes is legally sufficient; keep the written grant.
3. **Without a grant**, build the same capabilities from the permissive upstreams (`@wllama/wllama` MIT,
   `isomorphic-git` MIT, `pyodide` MPL-2.0, `@duckdb/duckdb-wasm` MIT, `marked` MIT, `dompurify`
   Apache-2.0/MPL-2.0), using section 4.2's checklist as a test plan (worker `document` stub, one model per
   instance, `n_ctx`, `cache_prompt`, omit empty `tools`, abort-as-success). Facts about library behaviour are
   not copyrightable; the wording of Cooper's comments is.
4. **Do not adopt the Rust/WASM loop** under any licence. Write the loop in TypeScript, with JSON-typed
   arguments, a round cap and a per-tool approval hook, which are exactly the three things this one lacks.
5. **Look elsewhere for PWA and premium chat UX.** Cooper contributes nothing to manifest/service-worker/
   offline/install, and its UI is a developer console, not a consumer product.
