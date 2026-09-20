# adelorenzo/cora-archieve — dossier

> | | |
> |---|---|
> | **What it is** | A frozen one-day snapshot (10 commits, all 2025-12-19) of "Cora", a React 18 + Vite + Tailwind **JavaScript** chat app whose real engine is **WebLLM/WebGPU loaded from a CDN**. The wllama/WASM path is a 17-line stub that loads the 260K-parameter `stories260K.gguf` toy. Development continued in a sibling repo, `adelorenzo/cora-ai`. |
> | **Licence verdict** | MIT (`LICENSE`, "Copyright (c) 2025 Cora AI"). Copying is allowed — **conditions**: keep the copyright + permission notice in every copy or substantial portion. No NOTICE / third-party licence files exist. `web/package.json:19` says `"license": "ISC"` — a leftover `npm init` default, not a second grant; the LICENSE file governs. |
> | **Best thing to take** | `web/src/styles/themes.css` + `web/src/contexts/ThemeContext.jsx` — eight complete shadcn-compatible HSL token sets (280 LOC). Second: the dependency-free browser RAG trio (`rag-service.js`, `embedding-service.js`, `file-parser.js`, ~1,000 LOC) as a *starting skeleton*, with the fixes listed in §5. |
> | **Biggest risk** | It reads as a finished wllama + PWA + mobile product and is not one: no usable WASM model, no responsive breakpoints, a service worker that precaches a file the build does not emit, native tool calling that can never execute, a PDF worker URL that returns 404, and search queries routed through the third-party `corsproxy.io` while the README says "your data stays local". |
> | **Scores (1-5)** | maturity 1 · code_quality 2 · chat_ux 2 · agentic 2 · mobile_pwa 1 |
> | **Recommendation** | **Do not adopt as a base. Lift the theme tokens as-is; treat the RAG trio and the `[SEARCH: …]` text-protocol for small models as reference code to rewrite in TypeScript.** Nothing here helps with wllama, PWA install, or Android. |

Examined: shallow clone at `/home/edu/.cache/slm-src/adelorenzo_cora-archieve` (HEAD `0a8ea12`, 2025-12-19) plus the
GitHub API (`gh api`) and two `curl -I` checks against cdnjs on 2026-09-21. Nothing was installed, built or run
(ground rules). Runtime behaviour is therefore read from source; where a conclusion depends on a build I did not
perform, it is labelled **UNVERIFIED**.

---

## 1. Licence

- `LICENSE` is the standard MIT text, 21 lines, `Copyright (c) 2025 Cora AI`. No modifications to the grant.
- No `NOTICE`, no `THIRD_PARTY`, no `licenses/` directory. The repo vendors no third-party source: the shadcn/ui
  components under `web/src/components/ui/` (430 LOC) are the usual copy-in pattern; shadcn/ui is MIT (from
  memory; not re-checked today — UNVERIFIED) and the files carry no header either way.
- `web/package.json:19` declares `"license": "ISC"` and `"author": ""`. This contradicts the LICENSE file only
  cosmetically (it is what `npm init -y` writes). I treat LICENSE as authoritative; both are permissive anyway.
- "Cora AI" is not a registered entity I could find; the sole committer is `Adolfo Delorenzo <adelorenzo@oe74.net>`.
  For attribution, cite the repo URL and the LICENSE copyright line verbatim.

**Verdict: `conditions`.** To copy code into a private or MIT-released product: reproduce the copyright line and
the MIT permission notice alongside the copied portion (a `THIRD_PARTY_NOTICES.md` entry plus a header comment in
each lifted file is sufficient). No state-changes duty, no copyleft, no patent clause.

Runtime dependencies that would come along if you lift the RAG code (licences read from `web/package-lock.json`):
`@xenova/transformers` 2.17.2 Apache-2.0, `pouchdb` 9.0.0 Apache-2.0, `xlsx` 0.18.5 Apache-2.0, `@wllama/wllama`
2.3.5 MIT, `react` 18.3.1 MIT. Apache-2.0 deps are fine for both targets but need their own notices in a
distributed bundle.

## 2. Provenance and history

