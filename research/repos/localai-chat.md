# LMLK-seal/LocalAI-Chat — dossier

```
WHAT      Chrome MV3 extension (vanilla ES modules, no build) that loads a user-dropped GGUF into wllama 3.4.x and chats offline;
          adds doc attachments (pdf.js / mammoth) and a "<file path> block -> diff -> Apply -> Undo" workspace on the File System Access API.
LICENCE   MIT (LICENSE read, "Copyright (c) 2026 SchwartZ"). Copy verdict: YES, condition = keep that copyright + MIT text with any copied file.
TAKE      The pure-logic half of src/file-renderer.js (path sanitiser, <file>-block + code-fence parsers, fence->file promotion, LCS line diff)
          plus src/file-history.js (IndexedDB undo ring). ~450 LOC, zero dependencies.
RISK      It is a 3-day, single-author, web-UI-uploaded code drop with no tests, no CI, no package.json. Two README features are verifiably broken
          (GGUF metadata parser throws on 3/3 real models; Regenerate duplicates the user turn). Nothing here is PWA/mobile.
SCORES    maturity 2 · code_quality 3 · chat_ux 3 · agentic 2 · mobile_pwa 1
VERDICT   Do not adopt as a base. Cherry-pick ~4 small dependency-free modules; take wllama itself from npm, not from this repo's lib/.
```

Analysed: shallow clone at `/home/edu/.cache/slm-src/LMLK-seal_LocalAI-Chat`, HEAD `c4ae38a` (2026-06-26). Date of analysis 2026-09-21.
All `file:line` references are relative to the repo root. Anything not checked by reading code or running a command is marked **UNVERIFIED**.

---

## 1. Licence

- `LICENSE` is the unmodified MIT text, `Copyright (c) 2026 SchwartZ` (LICENSE:1-3). GitHub API reports `license.spdx_id = MIT`.
- No `NOTICE`, no `THIRD_PARTY_LICENSES`, no per-file headers in `src/*.js`. README ends with "MIT — see source files" but the source files carry no licence header; the `LICENSE` file is the only grant. That is sufficient.
- Third-party code vendored as minified blobs in the repo (README "Third-party licenses" table is the only attribution):

| File | Size | Upstream licence | Licence text shipped in repo? |
|---|---|---|---|
| `lib/wllama.min.js` + `wasm/wllama.wasm` | 301,532 B + 7,308,965 B | MIT (ngxson/wllama; bundles llama.cpp, MIT) | No banner, no licence file |
| `lib/pdfjs/pdf.min.js`, `pdf.worker.min.js` | 320 KB + 1.09 MB | Apache-2.0 | Banner comment present in both files ("Copyright 2023 Mozilla Foundation") |
| `lib/mammoth.browser.min.js` | 642 KB | BSD-2-Clause | No banner, no licence file |

**Verdict for the operator: `yes` (can_copy), with the standard MIT condition.** For any file or substantial portion copied from `src/`:
keep `Copyright (c) 2026 SchwartZ` and the MIT permission notice somewhere in the product (a `THIRD_PARTY_NOTICES` file is enough; works for a private product and for an MIT release alike). No copyleft, no state-changes requirement, no patent clause.

Do **not** copy the `lib/` and `wasm/` blobs from this repo: they ship without the MIT/BSD licence texts their upstreams require, and their provenance is slightly off (section 6). Install `@wllama/wllama`, `pdfjs-dist`, `mammoth` from npm, where the licence files travel with the package.

Provenance caveat (inference, not proof): the FIX #n / TIER n comment style, the 11 KB changelog for a 3-day-old project, and the upload pattern strongly suggest LLM-generated code. That does not weaken the MIT grant from the author, but it means "who really wrote this" is not answerable. For ~450 LOC of generic parsing logic this is a low practical risk.

---

## 2. What the repo actually is

### Shape and history

