# Brief E11 — local watchdog classifier for the agent fleet (dataset + baselines + decision)

Read first: `slm/plan/briefs/_preface.md`, then `slm/plan/EXPERIMENT-PLAN.md` section "E11", and
`slm/research/landscape/bizloop-applications.md` section "C1. Garble and pane-state classifier" (lines ~104–145).
Today's instrument: `tools/vf-fleet-watch`, function `garble_and_mtime()` (the non-Latin-ratio heuristic). Your folder: `slm/experiments/e11/`.

**Data on disk.** `cockpit/runs/*.jsonl` — Claude Code stream-json transcripts of real delegate jobs (295 MB), with the
brief beside each as `<job>.prompt.txt`. Real garble incidents are described in `cockpit/SUPERVISOR-LOG.md` (search "garble").

1. `build_dataset.py`: turn the transcripts into windows of the last 6,000 bytes of visible agent output (assistant text
   + tool results as a terminal would show them), sampled along each job. Label each window with a pane state derived from
   the transcript's STRUCTURE, never from a model: `working` (more tool calls follow), `finished-report` (a result event
   follows immediately), `waiting-permission` (tool results saying approval is required), `api-error` (error events,
   402/429/500 text), and `garble`. Real garble is rare, so add synthetic garble with a documented generator: multilingual
   token salad, repetition loops, Latin-script nonsense, truncated JSON spew. Keep real and synthetic garble as separate
   slices. Split by JOB (never by window) into train / test. Write `data/{train,test}.jsonl` + `DATA.md` (counts per label).
2. `baselines.py`: (0) today's heuristic, reimplemented faithfully from `tools/vf-fleet-watch`; (1) a compression-ratio
   (zlib) + regex feature set with logistic regression (scikit-learn in your own venv). Report per class.
3. Only if (1) misses the pass bar: (2) add a small-LM perplexity feature (a ≤ 360M-parameter model on CPU, Apache/MIT).
4. Metrics (into `results.json`): garble recall overall and on the Latin-script slice; false alarms per 8 agent-hours
   (define agent-hours from the transcripts' timestamps); state accuracy; waiting-permission recall; CPU seconds per
   classification.
5. Pass bar (from the plan): garble recall ≥ 0.95 overall and ≥ 0.90 on the Latin-script slice; ≤ 1 false alarm per
   8 agent-hours; pane-state accuracy ≥ 0.90 with waiting-permission recall ≥ 0.95; ≤ 1 s CPU per poll.
   **Kill rule:** if the compression + regex baseline comes within 2 points of a model, keep the baseline, drop the model.
6. `REPORT.md`: the decision (baseline, model, or neither), with numbers from `results.json`.

Do not modify `tools/vf-fleet-watch` — the supervisor will port a winner after verifying it.
