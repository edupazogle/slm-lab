# E14 — finish (fresh session; handoff from the supervisor)

Read `slm/plan/briefs/_preface.md` and `slm/plan/briefs/E14-local-binding-spike.md` first. A previous session got this far
in `slm/experiments/e14/` — keep its files, fix and finish:

- `models/smollm2-360m-instruct-q8_0.gguf` is downloaded (386 MB, valid). **The only reason the server never started:**
  `serve.sh` points at `smollm2-360m-instruct.q8_0.gguf` (a dot where the file has a hyphen). Fix `MODEL_PATH`.
- `models.json` (a copy of `config/models.json` with the local binding) exists — check it against the real file's binding
  shape; the resolver is `gateway/lanes.py` `resolve(role, env, config=None)`: read it to see what `config` accepts
  (a dict? a path?) and how env selects the lane.
- `REPORT.md` is a transcript of thinking, not a report — rewrite it at the end.

Steps:
1. Fix `serve.sh`; start the server; wait for `http://127.0.0.1:8190/v1/models` to answer (a loop with a 60 s deadline,
   in the foreground); record the PID.
2. `call_binding.py`: load your `models.json`, call `gateway.lanes.resolve(<a role you add or reuse>, "poc", config=…)`
   exactly as the code supports; POST one chat completion to the resolved binding's base URL; write
   `results.json` with the resolved binding, latency ms (median of 5 calls), prompt/completion tokens from the server's
   `usage`, and the cost line — look for the repo's own pricing code (`gateway/pricing.py`) and say what it would print for
   a model with no price row; do not invent a price. If the resolver cannot take your config without a code change, record
   that as the finding and show the one-line change it would need (do not apply it).
3. `MODEL-CARD.md`: model, licence (Apache-2.0), size, where it runs (this machine, loopback), measured latency, intended use
   (bounded classification and extraction in the Lab lane; not the AXA lane).
4. Stop the server (kill the recorded PID); confirm port 8190 is closed.
5. Rewrite `REPORT.md`: a short, factual report — pass/fail against the plan's bar, the numbers from `results.json`, code
   changes that would be needed (if any), and "first-party nano comparison: not measured".

Every message must contain a tool call until the brief is done; text only in the final reply, in the preface's format.