- GitHub API (2026-09-21): 0 stars, 0 forks, 0 issues (open or closed), 0 PRs, 1 contributor (`LMLK-seal`, 32 contributions), created 2026-06-23, one release `LocalAI-Chat-v1.20` with `localai-chat-v1.2.0.zip` (2.89 MB, 8 downloads).
- All 32 commits are GitHub web-UI operations: `Add files via upload`, `Create 1`, `Delete src/1`, `Update README.md`. First commit 2026-06-23, last commit on `main` 2026-06-26. There is no development history to read: the code arrived finished, in folder-sized uploads.
- `pushed_at` is 2026-07-06 but `main` (the only branch) has no commit after 2026-06-26. Unexplained — **UNVERIFIED** (possibly a deleted branch or tag push).
- Version drift: manifest says `1.1.1` (manifest.json:4), README badge says `1.1.0`, the release is tagged `v1.20` / zip `v1.2.0`.
- No `package.json`, no lockfile, no bundler, no TypeScript, no JSDoc type-checking, no tests, no `.github/` (API returns 404), no linter config.

### Size (wc -l)

| File | LOC | Role |
|---|---|---|
| `src/app.js` | 1596 | God-object controller: DOM wiring, drop zone, model load UI, settings, file tree, slash dropdown, snippet editor |
| `src/chat-manager.js` | 1056 | Conversations, persistence (`chrome.storage.local`), rendering, streaming, fork / edit / regenerate, export / import |
| `src/file-renderer.js` | 862 | `<file>` block + code-fence parsing, LCS diff, file cards, Apply-all panel, diff modal |
| `src/model-loader.js` | 728 | wllama wrapper, GGUF header parser, fallback prompt templates |
| `src/workspace.js` | 356 | File System Access API: tree, read/write/delete, `@workspace` / `@file:` mentions, 5 s polling watcher |
| `src/document-parser.js` | 288 | PDF, DOCX, DOC, CSV/TSV, HTML, RTF, JSON -> text |
| `src/prompt-library.js` | 286 | Built-in slash commands + user snippets |
| `src/model-store.js` | 172 | GGUF blobs in IndexedDB |
| `src/file-history.js` | 167 | Undo snapshots in IndexedDB |
| `src/markdown.js` | 161 | Hand-rolled escape-first Markdown renderer |
| `src/token-counter.js` | 125 | chars/4 token heuristic + budget fitter |
| `src/settings.js` | 63 | Defaults + `chrome.storage.local` |
| `background.js` | 55 | MV3 service worker: open/focus the chat tab |
| `newtab.html` / `newtab.css` | 342 / 1216 | UI shell and theme |

Total first-party: ~7,470 lines. Everything else is vendored binaries.

### Architecture

```
background.js (SW) --opens--> newtab.html --<script type=module>--> src/app.js
  app.js ── ModelLoader (model-loader.js) ── dynamic import("../lib/wllama.min.js") + chrome.runtime.getURL("wasm/wllama.wasm")
         ── ChatManager (chat-manager.js) ── markdown.js, file-renderer.js -> file-history.js, document-parser.js, token-counter.js
         ── Workspace (workspace.js)       ── showDirectoryPicker, handle persisted in IndexedDB
         ── modelStore (model-store.js), promptLibrary, Settings
```

- Inference runs on the page's wllama instance (wllama spawns its own blob: worker). No server, no network: CSP `connect-src 'self'` (manifest.json:33). I grepped all first-party code for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `http(s)://`: only doc-comment URLs in model-loader.js. **No telemetry, confirmed by grep.**
- Consequence of that design: **there is no model download at all.** The only way in is drag-and-drop / file picker of a local `.gguf` (app.js:157-272). No Hugging Face fetch, no progress-of-download, no resume, no sharded GGUF handling. For a PWA/Android product this is the single most important missing piece, and wllama's own `ModelManager`/cache already does it better (see sibling dossier `wllama.md`).

