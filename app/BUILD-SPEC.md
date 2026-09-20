# SLM Lab app — build spec

Responsive web landing + installable PWA chat that runs small language models **inside the browser**
(wllama = llama.cpp compiled to WebAssembly, GGUF models), plus an Android package of the same app.
Operator's rule: **take the best code from GitHub, do not re-implement "inspired by" versions** — so
every lifted file is copied, its licence kept, and its provenance recorded.

## 1. What already exists (do not redo)

- `web/` is ngxson/wllama `examples/main` vendored verbatim at commit `46af429` (MIT) and then pointed at
  npm `@wllama/wllama@3.6.1`. It builds (`npm run build`) and runs. React 18, Vite, Tailwind 3, daisyUI 4.
- Three Vite entries: `index.html` (landing), `chat.html` (the chat app), `bench.html` (in-browser benchmark, working).
- `web/src/design/tokens.css` — the design tokens and form furniture (`.ff`, `.typed`, `.copy-sheet`, `.stamp`, `.receipt`). **Read it first.**
- `web/tailwind.config.cjs` — custom daisyUI themes `carbon` (light) and `carbonpaper` (dark) mapped to the palette, fonts `font-sans` (Archivo) and `font-typed` (Courier Prime).
- `serve.py` — static server with COOP/COEP (cross-origin isolation, needed for multi-threaded WASM). `python3 serve.py --port 8097` serves `web/dist`.
- `web/scripts/run-bench.mjs` — Playwright driver; copy its pattern for browser checks. Chromium is installed.
- Pre-installed deps (do not reinstall): lucide-react, clsx, tailwind-merge, class-variance-authority, idb-keyval, zod, @huggingface/gguf, react-markdown, remark-gfm, remark-breaks, rehype-highlight, highlight.js, vite-plugin-pwa, playwright, @fontsource-variable/archivo, @fontsource/courier-prime.

## 2. Identity (follow exactly; it is a decision, not a suggestion)

The subject is an insurer's AI-innovation lab, so the look comes from insurance paperwork: the **carbonless
duplicate claim form** (the French *constat amiable*) — carbon-blue ink on form stock, and ONE canary-yellow
copy that you keep. The canary copy *is* the product promise: what you type stays on your device.

- Colour: paper `#F7F9FC`, carbon ink `#1B2A6B`, field tint `#DCE6F7`, canary `#FFE45C` (the only loud colour; reserved for "your copy": the live meter, receipts, the stamp's sheet), stamp red `#C8372D` (the stamp only), body ink `#0E1230`. Dark theme is the carbon sheet itself (`carbonpaper`).
- Type: Archivo (variable, width axis; the grotesque of official forms) for everything structural; Courier Prime only for *typed-in values* — model names, numbers, receipts, what the user or the model "typed". Both self-hosted: a page promising no third-party requests cannot call a font CDN.
- Layout: left-aligned, form-like. Tinted fields with the small label INSIDE the box, top-left. Square-ish corners (2px). Rules in carbon ink where they separate real sections.
- One bold moment: the rubber stamp landing on the canary copy when the first on-device answer completes (`.stamp[data-land="1"]`). No other decorative motion. Respect `prefers-reduced-motion`.
- Voice (from the BizLoop × Copilot PRD): direct, specific, calm; numbers with units; no exclamation marks; no praise of the user; sentence case. Name things by what the user recognises.
- Avoid the generated-page tells: no ALL-CAPS tracked eyebrow labels, no meta strings joined with middle dots, no "→" appended to buttons, no gradient washes, no identical rounded shadow cards, no single accented word in a headline, no numbered 01/02/03 markers unless the content really is a sequence.
- Quality floor: works at 390px wide with a 16px gutter and no horizontal page scroll; visible keyboard focus; both themes legible; all text real, none lorem.

## 3. Honesty rules for every number and claim on the page

This product's credibility is its measurement discipline. Phase 1 of this project published numbers that
turned out to be artefacts, so:

- Every performance number shown must come from `web/src/data/findings.json` (owned by the supervisor, may be sparse) or be measured live in the visitor's own browser. If a number is missing, say "not measured yet" — never invent one.
- Claims about privacy must be checkable by the visitor: the live meter counts real network requests made by the page (PerformanceObserver `resource` entries) and lists their hosts; it invites the visitor to open DevTools → Network.
- Strengths AND weaknesses are both shown. Small models are good at narrow, structured tasks and bad at open reasoning, long context and facts; say so plainly.
- Anything experimental is labelled "experiment".

## 4. Provenance rule for lifted code

When you copy code from a clone under `~/.cache/slm-src/`, (a) copy the file, do not paraphrase it; (b) put a header
comment at the top: `// Lifted from <owner>/<repo> @ <commit> — <path> (<licence>). Changes: <one line>.`;
(c) add a line to `slm/app/THIRD_PARTY/NOTICES.md` (create it if missing: repo, commit, licence, files taken,
what changed); (d) copy the repo's LICENSE file into `slm/app/THIRD_PARTY/<repo>/`. Apache-2.0 files must also
state that they were changed. Never copy from a repo whose licence verdict in `slm/research/repos/*.md` is "no"
(no licence file) or AGPL.
