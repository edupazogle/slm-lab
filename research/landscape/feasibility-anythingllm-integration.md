# Feasibility brief 2 — running stock AnythingLLM headlessly and securely as the optional server tier

Date: 2026-09-21 · Author: research delegate (SLM Lab) · Status: evidence base for `prd/PRD.md`
Scope: **operating the unmodified upstream image** (decision D1: "sit beside it", D6: "loopback by default").
Nothing in this brief requires a code change to AnythingLLM. **No container was started, stopped or changed while
writing it** — every `docker` call used was `version` / `context ls` / `ps -a` / `inspect` / `image ls` / `volume ls`.

## Provenance

| Thing | Value |
|---|---|
| Source clone | `/home/edu/.cache/slm-src/Mintplex-Labs_anything-llm`, HEAD **`da66855`** (2026-09-17 16:23:16 -0700), shallow |
| Mobile clone | `/home/edu/.cache/slm-src/Mintplex-Labs_anythingllm-mobile`, HEAD **`10da4dd`** (2026-09-13 11:25:33 -0700) |
| Version in tree | `server/package.json:3` → `1.16.1`; `docker/Dockerfile:174` → `ENV DEPLOYMENT_VERSION=1.16.1` |
| Image on this machine | `mintplexlabs/anythingllm:latest`, id/digest `sha256:0faf4adda092…3383f49`, linux/amd64, **4.78 GB**, pulled 3 days ago (`docker image ls/inspect`, 2026-09-21) |
| Docker on this machine | Client+Engine **29.1.3** (Ubuntu package `29.1.3-0ubuntu4.1`), context `default` = `unix:///var/run/docker.sock`. **Native Linux engine inside WSL2 — not Docker Desktop** (`docker version`, `docker context ls`) |
| Existing container | `anythingllm`, image `mintplexlabs/anythingllm`, **`Exited (137) 58 minutes ago`**, `NetworkMode=host`, `PortBindings={}`, no caps, volume `anythingllm-storage → /app/server/storage`, env `DISABLE_TELEMETRY=true`, **no `AUTH_TOKEN`, no `JWT_SECRET`** (`docker inspect anythingllm`) — this is the Phase-1 instance the critique closed (`../../critique/evidence/phase1-service-state-before.txt`) |
| Upstream docs read | docs.anythingllm.com `/agent/custom/introduction`, `/mcp-compatibility/docker` (2026-09-21, via WebFetch) |

All `path:line` below are relative to the clone root unless prefixed `mobile:`.

---

## 1. Configuration surface: what can be set from the environment

### 1.1 The two example files are not the same file

`docker/.env.example` (573 lines) is the one to copy for a container; `server/.env.example` (584 lines) is for bare
metal and has some values **uncommented** that the docker one leaves commented:

| Key | `docker/.env.example` | `server/.env.example` | Note |
|---|---|---|---|
| `SERVER_PORT=3001` | `:1` | `:1` | the HTTP port inside the container |
| `STORAGE_DIR="/app/server/storage"` | `:2` (set) | `:414` (commented, "absolute filesystem path with no trailing slash") | **must be set for the container**, see §1.4 |
| `UID` / `GID` `'1000'` | `:3-4` | — | build args only (`Dockerfile:5-6`) |
| `SIG_KEY` / `SIG_SALT` ("at least 32 chars") | `:5-6` (commented) | `:4-5` (**uncommented**) | at-rest encryption, §1.5 |
| `JWT_SECRET` ("at least 12 chars") | `:7` (commented, "Only needed if AUTH_TOKEN is set") | `:2` (**uncommented**) | session signing |
| `JWT_EXPIRY="30d"` | `:8` | `:3` | session TTL |
| `LLM_PROVIDER='generic-openai'` + `GENERIC_OPEN_AI_*` | `:82-87` | `:88-92` | §1.2 |
| `EMBEDDING_ENGINE='native'` + `EMBEDDING_MODEL_PREF='Xenova/all-MiniLM-L6-v2'` | `:200-201` | `:207` | in-process embedder, §4.2 |
| `VECTOR_DB="lancedb"` | `:290` (commented) | `:319` (**uncommented**) | file-backed, inside `STORAGE_DIR` |
| `AUTH_TOKEN="hunter2"` ("password to your application if remote hosting") | `:406` | `:413` | §2 |
| `DISABLE_TELEMETRY="false"` | `:407` | (absent) | §4.1 |
| `PASSWORDMINCHAR…PASSWORDREQUIREMENTS` | `:415-421` | `:421-…` | multi-user password policy only |
| `ENABLE_HTTPS` / `HTTPS_CERT_PATH` / `HTTPS_KEY_PATH` | `:428-430` | — | opt-in TLS (`server/index.js:75-79`) |
| `DISABLE_VIEW_CHAT_HISTORY` | `:491` | — | |
| `SIMPLE_SSO_ENABLED` / `SIMPLE_SSO_NO_LOGIN` | `:498-499` | — | needed for `/v1/users/:id/issue-auth-token` (§5.7) |
| `COLLECTOR_ALLOW_ANY_IP`, `COLLECTOR_PORT=8888` | `:504-507` | — | document collector, §3.3 |
| `ANYTHINGLLM_CHROMIUM_ARGS="--no-sandbox,--disable-setuid-sandbox"` | `:514-517` — verbatim: *"This is only required on Linux machines running AnythingLLM via Docker and do not want to use the `--cap-add=SYS_ADMIN` docker argument"* | — | §3.4 |
| `DISABLE_SWAGGER_DOCS="true"` ("recommended for production deployments") | `:519-521` | — | turns off `/api/docs` (`server/swagger/utils.js:12-18`) |
| `MCP_NO_COOLDOWN` | `:523-526` | — | §6 |
| `PROVIDER_DISABLE_NATIVE_TOOL_CALLING="generic-openai,…"` | `:528-531` | — | force prompt-based tool calling for weak models |
| `AGENT_MAX_TOOL_CALLS=10` | `:533-535` | — | "prevents some lower-end models from infinite recursive tool calls" |
| `AGENT_SKILL_RERANKER_ENABLED` / `_TOP_N=15` | `:537-543` | — | on by default; claims up to 80 % tool-token saving |
| `AGENT_AUTO_APPROVED_SKILLS=create-pdf-file,…` | `:557-559` | — | §7.3 — **load-bearing for API-driven agents** |
| `EMBED_REQUIRE_ALLOWLIST="true"` | `:569-573` | — | hardens public embed widgets |

