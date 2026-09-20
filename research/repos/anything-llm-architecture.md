# Mintplex-Labs/anything-llm — architecture and extensibility dossier

```
WHAT IT IS      Server-centric "chat with your docs + agents" suite: Express/Prisma/SQLite server (112k LOC JS),
                document collector (13.5k), Vite+React 18 JSX frontend (77k, zero TypeScript). v1.16.1, 2026-08-27.
LICENCE         MIT (root LICENSE, (c) Mintplex Labs Inc.) -> copy: YES with attribution. EXCEPT open-computer/ = AGPL-3.0: do not touch.
BEST TO TAKE    Not the app. Take server-side pieces for the OPTIONAL backend (MCP hypervisor, UnTooled prompt-based tool
                calling, context-window compressor) + the Piper-TTS web-worker pattern. And use it whole, unmodified, via its API.
BIGGEST RISK    Inference is welded to the server: provider.handleStream(response, ...) writes to the Express response. There is
                NO client-side LLM path. Forking to add wllama means rewriting persistence, RAG, agents and history for the browser.
SCORES          maturity 5 · code_quality 3 · chat_ux 4 · agentic 5 · mobile_pwa 2
RECOMMENDATION  SIT BESIDE IT. Build the wllama PWA as its own Vite+React+TS app; run stock AnythingLLM (Docker, :3001) as the
                optional server brain reached over /api/v1 (OpenAI-compatible endpoint included). Do not fork.
```

Clone inspected: `/home/edu/.cache/slm-src/Mintplex-Labs_anything-llm`, HEAD `da66855` (2026-09-17, shallow).
All `path:line` references below are relative to that clone. Date of review: 2026-09-21.

---

## 1. Licence — read from the files, not the badge

| File | Licence | Consequence |
|---|---|---|
| `LICENSE` (root, 1,073 bytes) | **MIT**, "Copyright (c) Mintplex Labs Inc." | Copy, modify, sublicense, keep private or release. One condition: keep the copyright + permission notice "in all copies or substantial portions". |
| `open-computer/LICENSE` | **GNU AGPL-3.0** | 4,163 files of a QEMU "agent computer" sub-project living inside the MIT repo. Copyleft incl. network use. **Do not copy a line from `open-computer/`.** |
| `package.json:8`, `server/package.json:6`, `frontend/package.json:4` | `"license": "MIT"` | consistent with root |
| NOTICE / THIRD-PARTY files | none exist (`find -iname 'NOTICE*' -o -iname 'THIRD*'` returned only the two LICENSE files) | nothing extra to carry |
| `TERMS_SELF_HOSTED.md` §5 | "The AnythingLLM core is provided under the MIT License" | no field-of-use restriction on self-hosting |

`open-computer/` is self-contained: nothing in `server/`, `frontend/` or `collector/` references it (grep for
`open-computer|openComputer` outside that directory matched only its own `cli/` and `services/`). So the MIT parts are not
contaminated — but a careless `cp -r` of the repo root would import AGPL code.

Submodules `embed/` and `browser-extension/` (`.gitmodules`) are **empty in this clone**; their licences were NOT read —
UNVERIFIED. The README calls the embed widget and mobile app MIT; the mobile repo's LICENSE was checked via `gh api` and is MIT
("Copyright (c) 2025 Mintplex Labs").

**Verdict: `conditions` (light).** For any file copied from outside `open-computer/`:
1. Keep a copy of the MIT text with `Copyright (c) Mintplex Labs Inc.` in the product (e.g. `THIRD_PARTY_LICENSES/anything-llm.MIT.txt`).
2. Put a header on each vendored file: source repo, commit `da66855`, original path, "modified: yes/no". MIT does not require
   stating changes, but the operator's "copy with attribution" rule does, and it makes later re-syncs possible.
3. Brand assets are not code: `frontend/src/media/logo`, `frontend/public/anything-llm-*.png`, the name "AnythingLLM" —
   MIT grants no trademark rights. Do not ship their logos. `frontend/public/fonts/PlusJakartaSans.ttf` is a third-party
   font (OFL upstream — UNVERIFIED in this repo, no font licence file is bundled).

---

## 2. Health (GitHub API, 2026-09-21)

