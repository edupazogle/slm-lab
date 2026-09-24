# Brief E14 — a self-hosted small model as an ordinary model binding (half-day spike)

Read first: `slm/plan/briefs/_preface.md`, then `slm/plan/EXPERIMENT-PLAN.md` section "E14". Your folder: `slm/experiments/e14/`.

**Question.** Can BizLoop reach a small model served on this machine purely through configuration — a binding in
`config/models.json` — with its cost line and a model card, and no code change?

1. Read `config/models.json` and the code in this checkout that resolves a role to a binding and calls it (search:
   `grep -rn "models.json" gateway engine | head`, then read the resolver, e.g. `lanes.resolve`). Write down in
   `REPORT.md` how a binding is shaped and which fields the caller uses.
2. Serve a small instruct model with an OpenAI-compatible API bound to 127.0.0.1 only, port 8190: llama.cpp's server from
   `~/.venvs/slm` (`python -m llama_cpp.server`, run it — do not install into that venv) or your own venv. Model:
   `ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF` (Apache-2.0) — download the GGUF with curl into your folder's `models/`
   (git-ignore it). `serve.sh` starts it with an explicit PID file; stop it at the end of your run.
3. Copy `config/models.json` to `slm/experiments/e14/models.json` and add ONE binding for the local server, following the
   existing bindings' shape exactly (lane `lab`, residency "this machine"). Do not edit the real `config/models.json`.
4. `call_binding.py`: use the repo's own resolver pointed at your copy (a path argument or environment override if the
   code offers one; if it offers none, say so — that is a finding) to resolve a role to your binding and make one real
   call. Record latency, tokens reported by the server, and the cost line the repo's pricing code would print for it.
5. `MODEL-CARD.md` for the binding: model, licence, size, where it runs, what it may be used for, measured latency.
6. `REPORT.md`: pass/fail against the plan's bar ("a local OpenAI-compatible endpoint serves a role binding end to end,
   with its cost line and model card, and no code change"), every code change that WOULD be needed if any, and the
   comparison with first-party nano-class models marked "not measured" unless you actually ran one.