| Fact | Source |
|---|---|
| 0 stars, 0 forks, 0 issues (open or closed), not a fork, not archived, 19 MB | `gh api repos/adelorenzo/cora-archieve` |
| 10 commits, all 2025-12-19 15:53Z → 22:54Z, one author | `gh api …/commits?per_page=30` |
| `contributors` endpoint returns an empty list | `gh api …/contributors` (GitHub had not computed it, or the commit e-mail is unlinked) |
| First commit is `Initial commit: Cora AI v1.1.0` — the whole app arrived in one drop | same |
| All 10 GitHub Actions runs **failed** at the `build` job | `gh api …/actions/runs` |
| Failure cause: `actions/upload-artifact: v3` is deprecated and auto-failed | check-run annotation; `.github/workflows/ci.yml:39,76` |
| A sibling repo `adelorenzo/cora-ai` (MIT, 0 stars, 1 fork) shares the same first 10 commits and has 12 more, last push 2025-12-20 05:09Z | `gh api repos/adelorenzo/cora-ai/commits` |

The task brief says "single push"; precisely, it is ten commits pushed over seven hours of one day, then nothing.
The name ("archieve") and the sibling's history say this repo is the abandoned copy. The sibling's later commits
are titled e.g. `feat: use local wllama package for WASM on all browsers`, `feat: add WASM model selector with 4
model options`, `fix: add wasm-unsafe-eval to CSP for Safari WASM support`. I fetched the sibling's
`web/src/fallback/wllama.js` and it is still the same `stories260K` stub, so whatever those commits changed lives
elsewhere; **I did not audit the sibling** (UNVERIFIED whether it fixes anything below).