- 66,262 stars, 7,372 forks, 318 open issues, created 2023-06-04, pushed 2026-09-19, default branch `master`.
- Latest release `v1.16.1`, 2026-08-27.
- Last 30 commits span 2026-09-08 → 2026-09-17: 8 author names, mostly `fix:` with PR numbers (#6335–#6402), incl.
  "patch GHSA-8wh8-3v68-whwj (#6361)" — security advisories are being handled. `gh api .../security-advisories` returned 23.
- Contributors: `timothycarambat` 1,488, `shatfield4` 420, `angelplusultra` 104, then a long tail (29, 12, 11, 10…).
  **Bus factor ≈ 2.** It is a company product (Mintplex Labs), not a community project.
- CI: `.github/workflows/` has `run-tests.yaml`, `lint.yaml`, `check-translations.yaml`, `check-package-versions.yaml`,
  image builds. Tests: 62 `*.test.js` files, all server/collector (`server/__tests__/…`); **frontend: 0 tests**.
- Types: **0** `.ts`/`.tsx` files in `frontend/src`. JSDoc typedefs on the server (`server/utils/helpers/index.js:3-80`).

---

## 3. Architecture map

```
frontend/  Vite 4 + React 18 JSX + Tailwind 3, react-router 6, markdown-it + DOMPurify + highlight.js + KaTeX
   |  fetch + @microsoft/fetch-event-source (SSE over POST), WebSocket for agents
server/    Express 4 + Prisma 5.3.1 on SQLite (storage/anythingllm.db), bree job runner, express-ws
   |-- endpoints/            UI-facing routes (JWT session)       chat.js, workspaces.js, system.js, mobile/, mcpServers.js …
   |-- endpoints/api/        developer API /api/v1 (Bearer API key) auth, workspace, workspaceThread, document, system, admin, openai, embed
   |-- utils/AiProviders/    40 dirs: 38 chat providers + modelMap + modelRouter
   |-- utils/agents/aibitat/ agent loop + a SECOND, parallel provider set (providers/*.js, 41 files) + plugins (skills)
   |-- utils/MCP/            MCP client hypervisor (stdio / SSE / streamable-HTTP)
   |-- utils/agentFlows/     no-code flow executor (apiCall, llmInstruction, webScraping)
   |-- utils/router/         rule-based + LLM-classified model router
   |-- jobs/                 bree workers: scheduled jobs, memory extraction, doc sync, cleanup
   |-- utils/vectorDbProviders, EmbeddingEngines, TextSplitter, TextToSpeech, SpeechToText …
collector/ separate Express process: file/link -> text (PDF, DOCX, audio via whisper, repo loaders …)
open-computer/  AGPL side project (ignore)     embed/, browser-extension/  empty submodules
```

### 3.1 Chat request flow (traced in code)

1. **UI** `ChatContainer/index.jsx:340` calls `Workspace.multiplexStream(...)`.
2. `frontend/src/models/workspace.js:140-160` picks thread vs default; `streamChat` (`:161-229`) does
   `fetchEventSource(`${API_BASE}/workspace/${slug}/stream-chat`, {method:"POST", body:{message, attachments}, openWhenHidden:true})`
   and wires a window event `ABORT_STREAM_EVENT` to an `AbortController`.
3. **Route** `server/endpoints/chat.js:23-25`: `[validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug]`;
   sets `Content-Type: text/event-stream` (`:45-49`), checks the per-user daily quota (`:51`), calls `streamChatWithWorkspace`.
4. `server/utils/chats/stream.js:20`:
   - slash commands (`:30-44`);
   - `grepAgents` (`:47-56`) — if `@agent` is present **or** the workspace is in `automatic` mode with a tool-calling model
     (`server/utils/chats/agents.js:49-54`, `server/models/workspace.js:669-711`), the SSE emits
     `agentInitWebsocketConnection` with a UUID and closes; the UI then opens
     `ws://…/api/agent-invocation/:uuid` (`ChatContainer/index.jsx:374`, `server/endpoints/agentWebsocket.js:26`);
   - else `resolveProviderConnector` (`server/utils/helpers/index.js:671`) → `getLLMProvider` (`:136`, a 39-case `switch`)
     or the model router;
   - RAG: pinned docs, parsed files, vector search, history backfill (`:94-262`);
   - `LLMConnector.compressMessages(...)` (`:273`) fits system/context/history into the window;
   - `LLMConnector.streamGetChatCompletion(messages, {temperature})` (`:312`) then
     `LLMConnector.handleStream(response, stream, {uuid, sources})` (`:316`);
   - persists with `WorkspaceChats.new(...)` (`:328`) and emits `finalizeResponseStream` with `chatId` + metrics (`:342`).
5. **Provider** e.g. `server/utils/AiProviders/genericOpenAi/index.js:285-310`: iterates the OpenAI SDK stream and calls
   `writeResponseChunk(response, {uuid, type:"textResponseChunk", textResponse: token, …})`; listens on
   `response.on("close")` for client abort.
6. **UI reducer** `frontend/src/utils/chat/index.js` handles the event vocabulary: `textResponse`, `textResponseChunk`,
   `finalizeResponseStream`, `abort`, `statusResponse`, `stopGeneration`, `agentInitWebsocketConnection`,
   `modelRouteNotification`, `imageGenerationPending` (`:30-188`).

### 3.2 Provider interface contract

Documented as a JSDoc typedef, `server/utils/helpers/index.js:35-49` (`BaseLLMProvider`). There is **no base class**; each of
the 38 providers is a hand-written class that duck-types:

| Member | Role |
|---|---|
| `constructor(embedder, modelPreference)` | reads its own `process.env.*`; throws if unconfigured (`genericOpenAi/index.js:18-51`) |
| `className`, `model`, `defaultTemp`, `limits{history,system,user}` | 15 % / 15 % / 70 % window split (`:42-46`) |
| `streamingEnabled()` | gate checked at `stream.js:286` |
| `promptWindowLimit()` + `static promptWindowLimit(model)` | token budget |
| `isValidChatCompletionModel(name)` | |
| `constructPrompt({systemPrompt, contextTexts, chatHistory, userPrompt, attachments})` | builds OpenAI-style messages |
| `getChatCompletion(messages, {temperature,user})` → `{textResponse, metrics}` | |
| `streamGetChatCompletion(messages, opts)` → `MonitoredStream` | wrapped by `LLMPerformanceMonitor` |
| **`handleStream(response, stream, {uuid, sources})`** → `Promise<string>` | **takes the Express `response` and writes SSE itself** |
| `embedTextInput`, `embedChunks`, `compressMessages(promptArgs, rawHistory)` | |

Registering one provider is not one file. `grep -l "generic-openai"` hits **24 files**: `AiProviders/genericOpenAi`,
`agents/aibitat/providers/genericOpenAi.js` + `ai-provider.js` + `aibitat/index.js` + `agents/index.js` (the agent stack has its
own provider implementation), four `switch`es in `helpers/index.js` (`:192, :307, :417, :529`), `customModels.js`,
`updateENV.js` (`KEY_MAPPING` + `supportedLLM` allow-list at `:1151`), `modelPricing`, `endpoints/utils.js`, and 9 frontend
files (options form, onboarding list, settings list, agent LLM picker, privacy constants, model hook).

### 3.3 What a browser-side (wllama) provider would take

**Is there any client-side inference path today?** For LLMs: **no.** `grep -ril "wllama|web-llm|webllm"` over the whole repo: 0
hits. The only in-browser model inference is **TTS**: `@mintplex-labs/piper-tts-web` + `onnxruntime-web`
(`frontend/package.json`), driven from a Web Worker (`frontend/src/utils/piperTTS/worker.js`, 217 LOC, streaming per-sentence
chunks with a stream-id abort scheme `:6-14`). That proves the team ships WASM inference in the browser, but only for speech.

Why a browser LLM provider does not fit the contract:
- The contract's terminal step is `handleStream(response, …)` on the **server's** HTTP response. A browser model has no server
  response to write to; the tokens are born in the client.
- Everything of value happens server-side *around* the provider call in `stream.js`: RAG retrieval, memories, prompt
  compression, persistence (`WorkspaceChats.new`), metrics, quota, event logs. There is **no endpoint that lets a client save a
  chat it generated itself** (`grep "WorkspaceChats.new(" server/endpoints` → 0 hits; all writes are inside `utils/chats/*`).
- Agents run in a server-side loop over a WebSocket with a second provider stack; a browser model cannot be plugged into
  `aibitat` without proxying every completion back to the client.
- History is loaded from the server (`frontend/src/components/WorkspaceChat/index.jsx:62-63`); there is no local store, no
  offline mode, no service worker that caches the app shell.

Two ways to force it, both bad:
- **(a) Frontend-only swap**: replace `Workspace.multiplexStream` with a wllama generator emitting the same
  `textResponseChunk` / `finalizeResponseStream` objects. The reducer would render it, but you would still need new server
  endpoints for "give me the assembled prompt (RAG + memories + compressed history)" and "persist this exchange", plus the
  24-file provider registration, plus JSX→TS friction. You would own a permanent fork of a repo that landed 30 commits in the 10 days 2026-09-08..17 (12 of them on 09-16).
- **(b) "Reverse provider"**: a fake server provider that relays the prompt over WebSocket to the user's browser and awaits
  tokens. Works on paper; fragile on phones (backgrounded tabs kill the socket), and pointless when the phone is offline —
  which is the whole reason to run a model on-device.

Conclusion: the repo's centre of gravity is the server. An on-device-first product inverts that; it is a different
application, not a provider plug-in.

### 3.4 Headless configuration + developer API

**Env preconfiguration** (`docker/.env.example:82-87`; read in `genericOpenAi/index.js:18-51`):
```
LLM_PROVIDER='generic-openai'
GENERIC_OPEN_AI_BASE_PATH='http://host:port/v1'      # required, else constructor throws
GENERIC_OPEN_AI_MODEL_PREF='model-id'                # required
GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT=4096
GENERIC_OPEN_AI_API_KEY=sk-...
GENERIC_OPEN_AI_MAX_TOKENS=1024                      # default 1024 (index.js:37-39)
GENERIC_OPEN_AI_CUSTOM_HEADERS="X-A:b,X-C:d"         # parsed at :62
```
plus `GENERIC_OPEN_AI_REPORT_USAGE` and capability flags (`updateENV.js:1543-1562`, `genericOpenAi/index.js:433-480`).
Instance-level: `AUTH_TOKEN` + `JWT_SECRET` (password mode), `SIG_KEY`/`SIG_SALT` (at-rest encryption),
`DISABLE_TELEMETRY`, `ENABLE_HTTPS`, `DISABLE_SWAGGER_DOCS`, `SIMPLE_SSO_ENABLED`, `DISABLE_VIEW_CHAT_HISTORY`,
`AGENT_MAX_TOOL_CALLS`, `AGENT_AUTO_APPROVED_SKILLS`, `MCP_NO_COOLDOWN`, `MODEL_ROUTER_ID`
(`docker/.env.example:5-7, 406-559`; `helpers/index.js:701`).

**Runtime reconfiguration**: `POST /api/v1/system/update-env` (`server/endpoints/api/system/index.js:106-109`) takes
`{LLMProvider:"generic-openai", GenericOpenAiBasePath:…, GenericOpenAiModelPref:…, …}` — keys are the `KEY_MAPPING` names
(`updateENV.js:5-8, 204-223`), validated (`supportedLLM`, `isValidURL`, `nonZero`), applied to `process.env` live
(`:1456`) and written back to the `.env` file in production (`:1466, :1600`). Values that are all asterisks are ignored as
masked placeholders (`:1417`). `GET /api/v1/system` returns current settings.

**Developer API surface** (60 distinct paths / 63 route registrations extracted by grep from `server/endpoints/api/**`): `/v1/auth`; `/v1/workspaces`,
`/v1/workspace/new`, `/v1/workspace/:slug` (+ `/update`, `/chat`, `/stream-chat`, `/chats`, `/update-embeddings`,
`/update-pin`, `/vector-search`); threads under `/v1/workspace/:slug/thread/…` (new, update, chat, stream-chat, chats);
`/v1/document/upload`, `/upload-link`, `/raw-text`, `/create-folder`, `/move-files`, `/v1/documents`; `/v1/system`,
`/system/update-env`, `/system/export-chats`, `/system/vector-count`, `/system/remove-documents`; `/v1/admin/*` (users,
invites, workspace membership, preferences); `/v1/users/:id/issue-auth-token`; `/v1/embed/*`; and an **OpenAI-compatible
façade**: `/v1/openai/chat/completions` (workspace slug = `model`, `stream` supported —
`server/endpoints/api/openai/index.js:95-137`), `/openai/models`, `/openai/embeddings`, `/openai/vector_stores`,
`/openai/images/generations`. Swagger UI is served unless `DISABLE_SWAGGER_DOCS`.

Auth = `Authorization: Bearer <api key>` checked by `server/utils/middleware/validApiKey.js` (28 lines): a plain DB lookup of
`api_keys.secret`. The `api_keys` model (`server/prisma/schema.prisma:18-25`) has **no scope, role or expiry column**.
`SECURITY.md` states it outright: API keys "intentionally grant full, unrestricted access to the entire /v1/* API surface —
equivalent to admin access". Consequence for the operator: **an API key must never be shipped inside a PWA or APK**; a thin
proxy that holds the key (or per-user JWT sessions) is required.

### 3.5 Agentic stack — real, not README-ware

| README claim | Verified in code |
|---|---|
| MCP compatibility | `server/utils/MCP/hypervisor/index.js` (553 LOC) uses `@modelcontextprotocol/sdk ^1.24.3` with `StdioClientTransport`, `SSEClientTransport`, `StreamableHTTPClientTransport` (`:4-12, :403-428`); config file `storage/plugins/anythingllm_mcp_servers.json` (`:72-84`); UI routes in `endpoints/mcpServers.js`; 2 test files under `server/__tests__/utils/MCP`. |
| No-code agent flows | `server/utils/agentFlows/` — `flowTypes.js` (start, apiCall, llmInstruction, webScraping), `executor.js` 259 LOC, tests present. Small block set; it is a linear pipeline, not a graph engine. |
| Agent skills | `server/utils/agents/aibitat/plugins/`: web-browsing, web-scraping, sql-agent, filesystem, create-files, gmail, google-calendar, outlook, rechart, memory, generate-image, create-scheduled-job, request-user-input. Tool-approval UI exists (`ChatHistory/ToolApprovalRequest`, 226 LOC). Imported/community skills: `agents/imported.js` (365 LOC). |
| Tool calling for models without native tools | `aibitat/providers/helpers/untooled.js` (464 LOC): few-shot function showcase (`:31-52`), JSON extraction + validation (`:83`), dedupe + MCP cooldown to stop call loops (`:67`). **Directly relevant to sub-4B models.** |
| Scheduled jobs | Prisma models `scheduled_jobs`, `scheduled_job_runs` (`schema.prisma:403-430`); 11 routes in `endpoints/scheduledJobs.js`; worker `jobs/run-scheduled-job.js`; web-push on completion (`web-push` dep, `frontend/public/service-workers/push-notifications.js`). |
| Model router | `model_routers` / `model_router_rules` (`schema.prisma:448-480`): `calculated` rules (property/comparator/value, AND/OR) and `llm` rules classified by an LLM with a sticky cache (`server/utils/router/index.js:10-22, 421-474`); fallback provider/model + cooldown. Routes between **server** providers only. |
| Memories | `server/utils/memories/index.js` + `jobs/extract-memories.js`: up to 5 global + 5 reranked workspace memories appended to the system prompt. |
| "Any open-source llama.cpp compatible model" (README LLM list, first bullet) | **NOT implemented in this repo.** `getLLMProvider` has 39 cases, none `native`; `"native"` exists only as an embedder (`helpers/index.js:290`). `server/storage/models/README.md:29-33` still tells users where to drop a GGUF. Stale claim — that capability lives in the closed Desktop build. |

### 3.6 Auth for a LAN-exposed instance

Three modes (`SECURITY.md`, `server/utils/middleware/validatedRequest.js`):
1. **None** — if `AUTH_TOKEN` or `JWT_SECRET` is unset the middleware is a pass-through (`:16-24`). Default after install.
2. **Single password** — `AUTH_TOKEN`; JWT carries an encrypted payload compared with bcrypt (`:43-68`).
3. **Multi-user** — users table, roles `admin/manager/default` (`multiUserProtected.js:3-9`), per-user daily message quota
   (`chat.js:51`), invites, suspend, recovery codes, simple SSO temp tokens (10-min expiry, commit #6362).

Weak spots for LAN/phone exposure, all read from code:
- `app.use(cors({ origin: true }))` (`server/index.js:65`) reflects **any** Origin.
- No rate-limit or lockout on `POST /request-token` (`server/endpoints/system.js:198`): grep for `rateLimit|lockout|maxAttempts`
  found nothing relevant; failed logins are only written to the event log.
- `GET /v1/system/env-dump` has **no** `validApiKey` middleware (`api/system/index.js:16`). It returns no data (only rewrites
  `.env` in production), so impact is low, but it is an unauthenticated write-triggering route.
- Agent WebSocket is authenticated only by the invocation UUID in the URL (`agentWebsocket.js:26-35`); the maintainers
  declare UUID-guessing out of scope (`SECURITY.md`).
- HTTPS is opt-in (`ENABLE_HTTPS`, cert paths). On a LAN over plain HTTP the JWT and password travel in clear — and a PWA
  needs HTTPS (or localhost) anyway for service workers and WASM threads (`crossOriginIsolated`).

Minimum for LAN: multi-user mode, strong `JWT_SECRET`/`SIG_KEY`/`SIG_SALT`, `DISABLE_TELEMETRY=true`,
`DISABLE_SWAGGER_DOCS=true`, TLS-terminating reverse proxy with rate limiting on `/api/request-token`.

### 3.7 `server/endpoints/mobile` (456 LOC + `models/mobileDevice.js` 251)

This is the pairing protocol for the separate **AnythingLLM Mobile** app, not a mobile web UI.
- Admin routes: `GET /mobile/devices`, `POST /mobile/update/:id`, `DELETE /mobile/:id`, `GET /mobile/connect-info`
  (`index.js:19-86`). `connect-info` returns a URL with a short temp token (`mobileDevice.js:99-107`; token = first three
  groups of a UUIDv4, held in an in-memory map with expiry `:71-88`) — rendered as a QR code (`qrcode.react` dep).
- Device routes: `POST /mobile/register` with the temp token as Bearer (`middleware/index.js:52-92`) creates a row in
  `desktop_mobile_devices` (`schema.prisma:364-375`) with `approved=false`; an admin must approve. `validDeviceOs` is
  `["android"]` only (`mobileDevice.js:23`).
- Afterwards every call carries `x-anythingllm-mobile-device-token` (`middleware/index.js:14`); `POST /mobile/send/:command`
  multiplexes `workspaces`, `workspace-content`, `model-tag`, `reset-chat`, `new-thread`, `stream-chat`
  (`utils/index.js`), the last one via `ApiChatHandler.streamChat` in `mode:"chat"` over SSE, user-scoped in multi-user mode.

The client, `Mintplex-Labs/anythingllm-mobile` (gh api, 2026-09-21): MIT, 100 stars, React Native 0.81.6, TypeScript
(1.2 MB), **`llama.rn` 0.12.9** for on-device GGUF, pushed 2026-09-20, description "Chat, RAG, Agents, and more using small
models on device first". That repo — not this one — is where Mintplex solved "SLM on a phone + optional server sync", and it
deserves its own dossier. It is React Native, so it does not give a PWA, but its sync design is the closest prior art to the
operator's goal. (Only its metadata, `package.json` and LICENSE were read here; its code quality is UNVERIFIED.)

---

## 4. Scores

| Axis | Score | Why |
|---|---|---|
| maturity | **5** | 3+ years, v1.16.1, daily merged fixes with PR numbers, GHSA patches, 23 advisories processed, Docker/cloud templates, 62 server tests in CI. |
| code_quality | **3** | Readable, heavily commented, consistent. But: plain JS/JSX with no types, no base class for 38+41 near-duplicate providers, 39-case switches repeated 4×, a 1,607-line `updateENV.js`, providers coupled to the HTTP response, 0 frontend tests, stale pins (`langchain 0.1.36`, `@langchain/core 0.1.61`, `prisma 5.3.1`, `vite ^4.3`). |
| chat_ux | **4** | Streaming with abort, threads, fork/edit/regenerate, citations sidebar, reasoning (`<think>`) container, chain-of-thought steps, tool-approval cards, clarifying questions, charts, attachments + DnD, STT (browser + server), TTS (incl. in-browser Piper), slash commands, model picker, i18n. Desktop-first density; not a "premium consumer" feel. |
| agentic | **5** | MCP (3 transports), native + prompt-based tool calling, skills incl. SQL/filesystem/Gmail/Calendar, flows, scheduled jobs with push, router, memories, human-in-the-loop approval. All found in code. |
| mobile_pwa | **2** | `manifest.json` (display standalone, one `sizes:"any"` icon) + `PWAContext.jsx` standalone detection + 51 files using `isMobile`. The **only** service worker is push notifications (`frontend/public/service-workers/push-notifications.js`): no app-shell cache, no offline, no local history, no on-device LLM. Android story is a separate RN app. |

---

## 5. Liftable units

Paths relative to repo root. LOC by `wc -l`. "Transplant" = into a Vite + React + TypeScript app (or its optional Node backend).

| # | What | Paths | LOC | Deps | Transplant | Why take it rather than write it |
|---|---|---|---|---|---|---|
| 1 | **Prompt-based tool calling for models without native tools** | `server/utils/agents/aibitat/providers/helpers/untooled.js`, `…/utils/dedupe.js` | 464 + 152 | `uuid`; `safeJsonParse` (`utils/http`), `extractReasoningContent` (`helpers/chat/responses.js`) — two tiny helpers to copy along | **moderate** — CommonJS, mixin expects `this.client`/`formatMessageWithAttachments` from the provider class; re-type as a TS class taking a `complete(messages)` callback. Runs fine in a browser once decoupled (no Node APIs). | Battle-tested on weak local models: few-shot function showcase, JSON repair/validation, duplicate-call and MCP-cooldown guards against infinite loops. Exactly the failure modes a 1–4B wllama model will hit. |
| 2 | **Context-window compressor** | `server/utils/helpers/chat/index.js` (`messageArrayCompressor` `:49`, `cannonball` `:314`, `fillSourceWindow` `:382`), `server/utils/helpers/tiktoken.js` | 448 + 108 | `js-tiktoken`; `sourceIdentifier`, `convertToPromptHistory` | **moderate** — pure functions, but tied to the `llm.limits{system,history,user}` shape and to tiktoken (wrong tokenizer for GGUF models; swap in wllama's `tokenize`). | With 2–4k usable context on a phone, budgeted truncation (middle-out "cannonball", 15/15/70 split) is the difference between a working and a crashing chat. Edge cases already paid for. |
| 3 | **MCP client hypervisor** | `server/utils/MCP/hypervisor/index.js`, `server/utils/MCP/index.js`, tests in `server/__tests__/utils/MCP/` | 553 + 285 | `@modelcontextprotocol/sdk`, `helpers/shell.js` (PATH patching for stdio) | **moderate**, server-only — stdio transport cannot run in a browser. Lift into the optional Node backend; convert tools to the agent's function schema. | Handles all three transports, per-server boot results, reload/toggle, config-file lifecycle, tool suppression. Comes with tests. |
| 4 | **In-browser TTS worker (Piper/ONNX WASM)** | `frontend/src/utils/piperTTS/index.js`, `…/worker.js`, consumer `…/HistoricalMessage/Actions/TTSButton/piperTTS.jsx` | 256 + 217 | `@mintplex-labs/piper-tts-web`, `onnxruntime-web` | **easy** — self-contained worker + client, JSDoc-typed; rename to `.ts`. | Offline speech on the phone with a correct stream-supersede/abort protocol (`worker.js:6-14`) — the same worker pattern wllama needs. |
| 5 | **Markdown → safe HTML pipeline** | `frontend/src/utils/chat/markdown.js`, `…/plugins/markdown-katex.js`, `…/purify.js`, `…/hljs-libraries/svelte.js`, `…/themes/*.css` | 129 + 245 + 8 + 48 | `markdown-it`, `highlight.js`, `katex`, `dompurify`, `he` | **easy** — but it emits HTML strings with Tailwind classes and a `data-code-snippet` copy-button convention wired elsewhere. | Correct ordering (render → DOMPurify), HTML off by default (`markdown.js:14`), KaTeX plugin already debugged. Only worth it if the new app is markdown-it based; a `react-markdown` stack makes this moot. |
| 6 | **Reasoning/thought splitter** | `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ThoughtContainer/index.jsx` (regexes `:65-86`) | 87 | React, icons | **easy** | Small, but handles open-without-close `<think>` while streaming — needed for Qwen3/DeepSeek-R1-distill GGUFs. |
| 7 | **SSE-over-POST client + event reducer** | `frontend/src/models/workspace.js:140-229`, `frontend/src/utils/chat/index.js` | ~90 + 230 | `@microsoft/fetch-event-source`, `uuid` | **easy** as a *server-mode adapter*; do not adopt its state shape app-wide. | Gives wire compatibility with a stock AnythingLLM backend (event vocabulary in §3.1) including abort and `openWhenHidden`. Needed only for the "sit beside" bridge. |
| 8 | **Device pairing protocol (QR → temp token → approval → device token)** | `server/endpoints/mobile/` (3 files), `server/models/mobileDevice.js` | 456 + 251 | express, prisma, `ip`, `uuid` | **hard to lift, free to use** — it is Prisma/Express-bound; but a PWA/APK can simply *speak* it to a stock server. Caveat: `validDeviceOs` only accepts `"android"` (`mobileDevice.js:23`). | A reviewed, admin-approved pairing flow that avoids putting an admin API key on the phone. |
| 9 | Model router | `server/utils/router/index.js`, `server/models/modelRouter*.js`, `aibitat/plugins/router-classifier.js` | 653 + models | prisma, provider stack | **hard** — entangled with Prisma models and server providers | Take the *idea* (calculated rules first, LLM classifier second, sticky cache) for "on-device vs server" routing; the code is not portable. |

Not worth lifting: the 38 provider classes (the new app needs one OpenAI-compatible client plus wllama), the settings/admin
UI (77k LOC of untyped JSX tied to their API), `updateENV.js`, the collector (use it as a service instead).

---

## 6. Red flags

1. **AGPL-3.0 directory inside an MIT repo** (`open-computer/`, 4,163 files). Any bulk copy is a licence accident.
2. **No client-side LLM, no offline, no real PWA.** The operator's core requirement is absent by design (§3.3, §4).
3. **Telemetry is ON by default**: PostHog key hard-coded (`server/models/telemetry.js:11`), sent unless
   `DISABLE_TELEMETRY === "true"` (`:50`). Every chat fires `sent_chat` with provider/model/vector-DB names
   (`server/endpoints/chat.js:69-77`). No content is sent, per code and `TERMS_SELF_HOSTED.md` §2.
4. **Unscoped admin API keys** (§3.4) and `cors({origin:true})` + no login throttling (§3.6). Fine for a trusted box; not for
   an instance phones reach over Wi-Fi without a reverse proxy.
5. **Stale README claim**: native llama.cpp/GGUF LLM listed first among supported LLMs; not present in this server (§3.5).
6. **No TypeScript, no frontend tests.** Anything lifted into a TS app needs typing by hand; regressions in a fork would be
   caught only by eye.
7. **Heavy, partly dated dependency set**: LangChain 0.1.x pins, `openai 4.95.1`, `@xenova/transformers ^2.14`, LanceDB,
   jsdom, `chartjs-node-canvas`, mssql/mysql2/pg; the collector adds `puppeteer ~21.5.2` and `tesseract.js ^6`
   (`collector/package.json:40,44`). The Docker image is large (size UNVERIFIED — not pulled).
8. **Fork drag**: 30 commits in 10 days (2026-09-08..17), many touching providers and the chat path; a fork that edits `stream.js`, `workspace.js` and the
   provider switches will conflict continuously.
9. **Per-token full-history state updates**: `setChatHistory([..._chatHistory])` on every chunk
   (`frontend/src/utils/chat/index.js:185`), mitigated by `memo` on `HistoricalMessage` (`:212, :315`). Acceptable on desktop;
   on a phone that is *also* running the model on the same cores it competes with inference. UNVERIFIED as a measured problem.
10. Security hygiene is otherwise decent: every `dangerouslySetInnerHTML` sink fed by model output that I inspected goes through `DOMPurify.sanitize`
    (21 usages in `frontend/src`; the unsanitised ones found are static i18n strings and hljs output of a fixed embed snippet); no `eval`/`new Function` in
    `server/`, `frontend/src/`, `collector/`; secrets encrypted at rest with `SIG_KEY`/`SIG_SALT`.

---

## 7. Verdict: fork, extend, or sit beside?

**Sit beside it.**

- *Fork* — no. The thing the operator wants (tokens generated in the browser, offline-capable, installable, phone-first) is
  precisely the thing AnythingLLM's architecture excludes. A fork would keep ~190k LOC of untyped JS to reuse a chat pane, then
  fight upstream on every merge.
- *Extend (upstream a provider)* — no. A provider here is a server class that writes to an Express response; "the browser" is
  not expressible in that contract, and the maintainers' on-device answer is already a different repo (`anythingllm-mobile`,
  llama.rn).
- *Sit beside* — yes. Concretely:
  1. Build the PWA/landing/APK as its own Vite + React + TS app around wllama. It owns local history (IndexedDB/OPFS), the
     model cache, and the chat UX.
  2. Define one `ChatEngine` interface in the new app with two implementations: `WllamaEngine` (on-device) and
     `AnythingLLMEngine` (server). The second is ~300 lines: either the OpenAI-compatible
     `POST /api/v1/openai/chat/completions` (`model` = workspace slug, `stream:true`) or the native
     `/api/v1/workspace/:slug/stream-chat` using unit #7's event vocabulary to get citations and metrics.
  3. Run **stock, unmodified** AnythingLLM in Docker as the server brain for what a phone cannot do: document ingestion and
     RAG, MCP tools, agent skills, scheduled jobs, bigger models via `LLM_PROVIDER=generic-openai` → llama.cpp/Ollama on the
     RTX 4070. Configure it headlessly with env + `POST /api/v1/system/update-env`. Upgrades stay a `docker pull`.
  4. Never embed the admin API key in the client. Put a small authenticated proxy in front (or use multi-user JWT sessions /
     the `/mobile` pairing protocol), TLS included — the PWA needs HTTPS regardless.
  5. Vendor units #1, #2, #4, #6 (and #5 if markdown-it is chosen) with MIT headers; leave everything else where it is.
  6. Commission a separate dossier on `Mintplex-Labs/anythingllm-mobile` (MIT) — it is the vendor's own answer to
     "small models on device first" and the most likely source of a reusable sync design.

What this leaves unanswered (not determinable from this repo): whether AnythingLLM's RAG answers are good enough with the
operator's documents, the Docker image's real footprint, and the quality of the mobile repo's code.
