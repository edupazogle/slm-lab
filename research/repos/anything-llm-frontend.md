# Mintplex-Labs/anything-llm — frontend / chat-UX liftability dossier

| | |
|---|---|
| **What it is** | Full-stack RAG/agent chat product (Node server + collector + Vite/React 18 **JavaScript** frontend, ~138.5k LOC in `frontend/src`, 723 files). Plus `anythingllm-embed`: a 2.7k-LOC standalone chat bubble widget. |
| **Licence verdict** | **MIT** (root `LICENSE`, "Copyright (c) Mintplex Labs Inc."). Copy = **yes, with conditions**: keep the copyright + permission notice with every substantial portion. **Exclude `open-computer/` (AGPL-3.0)** and the provider logos in `frontend/src/media/`. |
| **Best thing to take** | The streaming-chat "spine": `utils/chat/index.js` event reducer + `hooks/useAutoScroll.js` + `utils/chat/markdown.js`/`purify.js` + thought-tag parsing. The single server seam is `Workspace.multiplexStream`; a wllama adapter that emits the same 4 event types makes the UI run with no server. |
| **Biggest risk** | It is a server product. 22 of 95 chat files import `@/models/*` (REST), mobile layout is decided by **user-agent sniffing** (`react-device-detect`, 129 uses) not CSS, there is **no TypeScript and zero frontend tests**, and the PWA is a manifest with one icon and a push-only service worker. Lifting the whole chat container is a rewrite, not a transplant. |
| **Scores** | maturity 5 · code_quality 3 · chat_ux 4 · agentic 4 · mobile_pwa 2 |
| **Recommendation** | Take ~1.5k LOC of surgical units (below) and the embed widget's architecture as the skeleton; do **not** fork the frontend. |

Clones read: `/home/edu/.cache/slm-src/Mintplex-Labs_anything-llm` (HEAD `da66855`, shallow) and
`/home/edu/.cache/slm-src/Mintplex-Labs_anythingllm-embed` (HEAD `11245fa`). All paths below are relative to those roots.
Date of review: 2026-09-21.

---

## 1. Licence

- `LICENSE` (root, 1,073 bytes): "The MIT License / Copyright (c) Mintplex Labs Inc." — standard MIT text, unmodified. `package.json:7` and `frontend/package.json:4` both say `"license": "MIT"`. GitHub API reports `license=MIT`.
- There is **no NOTICE or third-party-licences file** anywhere in the repo (`find -iname "NOTICE*" -o -iname "THIRD*"` returns nothing).
- **`open-computer/LICENSE` is GNU AGPL v3.** This subfolder ("Give your agent its own machine", `open-computer/README.md`) sits inside the MIT repo under a different, copyleft licence. Nothing in it is relevant to a chat frontend; **do not copy anything from `open-computer/`**. AGPL code in a product would force the whole combined work (including a network-served one) to be released under AGPL.
- `embed/` and `browser-extension/` are git submodules (`.gitmodules`). The embed repo has its own `LICENSE`: MIT, same copyright holder. GitHub API: `license=MIT`, 182 stars, pushed 2026-09-16.
- `TERMS_SELF_HOSTED.md` is a privacy/terms statement, not a licence restriction; section 5 restates "The AnythingLLM core is provided under the MIT License".

**Verdict: conditions (light).** For a private or MIT-released product:
1. Reproduce the MIT copyright + permission notice for the copied portions (a `THIRD_PARTY_NOTICES` entry or a header comment per vendored file; MIT does not require stating changes, but do it anyway so provenance survives).
2. Do not take `open-computer/**`.
3. Do not take `frontend/src/media/**` provider logos (OpenAI, Anthropic, etc. — trademarks, not covered by the code licence) nor the AnythingLLM name/logo (`frontend/public/anything-llm-*.png`, `favicon.png`).
4. Transitive dependency caveat — **Piper TTS**: `@mintplex-labs/piper-tts-web` declares MIT in its `package.json` but its GitHub repo (a fork of `diffusionstudio/vits-web`) has **no LICENSE file; GitHub reports `license=none` for both fork and parent**. The Piper phonemizer WASM (`piper_phonemize.wasm`, referenced at `frontend/vite.config.js:13`) is built on espeak-ng, which is **GPL-3.0** (GitHub API, espeak-ng/espeak-ng). Whether shipping that WASM blob makes a distributed app a GPL combined work is a legal question I cannot settle — treat in-browser Piper as **licence-UNVERIFIED** and keep it out of the MVP.
5. `frontend/public/fonts/PlusJakartaSans.ttf` — the font is published under OFL elsewhere, but no licence file ships with it here. UNVERIFIED in-repo; get it from the upstream source instead.

