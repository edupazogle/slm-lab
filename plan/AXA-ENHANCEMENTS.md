# AXA presentation pass — review, plan and status

2026-09-25 · branch `axa-enhancements` · handed over to the SLL PRO session at the operator's request, mid-way through.

Goal (operator): review the lab, find UX/UI and functional enhancements for an AXA audience (claims leaders, IT security,
risk and compliance, executives), implement the plan, and publish the new version to Railway for validation. The page to
present is **Second Look** (`/second-look/`); the landing, chat and bench pages are secondary.

Tone rules used for every new line of copy (from `bizloop/underwriting/GUIDE-how-underwriting-leaders-talk.md`): outcome
first, then mechanism; decision support with the person in charge; measured before-and-after; plain, structured, no hype.

## What the review found

Four inputs: a live audit (Lighthouse, headers, weights), a code and browser review of Second Look, a code review of the
web app, and screenshots at 1440 and 390 px.

**Second Look**
- P1: five or more overlapping decisions crash the tab (headless Chromium on Linux, reproduced 5 of 5): model runs are
  not serialised, Ctrl+Enter ignores key repeat, Decide stays clickable during a run.
- P1: the redactor is called "Anonymise" and its output "Safe to share", while E1a measured a French leak rate of 0.76 and
  42 % of names found (rules only). A UK letter ("27 Harrow Road", "W2 5DY" with no town, "3rd of May 1961") came out
  almost unchanged.
- P1 (fixed on `main` by another session, d55b1b8): the tour's highlight ring took the click on the button it asked for.
- P2: hype and "LLM" framing ("TinyLLM. Huge Possibilities.", "Looks like a mockup. It is not."); the models are a 13M
  and a 22M encoder. The calibration note says the true cases sit below the diagonal; they sit above it (under-confident).
  "0 requests · 0 bytes · €0" in receipts and the "0 bytes" KPI are constants, not the counter. `build.sh` pulls models
  from `resolve/main` unpinned while the page hard-codes byte counts. AXA-style logo on a public page. Tour step 2 points
  at a counter hidden on phones. "Measured on 8 drafted replies" has no data in the repo. Dark-on-dark chips in the dock panel.
- Accessibility 87 (Lighthouse): tablist without tabs, unlabelled sliders, 4.33:1 and 3.88:1 contrast, heading order.
- The page offered no way back to the rest of the lab, and the first-visit tour opened as a modal over the hero.

**Web app** (landing, chat, bench)
- P1: the chat's model list shows two "abliterated" models, a community fine-tune and two 3.2 GB Llama entries.
- P1: the anonymise skill stores the ORIGINAL text in IndexedDB and uses it as the conversation title.
- P1: triage labels an outcome "refuse"; the landing demo's errors are wrong for plain http and for an unreachable
  huggingface.co (a corporate proxy); the landing promises offline use and an installable app, and there is no manifest
  or service worker.
- P2: six clicks and two waits to a first chat answer; a message sent while a model loads is lost; picking a suggestion
  with a skill chip active empties the composer; "Valid against the schema" reads as "correct"; `/bench.html` with no
  parameters is a dead end and "Measure this device" starts a 386 MB download with no warning; jargon; chat contrast 2.52:1.

**Hosting**: no CSP, HSTS, Referrer-Policy, Permissions-Policy or frame protection; no caching on hashed assets; the
Railway edge already compresses (gzip, zstd); the service runs in us-west2, so every request from Europe waits ~180 ms.

## The plan, and where it stands