### 1.2 Preconfiguring the LLM provider

`generic-openai` is read straight out of `process.env` by the provider constructor
(`server/utils/AiProviders/genericOpenAi/index.js:18-51`):

- `GENERIC_OPEN_AI_BASE_PATH` — **required**, else `throw new Error("GenericOpenAI must have a valid base path…")` (`:19-23`)
- `GENERIC_OPEN_AI_MODEL_PREF` — **required**, else `throw new Error("GenericOpenAI must have a valid model set.")` (`:40-41`)
- `GENERIC_OPEN_AI_API_KEY` — passed as `apiKey` (`:29`); may be null
- `GENERIC_OPEN_AI_MAX_TOKENS` — default **1024** (`:37-39`)
- `GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT` — default **4096** (`:99-113`), split 15 % system / 15 % history / 70 % user (`:42-46`)
- `GENERIC_OPENAI_STREAMING_DISABLED="true"` kills streaming (`:94-95`)
- `GENERIC_OPEN_AI_CUSTOM_HEADERS="X-A:b,X-C:d"` (`:62-78`)

**Instrument warning.** Env values set at container start are **not validated** — `updateENV`'s checks
(`isValidURL`, `validDockerizedUrl`, `supportedLLM`, …) run only on the HTTP path (`server/utils/helpers/updateENV.js:1412-1468`).
A wrong base path therefore boots fine and fails at the first chat. Prove the wiring with a real completion (§5.4),
never with "the container is up".

### 1.3 `KEY_MAPPING`: the names the API uses

`server/utils/helpers/updateENV.js:4` opens `const KEY_MAPPING = {` — camel-case API key → env key + validators.
The rows that matter here:

| API key (`POST /v1/system/update-env`) | env key | checks | file:line |
|---|---|---|---|
| `LLMProvider` | `LLM_PROVIDER` | `isNotEmpty`, `supportedLLM` | `:5-8` |
| `GenericOpenAiBasePath` | `GENERIC_OPEN_AI_BASE_PATH` | `isValidURL` | `:204-207` |
| `GenericOpenAiModelPref` | `GENERIC_OPEN_AI_MODEL_PREF` | `isNotEmpty` | `:208-211` |
| `GenericOpenAiTokenLimit` | `GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT` | `nonZero` | `:212-215` |
| `GenericOpenAiKey` | `GENERIC_OPEN_AI_API_KEY` | none | `:216-219` |
| `GenericOpenAiMaxTokens` | `GENERIC_OPEN_AI_MAX_TOKENS` | `nonZero` | `:220-223` |
| `EmbeddingEngine` | `EMBEDDING_ENGINE` | `supportedEmbeddingModel`; **postUpdate `handleVectorStoreReset`** | `:247-251` |
| `EmbeddingBasePath` | `EMBEDDING_BASE_PATH` | `isNotEmpty`, `validDockerizedUrl` | `:252-255` |
| `EmbeddingModelPref` | `EMBEDDING_MODEL_PREF` | `isNotEmpty`; postUpdate reset + **model download** | `:256-261` |
| `VectorDB` | `VECTOR_DB` | `supportedVectorDB`; postUpdate reset | `:345-349` |
| `AuthToken` | `AUTH_TOKEN` | **`requiresForceMode`**, `noRestrictedChars` | `:581-584` |
| `JWTSecret` | `JWT_SECRET` | **`requiresForceMode`** | `:585-588` |
| `DisableTelemetry` | `DISABLE_TELEMETRY` | none; preUpdate fires a `telemetry_disabled` event | `:589-597` |

Three consequences:

1. **`AUTH_TOKEN` and `JWT_SECRET` cannot be set through the developer API.** `requiresForceMode` returns
   `"Cannot set this setting."` unless `force === true` (`:1274-1276`), and `/v1/system/update-env` calls
   `updateENV(body)` with no force (`server/endpoints/api/system/index.js:146`). Only the UI route
   `POST /api/system/update-password` passes `force = true` (`server/endpoints/system.js:638-644`). **So the password
   must come from the environment at container start** — which is what we want anyway.
2. `noRestrictedChars` limits the password alphabet to `^[a-zA-Z0-9_\-!@$%^&*();]+$` (`:1303-1308`). A hex or
   alphanumeric secret is safe; base64 (`+`, `/`, `=`) is not.
3. A value that is all asterisks is silently dropped as a masked UI placeholder (`:1417`).

### 1.4 Env precedence, and the `.env` write-back trap

`server/index.js:1-3` loads dotenv **without override**, so `docker run -e …` wins over anything in the mounted
`.env`. But `updateENV` mutates `process.env` live (`:1456`) and, when `NODE_ENV === "production"` (set in
`Dockerfile:172`), calls `dumpENV()` (`:1466`), which writes **every protected key — including `AUTH_TOKEN`,
`JWT_SECRET`, `SIG_KEY`, `SIG_SALT` — in plaintext** to `path.join(__dirname, "../../.env")` = `/app/server/.env`
(`:1492-1601`, path at `:1599-1600`). Also triggered by the **unauthenticated** `GET /api/system/env-dump`
(`server/endpoints/system.js:91-96`) and `GET /api/v1/system/env-dump` (`server/endpoints/api/system/index.js:16-35`,
**no `validApiKey` middleware**).

Practical rule: **do not mount a host `.env` file** (the upstream quickstart does: `HOW_TO_USE_DOCKER.md:61`). Keep the
env file on the host as `--env-file` only. Then `/app/server/.env` lives in the container's writable layer, dies with
the container, and the environment stays the single source of truth. Cost: settings changed in the UI revert on
`docker rm` + re-run — acceptable, and honest.

### 1.5 `SIG_KEY` / `SIG_SALT` must be supplied

`EncryptionManager` self-assigns random key+salt and dumps them if they are unset
(`server/utils/EncryptionManager/index.js:28-49`). With no `.env` mount that pair is **regenerated on every container
re-creation**, and anything encrypted with the old pair (the single-user session JWT payload, stored provider/agent
secrets) becomes undecryptable. Supply both explicitly (≥32 chars).

---

## 2. Password protection, multi-user, and API keys without the UI

### 2.1 The three auth modes

`server/utils/middleware/validatedRequest.js`:

- **No auth (default).** If `NODE_ENV === "development"` **or** `AUTH_TOKEN` is unset **or** `JWT_SECRET` is unset, the
  middleware calls `next()` (`:16-24`). Every UI route is then open to anything that can reach the port.
