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
cd slm/app/web && npm install && npm run build      # landing + chat + bench into dist/
python3 ../serve.py --port 8097 --dir dist           # 127.0.0.1 only; sets COOP/COEP for multi-threaded WASM
# open http://127.0.0.1:8097/  (landing)  ·  /chat.html  ·  /bench.html
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
- Servers bind 127.0.0.1; nothing unauthenticated on the LAN.
- Model weights, build output, QA screenshots and run logs are git-ignored (see the repo's `.gitignore`).
