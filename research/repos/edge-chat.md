# goatplatform/edge-chat — dossier

> | | |
> |---|---|
> | **What it is** | A 22-commit, 2-week (2025-01-22 → 2025-02-03) marketing demo for GoatDB: ~600 lines of Deno + React 19 + styled-components that feed one prompt to wllama 2.1.3 running a 15M-parameter TinyStories model and store messages in GoatDB. |
> | **Licence verdict** | MIT (`LICENSE`, "Copyright (c) 2025 Goat Developer Platform"). Copying is allowed — **conditions**: keep the copyright + permission notice. The committed binaries (2 wllama `.wasm`, 1 `.gguf`) carry no notice of their own; do not take those. |
> | **Best thing to take** | Nothing is best-in-class. The only reusable idea is the 48-line GoatDB chat/message schema (`schema.ts:34-81`) — and only if the product adopts GoatDB, which is a separate decision. |
> | **Biggest risk** | It looks like a wllama chat reference and is not one: streaming is dead code, no chat template, no history, `nPredict: 50`, context 128, model pulled whole into RAM with no cache. Copying it imports bugs, not know-how. |
> | **Scores (1-5)** | maturity 1 · code_quality 2 · chat_ux 1 · agentic 1 · mobile_pwa 1 |
> | **Recommendation** | **Skip.** Take wllama integration from ngxson/wllama's own examples and chat UI from a real chat repo; revisit GoatDB itself (579 stars, MIT, active) only if multi-device sync becomes a requirement. |

Examined: shallow clone at `/home/edu/.cache/slm-src/goatplatform_edge-chat` (HEAD `8bbcc74`, 2025-02-03) plus
the GitHub API, the npm registry, jsr.io and the Hugging Face API on 2026-09-21. Nothing was built or run
(ground rules: no installs, no services). Claims about runtime behaviour are therefore read from the source,
and marked UNVERIFIED where the source alone cannot settle them.

---

## 1. Licence

`LICENSE` (21 lines) is the unmodified MIT text:

```
MIT License
Copyright (c) 2025 Goat Developer Platform
```

- No `NOTICE`, no `THIRD_PARTY`, no per-file headers, no CLA. GitHub's detector agrees (`license.spdx_id: MIT`).
- **Verdict: conditions.** MIT permits copying into a private product or an MIT-released one. The single
  obligation: "The above copyright notice and this permission notice shall be included in all copies or
  substantial portions of the Software." In practice: a `THIRD_PARTY_NOTICES` entry with that copyright line
  and the MIT text, plus a source comment on any copied file. No state-changes or NOTICE duty (that is
  Apache-2.0, not MIT).
- **Bundled third-party binaries are a separate matter:**
  - `assets/wllama-single.wasm` (1,662,123 B) and `assets/wllama-multi.wasm` (1,678,076 B) are build
    outputs of ngxson/wllama (MIT per GitHub API). They are committed without wllama's copyright notice,
    which is itself a (minor) MIT non-compliance by this repo. Get them from the `@wllama/wllama` npm
    package instead — they must match the JS glue version anyway.
  - `assets/models/model.gguf` (19,077,344 B). README says it is Stories15M and links
    `Xenova/llama2.c-stories15M`. That model card declares **no licence** (HF API: `cardData` =
    `{'library_name': 'transformers.js', 'tags': ['transformers']}`, no `license:` tag). The upstream
    weights are Karpathy's tinyllamas; their licence was not checked here — UNVERIFIED. Irrelevant in
    practice: the model is useless for a product (see §3.2).

## 2. What is actually in the repo

Whole tree, excluding `.git` (`wc -l`, 950 lines total including README/LICENSE/lock stubs):

| Path | Lines | Role |
|---|---|---|
| `src/chat.tsx` | 291 | message list, input, model select, submit handler. ~105 lines are styled-components CSS |
| `src/chat-list.tsx` | 119 | sidebar: "New Chat" + list, selection stored in GoatDB |
| `src/app.tsx` | 40 | DB-ready gate, hardcoded user |
| `models/wllama.ts` | 85 | the entire wllama integration |
| `models/dummy.ts` | 15 | canned-reply fake model |
| `schema.ts` | 99 | 3 GoatDB schemas (33 lines are a how-to comment) |
| `server.ts` / `build.ts` / `debug-server.ts` | 55 / 17 / 17 | GoatDB server boilerplate (single-binary compile for linux-aar64) |
| `scaffold/index.{html,tsx,css}` | 24 / 12 / 13 | entry point |
| `edge-chat.service` | 13 | systemd unit for an EC2 box (`User=ec2-user`) |
| `assets/` | — | 2 wasm + 1 gguf, 21.4 MB of binaries in git |