The real development history is not in git. The docs date the work to September 2025 (README: "Last Updated:
September 17, 2025"; screenshots named `proof-2025-09-18T…`) and reference a private Gitea
(`https://git.oe74.net/adelorenzo/cora/actions`, README "CI/CD Pipeline"). What was published is a squashed export.

Shape of the tree (303 files outside `.git`):

- 14,344 LOC of app source under `web/src` + entry files (`wc -l`), **0 TypeScript files**.
- 73 PNG screenshots committed (`web/*.png`, `web/playwright-screenshots/`), names like
  `proof-full-2025-09-18T04-05-05.png`, plus 13 ad-hoc root scripts (`test-scheduler-fix-final.js`,
  `debug-production.cjs`, `test-with-proof.js`…).
- 11 sprint/plan/freeze reports at the root, 12 more Markdown reports under `web/`, 8 shell scripts for
  registering Gitea runners, three Dockerfiles (`Dockerfile`, `Dockerfile.fixed`, `Dockerfile.working`).

No file contains an AI-tool attribution string (grepped for claude/copilot/cursor/chatgpt/"generated with"). The
artefact pattern — sprint "completion reports", "proof" screenshots, `-fix-final` scripts, docs that assert 100 %
results — is nonetheless characteristic of unattended agent-driven development. That is inference, not a finding.

## 3. Architecture (what the code actually is)

```
web/index.html            inline polyfills, registers /sw.js only when host is not localhost (l.70-84)
web/src/main.jsx          ErrorBoundary > AccessibilityProvider > ThemeProvider > PersonaProvider > App
web/src/App.jsx           1,245 lines, one component: all chat state, RAG, URL fetch, tool loop, settings modal
web/src/lib/
  llm-service.js   599    WebLLM via CDN import; WASM "fallback"
  function-calling-service.js 412   tool schemas + text-pattern detection
  web-search-service.js 758   Wikipedia -> SearXNG -> DuckDuckGo, all via corsproxy.io
  smart-fetch-service.js 333  URL detection in the prompt, fetch through the same proxy
  rag-service.js 478 / embedding-service.js 218 / file-parser.js 313   browser RAG
  conversation-manager.js 460 / settings-service.js 322   localStorage
  model-optimizer.js 301 / performance-*.js 713 / error-*.js 489   "monitoring"
  database/ 1,720        PouchDB schema layer — imported only by tests
web/src/hooks/ 248        useLLM / useMessages — imported by nothing
web/src/components/       shadcn ui/ + selectors, DocumentUpload, dashboards
web/public/sw.js 75       hand-written service worker
landing/  850 LOC         separate React 19 + Tailwind 4 + framer-motion marketing page
txtai/    ~600 LOC Python FastAPI RAG server — no longer referenced by any file in web/src
```

Dead code measured by import graph (`grep -rl "from '…'"`): `hooks/useLLM.js`, `hooks/useMessages.js`,
`lib/database/*` (1,720 LOC), `components/WebSearchPanel.jsx` (358), `EmbeddingDemo.jsx` (262),
`ErrorRecovery.jsx` (244), `Markdown.jsx`, `MarkdownRenderer.jsx`, `SimpleMarkdown.jsx`, `web/app.js` (252, a
pre-React vanilla version), `txtai/`. Roughly a quarter of the source is unreachable. The only `stopGeneration`
in the codebase lives in the unused `useLLM.js:119`.

## 4. README claims versus source

| README claim | What the source does | Verdict |
|---|---|---|
| "Automatic WASM Fallback — seamless degradation via wllama" | `web/fallback/wllama.js:5-7` loads `tinyllamas/stories260K.gguf`. `llm-service.js:472-479` sends only the **last message** as a raw prompt, no chat template, `nPredict` 128, and yields the whole completion at once (no streaming). | **False in substance.** It is a smoke test, not a fallback. |
| "Firefox ✅ Good — compatibility mode" | `llm-service.js:23-25` forces Firefox off WebGPU, then `:281-295` installs a fake engine that returns a canned apology echoing the prompt. | **False.** Firefox cannot chat. |
| "Mobile Safari — WASM-only, optimized UI" | No `viewport-fit`, no `safe-area-inset`, no `dvh`, no `visualViewport`, no COOP/COEP headers for wllama multi-thread (grep: zero hits in `web/src`, `vite.config.js`, `Dockerfile`). Root layout is `h-screen` (`App.jsx:838`). The only Safari-specific line is terser's `safari10: true` (`vite.config.js:22`). | **Not implemented.** |
| "Mobile Responsive — perfect adaptation 320px to 1024px" | Tailwind responsive prefixes (`sm:`/`md:`/`lg:`) in `App.jsx`: **0**. In all of `web/src`: 3 (two in the perf dashboard, one in `ui/dialog.jsx`). The single app media query enforces 44 px touch targets (`styles/accessibility.css:4`). The "10/10 passed" report (`web/MOBILE_RESPONSIVENESS.md`) tests for absence of horizontal overflow. | A single flex column that does not overflow. **Not a responsive design.** |
| "6 curated models from 135M to 8B" (table lists SmolLM2 135M, Qwen 0.5B…) | `web/src/config/models.js:18,29,40` defines **three** models: DeepSeek-R1-Distill-Qwen-7B (~5.1 GB), Llama-3.2-3B (~2.3 GB), Hermes-3-8B (~4.5 GB). The header comment says "These 4 models". Smallest download is 2.3 GB. | **README table is fiction.** |
| "Function Calling — autonomous web search for Hermes models" | See §4.1. Native tool calling is unreachable; a `[SEARCH: query]` text protocol is what runs. | Partly real, mislabelled. |
| "Web Search Integration via local SearXNG" | See §4.2. | Works only on a dev box with SearXNG on `localhost`. |
| "Local Document Search (RAG)… stored in IndexedDB" | Real: `rag-service.js`, `embedding-service.js`. PDF path broken (§4.3). | **Mostly real.** |
| "Theme System — 8 beautiful themes" | Real: `styles/themes.css:7-190`, eight classes × 19 HSL tokens; `ThemeContext.jsx` swaps the class on `<html>`. | **Real.** |
| "PWA Support — installable, offline-capable" | See §4.4. | Installable manifest exists; offline is doubtful. |
| "328+ automated tests (~90% pass rate)" | 182 `test()` calls in `web/tests/*.spec.js` × 2 Playwright projects (chromium, firefox) ≈ 364 runs; 31 vitest cases. CI runs them with `continue-on-error: true` (`ci.yml:73`) and never got that far: every run died in `build`. `web/tests/TEST_RESULTS.md` itself lists six suites "requiring fixes". | Tests exist; **no evidence they pass.** |
| "No Tracking… Your data stays local" | No analytics found (true). But every search query and fetched URL goes through `https://corsproxy.io/?` (`web-search-service.js:32,104,160,561`); runtimes load from esm.run / jsdelivr / unpkg / esm.sh. | **Misleading.** |
| "Streaming responses", personas, conversations, export | Real on the WebGPU path (`llm-service.js:367-411`, 50 ms token batching). Personas: 5 built-ins + custom (`PersonaContext.jsx`). Export: MD/TXT/CSV (`export-utils.js`, 106 LOC). | **Real.** |

### 4.1 Function calling: the native path is dead code

```js
// web/src/lib/function-calling-service.js:14-20 — every supported model is a Hermes model
this.functionCallingModels = [ 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC', … 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC' ];

// web/src/App.jsx:577-579
const isHermesModel = llmService.currentModel?.includes('Hermes');
const useManualFunctionCalling = isHermesModel; // Always enabled for Hermes
const useStandardTools = modelSupportsFunctions && shouldSearchWeb && !isHermesModel;
```

`modelSupportsFunctions` is true only for Hermes ids and `!isHermesModel` is false for exactly those, so
`useStandardTools` is always false and `tools` is always `undefined` (`App.jsx:606`). The OpenAI-style schemas,
`processFunctionCall`, and the 50-line error-message scraper in `llm-service.js:412-465` (it regex-parses WebLLM's
exception text to recover model output) never execute.

What does run is a prompt-level protocol: the system prompt tells the model to emit `[SEARCH: query]`
(`function-calling-service.js:34-68`), a regex catches it (`:75`), the app searches, then re-prompts with the
results as a user turn (`App.jsx:709-760`). Single tool, single hop, only when the model id contains "Hermes",
i.e. only for a 4.5 GB WebGPU model. The gate `shouldUseWebSearch` (`:331-341`) is a keyword list that matches
"explain", "what is", "information" — nearly any question.

For a product targeting 0.5–3 B GGUF models this text protocol is actually the right *idea* (small models are
unreliable at JSON tool calls), which is why it appears in §5 as a reference. The implementation is not reusable
as-is.

### 4.2 Web search: works on localhost, blocked or leaking elsewhere

- Default SearXNG URL is `http://searxng:8080` (`web/public/config.js:7`, `web-search-service.js:15`) — a Docker
  network hostname. This code runs **in the browser**, which cannot resolve it.
- `isLocal` only recognises `localhost`/`127.0.0.1` (`:159`), so `http://searxng:8080` is wrapped in
  `corsproxy.io`, which cannot reach a private hostname either.
- The production CSP (`Dockerfile:66`) allows `connect-src` to huggingface, esm.run, jsdelivr, unpkg,
  `en.wikipedia.org` and `api.duckduckgo.com` — **not** `corsproxy.io` and not the four public SearXNG instances.
  DuckDuckGo is only ever called *through* the proxy (`:103-106`). Net effect in the shipped container: Wikipedia
  summaries are the only search that can succeed. (Read from config; not run — UNVERIFIED at runtime.)
- When nothing returns, the service fabricates a block titled "Weather information for X (simulated result)"
  (`:413-461`) and feeds it to the model as a tool result.
- Debug residue baked into logic: `enhanceSearchQuery` auto-quotes `Jair Bolsonaro|Donald Trump|Joe Biden` and any
  two capitalised words (`:209`); `filterRelevantResults` drops results mentioning lottery/powerball/jackpot
  (`:221-229`).

### 4.3 RAG: real and self-contained, with three concrete defects

Real parts: sentence-aware chunker with word overlap (`rag-service.js:346-394`), `Xenova/all-MiniLM-L6-v2` via
transformers.js (`embedding-service.js:13,70`), vectors stored as JSON arrays in PouchDB/IndexedDB
(`rag-service.js:146-155`), brute-force cosine top-k (`embedding-service.js:180-193`), status listeners, export /
import, PDF / DOCX / XLSX / CSV / HTML parsing in the browser (`file-parser.js`). Wired into chat at
`App.jsx:481-500` (top 3 chunks, threshold 0.3, appended to the user turn).

Defects:

1. **PDF worker URL is a 404.** `file-parser.js:12` builds
   `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`. The lockfile pins
   `pdfjs-dist` 5.4.449. Checked today: `…/5.4.449/pdf.worker.min.js` → **HTTP 404**, `…/pdf.worker.min.mjs` →
   200. cdnjs is also absent from the CSP `script-src`/`worker-src`. PDF ingestion therefore cannot load its
   worker (consequence inferred from pdf.js behaviour — UNVERIFIED at runtime; the 404 is verified).
2. **Everything on the main thread.** No Web Worker; `embedBatch` is a sequential `await` loop
   (`embedding-service.js:133-135`) and `search` loads *every* chunk with `allDocs({include_docs:true})`
   (`rag-service.js:229-231`) and rebuilds `Float32Array`s per query. Fine for ten pages, janky beyond that —
   especially while wllama is also competing for the CPU.
3. **`xlsx@0.18.5` from npm.** The npm package stopped at 0.18.5; SheetJS publishes fixes only on its own CDN.
   From memory, 0.18.5 is affected by CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS) —
   UNVERIFIED today, check before shipping a parser that opens user-supplied spreadsheets.