---

## 3. README claims vs. code

| README claim | Reality | Evidence |
|---|---|---|
| "GGUF metadata display — architecture · params · quantization, parsed from the binary header" | **Broken on real models.** I ran the repo's own `parseGgufHeader` under Node 22 against three local GGUFs (gemma-2-2b-it Q4_K_M, Llama-3.2-3B-Instruct Q4_K_M, qwen2.5-1.5b-instruct q4_k_m). 3/3 threw `GGUF string length out of bounds`. | model-loader.js:369 caps arrays at `lenLo < 10000` but then does **not skip** the array payload; `tokenizer.ggml.tokens` (151,936 entries at KV index 17 in the Qwen file) leaves `offset` pointing into string data, the next `readString()` throws (model-loader.js:234-236) and *all* already-parsed keys are lost. The early-exit at :276 needs `i > 30`, never reached (Qwen has 26 KVs). The failure is swallowed at :437-442, so the UI silently shows only "NNN MB". |
| "Streaming output with live tokens-per-second" | Implemented. tok/s is counted per `onData` chunk, i.e. chunks not tokens — approximately right. | model-loader.js:602-627, chat-manager.js:767-778 |
| "Model persistence — IndexedDB blob cache" | Implemented, works as described by reading. Stores the `File` itself as a Blob, so every cached model is a second full copy on disk. | model-store.js:52-72, app.js:394-418 |
| "Memory budget indicator … based on available JS heap" | Implemented but **measures the wrong thing**: `performance.memory.jsHeapSizeLimit - usedJSHeapSize`. WASM linear memory and GPU buffers are not JS heap, so the green/amber/red verdict says nothing about whether a model fits. An instrument that cannot fail. | model-store.js:156-168, app.js:1511-1533 |
| "Configurable … CPU threads 1–16" | Passed to wllama (model-loader.js:488-492), but the manifest declares no `cross_origin_embedder_policy` / `cross_origin_opener_policy`, which Chrome requires for an extension page to be cross-origin isolated and get `SharedArrayBuffer`. Grep for `cross_origin`, `crossOriginIsolated`, `SharedArrayBuffer` in manifest + src: 0 hits. So wllama most likely runs single-threaded and the slider is a no-op. **UNVERIFIED at runtime** (extension not executed). | manifest.json:32-34 |
| "WebGPU" (`n_gpu_layers` default 99) | The vendored wllama build does contain a WebGPU backend (strings `isSupportWebGPU`, `WebGPU not available on this browser…` in lib/wllama.min.js). Whether offload works was not run. **UNVERIFIED at runtime.** | model-loader.js:490-497, settings.js:24 |
| Loading progress bar | **Cosmetic.** A 150 ms `setInterval` "heartbeat" oscillates the bar "so it always looks alive"; wllama's `progressCallback` does not fire for local File loads (the code says so itself). | app.js:284-299, model-loader.js:464-468 |
| "Token-aware context management" | Implemented as a chars/4 (CJK chars/1.5) heuristic. Two holes: (a) images live on `m.images`, not in `content`, at the point `fitToTokenBudget` runs, so the 768-token image allowance in token-counter.js:57-63 is never applied (chat-manager.js:691-692 fits first, builds multimodal content second); (b) `minKeep: 2` keeps the last two messages even when they exceed the budget, so one 100-page PDF in a 4096 context still overflows. | token-counter.js:93-125, chat-manager.js:687-692 |
| "PDF (up to 100 pages)" | Implemented, but `_parsePdf` is the one parser that does **not** call `_truncate`, so the 100,000-char cap applied to every other format is skipped for PDFs. | document-parser.js:86-113 vs :268-276 |
| "DOCX / DOC — mammoth.js" | DOCX yes. `.doc` is not mammoth: it scrapes printable-ASCII runs >= 4 chars out of the binary. README's Limitations table admits this; the feature table does not. | document-parser.js:123-147 |
| "Regenerate" | **Bug:** `_regenerate` truncates to `slice(0, idx)` — which keeps the preceding user message — then calls `send(text)`, which pushes a *new* user message. Every regenerate duplicates the user turn in history and in the prompt. | chat-manager.js:1020-1042 with :652 |
| "💾 Save" on code blocks | **Bug:** the base64 payload is built from the *HTML-escaped* code (whole source is escaped at markdown.js:21, base64 taken at :41). The handler only base64-decodes (chat-manager.js:471), so `a < b && c` is written to disk as `a &lt; b &amp;&amp; c`. The file-card Apply path is not affected (it uses raw text). | markdown.js:21,41; chat-manager.js:467-479 |
| "Undo — snapshot-based, up to 10 levels per file" | Implemented for Apply and Apply-all. **Not for auto-apply:** with the `autoApply` setting on, files are written with no snapshot, including files whose *name was guessed from the prompt*. Silent overwrite, no undo. | chat-manager.js:802-827 (no `snapshotBeforeWrite`) vs file-renderer.js:438, :679 |
| "Diff preview — side-by-side diff modal" | It is a unified line diff with 3-line context collapse, not side-by-side. LCS is O(n·m) memory, capped at 800 lines, after which no diff is shown. | file-renderer.js:258-300, :712-862 |
| "Build from source: `bash scripts/setup-libs.sh`, `scripts/make-icons.py`, `scripts/package-extension.sh`" | **No `scripts/` directory exists.** Troubleshooting also points at it. README-ware for this section. | `ls` of repo root |
| "Full ARIA roles, aria-live, skip-link, reduced motion, prefers-contrast" | Plausible: 34 `aria-` attributes in newtab.html, `@media (prefers-reduced-motion)` at newtab.css:729, `prefers-contrast` at :1160. Undermined by 11 native `prompt()/confirm()/alert()` calls for rename, snippet edit, save-as, delete. | newtab.html, newtab.css, grep |
| "No telemetry" | True (grep, plus CSP). | manifest.json:33 |

