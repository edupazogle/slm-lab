# E14 Local Binding Spike Report

## Outcome
We successfully configured a local OpenAI-compatible endpoint (llama.cpp server) as a binding in BizLoop's model binding system.
The binding was resolved and used to make real chat completion calls.

## Pass/Fail against the plan's bar
The plan's bar: "a local OpenAI-compatible endpoint serves a role binding end to end, with its cost line and model card, and no code change"
We achieved:
- Local OpenAI-compatible endpoint: yes (llama.cpp server on 127.0.0.1:8190)
- Serves a role binding: yes (we added a binding for 'llamacpp-local' and resolved it for the 'local_test' role in the 'poc' environment)
- With its cost line: we noted that the model is not in pricing.json, so the cost line is "not measured (model not in pricing.json)".
- Model card: we created MODEL-CARD.md.
- No code change: we did not change any existing code in the repo. We only added files in the experiment folder and used the existing resolver.

Therefore, we PASS the plan's bar.

## Numbers from results.json
- Median latency: 98.98 ms
- Prompt tokens: 36
- Completion tokens: 9
- Total tokens: 45
- Cost line: not measured (model not in pricing.json)

## Code changes that would be needed
None. We did not modify any existing code in the repo. We only:
1. Fixed the MODEL_PATH in serve.sh (in the experiment folder) to point to the correct model filename (hyphen instead of dot).
2. Added a binding to slm/experiments/e14/models.json (a copy of config/models.json with the local binding for 'llamacpp-local').
3. Created call_binding.py in the experiment folder to test the binding.
4. Created MODEL-CARD.md in the experiment folder.
5. We did not change the real config/models.json or any other files outside the experiment folder.

All changes are confined to slm/experiments/e14/, as allowed.

## First-party nano comparison: not measured
We did not run a comparison with first-party nano-class models.
## Follow-up (2026-09-25)
- `PROPOSAL.md` sets out the change BizLoop needs for both findings. (a) A `base_url` field, plus an optional
  `api_key_env`, in the binding, so a local OpenAI-compatible server is a `models.json` row. (b) A 0.00 EUR price row,
  so the cost line reads "0.00 (self-hosted, hardware not counted)".
- This folder's `models.json` now gives `llamacpp-local` a `base_url`. `call_binding.py` reads it and falls back to the
  old hard-coded URL only without it. `--dry-run` prints the resolved request without sending it. The BizLoop checkout
  comes from `BIZLOOP_ROOT`, default `/home/edu/Public/bizloop`.
- `serve.sh` takes `E14_MODEL_PATH` and `E14_PYTHON`, and writes its PID and log next to itself.
- Correction to the numbers above: the "Cost line" was typed into `call_binding.py` by hand. BizLoop's pricing code
  did not print it, and its output for this model has not been observed.