- **Single password.** `AUTH_TOKEN` + `JWT_SECRET` → `POST /api/request-token {"password":…}` returns a JWT whose `p`
  claim is the password encrypted with `SIG_KEY`/`SIG_SALT` (`server/endpoints/system.js:311-344`); the middleware
  bcrypt-compares it (`:43-68`).
- **Multi-user.** A DB flag (`SystemSettings.isMultiUserMode`, `server/models/systemSettings.js:750-758`) switches to
  `validateMultiUserRequest` (`:74-111`): username/password login, roles `admin/manager/default`. Enabled only through
  the UI route `POST /api/system/enable-multi-user` (`server/endpoints/system.js:655-715`) — which is reachable by curl
  with a valid session, so it is headless-able, but there is **no env var** for it.

**For the SLM Lab optional tier: single-password mode is enough and is fully env-driven.** Multi-user only earns its
keep if several humans share the box; it also *removes* the single-user API-key routes (see 2.3).

### 2.2 Onboarding completes itself — no UI visit needed

`server/utils/boot/markOnboarded.js:37-50`: onboarding is auto-marked complete at boot if **any** of
`LLM_PROVIDER`, `VECTOR_DB`, `AUTH_TOKEN`, `JWT_SECRET` is set, or multi-user is on. It runs on every boot
(`server/utils/boot/index.js:36` and `:70`). The recommended run sets all four → `GET /api/onboarding` returns
`{"onboardingComplete":true}` on first boot. (Phase 1 saw `false` precisely because none were set.)

### 2.3 Minting an API key headlessly

`POST /api/system/generate-api-key` (`server/endpoints/system.js:1054-1082`) is a **UI** route: `validatedRequest`
only, and it 401s when multi-user is on (`:1059-1061`). In multi-user mode the equivalent is
`POST /api/admin/generate-api-key` (`server/endpoints/admin.js:519-542`, admin role). Both return
`{apiKey:{id,secret,…}}`; the secret is stored **in plaintext** in `api_keys.secret` and is readable back through
`GET /api/system/api-keys` (`:1034-1052`).

So: log in with the password, POST once, keep the secret. Full sequence in §4.3.