---

## 4. Code quality notes

Good:
- Small, single-purpose ES modules with long explanatory headers. Easy to read in one sitting.
- Defensive path handling for model-written files: `sanitizeWorkspacePath` rejects absolute paths, drive letters and any `..` that would climb above the root (file-renderer.js:25-49); unsafe blocks render with a disabled "Unsafe path" button and are skipped by Apply-all (:395-403, :668-673). The File System Access API additionally refuses `..` as a name, so this is belt and braces.
- Markdown renderer is safe by construction: it HTML-escapes the *entire* input first (markdown.js:21) and then emits only its own tags; link hrefs are allow-listed to `https?:|mailto:|#|/` (markdown.js:156-159); fence language is restricted to `\w*` (:59). I found no injection path through `renderMarkdown`.
- Streaming re-render is throttled with `requestAnimationFrame` + 50 ms floor (chat-manager.js:716-744) and scroll is pinned only when the user is within 150 px of the bottom (:555-578). Both are the right ideas.
- Per-conversation storage keys + small index instead of one monolithic blob (chat-manager.js:19-100).

Bad:
- `cancelAnimationFrame(rafScheduled)` is passed a **boolean**, not a rAF handle (chat-manager.js:783-786, :831-834). Harmless only because the target element gets replaced afterwards.
- Unescaped interpolation into `innerHTML` of user-controlled strings: attached file name `${d.name}` (app.js:915), cached model name `${m.name}` (app.js:1467-1472), snippet trigger/description (app.js:1242, :1407-1410 — body is escaped, trigger/description are not), error message into `document.body.innerHTML` (app.js:1595). Inside the extension the MV3 CSP (`script-src 'self'`) blocks inline handlers, so it is not exploitable *there*. **Copied into a normal web app without a strict CSP it becomes DOM XSS via a crafted filename.** Do not lift `app.js` rendering code.
- Every IndexedDB helper opens a new connection per call and never closes it (model-store.js:28-44, file-history.js:16-33, workspace.js:32-41).
- `_workspaceId` is the folder *name* (file-history.js:42-45): two workspaces both called `src` share undo history. The comment admits it.
- Vision image bytes are stored as `Uint8Array` on the message and then persisted through `chrome.storage.local` (JSON-serialised). After a reload `img.bytes` is no longer a typed array, so regenerate/edit with images after restart likely fails. **UNVERIFIED at runtime**, inferred from chat-manager.js:541, :594, :87-92.
- `app.js` is a 1,596-line class with ~60 methods and direct `getElementById` wiring: not reusable in React in any form.
- Manifest over-asks: `host_permissions: ["file:///*"]` and `tabs` are declared (manifest.json:6-14) but no first-party code touches `file://` URLs; `web_accessible_resources` exposes `src/*`, `lib/*`, `wasm/*` to `<all_urls>` with `use_dynamic_url: false` (manifest.json:35-50), which makes the extension trivially fingerprintable by any website.
- Zero tests. The one function I exercised (`parseGgufHeader`) failed on every real input, which is what no-tests looks like.