| # | Change | Status |
|---|---|---|
| 1 | Second Look hero for claims leaders: "Claims decisions, on this device." + a lede that states outcome, mechanism and who decides | **done** (9c4a243) |
| 2 | The tour offered from a hero button, not opened over the page (`?tour` still starts it) | **done**, QA `tour-opt-in` + `tour-first-visit` |
| 3 | A Content-Security-Policy (`connect-src 'self'`) and a "Test the lock" widget that tries a fetch and a pixel to example.org and shows the refusal | **done**, QA `csp-connect-self`, `lock-refused` |
| 4 | The request counter leaves out requests the policy refused (a refused image still shows in the resource timeline) | **done**, QA `lock-not-counted`; a real request still counts (checked by hand: 0 → 0 → 1) |
| 5 | Section 05 "What a pilot has to answer first": 9 answers for IT, risk and compliance, each checkable | **done** |
| 6 | Calibration: the recorded per-message run embedded, so chart, threshold and a new "At your volume" view work before any download; volumes rounded to 2 significant figures | **done**, QA `volume-view-recorded`, `volume-view-live` |
| 7 | Phone model bar on one row; chart labels legible on phones; tour pictures centred | **done** |
| 8 | Accessibility fixes (labels, tablist, headings, contrast) | **done**; not re-scored in Lighthouse |
| 9 | Links back to the lab from Second Look (sidebar, Railway only) | **done**; phones have a footer row (06bf0d0); the links go to /lab/ and show only on the Railway host |
| 10 | serve.py: Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS (`--public`), immutable caching for Vite hashed assets | **done** |
| 11 | Serialise model runs, ignore key repeat, disable Decide while running (the crash) | **done** (06bf0d0): one queue for every model call; QA `overlap-8-decisions` |
| 12 | "Anonymise" → "Pseudonymise", "Safe to share" → "Pseudonymised: check before sharing", with the measured leak rate beside it | **done** (06bf0d0): leak rate 0.7515 shown (E1a v4, the page's own 166-name list) |
| 13 | Calibration note: the squares sit above the diagonal (under-confident), not below | **done** (06bf0d0) |
| 14 | Receipts and the "0 bytes" KPI read the live counter instead of constants | **done** (06bf0d0) |
| 15 | Pin model revisions in `build.sh` and check sha256 (a changed upstream file breaks every build) | **done** (06bf0d0): `models.lock`; the Hugging Face files are pinned from CI (`build.sh --lock`) |
| 16 | Dock-panel chip contrast; hide the Ctrl ↵ hint on phones; tour step 2 text on phones; "Load it for me" label; hero button stuck disabled after Turn off; test button cannot re-run; toast when an example is clicked before the models; error handling in Pseudonymise and variants; storage shown in GB; footer "30 messages" for every widget | **done** (06bf0d0), plus the model bar's clipped third chip (1181–1370 px) and the tour cards on phones |
| 17 | UK address, standalone UK postcode and "3rd of May 1961" dates in the redactor. Needs the Python port (`experiments/e1/regex_baseline.py`) changed too, and the 900-document parity re-run to 0 diffs | **done** (06bf0d0): Python port changed identically, parity 0/900; E1a v5 (`results_v5.json`): English leak 0.9051 → 0.8846 |
| 18 | Web app: hide the abliterated / community / 3.2 GB models unless `?lab=1` (a hidden model already on the device stays listed, with a note, so it can be deleted) | **done**; build and lint pass, not checked in a browser |
| 19 | Web app: the anonymise skill stops storing the original text; neutral titles; "Delete all conversations" | **done** (a5694da) |
| 20 | Web app: triage wording, landing error messages (insecure context, huggingface.co unreachable), honest offline copy, one-click "Start with SmolLM2", message kept while a model loads, suggestion/chip bug, schema-badge wording, bench landing, "Measure this device" size warning, link to Second Look from the landing, chat contrast | **done** (a5694da) for chat, bench and needle; the landing-page parts were dropped with the landing (see below) |
| 21 | Railway preview environment on this branch | **done**; production itself moved to europe-west4 on 2026-09-25 |

## Notes for the web-app items (read in the code on 2026-09-25, not yet changed)

- **19, anonymise storage** leaks in more places than the user turn and the title (`chat-actions.ts:25-30`, `182`):
  `anonymise.tsx` `forStorage` stores `redact(input, entities)`, which is the original text when a run failed, was stopped
  or was still running when the debounced write fired (no entities yet), so store text only when `status === 'done'`;
  `extractJSON` (`lib/localmode/schema.ts:444`) puts "Raw text: <first 200 chars of the model output>" into its error,
  which reaches `run.issues` and the message's `error` field, and for Anonymise that output lists the personal values;
  once the user turn is a placeholder, "Ask again" after a reload would run the skill on the placeholder (guard it);
  conversations already saved still hold the original and should be cleaned on load (`messages.context.tsx:53-80`);
  `idb-keyval`'s `clear` gives "Delete all conversations".
- **Chat contrast**: both failing pairs come from `opacity-60` on the disabled composer (`lib/localmode/prompt-input.tsx`).
  The label (`--ink-soft` on `--field`) is 6.03:1 light and 6.37:1 dark without the fade; the placeholder
  (`placeholder:text-base-content/45`) is 2.85:1 and 3.5:1 even without it. Use `--ink-soft` and drop the fade.
- **Message lost while a model loads**: `PromptInput.submit()` calls `setText('')` even when `send()` returns early and
  navigates to Models (`chat-actions.ts:165-168`); the composer stays enabled while loading (`ChatScreen.tsx:219`). Send has
  to be held inside `PromptInput`, because Enter calls `submit()` directly. For a one-click start, `downloadModel` swallows
  errors, so it must report success before `loadModel` runs. `isOfferable()` in `utils/displayed-model.tsx` is there for
  that button (never offer a lab-only model).
- **Suggestion emptied by a chip**: the effect is at `ChatScreen.tsx:64-66`; the chips' `onClick` handlers are at 153 and 163.
- **Triage**: the model's `next_step` values are `log`, `ask_customer`, `human_review`; "refuse" is only display text
  (`triage.tsx:32`, `69`, `78`) and the CSS class `.decision-refuse` (`index.css:647`).
- **Landing errors**: an unreachable host throws "Failed to fetch" and a proxy's 403 "Failed to fetch … HTTP 403"; both are
  classed as `download` (`demo-engine.ts:114-118`). Telling them apart needs a bytes-received counter in the progress callback.
- **Offline copy**: no manifest and no service worker; wllama keeps the model in OPFS, but the page is not cached, so an
  offline reload fails.
- **Bench landing**: importing `BENCH_HREF` from `sections.tsx` pulls in `findings.json` (144 kB); move it to a small
  constants module.

## Deployment

- **Preview (for validation): https://slm-lab-axa-preview.up.railway.app/** and `/second-look/`. Railway project
  `zesty-passion`, environment `axa-preview` (duplicated from production on 2026-09-25), service `slm-lab`, source branch
  `axa-enhancements`: every push to the branch that touches the watched paths redeploys it.
- Verified at 19fe268 (deployment `4b09ea57`, SUCCESS): `/`, `/chat.html`, `/bench.html` and `/second-look/` answer 200; HSTS,
  Referrer-Policy, Permissions-Policy and X-Frame-Options are sent; a hashed asset carries `max-age=31536000, immutable`;
  the QA round against the preview URL passed 62 of 62 (models downloaded from Railway in 8.2 s, the 89-decision test in
  0.9 s, offline reload ready in 0.5 s).
- **Production is unchanged**: environment `production` still deploys `main` to https://slm-lab-production.up.railway.app/.

## Decided on 2026-09-25 (the operator)

- **Second Look is the site's only landing page.** The SLM Lab landing page is removed from the repo and the build; the
  site root `/` is Second Look, the web app's chat, bench and needle pages live under `/lab/`, and retired URLs answer
  301 (`/second-look/…` → `/…`, `/chat.html` → `/lab/chat.html`, `/lab/` → `/`). See the Dockerfile and `app/serve.py
  --redirect`.
- **Region**: production moved to europe-west4 (Amsterdam), 1 replica, on 2026-09-25.
- **Promote**: merged to `main` once `.github/workflows/checks.yml` (real models, the production image) was green.

## Open decisions for the operator

- **The AXA mark** in Second Look's sidebar is on a public page. Keep it (the audience is AXA and the page says it is a
  prototype), or swap it for a neutral mark and keep only the AXA blue palette.
- ~~**Region**~~ (decided above): production runs in us-west2. For a European audience europe-west4 should remove most of the ~180 ms wait
  per request (an estimate, not measured).
- ~~**Promote**~~ (decided above): production deploys from `main`. Merging `axa-enhancements` into `main` replaces the live page, and the
  GitHub Pages copy redeploys too (its workflow runs the QA round first).

## How to verify

```bash
cd app/second-look && ./build.sh && python3 build_pages.py
python3 -m http.server 8792 --bind 127.0.0.1 --directory dist &
NODE_PATH=../web/node_modules node test/qa_browser.js --url http://127.0.0.1:8792/     # 62 checks, 62 passed at e7e9afc
cd ../web && npm ci && npm run build && npm run lint
```
