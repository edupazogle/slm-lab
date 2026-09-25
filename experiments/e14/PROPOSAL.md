# E14 proposal: a local OpenAI-compatible server as an ordinary binding

The spike's two findings (`../SUPERVISOR-NOTES.md`, E14 row), and the change BizLoop needs for each. The gateway,
`config/models.json` and `cockpit/pricing.json` are in the BizLoop checkout, not in this repo. What follows is written
against what this folder shows (`models.json`, `call_binding.py`, `results.json`); where it names BizLoop code it names
the function to edit and what it must do, not code nobody here has read.

## What the spike showed

- **Binding shape.** Every binding in `models.json` has `provider`, `model`, `residency` (+ `residency_note` or
  `residency_source`) and `lanes`. Nothing says where to send the request or which key to use.
- **The resolver passes binding fields through.** `gateway.lanes.resolve("local_test", "poc", config=…)` returned
  `{"binding", "lane"}` plus every field of the binding, `residency_note` and `lanes` included (`results.json`,
  `resolved_binding`). So a new field in the binding most likely reaches the caller with no resolver change. This is
  inferred from one output, not read in `gateway/lanes.py`.
- **The URL lived in the caller.** `call_binding.py` hard-coded `http://127.0.0.1:8190/v1` (spike version, lines
  30–33). Calling this binding through BizLoop would mean adding a `llamacpp` case wherever the gateway maps a
  `provider` to an endpoint. That is a code change, and every new local server would need another one.
- **The cost line was never produced by BizLoop.** `"not measured (model not in pricing.json)"` was written into
  `call_binding.py` by hand. Nobody ran `gateway/pricing.py` for this model.

## (a) `base_url` and `api_key_env` in the binding

**Rule.** A binding that carries `base_url` is called as an OpenAI-compatible chat-completions endpoint at that URL,
whatever its `provider`. For such a binding, `provider` only labels it for pricing and logs. `api_key_env` is optional.
It holds the *name* of the environment variable with the key, never the key itself.

`config/models.json`, under `bindings`:

```json
"llamacpp-local": {
  "provider": "llamacpp",
  "model": "smollm2-360m-instruct-q8_0",
  "base_url": "http://127.0.0.1:8190/v1",
  "residency": "unknown",
  "residency_note": "local llama.cpp server on this machine (loopback only)",
  "lanes": ["lab"]
}
```

A server started with a key (`llama_cpp.server --api_key …`, vLLM `--api-key …`) adds
`"api_key_env": "LOCAL_LLM_API_KEY"`. The role is then an ordinary role row, e.g. `"local_test": {"lab": "llamacpp-local", …}`.
The spike's copy maps the `axa` lane to this lab-only binding too (`models.json`, `roles.local_test`). The resolver's
lane guard should refuse that for an AXA environment. Check it does before copying the row.

This folder's `models.json` now carries that `base_url`. `call_binding.py` reads it (see `build_request`) and falls back
to the old hard-coded URL only when the field is missing (`base_url_source` in its output says which one it used).

**What the owner changes in BizLoop.** There are three places, and none of them is per model:

1. **`gateway/lanes.py`, `resolve(role, env, config=None)`**, and whatever validates a binding when the config loads
   (`load_config`, if it validates).
   - If `resolve` copies the binding dict, as `results.json` suggests, the return value needs no change.
   - If it copies a fixed list of fields, add `base_url` and `api_key_env` to that list.
   - Add two checks where bindings are validated:
     - `base_url` is a string starting with `http://` or `https://`.
     - `api_key_env` matches `^[A-Z_][A-Z0-9_]*$`, so a pasted key fails loudly and never sits in the config.
2. **The function that turns a resolved binding into an HTTP request.** This is the one that dispatches on
   `binding["provider"]`; find it with `grep -rn provider gateway engine`. Add one branch that
   runs before the per-provider dispatch:
   - when `binding.get("base_url")` is set, POST `{"model": binding["model"], "messages": …}` to
     `base_url.rstrip("/") + "/chat/completions"`;
   - send `Authorization: Bearer <os.environ[api_key_env]>` when `api_key_env` is named, and fail with the variable's
     name when it is unset;
   - read `usage.prompt_tokens` / `usage.completion_tokens` from the response for the cost line.

   Bindings without `base_url` keep today's path unchanged. `call_binding.py`'s `build_request` is a reference for
   what the branch must produce, and `--dry-run` prints it.
3. **`tests/test_gw_lanes.py`.** Add three cases:
   - a binding with `base_url` resolves and the field reaches the caller;
   - a malformed `base_url` or a key-shaped `api_key_env` is rejected;
   - `TestResidencyIsSourced` still holds (the local binding keeps `residency: "unknown"` with its note).

After this one-time change, every later local or OpenAI-compatible server (llama.cpp, vLLM, Ollama's `/v1`) is a
`models.json` row. That is the plan's "configuration, not code".

## (b) A price row for the local model

`cockpit/pricing.json` (the path the spike's files name) needs a row for the model, priced at zero with the basis
stated. The row must be keyed and shaped like the file's existing rows, and that shape is not in this repo. So below,
**only the values are the proposal; the key names are placeholders** to be renamed to match the existing rows:

```json
"smollm2-360m-instruct-q8_0": {
  "currency": "EUR",
  "input_per_token": 0.00,
  "output_per_token": 0.00,
  "basis": "self-hosted: llama.cpp on the operator's machine, loopback; electricity and hardware amortisation not counted",
  "cost_line_note": "self-hosted, hardware not counted"
}
```

- **Lookup key.** The spike's note looked the model up by the binding's `model` string
  (`smollm2-360m-instruct-q8_0`). Use whatever key `gateway/pricing.py` actually uses (model or binding name).
- **Cost line.** With the row present, the cost line should read **`0.00 (self-hosted, hardware not counted)`**
  instead of `not measured`. If `gateway/pricing.py` prints only the computed amount, it needs to add the row's note
  after the amount. That is the only pricing code change, and it is needed only if the code cannot already print a
  note.
- **Why 0.00 is honest here.** The marginal cost per token of a model already running on owned hardware is zero, and
  the row says what it leaves out. Electricity (J/token) and amortised hardware are out of scope until measured. When
  they are, they replace the zero, with their source.
- **What the zero does not settle.** A zero price does not make the model the better choice. The plan's second bar
  still applies: a server-side small model must beat the first-party nano-class models on the same task before it earns
  a model card (`REPORT.md`: not measured).

## Checked here, and what only runs on the owner's machine

Checked offline in this repo:
- `python3 call_binding.py --dry-run` with no BizLoop checkout. It uses a stand-in resolver and says so, and prints the
  request built from the binding's `base_url`.
- A real run against a scratch test double of `gateway/lanes.py` and a stub OpenAI-compatible server:
  - `base_url` came from the binding;
  - `api_key_env` became a `Bearer` header, and the run refused to start when the variable was unset;
  - a binding without `base_url` fell back to the old URL.

The double is not BizLoop's gateway. On the owner's machine (BizLoop at `/home/edu/Public/bizloop`, or set
`BIZLOOP_ROOT`):

```bash
cd experiments/e14
python3 call_binding.py --dry-run        # real gateway.lanes.resolve; check base_url is in the resolved binding
./serve.sh                               # E14_MODEL_PATH / E14_PYTHON override the GGUF and the python
for i in $(seq 60); do curl -sf http://127.0.0.1:8190/v1/models >/dev/null && break; sleep 1; done
python3 call_binding.py                  # 5 calls; results.json gains resolver + base_url_source
kill "$(cat serve.pid)"
```