---

## 5. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | **2** | 3 days of web-UI uploads by one author in June 2026, no commits since, 0 stars/issues/PRs, no tests/CI/package.json, version numbers disagree in three places. |
| code_quality | **3** | Readable, modular, well commented, sensible security posture in the two places it matters (Markdown, file paths); but untyped, untested, with at least four verifiable bugs and unescaped `innerHTML` sinks in app.js. |
| chat_ux | **3** | Feature list is genuinely long (fork, edit-and-resend, per-message delete, search, slash autocomplete, export/import, tok/s, ctx bar, vision attach), but no syntax highlighting, no math, flat lists only, native `prompt()/confirm()` dialogs, fake progress bar. Not "premium". |
| agentic | **2** | One pattern only: model emits whole files in `<file path>` blocks -> card -> diff -> Apply -> Undo. No tool calling, no loop, no partial edits/patches, no command execution. Good fit for what a 1–3B model can do, but it is not an agent. |
| mobile_pwa | **1** | Chrome desktop extension. No web app manifest, no offline service worker, no install flow, hard dependency on `chrome.storage` / `chrome.runtime.getURL` and on `showDirectoryPicker`. Only concession: a 900 px breakpoint that turns the sidebar into a drawer (newtab.css:677-685). |

---

## 6. Vendored wllama — provenance check

- `wasm/wllama.wasm` sha256 `a3e827b9…2a72a30`, 7,308,965 B — **byte-identical** to `@wllama/wllama@3.4.1` `esm/wasm/wllama.wasm` (jsDelivr package metadata hash `o+gnufw1Nv0bBh7uixMORvY2bSWwYkOKeR2LF7KnKjA=` = same digest in base64). 3.4.1 was published 2026-05-30 (npm registry).
- `lib/wllama.min.js` is 301,532 B; upstream 3.4.1 `esm/index.min.js` is 301,510 B. A byte diff shows exactly one contiguous change: an inserted `spec_type:r.spec_type,` (22 bytes). It matches neither 3.4.0 nor 3.4.1 on npm. Origin of that build: **UNVERIFIED** (hand patch, or a build from an intermediate upstream commit).
- npm `latest` is 3.6.1 (2026-08-27). The vendored copy is three releases behind and carries no licence banner.

Conclusion: nothing to lift from `lib/` or `wasm/`. Use the npm package.

---

## 7. Liftable units

Ranked by value to a Vite + React + TypeScript PWA running wllama.