Stack: **Deno 2** (not Node/Vite), `jsx: precompile`, imports through `deno.json` import map. `deno.lock`
pins `@goatdb/goatdb 0.0.79`, `@wllama/wllama 2.1.3`, `react 19.0.0`, `styled-components 6.1.14`,
`esbuild 0.24.2`. Bundling is done by GoatDB's own `startDebugServer` / `compile` (`debug-server.ts:6`,
`build.ts:4`), not by a bundler the operator's stack would share. A `package.json` + 17-line
`package-lock.json` also exist and list only `@wllama/wllama` in the lock — a leftover, not a working
npm project.

Architecture, end to end:

```
scaffold/index.tsx  registerSchemas() -> <App/>
  src/app.tsx       useDBReady() gate -> <ChatList/> + <ChatArea/>      userId = 'TestUserId' (app.tsx:16)
    chat-list.tsx   useQuery(kSchemaChat, source=/user/<id>)  -> click sets UISettings.selectedChat
    chat.tsx        useQuery(kSchemaMessage, source=/data/<chatId>) -> db.create(user msg)
                    -> kLanguageModels[model](text, onProgress) -> db.create/ set(bot msg)
      models/wllama.ts   fetch whole gguf -> File -> wllama.loadModel -> createCompletion(prompt)
server.ts           GoatDB Server: serves static assets + syncs the repos
```

The one design idea worth noting: **a chat is a GoatDB repository** (`/data/<chatId>`), messages are
items in it, and the list of chats lives in a per-user repo (`/user/<userId>`), so opening a chat syncs
only that chat (`chat-list.tsx:56-58`, `chat.tsx:158-163`). That is a sound partitioning for a
sync-capable store. It is 3 lines of code and an idea, not a liftable unit.

## 3. README claims versus the source

### 3.1 "runs completely in the browser, no network connection needed" — half true

- Inference is local: yes (`models/wllama.ts:66`).
- "No network connection needed": **not implemented.** There is no service worker and no web manifest —
  `grep -rniE 'serviceWorker|manifest'` over all `.ts/.tsx/.html/.json` returns nothing. A reload while
  offline cannot load `/app.js`, the wasm or the 19 MB gguf, because nothing caches them:
  `models/wllama.ts:21-28` does a plain `fetch()` + `arrayBuffer()` and wraps it in a `File`. wllama's own
  download/cache manager (OPFS-backed `loadModelFromUrl`) is bypassed.
- `scaffold/index.html:13-18` loads Inter from `fonts.googleapis.com` — a third-party network request on
  every load, in an app advertised as network-free.

### 3.2 "ChatGPT-like interface" — no

- **Streaming is dead code.** The UI expects status strings starting with `"Generating: "`:

  ```ts
  // src/chat.tsx:218-221
  if (status.startsWith("Generating: ")) {
    currentResponse = status.replace("Generating: ", "");
    botMsg.set("text", currentResponse + "...");
  }
  ```
  The model wrapper never emits one; it discards the streamed text:

  ```ts
  // models/wllama.ts:73-76
  onNewToken: (token: string, piece: string, currentText: string) => {
    finalResponse = currentText;          // assigned, never read
    onProgress("Thinking...", 75);
  },
  ```
  `grep -rn "Generating" .` finds only the consumer. The user sees `...` until the whole completion returns.
- **No conversation.** `handleSubmit` passes only the new text (`chat.tsx:207`), and the wrapper calls raw
  `createCompletion(prompt, …)` (`wllama.ts:66`) — no chat template, no system prompt, no prior turns.
  Message history is stored but never sent to the model. The README's "Local Context Awareness" bullet
  has no code behind it.
- **`nPredict: 50`** hardcoded (`wllama.ts:67`); no stop, no abort, no regenerate, no edit, no copy.
- **The model cannot chat.** GGUF header read directly from the file: `general.architecture = llama`,
  `llama.context_length = 128`, `embedding_length = 288`, `block_count = 6`, `file_type = 2` (Q4_0),
  no `tokenizer.chat_template` key (20 KV pairs, none of them a template). It is a story-continuation
  toy; the UI labels it "TinyLlama" (`chat.tsx:24,279`), which is a different, real 1.1B model — misleading.
