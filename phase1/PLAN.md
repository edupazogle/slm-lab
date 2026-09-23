# SLM Research & Experimentation — Plan (needle3 → AnythingLLM)

Goal (operator 2026-09-20): review Cactus-Compute/needle3 + its ecosystem, set up an AnythingLLM
web UI usable on desktop & mobile, download small low-GPU models, run a deep round of experiments,
and produce a findings paper on SLM strengths/weaknesses + value for BizLoop (esp. anonymization,
synthetic data, docling document understanding, claims-triage).

## Environment facts
- WSL2 (systemd), passwordless sudo, network OK. GPU: RTX 4070 12GB (~8GB free). No Docker/Ollama yet.
- Disk: WSL root 898G free (on C: VHD, keep light), E: 106G free (bulk here).

## Phases
1. **Research** needle3 + Cactus ecosystem (needle/needle2/needle3/needle-pebble-ft, parakeet ASR,
   gemma-4-e2b, fine-tuning guide) + broader SLM landscape + AXA/fintech/insurance applications.
2. **Setup**: Ollama (native, GPU) → models; AnythingLLM (Docker, web server) → LAN for mobile;
   Python venv: `cactus-needle` (+train), `docling`.
3. **Experiment A — needle3 (Python)**: tool-calling, structured extraction (claims-triage schema),
   confidence gating, embeddings, synthetic-data structuring. Try LoRA fine-tune.
4. **Experiment B — AnythingLLM + Ollama SLMs**: load 1–3B chat models, benchmark speed/quality,
   RAG + docling document Q&A, desktop + mobile access.
5. **Paper**: findings paper (Markdown) + readable Artifact for the operator.

## Working decisions (I'm deciding, not asking — operator told me to proceed)
- Models on E: (`OLLAMA_MODELS=/mnt/e/VF/ollama-models`) to keep C: lean.
- AnythingLLM in Docker (systemd is on). Fallback: desktop app / npm source.
- Mobile: expose via Windows portproxy if WSL NAT blocks LAN.

## Log
- 19:35 — recon done, needle3 card + files + org + github + cactuscompute.com read.