### 7.1 Small-model file-edit protocol (pure logic) — TAKE
- **Paths:** `src/file-renderer.js` lines 1-300 (`sanitizeWorkspacePath`, `parseFileBlocks`, `stripFileBlocks`, `parseCodeFences`, `guessFilenameFromPrompt`, `promoteCodeFencesToFileBlocks`, `langFromPath`, `computeLineDiff`, `DIFF_LINE_CAP`) + the matching system prompt in `src/settings.js:5-17`.
- **LOC:** ~300 + 13.
- **Dependencies:** none (pure string functions; one import of `file-history.js` used only by the DOM half).
- **Transplant:** **easy.** Copy, add types, export. The DOM half (lines 302-862: `renderFileBlock`, `buildApplyPanel`, `buildDiffPreviewModal`, ~560 LOC of `document.createElement`) must be rewritten as React components — use it as the behavioural spec (button states, unsafe-path handling, context-collapse at 3/6 lines), not as code.
- **Why it beats writing fresh:** the fence-promotion fallback (CHANGES.md v1.1.1) encodes a real observation about 0.5–3B models — they ignore "use `<file>` blocks" and emit code fences — and handles it with filename guessing, a "guessed" badge and rename-before-apply. That is product knowledge, already debugged once (see the shadowing bug note at chat-manager.js:330-336).
- **Caveat:** replace `computeLineDiff` with the `diff` npm package (jsdiff, BSD-3) if files over 800 lines matter; the LCS table here is O(n·m) memory.

### 7.2 Undo ring for applied edits — TAKE
- **Path:** `src/file-history.js` (167 LOC). Dependencies: IndexedDB only.
- **Transplant:** **easy.** Fix two things on the way in: key the workspace by a stored UUID instead of `rootHandle.name` (:42-45), and reuse one DB connection. Make auto-apply call `snapshotBeforeWrite` (the original forgets, chat-manager.js:823-827).
- **Why:** correct handling of "file did not exist before" (`content: null` -> undo deletes) and FIFO eviction at 10 per path are exactly the fiddly parts.

### 7.3 Attachment-to-text parser — TAKE with edits
- **Path:** `src/document-parser.js` (288 LOC). Dependencies: `window.pdfjsLib`, `window.mammoth` globals.
- **Transplant:** **easy.** Swap the two globals for `import * as pdfjs from "pdfjs-dist"` and `import mammoth from "mammoth"`, point `workerSrc` at Vite's `?url` import. Add the missing `_truncate` call on the PDF path. Drop `_parseLegacyDoc` (ASCII scraping produces garbage on most `.doc`).
- **Why:** seven formats with sane caps (100 pages, 100k chars, 200 CSV rows) and a quoted-field CSV splitter in under 300 lines; saves an afternoon, not more. Runs on the main thread — move to a worker for large PDFs on a phone.

### 7.4 Context budget fitter — TAKE (as a pre-flight only)
- **Path:** `src/token-counter.js` (125 LOC), pure.
- **Transplant:** **easy.** Fix the image-accounting order (count from `m.images`), and make the over-budget case explicit instead of silently keeping `minKeep` messages. With wllama in hand you can call its real tokenizer for the final check; keep the heuristic for instant UI feedback (ctx bar).

### 7.5 Local-file model cache — OPTIONAL
- **Path:** `src/model-store.js` (172 LOC). IndexedDB only.
- **Transplant:** **easy**, but only relevant to a "bring your own .gguf" path. For downloaded models use wllama's built-in cache/ModelManager (OPFS-backed, see `wllama.md`); do not route multi-GB downloads through IndexedDB blobs. Drop `availableMemoryBytes()` (measures JS heap, not WASM/GPU).

### 7.6 Patterns worth re-implementing, not copying
- rAF + 50 ms throttled Markdown re-render and 150 px scroll pinning (chat-manager.js:555-578, :716-744).
- Fork / edit-and-resend / `_orig` metadata on user messages (chat-manager.js:632-651, :855-874). Fix the regenerate duplication when re-implementing.
- Fallback chat templates + family detection (model-loader.js:45-181, :679-711, ~170 LOC): only reached when the GGUF has no embedded template; wllama ships a Jinja engine, so this is a last-resort table. Low priority.
- `@workspace` / `@file:"path with spaces"` mention resolver (workspace.js:326-355).

