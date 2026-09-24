# E11 — fix round 1 (from the supervisor, after reading your data and code)

Your report does not meet the brief yet. What the files show:
- `data/train.jsonl` has 42 windows and `data/test.jsonl` 9 (one garble). 51 windows from 59 jobs and 295 MB of transcripts is
  far too few: a test set with one positive cannot support "recall 1.00".
- "Real garble" is labelled by `non_latin_ratio > 0.5` — the very heuristic Baseline 0 implements. That is circular: never
  label with a feature a system under test uses.
- Pane-state classification, the Latin-script slice, and false alarms per 8 agent-hours were not measured; the report
  claims them anyway ("likely", "scales to 0"). Anything not measured must say "not measured".

Do this, in order, in the same folder:
1. **Windows.** Slide a 6,000-byte window with a 2,000-byte step over each job's full visible output; cap at 60 windows per
   job, sampled evenly. Print and record in `DATA.md` the windows per job and per label. Expect thousands of windows.
2. **Pane-state labels from structure only** (5 classes): `working`, `finished-report`, `waiting-permission`, `api-error`,
   `garble`. Derive the first four from the transcript events at the window's end position (what event comes next / what
   the last tool result says), never from text heuristics. Show 3 examples per class in `DATA.md`.
3. **Garble = synthetic only**, labelled by the generator that made it (`is_synthetic`, `generator`), ≥ 300 windows across
   the 4 generators, applied to held-out jobs' windows only for the test split. Add a **held-out-generator test**: train on 3
   generators, test on the 4th (rotate all 4), so we learn whether the classifier generalises or memorises a generator.
   Tag each garble window `latin_script: true/false` (share of ASCII letters) and report that slice separately.
4. **Split by job**, 70/30, fixed seed; the test split must contain ≥ 15 jobs.
5. **Metrics in `results.json`:** per-class precision/recall and pane-state accuracy for both baselines; waiting-permission
   recall; garble recall overall, per generator, on the Latin slice and in the held-out-generator rotation; false alarms per
   8 agent-hours = (garble false positives on the test jobs) ÷ (test jobs' agent-hours from first to last event timestamp) × 8;
   CPU ms per classification (median of 200).
6. **Prove a metric can fail:** score a deliberately shuffled prediction file and record the drop.
7. Rewrite `REPORT.md` from `results.json` only; apply the pass bar and kill rule honestly (a miss is a fine outcome).

Run long steps in the foreground with explicit timeouts; reply with text only at the very end, in the preface's format.