### 4.4 PWA

- `web/manifest.json` (19 lines): name, `display: standalone`, two icons (192/512, no `maskable`, no
  screenshots, no `id`, no `scope`). It sits in `web/`, **not** `web/public/`, while `sw.js` precaches
  `./manifest.json` (`public/sw.js:3-9`). Vite only copies `public/` verbatim; an HTML-referenced file outside it
  is emitted under a hashed name. If so, `cache.addAll` rejects and the worker never installs. Supporting
  evidence: the sibling repo later added `web/public/manifest.json`. (Not built — UNVERIFIED.)
- The worker is 75 hand-written lines: cache-first for anything whose URL contains `huggingface.co`, `.gguf`,
  `mlc-ai`, `web-llm` or `.wasm`, network-first for the rest, one cache name, **no cache cleanup in `activate`**
  (`:16-18`), no versioned precache of hashed bundles, no range-request handling, no quota handling. Putting
  multi-GB model shards in the same Cache Storage bucket as the app shell is a quota-eviction risk.
- No `beforeinstallprompt` handling, no update prompt, no offline UI. Registration is gated on hostname
  (`index.html:72`), so it cannot be tested on localhost.
- Offline cannot work regardless: the inference runtimes are `import()`-ed from CDNs at runtime
  (`llm-service.js:1-3`, `fallback/wllama.js:2`), even though `@wllama/wllama` is in `dependencies`.

