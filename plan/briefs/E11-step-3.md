# E11 — step 3: the small-LM garble feature (the baseline missed the bar: garble recall 0.92 < 0.95)

Read `slm/plan/briefs/_preface.md`, `slm/experiments/SUPERVISOR-NOTES.md`, then `slm/experiments/e11/REPORT.md` and
`results/summary.json`. Work in `slm/experiments/e11/` on the dataset as it is (1,307 windows; do NOT rebuild it).
1. `lm_feature.py`: a per-window garble score from a small causal LM on CPU: `HuggingFaceTB/SmolLM2-135M` (Apache-2.0)
   through `transformers` in the e11 venv (pip install transformers torch --index-url https://download.pytorch.org/whl/cpu
   if torch is missing; set `OMP_NUM_THREADS=4`). Score = mean token negative log-likelihood over the window's last 1,500
   bytes (truncate to 512 tokens). Cache scores to `data/lm_scores.jsonl` keyed by window id; time the median ms per window.
2. `baselines.py`: add Baseline 2 = Baseline 1's features + the LM score; same split, same seed; the held-out-generator
   rotation and the Latin-script slice as before. Write everything to `results/summary.json` under `baseline_2` (keep
   `baseline_1` as it was for comparison).
3. Decision by the plan's kill rule: Baseline 2 is kept only if it beats Baseline 1 by MORE than 2 points on garble recall
   without raising false alarms per 8 agent-hours above 1, AND stays ≤ 1 s CPU per poll (the LM score's ms count).
   Also record: `waiting_permission_recall` is 0.0 because the data holds no such windows — write that as "not measurable
   on this data" in the report instead of 0.0, and count how many windows carry each state label.
4. Rewrite `REPORT.md` from `results/summary.json`; update the E11 row in `../SUPERVISOR-NOTES.md`.
Every message must contain a tool call until done; foreground runs with explicit timeouts (model download ≤ 5 min; scoring
in chunks of ≤ 300 windows per call); text only in the final reply, in the preface's format.
