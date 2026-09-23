# SLM Lab — operator quick-start

Everything below is already running on this machine. This file is the "how do I use it" guide.

## What's running

| Service | URL | Notes |
|---|---|---|
| **AnythingLLM** (web UI) | `http://localhost:3001` | Docker, `--network host`, onboarding done |
| **Model server** (OpenAI-compatible) | `http://127.0.0.1:8000/v1` | `llama-cpp-python`, serving Qwen2.5-1.5B (CPU) |
| needle3 + docling | venv `~/.venvs/slm` | experiments in `docs/slm-research/experiments/` |

Models (GGUF) on `E:\VF\gguf-models\`: `qwen2.5-1.5b`, `llama3.2-3b`, `gemma2-2b`.

## Use AnythingLLM (desktop)

1. Open `http://localhost:3001` in a browser (works from Windows via WSL localhost forwarding).
2. First time only — attach the local model (1 minute):
   - **Settings → LLM → Provider = "Generic OpenAI"**
   - **Base URL** = `http://127.0.0.1:8000/v1`
   - **API key** = anything (e.g. `local`)
   - **Chat model** = the model id, e.g. `/mnt/e/VF/gguf-models/qwen2.5-1.5b/qwen2.5-1.5b-instruct-q4_k_m.gguf`
     (or copy the exact `id` shown by `curl http://127.0.0.1:8000/v1/models`).
   - Save. New chat → done.
3. (Optional) set **Embedder** to "AnythingLLM Native Embedder" and leave vector DB on LanceDB (defaults work).

## Use on mobile (phone/tablet)

Desktop already works. For a phone on the same Wi-Fi, run these **once in an admin PowerShell** on
Windows (the portproxy needs elevation — I hit the "requires elevation" error, so this is the one
manual step):

```powershell
netsh interface portproxy add v4tov4 listenaddress=192.168.1.36 listenport=3001 connectaddress=172.20.139.222 connectport=3001
netsh advfirewall firewall add rule name="AnythingLLM 3001" dir=in action=allow protocol=TCP localport=3001
```

Then browse to `http://192.168.1.36:3001` from the phone. Note: `172.20.139.222` is the WSL IP and
**changes on every WSL restart** — re-run the `portproxy add` line (or `delete` then `add`) after a
restart. The durable fix is WSL mirrored networking (`.wslconfig` → `networkingMode=mirrored` +
`wsl --shutdown`), which removes the portproxy entirely.

## Switch the chat model

Stop the current server (`kill $(cat experiments/llama_server.pid)`) and start another, e.g.:

```bash
~/.venvs/slm/bin/python -m llama_cpp.server \
  --model /mnt/e/VF/gguf-models/gemma2-2b/gemma-2-2b-it-Q4_K_M.gguf \
  --host 127.0.0.1 --port 8000 --n_ctx 4096
```

Then update the model id in AnythingLLM (or just leave the URL the same — the endpoint is model-agnostic).

## Re-run the experiments

```bash
cd docs/slm-research/experiments
export NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1
~/.venvs/slm/bin/python needle3_claims.py       # claims triage + extraction + PII + benchmark
~/.venvs/slm/bin/python needle3_experiment2.py  # multi-action / relative-time / grounding
# results land in needle3_results.jsonl
```

## A note on speed

The chat models run on **CPU** here, which is slow (Qwen 1.5B ~16 tok/s; the 3B model ~3 tok/s).
For a fast mobile experience, either (a) approve installing **Ollama** (it does GPU automatically and
AnythingLLM has a native Ollama provider), or (b) a GPU rebuild of llama.cpp. needle3 itself is
CPU-native and needs no GPU at all (~0.5 s per extraction).
