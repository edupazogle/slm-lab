# SLM Lab

Small language models that run on the user's own device — in the browser (wllama, llama.cpp in WebAssembly) and
on Android — and the experiments that decide where they earn a place in BizLoop.

Moved here from the Valheim repo on 2026-09-21. Everything below is in this directory.

## Read in this order

| File | What it is |
| --- | --- |
| [`prd/PRD.md`](prd/PRD.md) | What we are building and why, with acceptance criteria |
| [`prd/DECISIONS.md`](prd/DECISIONS.md) | The seven decisions (sit beside AnythingLLM, wllama base + named lifts, Android on two tracks, needle3 as a specialist, measured numbers only, loopback by default, where the work lives), each with its evidence |
| [`findings/FINDINGS-v2.md`](findings/FINDINGS-v2.md) | What has been measured, what was verified in the browser, what is still open |
| [`critique/CRITIQUE.md`](critique/CRITIQUE.md) | The adversarially verified review of phase 1 (six lenses, merged, each finding re-checked) |
| [`plan/EXPERIMENT-PLAN.md`](plan/EXPERIMENT-PLAN.md) | Twelve experiments, each with dataset, metric and a pass bar written before the run |
| [`research/`](research/) | `repos/` 17 dossiers (licence, liftable code, red flags) · `models/slm_models.json` the model catalog in the operator's schema (built by `models/build_slm_models.py` from three part-catalogs) · `landscape/` landscape, applications-to-BizLoop and feasibility reports |
| [`phase1/`](phase1/) | The original phase-1 paper and experiments, kept as they were (read with the critique beside it) |

## Run it

```bash
cd app/web && npm install && npm run build          # chat + bench + needle into dist/
python3 ../serve.py --port 8097 --dir dist           # 127.0.0.1 only; sets COOP/COEP for multi-threaded WASM
# open http://127.0.0.1:8097/chat.html  ·  /bench.html  ·  /needle.html
# Second Look (the site's landing page): see app/second-look/README.md
```

Android (Track A, Capacitor):

```bash
cd slm/app/android-shell && rm -rf www && cp -r ../web/dist www && npx cap sync android
cd android && ANDROID_HOME=~/Android/sdk ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk  ->  adb install -r app-debug.apk
```

Experiments: `experiments/v2/` (needle3 fine-tune with a 4-bit untuned control: `ft2_pipeline.sh` trains and builds,
`ft2_eval_stage.sh` predicts and scores). Python venv: `~/.venvs/slm`. Always export `NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1`.

## Rules this lab keeps

- Every number shown is measured and its instrument checked first; `null` means "not measured yet".
- Code taken from other repos is copied with a provenance header and listed in `app/THIRD_PARTY/NOTICES.md`;
  nothing from repos without a licence or under AGPL.
- Servers bind 127.0.0.1; nothing unauthenticated on the LAN. The one exception is the hosted copy (`serve.py --public`,
  below), which serves static files only.
- Model weights, build output, QA screenshots and run logs are git-ignored (see the repo's `.gitignore`).

## Live

- **This lab on GitHub:** https://github.com/edupazogle/slm-lab (public; split from the BizLoop repo's `slm/` with its history,
  re-exported with `git subtree split --prefix=slm`).
- **The Second Look decision page:** https://edupazogle.github.io/slm-lab/ — built and deployed by `.github/workflows/pages.yml`
  on every push that touches `app/second-look/`; the runtime and the two models are fetched at build time, never committed.
  Verified live 2026-09-24: models ready in 6.5 s, every decision widget answers, redactor and variants run offline (0 requests).
  The workflow now runs the 39-check QA round (`app/second-look/test/qa_browser.js`, headless Chromium) before each deploy;
  results in [`app/second-look/QA.md`](app/second-look/QA.md). The page carries a usage meter: tokens, ms and tok/s under
  every decision, per-model counters, and a usage log.
- The same page as a claude.ai artifact (private): https://claude.ai/artifact/5UwCN5TwCUBukmTjmfiSkh
- **The whole lab, hosted:** https://slm-lab-production.up.railway.app/ — **Second Look is the landing page, at the
  root**; the web app's pages are under `/lab/` (`/lab/chat.html`, `/lab/bench.html`, `/lab/needle.html`). The old SLM Lab
  landing page was removed on 2026-09-25 and is no longer built. Retired URLs answer 301: `/second-look/…` → `/…`,
  `/chat.html` (and bench, needle) → `/lab/…`, `/lab/` → `/`; `/second-look/sw.js` retires the worker that browsers
  registered there. Railway project `zesty-passion`, service `slm-lab`, environment `production`, region europe-west4
  (Amsterdam), built from the repo's `Dockerfile` on every push to `main`. Served by `app/serve.py --public`, so every
  response carries COOP/COEP (GitHub Pages cannot, which is why the chat app is not there) and the security headers; the
  server is static only: `POST /api/bench` is off and folders are never listed. `.github/workflows/checks.yml` builds
  and tests this exact image with the real models on every pull request to `main`.