### Do NOT take
- `parseGgufHeader` (model-loader.js:216-386): verified broken. `@huggingface/gguf` (MIT) or wllama's own metadata does this properly.
- `src/markdown.js`: safe, but functionally far below `react-markdown`/`marked` + DOMPurify + a highlighter; has the escaped-Save bug.
- `src/app.js`, `newtab.html`, `newtab.css`: extension-shaped, unescaped `innerHTML`, not componentised.
- `src/workspace.js` as the storage layer for mobile: `showDirectoryPicker` availability outside desktop Chromium is limited (Firefox/Safari: no; Android Chrome: **UNVERIFIED**, check before relying on it). For a PWA/Android target, back the same interface with OPFS and keep this file only as the desktop-Chromium adapter.
- `lib/`, `wasm/`: see section 6.

---

## 8. Red flags

1. **Effectively abandoned code drop.** All code landed 2026-06-23..26 via web uploads; nothing since. No issue tracker activity to learn from. Expect zero upstream fixes.
2. **No tests, and the first function tested failed 3/3.** Treat every "implemented" in section 3 that is not marked as run as read-only evidence.
3. **README-ware in the build section**: three referenced scripts do not exist; the repo cannot be "built from source" as documented (it happens not to need a build, because the blobs are committed).
4. **Instruments that cannot fail**: fake heartbeat progress bar; JS-heap "memory budget"; swallowed GGUF parse error. Do not copy these UX elements.
5. **Latent XSS if transplanted**: unescaped filenames into `innerHTML` (app.js:915, :1467) are only contained by the extension CSP.
6. **Data-loss path**: `autoApply` writes guessed filenames with no snapshot (chat-manager.js:823-827).
7. **Binary provenance**: `wllama.min.js` differs from every npm release checked by one 22-byte insertion; 8.7 MB of minified third-party code committed without licence files for wllama and mammoth.
8. **Over-broad manifest**: unused `file:///*` host permission, `tabs`, and web-accessible `src/*` for `<all_urls>`.
9. **Repo weight**: 6.7 MB GIF + 8.7 MB blobs in git for ~7.5k lines of first-party code.
10. **No secrets, no eval, no `new Function`, no network calls** found in first-party code (grep). `'wasm-unsafe-eval'` in CSP is required by any WASM runtime and is not a finding.

---

## 9. Recommendation

Use this repo as a **parts bin for the "edit files with a tiny model" feature**, nothing else. Concretely: copy `file-renderer.js:1-300`, `file-history.js`, `document-parser.js`, `token-counter.js` (~880 LOC) into a `vendor/localai-chat/` folder with the MIT notice, convert to TypeScript, fix the five defects listed above on the way in, and write the tests the original never had (the GGUF-parser result shows why). Build the chat shell, Markdown rendering, model download/cache, PWA and Android layers from stronger sources covered in the sibling dossiers.

### Method note
Read in full: LICENSE, manifest.json, background.js, README.md, CHANGES.md (first 150 lines), PRIVACY.md (first 40 lines), and `src/` files model-loader, model-store, markdown, workspace, file-history, chat-manager, file-renderer, document-parser, token-counter, settings; `app.js` and `prompt-library.js` were read in targeted ranges plus grep. One experiment was run: the repo's `parseGgufHeader` imported unmodified into Node 22 and fed the first 64 KB of three GGUF files under `/mnt/e/VF/gguf-models` (read-only, < 2 s; scratch script deleted afterwards). Hash comparison used `sha256sum` locally against jsDelivr package metadata and one 300 KB download of upstream `index.min.js` (deleted afterwards). The extension itself was never loaded into a browser, so every runtime behaviour above is from code reading unless stated.