- Progress bar is fake: fixed 0 / 25 / 50 / 75 / 100 steps (`wllama.ts:54-79`), unrelated to bytes or tokens.
- Plain `<input>` single line (`chat.tsx:116,256`), deprecated `onKeyPress` (`chat.tsx:259`), no markdown,
  no code blocks, no autoscroll (`messageListRef` is created at `chat.tsx:185`, passed down, never used
  to scroll).
- Typing cursor heuristic: `text.endsWith("...")` (`chat.tsx:141`) — any finished message ending in an
  ellipsis shows a permanent cursor.

### 3.3 Sync / security bullets ("End-to-End Secure", "Incremental Synchronization")

These describe GoatDB, not this repo. In this repo every visitor is the same user:

```ts
// src/app.tsx:16
const userId = 'TestUserId';
```
No auth, no login, no per-user separation. On a shared deployment every visitor reads and writes the
same `/user/TestUserId` repo — UNVERIFIED at runtime (GoatDB may add session-level rules), but nothing in
this repo configures any.

### 3.4 "Live demo at https://chat.goatdb.dev/" — dead

- Issue #1 "Live demo broken" (opened 2025-03-28 by `marcomow`): page shows "Error! Please reload the
  page." — that is the `useDBReady() === 'error'` branch at `app.tsx:35-37`. **0 comments, still open 18
  months later.**
- From this machine on 2026-09-21: `getent hosts chat.goatdb.dev` → no record; `curl` → "Resolving timed
  out". (Single vantage point; a WSL DNS fault cannot be fully excluded, but other hosts resolved in the
  same command.)

### 3.5 "deno task build" — probably broken on a fresh clone (UNVERIFIED, not run)

```ts
// server.ts:6
import { BuildInfo } from "../goatdb/server/build-info.ts";
```
A relative import that points **outside the repository**, to a sibling checkout of goatdb on the author's
disk. It is not `import type`, so Deno's module graph will try to resolve it. `deno task debug` does not
import `server.ts` and is unaffected. Also `models/dummy.ts:1-2` imports helpers by raw URL from
`jsr.io/@goatdb/goatdb/0.0.47/...` while the import map pins `^0.0.79` — two GoatDB versions in one bundle.

(`arch: "aar64"` in `build.ts:12` looks like a typo but is GoatDB's own spelling:
`export type CPUArch = 'x64' | 'aar64'` in `@goatdb/goatdb@0.0.79/cli/compile.ts:14`.)

## 4. Engineering hygiene

