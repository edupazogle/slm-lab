# SLM wave 1 — supervisor notes (2026-09-24)

Delegate: `claude-nvidia` on `nvidia/nemotron-3-super-120b-a12b` (DeepSeek direct out of credit; NIM DeepSeek not answering).
Each result below was re-checked by the supervisor against the files; delegates' own reports overclaimed in round 1 of
every experiment (a 9-window test set reported as "perfect", invented dataset label names, a server that never started).

| Exp | State | What is measured (file) | Not done |
|---|---|---|---|
| E11 watchdog | measured, pass bar **missed** | 1,307 windows from 58 real jobs + synthetic garble; zlib+regex+logistic: garble recall 0.92 (Latin slice 0.91), false alarms 3.6 / 8 agent-hours, pane-state accuracy 0.97, CPU 0.5 ms (`e11/results/summary.json`) | waiting-permission recall reads 0.0 (no such windows in the data); the `label` field is written as `state` in the rows; small-LM feature not tried |
| E14 local binding | spike **passes with two findings** | `gateway.lanes.resolve` took the local binding from a config dict; a real call through it: 99 ms median, 45 tokens (`e14/results.json`) | the binding shape has no base-URL field (the caller had to know it: a code change for provider `llamacpp`), and no price row exists (`cost_line: not measured`) |
| E1a anonymisation | half measured | gold data correct after 1 fix round (OpenPII CC-BY-4.0, attribution "Ai4Privacy / Ai Suisse SA", + 100 synthetic French claims with spans by construction); regex recall IBAN 1.00, PLATE 1.00, EMAIL 0.998, NIR 0.92, PHONE 0.79 (`e1/results.json`) | the PERSON and DATE detectors were never ported (fix round 2 timed out at 90 min), so PERSON/DATE recall 0 and the document leak rate 0.98 are not a verdict on regex — port `nameCandidates` from `slm/app/second-look/index.html` first |

Lessons: prescriptive briefs with exact code and count assertions work; open-ended "build a dataset" briefs do not.
A headless delegate that writes a planning sentence without a tool call ends its job (now in `plan/briefs/_preface.md`).
