# Third-party code in SLM Lab

Every file in this app that came from someone else's repository is listed here: where it came from, at which commit,
under which licence, and what was changed on the way in. Each lifted file also carries the same information in a header
comment, and each repository's licence text sits next to this file in `THIRD_PARTY/<repo>/`.

Paths are relative to `slm/app/`.

---

## ngxson/wllama — the engine, and the app this one started from

| | |
|---|---|
| Upstream | <https://github.com/ngxson/wllama> |
| Licence | MIT, Copyright (c) 2024 Xuan Son NGUYEN — `THIRD_PARTY/wllama/LICENCE` |
| Commit | `46af429766fc646ab3c1f19ae9774fd596ef0106` (shallow clone taken 2026-09-21) |
| Also | npm dependency `@wllama/wllama@3.6.1` and `@wllama/wllama-compat@3.6.1`, both MIT, shipped as-is |

- `web/` was vendored from `examples/main` at that commit (see `THIRD_PARTY/wllama/PROVENANCE.md`). What is still
  recognisably theirs, with a header saying so:
  - `web/src/utils/custom-models.tsx` — GGUF URL check by ranged fetch of the magic bytes, shard size by HEAD.
    Changes: the `window._exportModelList` debug hook removed, errors reworded, returns a plain record.
  - `web/src/utils/displayed-model.tsx` — the model row merged from the curated list, the user's own models and the
    cache. Changes: carries the curated notes/licence data, exposes size tier and download bytes.
  - `web/src/utils/wllama.context.tsx` — the engine provider. Changes: loading goes through the lifted Thales loader,
    `alert()` became an in-page notice, downloads report bytes and can be cancelled, generation is measured and
    cancellable, the per-token localStorage write is gone.
  - `web/src/config.ts` — the model list (URLs and sizes are wllama's curated entries, known to load); the notes,
    languages and licences were added here from the Hugging Face model cards.
  - `web/vite.config.ts`, `web/src/vite-env.d.ts` — the Vite recipe (wasm via `?url`, compat worker via `?raw`,
    COOP/COEP middleware).
- The bundled WebAssembly (`@wllama/wllama/src/wasm/wllama.wasm`, served from this app's own origin) contains
  **llama.cpp / ggml**, MIT, "Copyright (c) 2023-2026 The ggml authors", and, in the WebGPU build, **Dawn /
  emdawnwebgpu**, BSD-3-Clause, Copyright 2017-2024 The Dawn & Tint Authors. Shipping the wasm distributes both; their
  notices belong in the app's open-source page when it ships publicly.

## LocalMode-AI/LocalMode — chat UI primitives and the structured-output helpers

| | |
|---|---|
| Upstream | <https://github.com/LocalMode-AI/LocalMode> |
| Licence | MIT, Copyright (c) 2025 LocalMode — `THIRD_PARTY/LocalMode-AI_LocalMode/LICENSE` |
| Commit | `3ef8bc4` |

| File here | Taken from | Changed |
|---|---|---|
| `web/src/lib/localmode/utils.ts` | `apps/ui/registry/localmode/lib/utils.ts` | header only |
| `web/src/lib/localmode/button.tsx` | `apps/ui/registry/localmode/ui/button.tsx` | radix `Slot` removed, forwardRef for React 18, shadcn tokens remapped to the carbon daisyUI themes |
| `web/src/lib/localmode/conversation.tsx` | `…/conversation/conversation/conversation.tsx` | tokens remapped; the hand-rolled scroll pinning replaced by anything-llm's `useAutoScroll`; `history` prop drives it |
| `web/src/lib/localmode/prompt-input.tsx` | `…/conversation/prompt-input/prompt-input.tsx` | IME guard added, Enter inserts a newline on touch devices, form identity, text labels instead of icon-only buttons, dictation sub-part dropped, `label` and `allowEmpty` props added, textarea ref typed for React 18 |
| `web/src/lib/localmode/reasoning.tsx` | `…/conversation/reasoning/reasoning.tsx` | radix Collapsible replaced by a button + aria-expanded region; tokens remapped; brain icon and pulse dropped |
| `web/src/lib/localmode/suggestions.tsx` | `…/conversation/suggestions/suggestions.tsx` | scrolling chip rail became a wrapping grid of form rows; `label` added |
| `web/src/lib/localmode/storage-meter.tsx` | `…/local-first/storage-meter/storage-meter.tsx` | decimal byte formatting, carbon identity, `refreshKey`, says whether the browser agreed to keep the data |
| `web/src/lib/localmode/capability-gate.tsx` | `…/local-first/capability-gate/capability-gate.tsx` | tokens remapped, no browser-brand advice, `opfs` and `crossOriginisolated` gateable |
| `web/src/lib/localmode/use-environment.ts` | `apps/ui/registry/localmode/lib/use-environment.ts` | `isOPFSSupported` now tests `navigator.storage.getDirectory` |
| `web/src/lib/localmode/schema.ts` | `packages/core/src/generation/schema.ts` | types imported locally, `/no_think` made opt-in, `repairJSON` exported, schema in the prompt compacted |
| `web/src/lib/localmode/generate-object.ts` | `packages/core/src/generation/generate-object.ts` | drives an injected generator (our engine) instead of their `LanguageModel`; `/no_think` opt-in; error carries the raw text |
| `web/src/lib/localmode/types.ts` | `packages/core/src/generation/types.ts` (excerpt) + `errors/index.ts` (`StructuredOutputError`) | excerpt only; `model` option replaced by an injected `generate` function |

## Mintplex-Labs/anything-llm — the auto-scroll hook and the thought-tag regexes

| | |
|---|---|
| Upstream | <https://github.com/Mintplex-Labs/anything-llm> |
| Licence | MIT, Copyright (c) Mintplex Labs Inc. — `THIRD_PARTY/Mintplex-Labs_anything-llm/LICENSE` |
| Commit | `da66855` |

| File here | Taken from | Changed |
|---|---|---|
| `web/src/lib/anythingllm/use-auto-scroll.ts` | `frontend/src/hooks/useAutoScroll.js` | typed for TypeScript; the `Appearance.disableAutoScroll` setting removed; `history` typed to the two fields it reads. The follow/unfollow logic is unchanged — it is the part worth having: the pin runs per animation frame only while streaming, and the reader's own wheel or touch releases it. |
| `web/src/lib/anythingllm/thought-tags.ts` | `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ThoughtContainer/index.jsx`, lines 65-87 | only the tag regexes and `stripThoughtTags`; typed |

Nothing was taken from `open-computer/` (AGPL-3.0) or from `frontend/src/media/` (third-party logos).

## ThalesGroup/rust-coding-dojo — the wllama loader

| | |
|---|---|
| Upstream | <https://github.com/ThalesGroup/rust-coding-dojo> |
| Licence | **Apache-2.0**, Copyright 2025 ThalesGroup — `THIRD_PARTY/ThalesGroup_rust-coding-dojo/LICENSE` |
| Commit | `0c6340c` |

`web/src/lib/thales/localWllama.ts` is derived from `academy/src/llm/localWllama.ts` and **has been modified**
(Apache-2.0 §4(b); the file header states this too): the Rust-kata prompts and the hard-coded model were removed, the
model source and parameters are arguments, it loads by URL instead of through the Hugging Face API, the duplicated
retry block is one function and clears only the failing model's files, the module-level singleton and polled progress
variable are gone, and the WebGPU probe is stricter than `isSupportWebGPU()` — it requests an adapter and refuses a
software one, with a GPU-to-processor fallback on a failed load.

## Cactus-Compute/needle3 — the needle experiment page (not part of the chat app)

Apache-2.0, `THIRD_PARTY/needle3/LICENSE`, revision `b274efcb211a9eef48c9a88da4b43bd569696a39`; see
`THIRD_PARTY/needle3/PROVENANCE.md`. Redistributed unmodified as `web/public/needle/needle.{js,wasm}`.

---

## Runtime npm dependencies used by the chat app

All MIT unless stated: react, react-dom, react-markdown, remark-gfm, remark-breaks, rehype-highlight, highlight.js
(BSD-3-Clause), lucide-react (ISC), clsx, tailwind-merge, class-variance-authority, idb-keyval, zod, daisyUI,
tailwindcss, `@fontsource-variable/archivo` and `@fontsource/courier-prime` (the fonts themselves are SIL OFL 1.1).
The fonts are self-hosted: a page that promises no third-party requests cannot call a font CDN.

Not used, deliberately: no analytics, no error reporting, no CDN at runtime. The compat WebAssembly build is served
from this origin, and when it is missing the app refuses the CDN fallback rather than make a third-party request.