| Check | Finding |
|---|---|
| Tests | none — no test file, no test task in `deno.json` |
| CI | none — no `.github/` directory |
| Lint/format config | none beyond Deno defaults |
| Types | TypeScript throughout, GoatDB's schema-derived types are used properly (`useItem<SchemaMessage>`); `// @deno-types="npm:@types/react"` pragmas are Deno-specific |
| Releases / tags | 0 |
| Branches | `main` only (a `HuggingFace` branch was merged then reverted: `3d10e2f` → `f919ccc`) |
| Commits | 22 total, 2025-01-22 → 2025-02-03. 6 of 22 are "Update README.md", 3 are merge/revert churn |
| Contributors | `ofriw` 15, `amitsr4` 7 (GoatDB's own team) |
| Issues | 1, open, unanswered |
| Forks / stars | 2 / 12 |
| Dependency drift | pinned `@goatdb/goatdb 0.0.79`; jsr latest is **0.6.1** (109 versions published). pinned `@wllama/wllama 2.1.3` (published 2025-01-22); npm latest is **3.6.1** — a major version behind |

History shape tells the story: started on LM Studio over HTTP (`fb36c0b integrate lmstudio`), switched to
wllama four days later (`d8511ac Using wllama instead of LM studio`), deployed, abandoned.

Small correctness defects, each visible in the source:
- `scaffold/index.css:7` styles `.body` (a class) instead of `body` — the margin/font reset never applies.
- `scaffold/index.html:10` references `/assets/favicon.png`; no such file in `assets/`.
- `chat.tsx:106-109` `InputContainer` sets `bottom/left/right` with no `position` — inert leftovers.
- `chat-list.tsx:93-94` sorts chats by `lastModified`, which is only ever set by its default at creation
  (`schema.ts:42-45`); sending a message never touches it, so "recent" order is creation order.
- `wllama.ts:3-7` passes a `"model/default"` key in the wasm path config — not a wllama asset key; ignored.
- `chat.tsx:157` `console.log` on every render of the message list.
- `wllama.ts:11-14` guards on `modelLoaded` only; two fast submits before load completes would each
  allocate a Wllama instance and a 19 MB buffer (mitigated by the input being disabled while loading).

Multi-threading: `wllama-multi.wasm` needs `SharedArrayBuffer`, i.e. COOP/COEP response headers. I
fetched `net/server/server.ts` (393 lines), `net/server/static-assets.ts` (149) and `net/server/cors.ts`
(35) of `@goatdb/goatdb@0.0.79` from jsr.io and found **0** occurrences of `Cross-Origin-Opener` /
`Cross-Origin-Embedder`. If no other layer adds them, the demo always ran single-threaded and shipped
1.6 MB of wasm it could not use. UNVERIFIED end to end (three files checked, not the whole package).

## 5. Security and privacy

- **No unsafe HTML.** `grep -rniE 'dangerouslySetInnerHTML|innerHTML|eval\('` → nothing. Model output is
  rendered as a React text node (`chat.tsx:145`), so it is escaped. This is safe only because there is no
  markdown rendering at all.
- No secrets, API keys or tokens in the tree (grep for `apiKey|secret|token` hits only the `onNewToken`
  callback).
- No analytics/telemetry SDK (`analytics|gtag|sentry|posthog` → nothing). The Google Fonts link is the only
  third-party call.
- Hardcoded shared identity (`'TestUserId'`) — see §3.3. Disqualifying for anything multi-user.
- 21.4 MB of binaries committed to git with unclear provenance (no build script, no hash, no version note
  tying the wasm to wllama 2.1.3). sha256 recorded here for reference:
  `wllama-single.wasm bbf0abac…4b54d2`, `wllama-multi.wasm 0a1226d4…65b0c5`, `model.gguf 6151b192…da93a04`.

## 6. Scores

| Axis | Score | Justification |
|---|---|---|
| maturity | **1** | 22 commits in 13 days, no tests/CI/releases, demo dead and its one bug report unanswered since 2025-03 |
| code_quality | **2** | Small, typed, readable; but dead streaming path, unused variables, out-of-repo import, mixed dependency versions, several inert CSS/HTML bugs |
| chat_ux | **1** | No streaming, no history to the model, no markdown, no stop/regenerate, single-line input, fake progress, no autoscroll |
| agentic | **1** | No tools, no function calling, no RAG, no system prompt — one raw completion call |
| mobile_pwa | **1** | No manifest, no service worker, fixed 200 px sidebar, `height: calc(100vh - 160px)`, no media queries |

## 7. Liftable units

Honest answer: **none of this beats the alternatives.** For completeness, the three candidates and why
each fails the "best-in-class" bar:

### 7.1 GoatDB chat schema + repo-per-chat layout — take only if GoatDB is adopted
- Paths: `schema.ts` (99 lines, 48 of them real: lines 34-81 and 93-99); layout helper
  `src/chat-list.tsx:56-58`.
- Dependencies: `@goatdb/goatdb` (pinned 0.0.79; latest 0.6.1 — expect API changes, UNVERIFIED which).
- Transplant into Vite + React + TS: **moderate.** The schema file is plain TS and copies as-is, but it is
  worthless without GoatDB, and GoatDB at this version expects its own Deno server/bundler
  (`startDebugServer`, `compile`). Whether current GoatDB runs client-only inside a Vite build is a
  question for a GoatDB evaluation, not something this repo answers.
- Why over writing fresh: it barely is. 48 lines; the value is the partitioning idea (one repo per chat,
  registry repo per user), which can be restated in one sentence. For plain local persistence without
  sync, an IndexedDB wrapper is the more conventional fit for a Vite PWA and needs no custom server.

### 7.2 `models/wllama.ts` — do not take
- 85 lines, depends on `@wllama/wllama@2.1.3`.
- Transplant: easy mechanically, **negative value**: whole-file `fetch` into RAM instead of wllama's
  cached, progress-reporting, shard-aware loader; raw completion instead of `createChatCompletion` with
  the GGUF chat template; streamed text discarded; no abort. The upstream ngxson/wllama repo (same MIT
  licence, maintained — pushed 2026-09-20, 1,267 stars, npm latest 3.6.1) is the place to take the
  integration from; its example app was not read as part of this dossier (UNVERIFIED here — see the
  wllama dossier).

### 7.3 "Bot reply is a DB row mutated during generation" (`src/chat.tsx:194-249`) — pattern only
- ~55 lines. Persisting the assistant message as a row from the first token, then `set("text", …)` as it
  grows, means a reload or a second device sees the partial answer. Nice property for a synced store.
- As written it creates the bot row in three duplicated branches (`chat.tsx:210-217`, `224-231`,
  `235-242`), encodes state in the text (`"..."` suffix) and never receives tokens. Re-implement in 20
  lines; nothing to copy.

Not liftable at all: `server.ts`, `build.ts`, `debug-server.ts`, `edge-chat.service` (GoatDB/Deno/EC2
deployment boilerplate), `scaffold/*`, the styled-components CSS (unthemed hex colours, no dark mode, no
responsive rules), the binaries.

## 8. Red flags

1. **Abandoned.** Last push 2025-02-03; 19+ months stale; live demo unreachable; issue #1 unanswered.
2. **README oversells.** "No network connection needed", "Local Context Awareness", "End-to-End Secure"
   have no corresponding code in this repo (§3). It is a product advert for GoatDB.
3. **Core feature is dead code** — token streaming (§3.2). Anyone copying `chat.tsx` + `wllama.ts` as a
   pair inherits a UI that waits silently for the full completion.
4. **Out-of-repo import** in `server.ts:6`; production build likely fails on a clean clone (UNVERIFIED).
5. **Two major versions behind on wllama** (2.1.3 vs 3.6.1) and ~100 releases behind on GoatDB.
6. **Binaries in git without provenance or notices**; model card upstream declares no licence.
7. **Single hardcoded user id** shared by all visitors.
8. **Wrong ecosystem for the target stack**: Deno import map + GoatDB's bundler + styled-components, versus
   the operator's Vite + React + TS. Every file needs its imports rewritten
   (`"../schema.ts"` extensions, `@deno-types` pragmas, `jsr:` specifiers).
9. No telemetry, no eval, no unsafe HTML, no secrets — the repo is harmless, just not useful.

## 9. Verdict

edge-chat does not beat any alternative on any axis the product cares about. It is a thin wrapper over one wllama call, and the
wrapper is where the defects are. Its only distinctive ingredient is GoatDB, and that belongs in
a separate evaluation of `goatplatform/goatdb` (MIT, 579 stars, pushed 2026-09-01) — judged on its
current 0.6.x API, not on this 0.0.79 demo. **Legally copyable (MIT, keep the notice); practically,
copy nothing.**

### Sources
- Local clone: `/home/edu/.cache/slm-src/goatplatform_edge-chat` (file:line references above).
- `gh api repos/goatplatform/edge-chat` (+ `/commits?per_page=30`, `/contributors`, `/branches`, `/tags`,
  `/issues?state=all`, `/issues/1`), 2026-09-21.
- `gh api repos/goatplatform/goatdb`, `gh api repos/ngxson/wllama` (licence, stars, pushed_at).
- `https://registry.npmjs.org/@wllama/wllama` (dist-tags, publish time of 2.1.3).
- `https://jsr.io/@goatdb/goatdb/meta.json`, `…/0.0.79_meta.json`, `…/0.0.79/cli/compile.ts`,
  `…/0.0.79/net/server/{server,static-assets,cors}.ts`.
- `https://huggingface.co/api/models/Xenova/llama2.c-stories15M` (no licence tag).
- `https://unpkg.com/@wllama/wllama@2.1.3/esm/wllama.d.ts` — confirms the pinned version already offered
  `loadModelFromUrl(... useCache)` (l.314), `loadModelFromHF` (l.324), `createChatCompletion` (l.356) and
  `abortSignal` (l.93); `esm/cache-manager.d.ts:47` "Cache implementation using OPFS". The demo used none.
- GGUF header parsed directly from `assets/models/model.gguf` with a 20-line stdlib Python reader.
