# Archive: E11 step 3 as it stood in the BizLoop repo (feat/slm-lab @ 0628210, 2026-09-24)

These seven files are moved here from `github.com/edupazogle/Bizloop`, branch `feat/slm-lab`, commit `0628210`
("SLM E11 step 3: the small-LM garble feature, measured and dropped…"), plus that branch's `experiments/SUPERVISOR-NOTES.md`.
They were the only SLM Lab content that existed in the BizLoop repo and not in this one. The SLM Lab left the BizLoop
line on 2026-09-25, and the operator asked for them to be moved here on 2026-09-26.

**They are superseded. Do not use their numbers.** This repo's 6e63628 ("SLM E11/E14: the E11 evaluation fixed (its
published numbers were not valid), step 3 finished…") found the evaluation behind them invalid:
- the test metrics were in-sample;
- "pane-state accuracy" was really binary garble accuracy;
- waiting-permission recall and CPU ms were constants;
- window labels came from the end of each job.

The current E11 is `experiments/e11/`, with its `REPORT.md` and `SUPERVISOR-NOTES.md`.

| File | What it is |
|---|---|
| `SUPERVISOR-NOTES.md` | the BizLoop-side supervisor notes for SLM wave 1, including the E11 figures later found invalid |
| `e11/REPORT.md`, `e11/final_reply.txt` | the delegate's step-3 report and final message |
| `e11/baselines.py`, `e11/lm_feature.py` | the step-3 scripts (the in-sample fit that 6e63628 corrected) |
| `e11/data/lm_scores_summary.json`, `e11/results/baselines_results.json` | the step-3 outputs |

The bytes are exactly those of `feat/slm-lab:slm/<path>` in the BizLoop repo, which keeps its history as an archive branch.