Use `vite-plugin-pwa` (Workbox) instead; there is nothing to take here.

### 4.5 Chat UX as built

- Input is `<input type="text">` (`App.jsx:1154`): no multiline, no Shift+Enter, no auto-grow, disabled during
  generation. **No stop button** and no abort path in the live code.
- Rendering uses the hand-rolled `SimpleMarkdownRenderer.jsx` (150 lines; comment at `App.jsx:17`: "to avoid
  dependency issues"): headings, `**bold**`, flat list items emitted as bare `<li>` without a parent list, fenced
  code without highlighting. No links, tables, nested lists, italics. `react-markdown`, `remark-gfm`,
  `rehype-highlight` and `highlight.js` are installed and unused. Upside: no `dangerouslySetInnerHTML` anywhere
  in the chat path, so no XSS from model output.
- Has: copy message, regenerate, timestamps, conversation switcher with search, export dropdown, persona and
  theme pickers, model-load progress text. No message editing, no branching, no token/s display in chat, no
  attachments in the composer (documents go through a separate modal).
- Conversations persist as one JSON blob in `localStorage` (`conversation-manager.js:24,66`) — ~5 MB ceiling,
  synchronous stringify of the full history on every message.
- "Optimal model" selection is wrong on small devices: `model-optimizer.js:88` requires size < 50 % of
  `navigator.deviceMemory` (capped at 8 GB by the spec; iOS hard-coded to 2048 MB at `:117`). On a phone no model
  qualifies, and the "Fallback to smallest model" (`:34-35`) returns `sortedModels[0]` — sorted by *priority*,
  i.e. the 5.1 GB DeepSeek-R1-7B.

## 5. Liftable units

Ordered by value. "Transplant" assumes a Vite + React + TypeScript target with Tailwind/shadcn tokens.

### 5.1 Eight-theme token set — TAKE

- **Paths:** `web/src/styles/themes.css` (192), `web/src/contexts/ThemeContext.jsx` (88); optional
  `web/src/components/ThemeSwitcher.jsx` (116).
- **Deps:** none beyond the shadcn token convention (`--background`, `--foreground`, `--card`, `--primary`,
  `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`; HSL triplets consumed as
  `hsl(var(--x))`). `ThemeContext` imports `settings-service` for two calls (`getTheme`/`setTheme`) — replace
  with your own store.
- **Transplant: easy.** CSS drops in unchanged under Tailwind 3; under Tailwind 4 move the variables into
  `@theme`/`:root` layers. The context is 40 lines of logic; add types, add `prefers-color-scheme` detection and
  a `<meta name="theme-color">` update (both missing).
- **Why it beats fresh:** eight coherent 19-token palettes are tedious to author and these are internally
  consistent. **Caveat:** contrast ratios were not measured by me; the repo's "WCAG 2.1 compliant" claim is
  unsupported — run an axe/contrast pass on Ocean, Sunset and Rose before shipping.

### 5.2 Browser RAG skeleton — TAKE AS REFERENCE, REWRITE

- **Paths:** `web/src/lib/rag-service.js` (478), `web/src/lib/embedding-service.js` (218),
  `web/src/lib/file-parser.js` (313), `web/src/components/DocumentUpload.jsx` (298).
- **Deps:** `@xenova/transformers` 2.17.2 (superseded by `@huggingface/transformers` v3 — migrate),
  `pouchdb` + `pouchdb-find` + `pouchdb-adapter-idb`, `pdfjs-dist`, `mammoth`, `xlsx`. That is a heavy bundle;
  all three parsers should be dynamic imports.
- **Transplant: moderate.** Logic is clean, singleton classes with listener arrays, no React coupling. Required
  changes: move embedding + search into a Web Worker; fix the pdf.js worker (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`);
  replace PouchDB with plain IndexedDB (`idb`) storing `Float32Array` blobs rather than JSON number arrays;
  replace `xlsx@0.18.5`; add TypeScript types.
- **Why it beats fresh:** the chunker (`rag-service.js:346-394`) handles the over-long-sentence case, the
  status/progress plumbing is complete, and the file-type matrix is already mapped. It saves a day, not a week.
  It is not best-in-class — compare against the RAG code in the other dossiers before choosing.

### 5.3 `[SEARCH: …]` text tool protocol for small models — REFERENCE ONLY

- **Paths:** `web/src/lib/function-calling-service.js:34-89, 347-409`; the continuation loop at
  `web/src/App.jsx:709-760`.
- **Deps:** none.
- **Transplant: moderate** — the loop is tangled into the 1,245-line `App.jsx` and must be re-extracted into a
  hook. Generalise to `[TOOL: name | args]`, cap hops, and make the stream suppress the marker instead of
  replacing the bubble text after the fact.
- **Why:** sub-3B GGUF models under wllama have no grammar-constrained tool calling wired here, and a bracket
  marker plus re-prompt is a pragmatic pattern. ~120 useful lines. Do **not** take `web-search-service.js`.

### 5.4 Small utilities — OPTIONAL

- `web/src/lib/export-utils.js` (106): Markdown / plain-text / CSV conversation export, zero deps. Easy. Trivial
  to write, but it is done.
- `web/src/contexts/PersonaContext.jsx` (126) + `web/src/components/PersonaSelector.jsx` (252): five personas
  with per-persona temperature, custom persona CRUD. Easy; coupled to `settings-service` (localStorage).

### Explicitly do not take

`llm-service.js` (CDN-imported runtimes, UA sniffing, exception-text scraping), `fallback/wllama.js` (toy),
`public/sw.js` and `manifest.json` (§4.4), `web-search-service.js` / `smart-fetch-service.js` (third-party proxy,
fabricated results, hard-coded names), `model-optimizer.js` (wrong on phones), `performance-monitor.js` /
`performance-optimizer.js` / `error-logger.js` (1,200 LOC of ornamental instrumentation), `conversation-manager.js`
(localStorage blob), `SimpleMarkdownRenderer.jsx`, `landing/` (850 LOC of generic Hero/Features/CTA with only 8
lines carrying a responsive prefix; React 19 + framer-motion, nothing distinctive), `txtai/` (orphaned server).

## 6. Scores

| Axis | Score | Justification |
|---|---|---|
| maturity | **1** | One day of public history, 0 users, 0 issues, every CI run red, superseded by a sibling repo within hours. |
| code_quality | **2** | Readable, commented service classes; but plain JS, a 1,245-line god component, ~25 % dead code, UA sniffing, logic patched around specific test queries, docs that contradict the code. |
| chat_ux | **2** | Streaming, copy/regenerate, personas, themes, export work on WebGPU; single-line input, no stop, toy markdown, localStorage history. |
| agentic | **2** | One tool, one hop, regex-triggered, Hermes-only; the native tool path can never run; search backend unreachable in its own container. |
| mobile_pwa | **1** | No breakpoints, no iOS handling, smallest real model 2.3 GB and WebGPU-only, WASM path is a 260K toy, service worker likely fails to install, no Android/Capacitor/TWA anything. |

## 7. Red flags

1. **README-ware.** Model table, Firefox/Safari rows, "responsive 320–1024", "328+ tests ~90 %", "WCAG 2.1
   compliant", "Production Ready" are each contradicted by the source or unsupported (§4). Treat every sentence
   in the 23 Markdown reports as a claim, not evidence.
2. **Abandoned on arrival.** This is the archive copy; `adelorenzo/cora-ai` is where the author went. Neither has
   users.
3. **Privacy claim vs. `corsproxy.io`.** User queries and fetched page contents transit a third-party proxy by
   default (`web-search-service.js:32`). A product that markets on-device privacy cannot inherit this.
4. **Fabricated tool results.** `generateFallbackResults` hands the LLM text labelled "(simulated result)" as if
   it were search output (`web-search-service.js:413-461`).
5. **Runtime code from four CDNs, unpinned by hash.** esm.run, jsdelivr, unpkg, esm.sh
   (`llm-service.js:1-3`, `fallback/wllama.js:2`); CSP needs `'unsafe-eval' 'unsafe-inline'` (`Dockerfile:66`).
   No SRI. Breaks offline and widens supply-chain exposure.
6. **Broken at the pinned versions.** pdf.js worker URL 404 (verified); CI action deprecated (verified);
   service-worker precache of a non-emitted file (UNVERIFIED).
7. **Dependency weight and hygiene.** 762 lockfile packages; `glob` and `@tailwindcss/postcss` (v4) listed as
   runtime deps next to `tailwindcss` v3; node polyfills (`buffer`, `process`, `util`, `events`) for PouchDB;
   `xlsx@0.18.5`.
8. **Repo hygiene.** 73 screenshots, 13 debug scripts, 3 Dockerfiles, runner-registration shell scripts with a
   private Gitea hostname. A `.env` was committed and removed twice; I read it at `b535ed4` and `6c039b6` — it
   contains only the placeholder `SEARXNG_SECRET_KEY=ultrasecretkey` and an empty `TXTAI_API_KEY`. **No real
   secret leaked.** `docker-compose.yml` still defaults to that placeholder key.
9. **No unsafe HTML in the chat path** (positive): the only `innerHTML` uses are the static crash screen
   (`main.jsx:37`, which does interpolate `error.message` unescaped — low risk) and the legacy `web/app.js`.
   No `eval`, no `new Function`, no telemetry endpoints found.

## 8. Bottom line for the product

The product needs wllama + GGUF, an installable PWA, a phone-first layout and an Android wrapper. This repo
contributes to none of those: its wllama usage is a placeholder, its PWA layer is weaker than
`vite-plugin-pwa` defaults, and it has no mobile layout work to copy. Its value is confined to a CSS file of
theme tokens (take, with the MIT notice) and two pieces of reference logic (browser RAG, bracket-marker tool
protocol) that should be rewritten in TypeScript inside a worker rather than transplanted. Budget: half a day to
lift themes + export utils; do not spend more here.