> **This is the security hole that makes `AUTH_TOKEN` mandatory, not optional.** With no password, *anyone who can
> reach :3001 can mint an admin API key* — and `server/index.js:65` is `app.use(cors({ origin: true }))`, which reflects
> any `Origin` and approves any preflight. A hostile page open in the operator's browser can therefore POST to
> `http://127.0.0.1:3001/api/system/generate-api-key` and read the response, loopback binding notwithstanding. (Modern
> Chrome's private/local-network-access gating may block part of this — **UNVERIFIED**, do not rely on it.) Phase 1 ran
> in exactly this state on *all interfaces* (`critique/evidence/phase1-service-state-before.txt`).

### 2.4 What an API key is worth

`server/utils/middleware/validApiKey.js:4-25` is a plain `Authorization: Bearer <secret>` → DB lookup. No scope, no
expiry. `SECURITY.md:51`: *"Developer API keys are **system-level credentials** … intentionally grant full,
unrestricted access to the entire `/v1/*` API surface — equivalent to admin access."* Therefore: **never ship the key
in the PWA or the APK.** It belongs in `app/serve.py` (or another server-side proxy) which the browser talks to
same-origin. This is the same rule D6 already imposes.

---

## 3. Loopback-only under Docker, on *this* machine

### 3.1 Bind on the host side, not in the app

The Node server binds with no host argument (`server/utils/boot/index.js:68`), i.e. all interfaces **inside the
container** — the isolation must come from the publish flag: `-p 127.0.0.1:3001:3001`. Do **not** use
`--network host` (what the current, stopped container has: `NetworkMode=host`), because then `SERVER_PORT` 3001 **and
the collector's 8888** land on every interface — exactly the Phase-1 finding (`*:3001`, `*:8888` in the evidence file).

Docker Engine 28+ additionally stops other hosts on the LAN from routing to ports published on `127.0.0.1`
([Docker blog, "Docker Engine 28: Hardening Container Networking by Default"](https://www.docker.com/blog/docker-engine-28-hardening-container-networking-by-default/));
this machine runs 29.1.3, so that hardening is in force.

### 3.2 `127.0.0.1` inside a container is the container

`docker/HOW_TO_USE_DOCKER.md:22-32`: *"If you are running another service on localhost … you will need to use
`http://host.docker.internal:xxxx` … **Linux**: add `--add-host=host.docker.internal:host-gateway`."* This machine is
**native Linux docker inside WSL2**, not Docker Desktop, so the flag is required (Docker Desktop injects the name
automatically). `host-gateway` resolves to the bridge gateway, here **`172.17.0.1`** (`ip -4 addr`: `docker0 inet
172.17.0.1/16`).

**The catch that will bite:** the SLM Lab's OpenAI-compatible server is expected on `http://127.0.0.1:8000/v1`, and a
process bound to `127.0.0.1` on the host is **not reachable from the container** via `172.17.0.1`. Options, best first:

1. **Bind the inference server to the bridge address**: `llama-server --host 172.17.0.1 --port 8000`. Reachable from
   the host and from containers; not on `eth0`, and WSL2 NAT keeps it off the LAN anyway. (That the address accepts a
   bind while `docker0` shows `NO-CARRIER` — no container running — is **UNVERIFIED**; check with `ss -ltn`.)
2. **A forwarder**: `socat TCP-LISTEN:8000,bind=172.17.0.1,fork TCP:127.0.0.1:8000`, leaving the model server on
   loopback. (`socat` presence on this machine: UNVERIFIED.)
3. **Put the inference server in a container** on a user-defined network with AnythingLLM and address it by name
   (`http://llama:8000/v1`). Cleanest, but a GPU container needs the NVIDIA container toolkit — **UNVERIFIED** here.
4. `--network host` — **rejected** (D6, §3.1).

AnythingLLM's own guard agrees with all this: `validDockerizedUrl` (`updateENV.js:1278-1301`) refuses a loopback URL
set *through the API* when `ANYTHING_LLM_RUNTIME=docker`, with *"Please use host.docker.internal (for linux use
172.17.0.1), a real machine ip, or domain"*. It does **not** run on env values at boot (§1.2).

Also unverified and worth one test: whether the operator's **Windows** Chrome can reach a WSL container port published
on `127.0.0.1` via WSL's localhost relay (`http://localhost:3001`). WSL2 is in NAT mode here (`eth0 172.20.139.222/20`,
`/mnt/c/Users/*/.wslconfig` has no `networkingMode=mirrored`). If it cannot, use `http://172.20.139.222:3001` from
Windows — but that address is *not* loopback, so prefer testing first.

### 3.3 The collector

`docker-entrypoint.sh:19-28` starts **two** Node processes: the server (after `prisma generate` + `prisma migrate
deploy`) and `/app/collector/index.js`, which listens on `COLLECTOR_PORT` default 8888 (`collector/index.js:22,217`),
again on all container interfaces. With `-p 127.0.0.1:3001:3001` and nothing else published it is unreachable from the
host — keep it that way (do not publish 8888).

### 3.4 `--cap-add SYS_ADMIN`: what it is for, and skipping it

Upstream puts `--cap-add SYS_ADMIN` in every quickstart (`HOW_TO_USE_DOCKER.md:59,80,103`; `docker-compose.yml:16-17`).
It exists for the collector's **Puppeteer/Chromium** sandbox used by link and website scraping
(`collector/processLink/convert/generic.js:143-166`, `collector/utils/extensions/WebsiteDepth/index.js:52-75`), fed by
`browserLaunchArgs` from `ANYTHINGLLM_CHROMIUM_ARGS` (`server/utils/collectorApi/index.js:80`,
`collector/utils/runtimeSettings/index.js:34-43`). The env file says so itself (`docker/.env.example:514-517`).

**Recommendation: do not grant `SYS_ADMIN`.** It is close to root-on-host in effect. Either (a) omit it and accept that
"scrape this URL" is broken, or (b) omit it and set
`ANYTHINGLLM_CHROMIUM_ARGS="--no-sandbox,--disable-setuid-sandbox"`, accepting an unsandboxed Chromium that renders
attacker-controlled pages inside the container. For the SLM Lab tier (local documents, no web scraping) option (a) is
the default; switch to (b) deliberately if link ingestion is needed.

---

## 4. Telemetry and the other outbound calls

### 4.1 Telemetry

PostHog write key hard-coded at `server/models/telemetry.js:11`; the client is `null` — i.e. nothing is sent — only
when `process.env.DISABLE_TELEMETRY === "true"` exactly (`:50`, mirrored at `server/utils/database/index.js:86` and
`server/utils/telemetry/index.js:9`). Events carry provider/embedder/vector-DB names and a runtime tag, debounced
(`:19-32`, `:89-125`); `sent_chat` fires on every API chat (`server/endpoints/api/workspace/index.js:710-716`).
Set `DISABLE_TELEMETRY=true` (string). The Phase-1 container already had it — that part was right.

### 4.2 Egress that `DISABLE_TELEMETRY` does **not** cover

- **Model-pricing refresh**: `require("./utils/helpers/modelPricing")` at `server/index.js:7` boots a fetch of
  `https://models.dev/api.json` (`server/utils/helpers/modelPricing/index.js:70`, refresh `:190-209`, 3-day cache
  `:69`, 5 s timeout). No env switch — it will be attempted at every boot with a stale cache.
- **Native embedder download**: `EMBEDDING_ENGINE=native` pulls `Xenova/all-MiniLM-L6-v2` from Hugging Face on first
  use, with `https://cdn.anythingllm.com/support/models/` as fallback host
  (`server/utils/EmbeddingEngines/native/index.js:37,140-160`), cached under `STORAGE_DIR/models` (`:43-48`) — i.e.
  inside the named volume, so it downloads once.
- Unauthenticated info disclosure: `GET /api/setup-complete` returns `SystemSettings.currentSettings()`
  (`server/endpoints/system.js:118-126`, `server/models/systemSettings.js:453-…`). Secrets appear as booleans
  (`AuthToken: !!process.env.AUTH_TOKEN`), but **base paths and model names are returned in clear**
  (`:978-980` `GenericOpenAiBasePath`, `…ModelPref`, `…TokenLimit`). Not fatal on loopback; worth knowing before any
  tunnel is opened.

---

## 5. The developer API (`/api/v1`) — with curl

Auth for everything below: `Authorization: Bearer $ALLM_KEY` (`validApiKey`). Swagger UI at `/api/docs` unless
`DISABLE_SWAGGER_DOCS="true"` (`server/swagger/utils.js:12-18`). Routes are mounted under `/api`
(`server/index.js:81,97`), so the full path is `/api/v1/...`.

```bash
BASE=http://127.0.0.1:3001
ALLM_KEY=...        # from §4.3 step 7
H=(-H "Authorization: Bearer $ALLM_KEY" -H 'Content-Type: application/json')
```

### 5.1 Auth probe and system

```bash
curl -s "${H[@]}" $BASE/api/v1/auth                 # {"authenticated":true}        endpoints/api/auth/index.js:6
curl -s "${H[@]}" $BASE/api/v1/system               # current settings              api/system/index.js:37
curl -s "${H[@]}" $BASE/api/v1/system/vector-count   #                              api/system/index.js:74
curl -s "${H[@]}" -X POST $BASE/api/v1/system/update-env \
  -d '{"GenericOpenAiModelPref":"qwen3.5-4b-instruct"}'   #                          api/system/index.js:106-166
```
`update-env` takes **`KEY_MAPPING` names** (§1.3), applies them live and (production) rewrites `/app/server/.env`.
Remember `AuthToken`/`JWTSecret` are refused here.

### 5.2 Workspaces (`server/endpoints/api/workspace/index.js`)

```bash
curl -s "${H[@]}" -X POST $BASE/api/v1/workspace/new \
  -d '{"name":"SLM Lab","chatMode":"chat","topN":4,"similarityThreshold":0.7}'   # :28
curl -s "${H[@]}" $BASE/api/v1/workspaces                                        # :109
curl -s "${H[@]}" $BASE/api/v1/workspace/slm-lab                                 # :163
curl -s "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/update -d '{"openAiTemp":0.3}'   # :279
curl -s "${H[@]}" $BASE/api/v1/workspace/slm-lab/chats                           # :360
curl -s "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/vector-search -d '{"query":"invoice terms","topN":4}'  # :898
```
Also `DELETE /v1/workspace/:slug` (`:228`), `POST …/update-pin` (`:534`).

### 5.3 Documents: upload → embed (`server/endpoints/api/document/index.js`)

```bash
# multipart; field name is exactly "file"; addToWorkspaces is a comma-separated slug list
curl -s -H "Authorization: Bearer $ALLM_KEY" -X POST $BASE/api/v1/document/upload \
  -F 'file=@/path/to/contract.pdf' \
  -F 'addToWorkspaces=slm-lab' \
  -F 'metadata={"title":"Contract","docAuthor":"Legal"}'                          # :50-170
# returns documents[].location, e.g. "custom-documents/contract.pdf-<uuid>.json"

curl -s "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/update-embeddings \
  -d '{"adds":["custom-documents/contract.pdf-<uuid>.json"],"deletes":[]}'        # :457-528
```
Other routes: `POST /v1/document/upload/:folderName` (`:175`), `POST /v1/document/upload-link` (`:324`),
`POST /v1/document/raw-text` (`:500`), `GET /v1/documents` (`:644`), `GET /v1/document/accepted-file-types` (`:785`),
`POST /v1/document/create-folder` (`:949`), `POST /v1/document/move-files` (`:1074`).
`addToWorkspaces` does upload **and** embed in one call; `update-embeddings` is the explicit form.

### 5.4 Chat and streaming chat

```bash
curl -s "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/chat \
  -d '{"message":"What is in the contract?","mode":"chat","sessionId":"cli-1","reset":false}'   # :602-728

curl -sN "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/stream-chat \
  -d '{"message":"Summarise it","mode":"query","sessionId":"cli-1"}'                            # :736-895
```
`mode` ∈ `chat | query | automatic` (the swagger text at `:609` defines them: *query* skips the LLM unless sources
match and forgets history; *automatic* turns on native tool calling). Attachments go in `attachments[]` as data URLs;
a document attachment must use mime `application/anythingllm-document` or it is treated as an image (`:610`).
SSE frames are `data: {json}\n\n` (`server/utils/helpers/chat/responses.js:353-359`) with
`type ∈ textResponse | textResponseChunk | finalizeResponseStream | abort | agentThought | fileDownload | usageMetrics`
(grep over `utils/chats/apiChatHandler.js`, `utils/AiProviders/genericOpenAi/index.js`, `utils/agents/ephemeral.js`).
**Agents work over this endpoint**: a message containing `@agent`, or `mode:"automatic"` with a tool-calling model,
routes into `EphemeralAgentHandler` (`server/utils/chats/apiChatHandler.js:181-208`,
`server/utils/agents/ephemeral.js:617-629`).

### 5.5 Threads (`server/endpoints/api/workspaceThread/index.js`)

```bash
curl -s "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/thread/new -d '{"name":"Tax questions"}'     # :21
curl -s "${H[@]}" $BASE/api/v1/workspace/slm-lab/thread/<threadSlug>/chats                            # :245
curl -sN "${H[@]}" -X POST $BASE/api/v1/workspace/slm-lab/thread/<threadSlug>/stream-chat \
  -d '{"message":"and the penalty clause?","mode":"chat"}'                                            # :486
```
Plus `POST …/thread/:threadSlug/update` (`:111`), `DELETE …/thread/:threadSlug` (`:196`), `POST …/chat` (`:329`).

### 5.6 OpenAI-compatible façade (`server/endpoints/api/openai/index.js`) — what `ServerEngine` should use

```bash
curl -s "${H[@]}" $BASE/api/v1/openai/models          # "models" are WORKSPACES                      # :19
curl -s "${H[@]}" -X POST $BASE/api/v1/openai/chat/completions \
  -d '{"model":"slm-lab","messages":[{"role":"system","content":"Be brief"},
       {"role":"user","content":"What is AnythingLLM?"}],"stream":true,"temperature":0.7}'            # :76-192
curl -s "${H[@]}" -X POST $BASE/api/v1/openai/embeddings -d '{"input":["hello","world"]}'             # :288-347
```
Behaviour to design against, read from source:
- `model` **must be a workspace slug**, else HTTP 401 (`:117-118`).
- Only `model`, `messages`, `temperature`, `stream` are read (`:111-116`). **`tools`, `tool_choice`, `max_tokens`,
  `response_format`, `stop`, `seed` are ignored** — no tool calling and no JSON mode through this façade, and no agent
  path either (zero `agent` references in `server/utils/chats/openaiCompatible.js`).
- The last message must have `role:"user"` (`:119-130`); the first `system` message becomes the system prompt.
- Streaming chunks are re-wrapped from AnythingLLM's own format (`openaiCompatible.js:265-279`) by `formatJSON`
  (`:524-548`), which emits **`object: "chat.completion"` even for deltas** (not `chat.completion.chunk`) and there is
  **no `data: [DONE]` sentinel** — the stream just ends. Whether the stock `openai` JS/Python SDK tolerates that is
  **UNVERIFIED**; test before choosing the SDK over a hand-rolled SSE reader (we already have one in the wllama app).
- `/v1/openai/embeddings` runs whatever `EMBEDDING_ENGINE` is configured (`:311-341`) — with `native` that is
  all-MiniLM-L6-v2, 384 dims, i.e. **a free local embedding endpoint** the PWA can borrow for server-side RAG.
- Also present: `/v1/openai/images/generations` (`:193`), `/v1/openai/vector_stores` (`:355`).

### 5.7 Admin / users / embed

`/v1/admin/is-multi-user-mode` (`api/admin/index.js:15`), `/v1/admin/users` (`:41`), `/v1/admin/users/new` (`:85`),
`/v1/admin/invites` (`:270`), `/v1/admin/workspaces/:id/users` (`:441`), `/v1/admin/workspace-chats` (`:678`),
`/v1/admin/preferences` (`:734`); `/v1/users/:id/issue-auth-token` (`api/userManagement/index.js:67-69`) — **only when
`SIMPLE_SSO_ENABLED`** (middleware `simpleSSOEnabled`), returns `{token, loginPath:"/sso/simple?token=…"}`, the clean
way to hand a browser a session without exposing the API key. Embed-widget CRUD at `/v1/embed*`
(`api/embed/index.js:10,78,140,201,287,357`).

---

## 6. MCP: it consumes, it does not expose

- **Config file**: `STORAGE_DIR/plugins/anythingllm_mcp_servers.json`, created with `{"mcpServers":{}}` if missing
  (`server/utils/MCP/hypervisor/index.js:67-90`). Docs agree: *"located at `plugins/anythingllm_mcp_servers.json` in
  the AnythingLLM storage directory"* (docs.anythingllm.com/mcp-compatibility/docker).
- **Format** (from `#parseServerType` `:344-354`, `#validateServerDefinitionByType` `:364-397`, `createHttpTransport`
  `:421-440`, `updateSuppressedTools` `:140-190`, `#bootMCPServers` `:502-510`):

```jsonc
{
  "mcpServers": {
    "local-files": {                       // stdio: has "command"
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/app/server/storage/documents"],
      "env": { "FOO": "bar" },             // merged over a docker base PATH/NODE_PATH (:300-337)
      "anythingllm": { "autoStart": true, "suppressedTools": [] }
    },
    "remote-tools": {                      // http: has "url"; type omitted ⇒ SSE transport
      "url": "http://host.docker.internal:9000/sse",
      "type": "streamable",                // "sse" | "streamable" | "http"; anything else is a config error
      "headers": { "Authorization": "Bearer …" }
    }
  }
}
```
- Transports: stdio, SSE, streamable-HTTP, via `@modelcontextprotocol/sdk ^1.24.3` (`server/package.json:36`,
  hypervisor `:4-13`). The image ships `node 18` and `uvx` 0.6.10 (`docker/Dockerfile:94-105`), so `npx`/`uvx` servers
  can run **inside** the container. Docs: *"we do **not** support Resources, Prompts, or Sampling"* — tools only.
- **Management is UI-authenticated, not API-key**: `server/endpoints/mcpServers.js` exposes
  `/mcp-servers/force-reload`, `/list`, `/toggle`, `/delete`, `/toggle-tool`, all `[validatedRequest,
  flexUserRoleValid([ROLES.admin])]` — and **there is no "add server" route**: you write the JSON file and reload.
  Headless recipe: `docker cp` the file into the volume (or write it on the host if the volume is bind-mounted), then
  `curl -H "Authorization: Bearer $JWT" $BASE/api/mcp-servers/force-reload`.
- MCP tools reach the model only through the **agent** path (`@agent` / `mode:"automatic"`), as `@@mcp_<server>`
  plugins (`server/utils/agents/index.js:645-660`).
- **Can AnythingLLM act as an MCP server?** No. Nothing imports `@modelcontextprotocol/sdk/server` outside its own
  tests (`grep -rl "sdk/server"` → only `server/__tests__/utils/MCP/*`), and the docs make no such claim. If the SLM
  Lab wants to expose AnythingLLM to an MCP client, write a thin MCP server that calls `/api/v1` — the PRD should say
  so rather than imply a built-in.

---

## 7. Agent skills, flows, and the approval trap

### 7.1 Custom skills (`STORAGE_DIR/plugins/agent-skills/<hubId>/`)

Loader: `server/utils/agents/imported.js:6-9` (path), `:35-44` (`plugin.json` per folder), `:66-81` (only
`active: true` are loaded, as `@@<hubId>`), `:213-250` (how the manifest becomes a tool: `description`, `examples`,
and JSON-schema `parameters` from `entrypoint.params`). Manifest schema is committed:
`server/utils/agents/imported-manifest.schema.json` — required keys `active, hubId, name, schema ("skill-1.0.0"),
version, description, entrypoint{file, params}, imported: true`; optional `author`, `license`, `setup_args`
(rendered as UI inputs, injected as `runtimeArgs`), `examples[{prompt, call}]`.
`handler.js` must export `module.exports.runtime = { handler }` and, per the docs, *"All skills must return a `string`
type response - anything else may break the agent invocation."* `this` inside the handler carries `introspect`,
`logger`, `runtimeArgs`, `config` plus `webScraper` and `requestToolApproval` (`imported.js:214-250`, approval fn at `:243`). Docs also warn:
*"Only run custom agent skills you trust"*. **This is arbitrary Node code running as uid 1000 inside the container.**

### 7.2 Flows (`STORAGE_DIR/plugins/agent-flows/<uuid>.json`)

`server/utils/agentFlows/index.js:18-20` (dir), `executor.js:218-234` (`flow.config.steps`, a linear list).
Block types: `start` (declares `variables`), `apiCall`, `llmInstruction`, `webScraping`
(`server/utils/agentFlows/flowTypes.js:1-85`). Active flows load as `@@flow_<uuid>`.

### 7.3 Tool approval over REST is **auto-deny**

`server/utils/agents/aibitat/plugins/http-socket.js:117-158` (the plugin the ephemeral/REST agent attaches,
`server/utils/agents/ephemeral.js:568-572`): a skill that asks for approval is auto-approved only if it is in
`AGENT_AUTO_APPROVED_SKILLS` (`server/utils/helpers/agents.js:12-27`) or whitelisted in the DB; otherwise —
*"Tool approval requested … but no Telegram context available. Auto-denying for safety."* Interactive approval exists
only over the UI WebSocket (`plugins/websocket.js:219-310`) or Telegram. So **any agent flow we drive from `/api/v1`
must have its skills pre-approved by env or whitelist, or it will silently refuse to act.**

---

## 8. Mobile pairing (`server/endpoints/mobile/`, 456 LOC + `server/models/mobileDevice.js`, 251)

Protocol, as coded:

1. Admin (JWT session) calls `GET /api/mobile/connect-info` (`endpoints/mobile/index.js:84-97`) →
   `{"connectionUrl":"/api/mobile?t=<temp>"}`. In production the URL is **relative**
   (`models/mobileDevice.js:99-108`); the temp token is the first three groups of a UUIDv4, held in an in-memory map
   and valid **3 minutes** (`:61-77`).
2. The web UI turns it into a QR by prefixing `window.location.origin` — and **throws if the origin is
   `localhost`/`127.0.0.1`/`0.0.0.0`**: *"Please open this page via your machines private IP address or custom domain.
   Localhost URLs will not work with the mobile app."*
   (`frontend/src/pages/GeneralSettings/MobileConnections/ConnectionModal/index.jsx:88-109`).
3. The phone scans the QR (mobile: `src/screens/ConnectToInstance/Main/index.tsx:25-42` — protocol must be http/https,
   **pathname must be exactly `/api/mobile`**, token read from `?t=`), then `POST <url>/register` with
   `Authorization: Bearer <temp>` and `{deviceName, deviceOs: Platform.OS}`
   (mobile: `src/utils/AnythingLLMExternal/index.ts:60-82`). Server side: `validRegistrationToken`
   (`endpoints/mobile/middleware/index.js:52-92`) consumes the token; `MobileDevice.create` rejects anything but
   `deviceOs === "android"` (`models/mobileDevice.js:23,118-124`) and stores the row `approved: false`.
4. An admin approves: `GET /api/mobile/devices` then `POST /api/mobile/update/:id {"approved":true}`
   (`endpoints/mobile/index.js:19-58`; `writable: ["approved"]`).
5. Afterwards every call carries `x-anythingllm-mobile-device-token` (`middleware/index.js:12-42`); commands are
   `POST /api/mobile/send/:command` for `workspaces`, `workspace-content`, `model-tag`, `reset-chat`, `new-thread`,
   `stream-chat` (SSE, `mode:"chat"`), `unregister-device` (`endpoints/mobile/utils/index.js:16-199`).

Consequences for a loopback-bound instance:

- **The UI QR path is blocked** by step 2's localhost check. Headless workaround: fetch `connect-info` with the session
  JWT and render the QR yourself from a URL the phone can actually resolve. The mobile app has **no manual URL entry**
  — QR only (no `TextInput` anywhere under `src/screens/ConnectToInstance`, no deep-link intent filter for it).
- Cleartext http is allowed by the app on `localhost`, `127.0.0.1`, `10.0.2.2` and `192.168.*`
  (mobile: `android/app/src/main/res/xml/network_security_config.xml`), so `http://127.0.0.1:3001/api/mobile?t=…`
  **combined with `adb reverse tcp:3001 tcp:3001`** is the loopback-preserving pairing route. Whether that chain works
  from WSL2 (adb over usbipd, or Windows-side adb + WSL localhost relay) is **UNVERIFIED** — see brief 3.
- The 3-minute token expiry means generate → display QR → scan must happen in one go.
- This pairing exists for **Mintplex's own Android app**, which is a separate product (D3 Track B). Our PWA/Capacitor
  app should **not** speak it: it gets a scoped route through `serve.py`, not a device token. Listed here because it is
  the only built-in way to give a phone server access *without* handing it an admin API key.

---

## 9. Recommended `docker run` for this machine

Prepared, not executed. Written for: loopback only, password on, telemetry off, no `SYS_ADMIN`, named volume,
provider preconfigured against the local OpenAI-compatible server, env file as the single source of truth.

```bash
# --- 1. secrets file (host side, never committed; AUTH_TOKEN alphabet is restricted, so use hex) -----------
umask 077
mkdir -p ~/.config/slm-lab
cat > ~/.config/slm-lab/anythingllm.env <<EOF
# --- instance ---
SERVER_PORT=3001
STORAGE_DIR=/app/server/storage
AUTH_TOKEN=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRY=7d
SIG_KEY=$(openssl rand -hex 32)
SIG_SALT=$(openssl rand -hex 32)
DISABLE_TELEMETRY=true
DISABLE_SWAGGER_DOCS=true
DISABLE_VIEW_CHAT_HISTORY=
# --- LLM: the local OpenAI-compatible server (see §3.2 — it must NOT be bound to 127.0.0.1 only) ---
LLM_PROVIDER=generic-openai
GENERIC_OPEN_AI_BASE_PATH=http://host.docker.internal:8000/v1
GENERIC_OPEN_AI_MODEL_PREF=qwen3.5-4b-instruct     # exact id your server reports at /v1/models
GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT=8192
GENERIC_OPEN_AI_MAX_TOKENS=1024
GENERIC_OPEN_AI_API_KEY=slm-lab-local              # set one on llama-server too; the SDK sends it
# --- embeddings + vectors: local, no third party ---
EMBEDDING_ENGINE=native
EMBEDDING_MODEL_PREF=Xenova/all-MiniLM-L6-v2
VECTOR_DB=lancedb
# --- agents on small models ---
AGENT_MAX_TOOL_CALLS=10
# PROVIDER_DISABLE_NATIVE_TOOL_CALLING=generic-openai   # enable if native tool calls misbehave
# AGENT_AUTO_APPROVED_SKILLS=                            # REQUIRED for any skill used over /api/v1 (§7.3)
EOF

# --- 2. run -------------------------------------------------------------------------------------------
docker volume create slm_anythingllm_storage            # fresh; leave Phase-1's anythingllm-storage alone

docker run -d \
  --name slm-anythingllm \
  --restart no \
  -p 127.0.0.1:3001:3001 \
  --add-host=host.docker.internal:host-gateway \
  --env-file ~/.config/slm-lab/anythingllm.env \
  -v slm_anythingllm_storage:/app/server/storage \
  --security-opt no-new-privileges \
  --memory 4g --memory-swap 4g \
  mintplexlabs/anythingllm@sha256:0faf4adda092f40bcb6aa5c76746e883825da117be11c27e97d1c72523383f49
```

Notes on each choice:

- **`-p 127.0.0.1:3001:3001`**, never `--network host` (§3.1). The collector's 8888 stays unpublished.
- **`--add-host=host.docker.internal:host-gateway`** is required on native Linux docker (`HOW_TO_USE_DOCKER.md:29`).
- **No `-v …/.env:/app/server/.env`** — deliberately (§1.4).
- **No `--cap-add SYS_ADMIN`** (§3.4). Link/website scraping will not work; that is the trade.
- **Pinned by digest**, because `:latest` moved on 2026-09-17 while the release tag `1.16.1` is from 2026-08-27
  (Docker Hub tag listing, 2026-09-21). Use `mintplexlabs/anythingllm:1.16.1` if a human-readable pin is preferred.
- **New named volume**: the existing `anythingllm-storage` was written by an instance that ran with no password on all
  interfaces; treat its contents (any API keys minted then) as untrusted rather than inheriting them.
- `--security-opt no-new-privileges`, `--memory 4g`: hardening/containment that upstream does not specify;
  **UNVERIFIED** against a full ingestion run (a large PDF batch through Chromium/tesseract may want more RAM). WSL2
  itself is capped at 12 GB (`/mnt/c/Users/*/.wslconfig`).
- `--restart no`: this is an *optional* tier; it should start when the operator asks, not at boot.

### 9.1 First boot without ever opening the UI

Every step below is curl-able. Nothing here needs a browser.

```bash
BASE=http://127.0.0.1:3001
set -a; . ~/.config/slm-lab/anythingllm.env; set +a

# 1. liveness — a positive marker, not an absence of errors
curl -fsS $BASE/api/ping                      # {"online":true}            endpoints/system.js:83

# 2. onboarding auto-completed because LLM_PROVIDER/VECTOR_DB/AUTH_TOKEN are set (§2.2)
curl -fsS $BASE/api/onboarding                # {"onboardingComplete":true}

# 3. prove the password is ON (this is the check Phase 1 never made)
curl -fsS $BASE/api/setup-complete | grep -o '"RequiresAuth":[a-z]*'      # "RequiresAuth":true
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/system/generate-api-key \
     -H 'Content-Type: application/json' -d '{}'                          # MUST be 401, not 200

# 4. log in
JWT=$(curl -fsS -X POST $BASE/api/request-token -H 'Content-Type: application/json' \
      -d "{\"password\":\"$AUTH_TOKEN\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 5. mint the one API key serve.py will hold
ALLM_KEY=$(curl -fsS -X POST $BASE/api/system/generate-api-key \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"name":"slm-lab-serve"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["apiKey"]["secret"])')

# 6. verify the key
curl -fsS -H "Authorization: Bearer $ALLM_KEY" $BASE/api/v1/auth        # {"authenticated":true}

# 7. create a workspace and prove the LLM wiring end to end (a real completion, not a 200)
curl -fsS -H "Authorization: Bearer $ALLM_KEY" -H 'Content-Type: application/json' \
  -X POST $BASE/api/v1/workspace/new -d '{"name":"SLM Lab"}'
curl -fsS -H "Authorization: Bearer $ALLM_KEY" -H 'Content-Type: application/json' \
  -X POST $BASE/api/v1/workspace/slm-lab/chat \
  -d '{"message":"Reply with the single word: pong","mode":"chat","sessionId":"boot-check"}'
  # look for textResponse containing "pong"; an empty/error textResponse means the base path is wrong (§1.2)
```

**Steps that still need the UI once:** none for this configuration. Three things *do* need it (or a direct file write)
if you want them: enabling **multi-user** mode (`POST /api/system/enable-multi-user` with the JWT — curl-able, but
there is no env switch), adding an **MCP server** (write the JSON into the volume, then
`GET /api/mcp-servers/force-reload` with the JWT — no create route exists), and the **mobile QR** (§8, blocked on
localhost origin; generate the QR yourself from `connect-info`).

---

## 10. Blockers, risks and open questions

| # | Item | Severity | Evidence |
|---|---|---|---|
| 1 | Without `AUTH_TOKEN` **and** `JWT_SECRET`, every UI route is open and anyone reaching the port can mint an admin API key; `cors({origin:true})` means a hostile web page counts as "reaching the port" | **blocker** | `validatedRequest.js:16-24`, `system.js:1054-1061`, `index.js:65`, `SECURITY.md:51` |
| 2 | `127.0.0.1:8000` on the host is unreachable from the container; the inference server must move to `172.17.0.1` (or a container/forwarder) | **blocker for the recommended run** | `HOW_TO_USE_DOCKER.md:22-32`, `updateENV.js:1278-1301`, `ip -4 addr` |
| 3 | API keys are unscoped, unexpiring, stored in plaintext, and equal admin — so no key may ever ship inside the PWA/APK; a server-side proxy is mandatory | **design constraint** | `validApiKey.js:17`, `server/prisma/schema.prisma:18-25` (`api_keys` = id/name/secret/createdBy/createdAt/lastUpdatedAt — no scope, no expiry), `SECURITY.md:49-53` |
| 4 | Over `/api/v1`, any agent skill needing approval is **auto-denied** unless pre-approved | **blocker for agent use** | `plugins/http-socket.js:146-158`, `helpers/agents.js:12-27` |
| 5 | The OpenAI-compat façade ignores `tools`/`response_format`/`max_tokens`, emits `object:"chat.completion"` for deltas and no `[DONE]` | **integration risk** | `api/openai/index.js:111-116`, `openaiCompatible.js:265-279,524-548` |
| 6 | Mounting a host `.env` (the upstream quickstart does) lets the app rewrite it with all secrets in plaintext, and an unauthenticated `GET /api/system/env-dump` can trigger the write | medium | `updateENV.js:1466,1492-1601`, `system.js:91-96`, `api/system/index.js:16-35` |
| 7 | If `SIG_KEY`/`SIG_SALT` are not supplied, they are regenerated per container and previously encrypted data is lost | medium | `EncryptionManager/index.js:28-49` |
| 8 | Egress that `DISABLE_TELEMETRY` does not stop: `models.dev/api.json` at every boot; HF / `cdn.anythingllm.com` for the native embedder on first use | medium (privacy claim) | `modelPricing/index.js:70,190-209`; `EmbeddingEngines/native/index.js:37,140-160` |
| 9 | `--cap-add SYS_ADMIN` in every upstream quickstart is only for Chromium's sandbox; granting it to get link-scraping is a large privilege for a small feature | medium | `docker/.env.example:514-517`, `HOW_TO_USE_DOCKER.md:59` |
| 10 | Mobile QR pairing is refused when the UI is opened on localhost, and the app has no manual URL entry | medium (Track B only) | `ConnectionModal/index.jsx:88-109`; mobile `ConnectToInstance/Main/index.tsx:25-42` |
| 11 | `GET /api/setup-complete` is unauthenticated and returns base paths and model names | low | `system.js:118-126`, `systemSettings.js:453,978-980` |
| 12 | No login rate-limit or lockout on `POST /api/request-token`; failures only hit the event log | low on loopback, blocker before any tunnel | `system.js:198-349` (no limiter in the file) |
| 13 | Image is 4.78 GB and the release tag (1.16.1, 2026-08-27) lags `:latest` (2026-09-17); "upgrades stay a `docker pull`" means an unpinned moving target | low | `docker image ls`, Docker Hub tags 2026-09-21 |
| **UNVERIFIED** | Windows-Chrome → WSL-published `127.0.0.1:3001` reachability; `openai` SDK tolerance of the missing `[DONE]`; binding a host service to `172.17.0.1` while `docker0` is `NO-CARRIER`; `socat`/NVIDIA-container-toolkit presence; `--memory 4g` sufficiency for ingestion; `adb reverse` chain from WSL2 | — | none — each needs one measurement |

## 11. What this means for the PRD

- D1 holds: nothing above requires forking. The whole server tier is **env + curl**, which keeps upgrades a `docker pull`.
- D6 holds, with one correction to make explicit: *loopback binding is necessary but not sufficient* — `AUTH_TOKEN` +
  `JWT_SECRET` must be set in the same breath, because of risk #1.
- `ServerEngine` should target **`/api/v1/workspace/:slug/stream-chat`** (citations, metrics, agents, abort) and treat
  `/api/v1/openai/chat/completions` as the compatibility fallback, given risk #5.
- The API key lives in `serve.py`; the browser never sees it (risk #3).
- Server-side RAG for the PWA = `POST /v1/document/upload` (+`addToWorkspaces`) then `stream-chat` in `query` mode; the
  free local embedder is also exposed at `/v1/openai/embeddings`.