## 2. Architecture (what is actually there)

```
anything-llm/
  server/      Express + Prisma (SQLite), LLM/vector providers, agents (aibitat), MCP, telemetry
  collector/   document parsing service
  frontend/    Vite 4 + React 18 + Tailwind 3 + react-router 6, plain JS (+ JSDoc), yarn
  embed/       submodule -> anythingllm-embed (the website bubble)
  open-computer/  AGPL agent VM (unrelated)
```

Frontend facts, measured:
- 723 files under `frontend/src`; `.js`+`.jsx` total **138,522 lines**; **0 `.ts`/`.tsx` files**. `jsconfig.json` only provides the `@/` alias. `flow-bin` is a devDependency but types are JSDoc comments only.
- Chat surface: `frontend/src/components/WorkspaceChat/**` — 95 JS/JSX files, **12,706 lines**.
- REST layer: `frontend/src/models/*.js` — 3,978 lines of `fetch` wrappers against `API_BASE`.
- i18n: `i18next` + `react-i18next`, **31 locale folders**, English source `locales/en/common.js` = 1,963 lines; CI has a `check-translations.yaml` workflow and `verifyTranslations.mjs`.
- Tests: 62 `*.test.js` files in the repo — **49 in `server/`, 13 in `collector/`, 0 in `frontend/`**. `run-tests.yaml` runs jest; `lint.yaml` runs eslint on all three packages.
- Activity (GitHub API today): 66,262 stars, 7,372 forks, 318 open issues, last push 2026-09-19, created 2023-06-04. Last 30 commits span 2026-09-08 → 09-17 from 8+ authors. Contributors: timothycarambat 1,488, shatfield4 420, angelplusultra 104, then a long tail — healthy, but a two-person core.

### The streaming data flow (the part that matters)

1. `ChatContainer/index.jsx:100-149` — on submit, pushes a user message and a `{pending:true, animate:true, userMessage}` placeholder into `chatHistory`, sets `loadingResponse`.
2. `ChatContainer/index.jsx:340-354` — an effect calls **`Workspace.multiplexStream({workspaceSlug, threadSlug, prompt, chatHandler, attachments})`**. This is the *only* place the chat turn touches the network.
3. `models/workspace.js:161-232` — `fetchEventSource` POST to `/workspace/:slug/stream-chat`; each SSE message is `JSON.parse`d and handed to `handleChat`. Abort is a window event (`ABORT_STREAM_EVENT`) → `AbortController.abort()` + a synthetic `{type:"stopGeneration"}` event.
4. `utils/chat/index.js:7-223` — `handleChat` is a reducer over event types: `textResponseChunk` (append by `uuid`), `finalizeResponseStream` (close + metrics), `textResponse`, `abort`, `statusResponse`, `stopGeneration`, plus server-only ones (`agentInitWebsocketConnection`, `modelRouteNotification`, `imageGenerationPending`).
5. `ChatHistory/PromptReply/index.jsx:87-93` renders the live message; `HistoricalMessage/index.jsx:323,343` renders closed ones. Both: `DOMPurify.sanitize(renderMarkdown(text))` into `dangerouslySetInnerHTML`.

Consequence for the operator's product: a wllama adapter only has to emit

```js
handleChat({ uuid, type: "textResponseChunk", textResponse: piece, sources: [], close: false, error: false });
handleChat({ uuid, type: "finalizeResponseStream", close: true, chatId, metrics });
```

and honour `ABORT_STREAM_EVENT`. The reducer, placeholder logic, stop button and auto-scroll then work unchanged. That is the real value here: a battle-tested event contract, not the components.

### README claims checked against source

