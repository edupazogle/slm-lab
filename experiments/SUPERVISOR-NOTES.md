# SLM wave 1 — supervisor notes (2026-09-24)

Delegate: `claude-nvidia` on `nvidia/nemotron-3-super-120b-a12b` (DeepSeek direct out of credit; NIM DeepSeek not answering).
Each result below was re-checked by the supervisor against the files; delegates' own reports overclaimed in round 1 of
every experiment (a 9-window test set reported as "perfect", invented dataset label names, a server that never started).

| Exp | State | What is measured (file) | Not done |
|---|---|---|---|
| E11 watchdog | measured, pass bar **missed** | 1,307 windows from 58 real jobs + synthetic garble; zlib+regex+logistic: garble recall 0.92 (Latin slice 0.91), false alarms 3.6 / 8 agent-hours, pane-state accuracy 0.97, CPU 0.5 ms (`e11/results/summary.json`) | waiting-permission recall reads 0.0 (no such windows in the data); the `label` field is written as `state` in the rows; small-LM feature not tried |
| E14 local binding | spike **passes with two findings** | `gateway.lanes.resolve` took the local binding from a config dict; a real call through it: 99 ms median, 45 tokens (`e14/results.json`) | the binding shape has no base-URL field (the caller had to know it: a code change for provider `llamacpp`), and no price row exists (`cost_line: not measured`) |
| E1a anonymisation | measured, pass bar **missed**, kill rule **not triggered** | faithful port of the page's detectors — 0 of 900 documents differ from the page's own JS run under node (`e1/preds/parity_*.json`) — plus 644 hand-written first names; all 900 documents, 9 direct-identifier types: leak rate FR 0.8747 / EN 0.9231, precision 0.91 / 0.92, PERSON recall 0.3214 overall (FR 0.28, EN 0.37), NIR/NATIONAL_ID 0.52 / 0.11, PHONE 0.80 / 0.72, EMAIL 0.99, IBAN & PLATE 1.00, DATE 0.63 / 0.65 (`e1/results.json`); 949 of 1,058 PERSON misses are cue-less candidates the page defers to its model; +5 shift raises leak to 0.97 / 0.95 (`e1/results_shift5.json`) | 8 of 100 synthetic NIRs are malformed gold (unpadded birth year in `gen_fr_claims.py`); `REPORT.md` written by the supervisor from the delegate's text (its harness refused the .md write); no SIREN / NIR-key check (not in the page); throughput not measured |

Lessons: prescriptive briefs with exact code and count assertions work; open-ended "build a dataset" briefs do not.
A headless delegate that writes a planning sentence without a tool call ends its job (now in `plan/briefs/_preface.md`).

**Follow-up for the Second Look page** (`slm/app/second-look/index.html`), from E1a's parity run: add `Nom:` as a name cue;
Unicode-aware word boundaries (`\b` is ASCII-only in JS, so "Édith" is never a candidate); hyphenated given names; names
longer than 4 words; a surname-only placeholder must not match a particle ("Le"); NIR before CARD in `PATTERNS` (10 NIRs
masked as CARD); and `gen_fr_claims.py` pads the birth year. Brief it as one small Opus task after the frontend wave.
