# SLM wave 1 — supervisor notes (2026-09-24)

Delegate: `claude-nvidia` on `nvidia/nemotron-3-super-120b-a12b` (DeepSeek direct out of credit; NIM DeepSeek not answering).
Each result below was re-checked by the supervisor against the files; delegates' own reports overclaimed in round 1 of
every experiment (a 9-window test set reported as "perfect", invented dataset label names, a server that never started).

| Exp | State | What is measured (file) | Not done |
|---|---|---|---|
| E11 watchdog | measured, pass bar **missed** | 1,307 windows from 58 real jobs + synthetic garble; zlib+regex+logistic: garble recall 0.92 (Latin slice 0.91), false alarms 3.6 / 8 agent-hours, pane-state accuracy 0.97, CPU 0.5 ms (`e11/results/summary.json`) | waiting-permission recall reads 0.0 (no such windows in the data); the `label` field is written as `state` in the rows; small-LM feature not tried |
| E14 local binding | spike **passes with two findings** | `gateway.lanes.resolve` took the local binding from a config dict; a real call through it: 99 ms median, 45 tokens (`e14/results.json`) | the binding shape has no base-URL field (the caller had to know it: a code change for provider `llamacpp`), and no price row exists (`cost_line: not measured`) |
| E1a anonymisation | measured, pass bar **missed**, kill rule **not triggered** | faithful port of the page's detectors — 0 of 900 documents differ from the page's own JS run under node (`e1/preds/parity_*.json`) — plus 644 hand-written first names; all 900 documents, 9 direct-identifier types: leak rate FR 0.8747 / EN 0.9231, precision 0.91 / 0.92, PERSON recall 0.3214 overall (FR 0.28, EN 0.37), NIR/NATIONAL_ID 0.52 / 0.11, PHONE 0.80 / 0.72, EMAIL 0.99, IBAN & PLATE 1.00, DATE 0.63 / 0.65 (`e1/results.json`); 949 of 1,058 PERSON misses are cue-less candidates the page defers to its model; +5 shift raises leak to 0.97 / 0.95 (`e1/results_shift5.json`) | 8 of 100 synthetic NIRs are malformed gold (unpadded birth year in `gen_fr_claims.py`); `REPORT.md` written by the supervisor from the delegate's text (its harness refused the .md write); no SIREN / NIR-key check (not in the page); throughput not measured |

**Correction 2026-09-25 (E11 row): those numbers are not valid; do not quote them.** A code review found that the test
metrics were in-sample (`baselines.py` and `evaluate.py` fitted a fresh logistic regression on the test windows and scored
the same windows), "pane-state accuracy 0.97" was the binary garble accuracy, "3.6 false alarms / 8 agent-hours" came
from a placeholder formula (`fp_rate * 8 * 100`), "CPU 0.5 ms" was a constant, and waiting-permission recall was a
hard-coded 0.0 (the 62 such windows existed; no pane-state classifier did). Also: every window in a job shared one label,
and `pane_state` could never be `garble`. All fixed in the scripts the same day (train-fitted models, a 5-class pane-state
classifier, per-class test counts, measured CPU time, agent-hours from `data/jobs.jsonl`, the `label` field, and step 3's
small-LM feature with the kill rule); the pipeline has to be re-run on the owner's machine, where the transcripts are
(`e11/REPORT.md`, "How to run step 3"). E14's missing `base_url` field and price row are written up as a change for
BizLoop in `e14/PROPOSAL.md`.

Lessons: prescriptive briefs with exact code and count assertions work; open-ended "build a dataset" briefs do not.
A headless delegate that writes a planning sentence without a tool call ends its job (now in `plan/briefs/_preface.md`).

**Follow-up for the Second Look page** (`slm/app/second-look/index.html`), from E1a's parity run — **done 2026-09-24**
(branch `claude/wizardly-allen-tu4p7a`): `Nom:` / `Name:` / `Prénom:` as a name cue; Unicode-aware boundaries in CAP and
the place skip (`\b` is ASCII-only in JS, so "Édith" was never a candidate and "à" never a place cue); hyphenated given
names; names up to 6 words; a surname-only placeholder never matches a particle ("Le"); NIR before CARD in `PATTERNS` (the
10 NIRs masked as CARD); `gen_fr_claims.py` pads the birth year. The port (`regex_baseline.py`, `eval.py`) follows the
page; parity 0/900 again; the numbers are in `experiments/e1/REPORT.md` (addendum) and `results_v2.json`. Verified in
headless Chromium with the runtime and model files read back from the published artifact, and the artifact republished.
Still open: regenerate the synthetic claims with the padded NIR before the model half is scored on NIR.