| Claim (README.md) | Found? |
|---|---|
| "drag-and-drop uploads and source citations" (l.77) | Yes — `ChatContainer/DnDWrapper/index.jsx` (483 l., `react-dropzone`), `ChatHistory/Citation/index.jsx` (402 l.), `SourcesSidebar/`. Both need the server (parse/embed endpoints). |
| "Custom Embeddable Chat widget … Docker version only" (l.75) | Yes — separate repo, built JS copied to `frontend/public/embed/`. |
| TTS "PiperTTSLocal - runs in browser" (l.152) | Yes — `utils/piperTTS/index.js` (256 l.) + `worker.js` (217 l.), Web Worker + `onnxruntime-web`. Genuinely client-side. |
| STT "Native Browser Built-in" | Yes — `react-speech-recognition` in `PromptInput/SpeechToText/` (413 l.). Chrome's Web Speech API sends audio to Google; not on-device. |
| Telemetry opt-out | Server only: `server/models/telemetry.js:50-51` (PostHog, skipped when `DISABLE_TELEMETRY=true`). **No telemetry SDK in the frontend or the embed** (`grep posthog frontend/` = nothing). |
| In-browser LLM inference | **None.** `grep -r "wllama\|webllm\|transformers.js" frontend/` returns nothing. Every model runs behind the server. |
| PWA / installable | Partial, see section 4. Not claimed in the README. |

## 3. Chat UX review (focus areas)

**Streaming rendering.** Full re-parse of the whole message with markdown-it on every chunk (`PromptReply/index.jsx:91`, no memoisation or throttle on the live message; `PromptReply` is `memo`'d so only the streaming row re-renders). Fine at server token rates with short answers; with a 4k-token answer it is O(n²) parsing on the same main thread — acceptable if wllama runs in its worker, but worth a `requestAnimationFrame` batch. Notably the **embed** fixed a streaming flicker that the main app still has: `embed src/utils/chat/markdown.js:49-61` disables `lheading` because a lone `-`/`=` line arriving mid-stream flips the previous paragraph into an `<h2>` and back ("the dominant cause of the visible size jump"). The main `markdown.js` does not disable it.

**Auto-scroll — the best small unit in the repo.** `hooks/useAutoScroll.js` (159 l.): follow/un-follow model driven by wheel + touch direction, a per-frame rAF pin *only while the last message is streaming* (l.89-100), a 30-frame pin after load because "markdown, citations, and images below the fold keep resizing the content" (l.38-41), and re-engage only when scrolling *down* into the bottom 40px zone so an upward scroll is never snapped back (l.109-113). Every one of these is a bug people hit when writing this fresh. Only dependency: `Appearance.get("disableAutoScroll")` (a localStorage getter).

**Markdown + code.** `utils/chat/markdown.js` (129 l.): markdown-it 13 + highlight.js 11 + a hand-written KaTeX plugin (`plugins/markdown-katex.js`, 245 l., with currency-safe `$` heuristics) + code-block header with a delegated copy button (`components/WorkspaceChat/index.jsx:187-198`). Code blocks are HTML strings with Tailwind classes baked in (`max-w-[65vw]`, `bg-stone-800`) — works, but it is string templating, not components; no line numbers, no wrap toggle, no language auto-detect, and `import hljs from "highlight.js"` pulls **all ~190 languages** (the embed uses a curated `staticHljs`, `embed src/utils/chat/hljs.js`, 88 l. — take that one).

**Reasoning / thinking UI.** `ChatHistory/ThoughtContainer/index.jsx:65-76` builds open/close/complete regexes over a keyword list (`<think>`, `<thinking>`, …) so partial tags during streaming are handled; `renderThoughtMarkdown` (`markdown.js:96-129`) normalises the sloppy 4-space list indentation reasoning models emit. Directly useful for Qwen3/DeepSeek-R1-distill GGUFs in wllama. `ChainOfThought` + `StatusResponse` (502 l. combined) render a collapsible activity chain with timing.

**Prompt input.** `PromptInput/index.jsx` (559 l.): auto-growing textarea, custom 100-entry undo/redo stack (l.24, 57-58, 199-245), image paste → attachment (l.256-300), per-thread draft persistence (`hooks/usePromptInputStorage.js`, 128 l., with a guard against a debounced write resurrecting a just-submitted draft), stop-generation button, slash-command + agent tools menu. It reads the textarea by `document.getElementById(PROMPT_INPUT_ID)` from the parent (`ChatContainer/index.jsx:102-103`) and communicates via `window` CustomEvents — a deliberate re-render optimisation, but global-DOM coupling means **one chat per page**.

**Attachments / drag-drop.** `DnDWrapper/index.jsx` (483 l.) is welded: `System.checkDocumentProcessorOnline()` (l.59), `Workspace.parseFile` (l.239), `Workspace.embedParsedFile` (l.368), context-window budgeting from the server (l.222-224). The liftable part is the *presentation*: `PromptInput/Attachments/index.jsx` (247 l., no model imports) and the `Attachment` typedef (`DnDWrapper/index.jsx:20-30`, base64 `contentString` — maps cleanly to a multimodal GGUF).

**Citations.** `Citation/index.jsx` (402 l.) groups chunks by source, shows similarity %, opens a modal/sidebar; mobile gets `SourcesSidebar/MobileCitationModal/`. No REST imports, but it imports three PNG logos from `@/pages/Admin/Agents/**` (l.15-17) and `@/components/lib/Modal`. Only relevant once the product has in-browser RAG.

**Thread + workspace sidebar.** `components/Sidebar/**` 1,424 l. Every list, rename, fork, delete and drag-reorder (`react-beautiful-dnd`, deprecated upstream — UNVERIFIED date) is a REST call. Hard to lift; the IndexedDB-backed equivalent has to be written anyway.

**Model/provider settings.** `components/LLMSelection/**` + `pages/GeneralSettings/**` — 40-odd provider forms posting env keys to the server. Nothing here applies to "pick a GGUF and download it". `ChatContainer/WorkspaceModelPicker/index.jsx` (155 l.) is the only piece whose *shape* (inline picker above the chat) is worth imitating.

**Theming.** Dark-first. `index.css` (1,192 l.) defines 177 `--theme-*` custom-property references under `:root` and `[data-theme="light"]` (l.9, l.108); Tailwind maps them (`tailwind.config.js:51-60`) and adds a custom `light:` variant (l.296). `hooks/useTheme.js` (86 l.) handles system/light/dark with a `matchMedia` listener. But the light theme is also patched by overriding utility classes globally:

```css
/* frontend/src/index.css:210 */
[data-theme="light"] .text-white { color: var(--theme-text-primary); }
```

and components carry **1,013** `light:` overrides next to hard-coded dark colours (`bg-zinc-900 light:bg-white`, `ChatContainer/index.jsx:488`). Any component lifted brings this dual system with it. Take `useTheme.js`, not the CSS.

**i18n.** Solid and liftable as a pattern (`i18n.js`, 21 l.), but the 1,963-line English bundle is 90% admin/settings strings; the chat-relevant keys (`chat_window.*`, `main-page.*`) are a small slice. The embed's 13-line locale files are closer to what a focused chat app needs.

**400px viewport.** This is the weak spot. Layout is switched by `isMobile` from `react-device-detect` — a UA check evaluated once at import — in **129 places across 51 files**:

```jsx
// frontend/src/pages/WorkspaceChat/index.jsx:21
{!isMobile && <Sidebar />}
// frontend/src/components/Sidebar/index.jsx:33-35
style={{ width: showSidebar ? "292px" : "0px", ... }}
```

A real phone gets `SidebarMobileHeader` and a slide-over; a 400px desktop window, a foldable, a tablet in split view or a PWA window resized on ChromeOS gets the desktop layout with a fixed 292px sidebar. Tailwind `md:` breakpoints are used for padding/rounding but not for structure. I did not run the app (read-only, no installs), so the *visual* result at 400px is **UNVERIFIED**; the branching logic is verified. Code blocks use `max-w-[65vw]` (`markdown.js:27,45`), which is a viewport hack rather than container-relative sizing.

## 4. PWA readiness

- `frontend/public/manifest.json`: `name`, `short_name`, `display: standalone`, `orientation: portrait`, `start_url`, and **one icon** `{"src":"/favicon.png","sizes":"any"}`. No 192/512 PNGs, no `maskable`, no `theme_color`/`background_color`, no `id`, no screenshots. Chrome's installability criteria want a 192 and a 512 icon — whether this manifest triggers the install prompt is UNVERIFIED (not run).
- `frontend/public/service-workers/push-notifications.js` handles `push` and `notificationclick` only. **No `fetch` handler, no precache, no offline shell.** Registered lazily from `hooks/useWebPushNotifications.js:56`, not at boot.
- `PWAContext.jsx` (93 l.) is a clean standalone-mode detector (display-mode media query + iOS `navigator.standalone` + `android-app://` referrer) that toggles a `pwa` body class. Small, dependency-free, liftable.
- Nothing about WASM/model caching, COOP/COEP headers for `SharedArrayBuffer` (needed for multi-threaded wllama), storage quota or OPFS — expected, since nothing runs in the browser.
- Android: the separate repo `Mintplex-Labs/anythingllm-mobile` exists (GitHub API: MIT, TypeScript/React Native, 100 stars, pushed 2026-09-20, description "Chat, RAG, Agents, and more using small models on device first"). **Not reviewed here — contents UNVERIFIED**, but it is a more relevant lead for the APK than anything in this repo.

## 5. The embed widget as a chat surface

`anythingllm-embed/src` is 2,704 lines including locales; the functional core is ~1,500. Dependencies: react, markdown-it, highlight.js, dompurify, he, uuid, fetch-event-source, phosphor icons, i18next. Vite 5, Tailwind 3.4.1 with `prefix: 'allm-'` (`tailwind.config.js:4`) so it cannot collide with a host page.

Why it matters: it is the *same* architecture as the main chat — same placeholder message, same `handleChat` reducer (`src/utils/chat/index.js`, 120 l.), same `loadingResponse` effect (`ChatContainer/index.jsx:89-118`) — with every server concern collapsed into **one 109-line file**, `src/models/chatService.js` (`embedSessionHistory`, `resetEmbedChatSession`, `streamChat`). Swap that file for a wllama adapter + IndexedDB and the widget runs offline. No router, no auth context, no global `getElementById` tricks (input is controlled state, `ChatContainer/index.jsx:13,24-26`).

Limits, all verified in source:
- **No stop-generation**: the `AbortController` in `chatService.js:42` is only aborted on error paths; there is no UI to cancel. Essential for slow on-device generation — must be added.
- **Lists are disabled** in markdown (`markdown.js:61`, `.disable(["list","lheading"])`), so bullet answers render as plain lines. Re-enable `list`.
- No attachments, citations, threads, regenerate/edit, theming beyond two bubble colours (`main.jsx:19-26`), no dark mode.
- Mounts by appending a div to `document.body` and reading `document.currentScript.dataset` (`main.jsx:8-14`) — widget ergonomics, to be replaced by a normal React root.
- **Unsanitised streaming render**: `ChatHistory/PromptReply/index.jsx:169-171` does `dangerouslySetInnerHTML={{ __html: renderMarkdown(responseContent) }}` with no DOMPurify, while `HistoricalMessage/index.jsx:125` does sanitise. This is the *same omission* that produced the critical advisory in the main app (section 6). Here `html:false` and the absence of a custom image rule mean I found **no working exploit** — but wrap it in `DOMPurify.sanitize` on day one.

## 6. Red flags

1. **XSS history in exactly the code you would lift.** GitHub lists 23 published security advisories for the repo. Three concern HTML rendering:
   - **GHSA-rrmw-2j6x-4mf2 (critical, 2026-03-13)** "Streaming Phase XSS to RCE via LLM Response Injection": the custom image renderer in `utils/chat/markdown.js` interpolated `token.content` into `alt` unescaped and `PromptReply` rendered without DOMPurify. Patched in 1.11.2; current source encodes (`markdown.js:76`, `HTMLEncode(alt)`) and sanitises (`PromptReply/index.jsx:91`).
   - GHSA-4q6m-qh3w-9gf5 (medium, 2026-04-15): unsanitised `renderMarkdown(content.caption)` in `Chartable`.
   - GHSA-rh3m-xv7m-9jhf (medium, 2026-09-01): server-side MetaGenerator.
   Lesson: the pattern "markdown-it → HTML string → `dangerouslySetInnerHTML`" (21 sites in the frontend) is only as safe as every custom renderer rule. If lifted, keep DOMPurify on **every** sink and never enable the `renderHTML` appearance flag (`markdown.js:15`, which turns on raw HTML in model output).
2. **`define: { "process.env": process.env }`** at `frontend/vite.config.js:24-26` inlines the *entire build-machine environment* into the bundle wherever `process.env` is referenced as an object. Do not copy this config; use `import.meta.env`.
3. **No types, no frontend tests.** 138k lines of JSX with JSDoc. Transplanting into a TypeScript app means typing each unit by hand; there is no test to tell you the transplant still behaves.
4. **UA-sniffed responsiveness** (section 3) — contrary to the operator's "responsive web landing" requirement.
5. **Heavy dependency set** if taken wholesale: `@tremor/react` + `recharts` + `recharts-to-png` (charts in chat), `onnxruntime-web`, `moment`, `@lobehub/icons`, `react-beautiful-dnd`, full `highlight.js`. None is needed for the units recommended below except markdown-it/hljs/dompurify/he/katex.
6. **AGPL subfolder** `open-computer/` inside an MIT repo — an easy mistake for an agent told to "take the best code from this repo".
7. **Piper TTS licence chain unclear** (section 1, item 4).
8. **Global-event coupling.** Components talk through `window` CustomEvents and DOM ids (`PROMPT_INPUT_EVENT`, `ABORT_STREAM_EVENT`, `CLEAR_ATTACHMENTS_EVENT`, `#prompt-input-wrapper`, `#chat-history`). Cheap to transplant, but it caps you at one chat instance per document and makes the units order-dependent.
9. Not abandoned, not README-ware, no `eval`/`new Function` in `frontend/src` (grep clean), no secrets found in the frontend tree, no frontend telemetry.

## 7. Scores

| Axis | Score | Justification |
|---|---|---|
| maturity | **5** | 3+ years, v1.16.1, 66k stars, daily commits from multiple authors, 23 advisories triaged and patched, CI for lint/tests/translations. |
| code_quality | **3** | Readable, unusually well-commented (the *why* is written down), but untyped JS, zero frontend tests, HTML-string templating, global DOM/event coupling, theme hacks. |
| chat_ux | **4** | Streaming, stop, regenerate, edit, fork, thoughts, citations, TTS/STT, drafts, undo — feature-complete and polished; loses a point for re-parse-per-chunk, the setext flicker and string-built code blocks. |
| agentic | **4** | Real agent loop over WebSocket with tool-approval cards, clarifying-question forms, MCP, flows — but 100% server-side (`utils/chat/agent.js`, 541 l.); nothing transfers to in-browser. |
| mobile_pwa | **2** | Minimal manifest, push-only SW, no offline, UA-sniffed layout. `PWAContext` is the only good piece. |

## 8. Liftable units

Ordered by value ÷ effort. "LOC" from `wc -l`. Target = Vite + React + TypeScript.

| # | Unit | Paths (repo-relative) | LOC | Deps | Difficulty | Why it beats writing fresh |
|---|---|---|---|---|---|---|
| 1 | **Chat auto-scroll hook** | `frontend/src/hooks/useAutoScroll.js` | 159 | React; one localStorage flag (`models/appearance.js`, 70 l. — or inline a boolean) | **easy** | Encodes five non-obvious fixes (rAF pin only while streaming, 30-frame settle after load, wheel/touch disengage, re-engage only on downward scroll, scroll-to-bottom button state). This is the classic thing every chat app gets wrong for weeks. |
| 2 | **Stream event reducer + message shape** | `frontend/src/utils/chat/index.js`; reference the emitter in `frontend/src/models/workspace.js:161-232`. Simpler variant: `anythingllm-embed/src/utils/chat/index.js` | 230 (embed: 120) | none after deleting 3 imports (thread-rename event, TTS event, agent flag) | **easy** | A proven contract (`textResponseChunk` / `finalizeResponseStream` / `abort` / `stopGeneration`, keyed by `uuid`, with `pending/animate/closed`) that the whole UI already understands. A wllama adapter targets it in ~60 lines. Delete the agent/image/router branches. |
| 3 | **Markdown + sanitiser + KaTeX + code-copy** | `frontend/src/utils/chat/markdown.js`, `purify.js`, `plugins/markdown-katex.js`, `themes/github.css`, `themes/github-dark.css`, `hljs-libraries/svelte.js`; copy delegate at `frontend/src/components/WorkspaceChat/index.jsx:187-198`. Use the embed's curated `anythingllm-embed/src/utils/chat/hljs.js` (88 l.) instead of full hljs, and port its `.disable(["lheading"])` | 680 + 88 | markdown-it 13, highlight.js 11, dompurify 3, he, katex 0.16, uuid | **moderate** | Post-advisory hardened renderer rules (escaped `alt`, encoded `href`, `rel=noopener`), currency-safe `$` math, and thought-markdown normalisation (`renderThoughtMarkdown`). Moderate because the code-block template has Tailwind/theme classes and `max-w-[65vw]` baked into HTML strings, and it reads `localStorage.theme` + `Appearance.renderHTML` at module load — both need replacing. Alternative worth weighing: `react-markdown`/`streamdown`-style component rendering avoids the `dangerouslySetInnerHTML` class of bug entirely. |
| 4 | **Reasoning-tag parsing + thought UI** | `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ThoughtContainer/index.jsx` (regexes l.65-87), `ChainOfThought/index.jsx`, `StatusResponse/index.jsx` | 87 + 212 + 203 | phosphor icons, react-i18next, `utils/numbers.formatDuration`, a `.webm` agent animation (drop it) | **moderate** | Handles unterminated `<think>` mid-stream, multiple tag spellings, expansion state that survives the PromptReply→HistoricalMessage swap. Small reasoning GGUFs make this a day-one need. Take the regexes + expansion context verbatim; restyle the chain. |
| 5 | **Embed widget as app skeleton** | `anythingllm-embed/src/components/ChatWindow/**`, `src/hooks/**`, `src/utils/**`, with `src/models/chatService.js` (109 l.) as the single file to replace | ~1,500 | see section 5 | **moderate** | The smallest complete, working instance of the architecture with exactly one server seam. Moderate: strip `allm-` prefix or keep it, replace script-tag settings, add stop button, re-enable lists, add DOMPurify to `PromptReply:169`, add dark mode. Faster than carving the same thing out of the 12.7k-line main chat. |
| 6 | **Prompt input behaviours** | `frontend/src/components/WorkspaceChat/ChatContainer/PromptInput/index.jsx` (take: auto-grow l.250-255, undo/redo l.57-58 + 199-245, paste-image l.256-300; the enter handler `captureEnterOrUndo` l.144-197 is NOT a model: it submits on `keyCode === 13` with no `isComposing` check and no mobile exception, so Enter always sends on a phone keyboard), `frontend/src/hooks/usePromptInputStorage.js`, `PromptInput/StopGenerationButton/`, `PromptInput/Attachments/index.jsx` | 559 + 128 + 247 | lodash.debounce, react-tooltip, react-router (`useParams`/`useSearchParams` — replace), phosphor | **moderate-hard** | The behaviours are right and fiddly (draft resurrect guard, undo stack that survives programmatic writes). Hard part: the file also hosts ToolsMenu, AgentMenu, LLMSelector, STT and agent-session state; lift functions, not the file. |
| 7 | **Theme + PWA-mode hooks** | `frontend/src/hooks/useTheme.js`, `frontend/src/PWAContext.jsx`, `frontend/src/ThemeContext.jsx` | 86 + 93 + 16 | React only (remove the `REFETCH_LOGO_EVENT` import) | **easy** | Correct system/light/dark with live OS listener and legacy-value migration; standalone detection across Chrome/iOS/TWA. Trivial, but correct and free. |
| 8 | **In-browser Piper TTS client** | `frontend/src/utils/piperTTS/index.js`, `worker.js`, `frontend/src/utils/chat/messageToSpeech.js`, `ChatHistory/HistoricalMessage/Actions/TTSButton/piperTTS.jsx` | 256 + 217 + 98 + 186 | `@mintplex-labs/piper-tts-web`, `onnxruntime-web`, WASM assets, voices fetched at runtime | **hard / blocked** | The only genuinely on-device ML in the frontend, with worker isolation and think-tag stripping. **Blocked on the licence question in section 1 item 4** and adds a large ONNX runtime. Defer. |

**Not worth lifting (welded to the server):** `ChatContainer/index.jsx` itself (thread creation, WebSocket agent session, `Workspace.*`), `DnDWrapper/` (collector pipeline), `Sidebar/**` (REST threads/workspaces), `LLMSelection/**` and all of `pages/GeneralSettings/**`, `MemoriesSidebar/`, `ToolApprovalRequest/`, `ClarifyingQuestion/` (agent WebSocket), `Chartable/` (tremor + recharts, and an advisory), `Citation/` until in-browser RAG exists.

## 9. Bottom line

AnythingLLM is a mature, actively maintained, permissively licensed product whose chat UX is good — but its frontend is a thin client over a large server, written in untyped JS with no tests, a user-agent-based mobile layout and a token PWA. For a wllama-in-the-browser product the right move is **not** to fork `frontend/`. Take units 1, 2, 3, 4 and 7 (about 1,500 lines, all MIT, all transplantable in a day or two with attribution), use the embed widget (unit 5) as the structural reference because it isolates the server behind one 109-line file, and look elsewhere for the things this repo does not have at all: in-browser inference plumbing, model download/caching UX, an offline service worker, CSS-driven responsive layout, and TypeScript.
