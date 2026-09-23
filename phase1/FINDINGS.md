# Small Language Models for BizLoop — Findings Paper

**Operator:** Valheim / BizLoop · **Date:** 2026-09-20 · **Author:** supervisor session (deepseek-v4-pro)

---

## 0. Executive summary

This session reviewed **Cactus-Compute/needle3** and its ecosystem, stood up an
**AnythingLLM** web interface (desktop + mobile path), downloaded small models, and ran a
deep round of hands-on experiments. The headline result:

> **`needle3` (121M params, 35 MB, runs on CPU with zero GPU) is a specialised "tool-calling +
> structured-extraction + embedding" model, not a chatbot — and it is *exactly* the shape of a
> claims-triage primitive.** It extracted a full claim record and a PII record (name, phone, email,
> address, policy, national ID) with perfect fidelity in ~0.5 s on CPU, and its **grounding gate
> suppressed a hallucinated claim** on sparse input. Its weaknesses are real and measurable too:
> relative-time resolution fails, name/phone disambiguation scrambles, and confidence can be
> **high (0.99) while wrong**.

Key findings in one table:

| Question | Answer |
|---|---|
| Is needle3 useful for claims triage? | **Yes** — structured extraction is excellent; tool-calling + confidence gating fit "act / confirm / refuse" routing. |
| Is it safe to run unattended? | Partly — the grounding gate catches full hallucination, but confidence is not a silver bullet (0.99 on a wrong answer). Needs a human/big-model in the loop for the middle band. |
| Does it work in French? | Weak — non-English fragments ~1.7× more tokens and confidence is English-calibrated ("correct Spanish calls measured at 0.0"). **Fine-tuning is the fix.** |
| Can it anonymise data? | Yes — it extracts PII into typed fields on-device, which can drive a redaction step without sending raw text to a cloud. |
| What about general chat SLMs (Qwen/Llama/Gemma)? | They work and answer correctly, but on CPU they are **too slow** (3–16 tok/s) for interactive use. Need GPU (Ollama/LM Studio) or a dedicated server. |
| Does docling work here? | Yes — HTML and PDF → clean Markdown with table reconstruction, OCR on GPU. Combined with needle3 it makes a document→structured-data pipeline. |
| Can needle3 be fine-tuned locally? | Yes — LoRA on GPU works (22 min → 63 MB artifact). But a 179-example synthetic dataset didn't improve held-out accuracy (0.72 → 0.72): **data, not tooling, is the bottleneck.** See §7. |

---

## 1. Scope, method, and constraints

**Reviewed.** The needle3 model card, its Files tab, the Community tab, the Cactus-Compute
organisation page (62 models, 3 datasets), the `cactus-compute/needle` GitHub repo, and
`cactuscompute.com/needle` (architecture + benchmarks). Companion models read: `needle`,
`needle2`, `needle-pebble-ft`, `parakeet-tdt-0.6b-v3` (ASR), `gemma-4-e2b-it-hybrid` (5B, "knows
when it's wrong" probe). Full references in the appendix.

**Environment.** WSL2 (systemd), AMD Ryzen 7 7800X3D (8c), NVIDIA RTX 4070 12 GB, no Docker/Ollama
preinstalled, Python 3.14 system (too new) → a 3.12 venv via `uv`.

**Constraints I hit (and how I handled them).**

1. **`curl https://ollama.com/install.sh | sh` was denied** by the permission classifier (executes
   remote code from a source the goal didn't name). I did **not** work around it — I used
   `llama-cpp-python` (a pip package) as the model server instead, and I flag Ollama below as the
   one thing worth approving for a smoother GPU setup.
2. **Web search is denied** in this environment (both `WebSearch` and the `jina search_web` route).
   I did the "find more" work through **specific URL reads** of the named sources and
   **HuggingFace's own API** (`HfApi`), not general search. Domain-reasoning sections are labelled
   as such.
3. **Mobile (phone) access** needs a Windows `netsh portproxy` + firewall rule, which requires an
   **admin** PowerShell (I confirmed the elevation error). Desktop works today via
   `http://localhost:3001` (WSL localhost forwarding). The exact command is in §11.

---

## 2. The needle3 family — what it actually is

Cactus Compute ships a **ladder** of tiny foundation models for tool-calling / structured
extraction / embeddings — not general chat. All are Apache-2.0 (needle is MIT).

| Model | Params | Size | Notes |
|---|---|---|---|
| `needle` (v1) | 26M | — | Encoder-decoder, pure attention (no FFN), distilled from Gemini 3.1. MIT. |
| `needle2` | 45M | 14 MB | CQ2-bit; runs a session in ~28 MB RAM; ESP32/Raspberry Pi/VR; 500 tok/s on a Pi 5. |
| `needle3` | 29–121M | 8–29 MB | **Laddered** 2–20 layers (one weights file, every depth is a deployable model). |
| `parakeet-tdt-0.6b` | 0.6B | — | Automatic speech recognition (NVIDIA Parakeet derivative). |
| `gemma-4-e2b-it-hybrid` | 5B | 3.4 GB (Q4_K_M) | Multimodal + a **confidence probe** that re-routes to a bigger model when unsure. |

**needle3 architecture** (the interesting part): a "Simple Attention Network" — Monarch-Hadamard
MLP instead of an FFN, GQA attention with causal conv taps, "engram" n-gram memory read by gather,
multi-lane hyper-connections. Most parameters sit in the engram, so the 121M model does the
arithmetic of a ~50M one. Weights are CQ2-bit (2.125 bits/weight). A **byte-level grammar compiled
from your schemas constrains every token**, so the output JSON *cannot* be malformed — schema
conformance is guaranteed, not requested.

**Three jobs, all on-device:** (1) tool calls — pick the right functions and fill every argument
from what the user said; (2) structured extraction — declare a shape, get typed fields; (3) text
embeddings — a vector per sentence for search/match/route/dedupe.

### 2.1 Why these are different from "a small ChatGPT"
The family is built on three ideas that matter more than parameter count:

1. **Intelligence laddering** — one weights file, every depth 2→20 is a deployable model. You pick
   the size that fits the device *and* the task, and fine-tune the smallest subnetwork that suffices.
2. **Grammar-constrained decoding** — the output is compiled against your schema, so JSON can't be
   malformed and enum values can't leave their set. This is what makes them *safe* dispatchers.
3. **Confidence + grounding** — a calibrated "am I sure?" score plus a grounding gate that withholds
   calls it can't justify from the input. The model can refuse instead of guess.

**The two "confidence" ideas are the real story for triage:**

- **needle3's calibrated confidence head** — every response carries a score in [0,1]; the engine
  withholds calls under 0.1; you route act/confirm/refuse on the rest.
- **gemma-4-e2b-it-hybrid's probe head** — post-trained to *know when it's wrong*, scoring every
  answer 0–1 as structured data, re-routing to a bigger model when below threshold (matches
  Gemini 3.1 Flash-Lite while running only 15–35% of queries through the big model). This is the
  "small model does the easy 80%, escalate the hard 20%" pattern.

---

## 3. The stack I built

| Component | How | Where | Status |
|---|---|---|---|
| **AnythingLLM** | Docker (`mintplexlabs/anythingllm`, `--network host`) | `http://localhost:3001` | ✅ serving, onboarding complete |
| **Model server** | `llama-cpp-python` (OpenAI-compatible) | `http://127.0.0.1:8000/v1` | ✅ serving (CPU build) |
| **3 chat SLMs** | GGUF via `huggingface_hub` | `E:\VF\gguf-models\` | ✅ downloaded |
| **docling** | pip (torch 2.14 + CUDA) | venv | ✅ HTML + PDF both verified |
| **cactus-needle** | pip (+ `[train,gpu]` JAX) | venv | ✅ inference + fine-tune |

Chat models downloaded (all GGUF Q4_K_M): `Qwen/Qwen2.5-1.5B-Instruct`, `unsloth/Llama-3.2-3B-Instruct`,
`bartowski/gemma-2-2b-it`. All run through the same OpenAI-compatible endpoint AnythingLLM's
"Generic OpenAI" provider can call.

---

## 4. Experiment results — needle3 (claims triage, extraction, PII, embeddings)

All results from real runs (scripts in `experiments/`), CPU, ~105 MB peak RAM, ~0.5 s mean latency.

### 4.1 Structured extraction — excellent
A messy claim paragraph → typed record, all five fields correct:
`policy AXA-77812, claimant "Mr. Jean Dupont", date 2026-08-30, type "car collision", amount 2150.5`.

### 4.2 PII extraction (anonymisation feed) — excellent
From a customer email, every PII field extracted correctly: `full_name`, `phone`, `email`,
`address`, `policy_number`, **`id_number`** (French national ID). This is the raw material for a
local anonymisation/redaction step — the structured PII list can be redacted or tokenised before
the text ever leaves the device.

### 4.3 Confidence tracks information-completeness (in simple cases)
5 claims benchmarked: confidences `[0.98, 0.55, 0.77, 0.94, 0.99]`. The 0.55 was the one claim
with **no amount** ("third-party liability after a fall, no amount") — the score dropped exactly
where a human would pause. Mean latency 0.59 s, p50 0.50 s.

### 4.4 The grounding gate is the safety feature — and it works
- **Sparse input** ("A customer wants to file a claim for a stolen bicycle") → the model *tried*
  to hallucinate a full claim (`policy "AC-777"`, `amount 50.0`) but the engine **suppressed the
  call** and listed 4 `validation.ungrounded` fields. A client that does nothing gets a refusal
  instead of a fabricated claim. This is precisely what you want in triage.
- **Multi-action with a missing required field** → the model invented a policy number (`MRD-7843`)
  and mangled the name, but again `validation.ungrounded` flagged policy, claimant, date and
  amount, and confidence dropped to 0.60.

### 4.5 Weaknesses — measured, not guessed
- **Relative-time resolution fails.** "call back the day after tomorrow at 3pm on 04 11 22 33 44"
  → `contact_number` got the *name*, `when` got the *phone number*, and — worse — **confidence was
  0.99** (high while wrong) with **no** ungrounded flag. Confidence is not a silver bullet.
- **Name/phone/disambiguation scrambles** under multi-action pressure (E1: claimant became
  `MRD-7843`).
- **Partial claims** ("Log a theft claim for 800 euros") → fabricated `policy_number="800 euros"`,
  `claimant="theft"`, `incident_date=today`, at confidence 0.87. Only the date was flagged.
- **Non-English degrades.** Spanish fragments ~1.7× more tokens; "correct Spanish calls measured at
  0.0" confidence. French is the same risk for AXA France → fine-tune or keep English.

### 4.6 Embeddings — weak absolute separation
`agent.embed()` returns 3072-dim vectors, but raw cosine is poorly separated:
`cos(water_damage, flooding)=0.94`, `cos(water_damage, car_collision)=0.92`,
`cos(water_damage, restaurant)=0.91`. The retrieval head is trained **contrastively** for top-k
*ranking* (pick the closest of a tool catalogue), not for absolute cosine thresholds. Use it for
ranking/dedupe, not for "similarity > 0.8" gates.

### 4.7 Classification via enums is label-sensitive
Extraction generalises to classification (an enum field = a classifier), but **the enum labels must
match user vocabulary**. Measured: classifying a claim's `line_of_business` with abstract labels
`["motor","home","liability"]` misfired — "…need this fixed before I *travel* on Friday" → `travel`,
a store slip-and-fall → `motor`, and a water-pipe claim returned `None`. Same model, same task, but
the abstract labels have no surface cue to ground on. The fix (per needle's tools-design guide) is to
name enums after the words people actually say, or fine-tune on the real label set. Sentiment and
urgency (labels with surface cues) worked far better than the abstract `line_of_business`.

### 4.8 The full agentic loop works — and smaller rungs suffice
`run()` (the full loop: model picks calls → executes your functions → feeds results back → continues)
correctly chained a two-step request — *"log claim AXA-9999 … and then flag it for review"* — into two
sequential calls (`log_claim` then `flag_for_review`) with both results returned. And on clean
extraction, **needle2 (45M) produced byte-identical output to needle3 (121M)**: the ladder means you
can run the smallest rung that fits the task/device and keep the big one for the hard cases.

**Net:** needle3 is a *primitive*, not a chatbot. Its extraction is the strongest part; its
routing + confidence + grounding give you a genuinely useful "act / confirm / refuse" scaffold for
simple claims. The failure mode to engineer around is **confident-but-wrong on relative time and
field disambiguation**, which is exactly what the middle "confirm" band and fine-tuning are for.

---

## 5. Experiment results — docling (document understanding)

- **HTML → Markdown**: correct, 0.6 s, table reconstructed.
- **PDF → Markdown** (a generated AXA motor-claim form): correct table (policy, claimant, phone,
  email, address, date, damage, amount, third-party reg) + description, **OCR on the GPU** (RapidOCR,
  torch engine). 45 s including first-run OCR model downloads.

**The killer combo** for the operator's triage interest: **docling turns a messy PDF into clean
Markdown, then needle3 turns that Markdown into a typed claim record + PII list.** Document in →
structured fields out, both locally — but only after **flattening the Markdown table to key-value
prose**. Measured: feeding docling's raw markdown *table* to needle3 made it hallucinate
(`policy "POL-2026-887"`, name `"Amara Okafor"`, amount `250.5`). Flattening `| key | value |`
rows to `key: value` lines fixed it — needle3 then extracted all five fields correctly
(`AXA-77812 / Mr Jean Dupont / 30 August 2026 / Car collision / 2150.5`). **Rule: docling emits
tables; needle3 wants prose — insert a flatten step.**

---

## 6. Experiment results — general chat SLMs (CPU benchmark)

Same 4 prompts × 3 models, `llama-cpp-python` on CPU (8 threads):

| Model | Speed (tok/s) | Factual | JSON extract | French | Synthetic claim |
|---|---|---|---|---|---|
| **Qwen2.5-1.5B** | **16.1** | ✅ correct | ✅ valid JSON | ⚠️ fluent, slightly off | ✅ plausible |
| **Gemma-2-2B** | 7.2 | ✅ correct | ✅ valid JSON | ✅ good | ✅ good |
| **Llama-3.2-3B** | 3.2 | ✅ correct | ✅ valid JSON | ⚠️ ok | ✅ good |

**Finding:** quality is *surprisingly good for the size* — all three answered insurance subrogation
correctly and produced valid JSON and plausible French synthetic claims. But **CPU speed is not
interactive** (3–16 tok/s). The 3B model is unusable on CPU; even 1.5B is "tolerable, not fast".

This is the sharp contrast that makes needle3 interesting: **needle3 does a *narrow* task at 0.5 s
on CPU, where a general 3B chatbot crawls.** Specialisation is the lever, not raw size. For
AnythingLLM to feel fast, these chat models need GPU (Ollama/LM Studio handle this automatically),
or you accept CPU for the 1.5B model only.

---

## 7. Fine-tuning needle3 (LoRA on GPU) — result

**What I did:** synthetic-data generator (`expand_data.py`) → **179 grounded EN+FR examples** →
LoRA (rank 16) on the frozen 20-layer base, **20 epochs on the RTX 4070 (JAX/CUDA), 22m35s, val loss
0.294 → 0.032**. Then `needle build` → **`tuned.cact` (63.5 MB, W4A8)**, and a held-out eval
(6 cases, fresh agent per case) against the base model.

**Result — the tooling works end-to-end; the data did not move the needle:**

| Held-out metric | Base | Fine-tuned |
|---|---|---|
| Accuracy (6 cases) | **0.72** | **0.72** |
| French "dégât des eaux" | truncates to `"eaux"` | same (unfixed) |
| Sparse claim → `flag_for_review` | hallucinates `log_claim` (grounding suppresses it) | same (unfixed) |
| Off-topic refusal | ✅ | ✅ (not broken) |
| Multi-action + FR callback | ✅ | ✅ |
| Confidence score | calibrated | **`None`** (head not updated) |

A 179-example, template-generated, log_claim-heavy dataset was **too small and too uniform** to fix
the two weaknesses it targeted. It also did **not** regress — with a clean eval the tuned model keeps
the base's off-topic refusal and multi-action routing. Two things I hit and confirmed:

1. **Context bleed is real.** Reusing ONE agent across independent cases made the tuned model
   hallucinate `log_claim` on off-topic input and misroute (a misleading 0.33). Fresh agents per case
   are mandatory — the same discipline as "reuse the instance for a *conversation*, but never across
   independent tasks."
2. **Fine-tuning does not update the confidence head** — tuned models report `confidence: None`
   (confirmed by the runtime warning). Route tuned models on your own validation set, not the score.

**The lesson for BizLoop:** the *pipeline* is a real asset — train a 121M model to a custom toolset in
~20 min on a consumer GPU, export a 63 MB artifact that runs on the same CPU engine. The *hard part is
the dataset*: needle's own guide says tool-selection moves with a few hundred clean examples, but
argument **grounding** (exactly what claims triage needs) takes **thousands** of varied,
reasoning-labelled examples with ~1/8 off-topic/refusal. My synthetic generator is the right
starting point; it needs real (anonymised) claims phrasing and 5–10× more volume to pay off.

---

## 8. Use-case mapping (the operator's four interests)

### 8.1 Anonymisation of data (so it can later be used with other platforms/LLMs)
needle3's PII extraction (§4.2) is the enabling step: run it on-device to pull structured PII out
of free text, then either (a) redact the matched spans, or (b) replace them with deterministic
tokens (pseudonymisation) *before* the text is shared with a cloud LLM or a partner platform. This
is the same job Microsoft Presidio does; needle3 does it locally with no network and at ~0.5 s,
which is valuable when the data cannot leave the machine. Caveat: needle3 extracts what you declare
— you must declare name/phone/email/address/ID as the schema, and its grounding makes it *less*
likely to invent PII than a free-form LLM.

### 8.2 Synthetic data generation (for testing with AI)
Two complementary roles observed: (a) **chat SLMs** (Qwen/Llama/Gemma) generate plausible synthetic
claims/text well (§6) — useful for filling test beds; (b) **needle3 structures/validates** the
synthetic data into typed records, so you can assert your downstream systems parse what the
generator emitted. I also used template+entity synthetic generation to build the fine-tune set (§7).
For regulated claims data, synthetic generation is the standard way to build a test corpus without
touching real policyholder data.

### 8.3 Document understanding (docling) as a triage tool
docling converts PDFs/DOCX/email/HTML (and even video/audio) to clean Markdown with table and
layout understanding, **on the GPU and air-gappable**. As a triage tool: drop a claims letter or a
policy excerpt in, get Markdown out, feed it to needle3 for the structured record. The
docling→needle3 pipeline is the concrete "document in, fields out" primitive the operator asked
about.

### 8.4 Simple-claims agentic workflow triage
The strongest fit. A claims-intake agent needs to: read a request → decide *what* it wants
(log / flag / callback / off-topic) → fill fields → decide *confidence*. needle3 does exactly this,
with grammar-guaranteed calls and a confidence score, and its grounding gate suppresses
hallucination. The `act / confirm / refuse` pattern from the needle docs maps directly onto a
claims routing queue: high confidence → auto-log; middling → show the extracted call to a human for
one-tap approval; empty → "I can't do that" / off-topic. gemma-4-e2b-hybrid's probe gives the same
"escalate when unsure" behaviour for the *chat* side.

---

## 9. What people do with SLMs, and the insurance/fintech angle

*(Grounded in the sources read; the AXA-specific part is domain reasoning, labelled.)*

**Why SLMs at all:** cost (no per-token API fees), latency, privacy/air-gap (data never leaves the
device), edge deployment (phones, wearables, microcontrollers), and full customisability
(fine-tune on your own schema). needle's positioning — "beat models 10× its size on tool calls,
match 2–3× bigger on extraction" — is the category's pitch: *for a narrow, well-defined task, a
small specialised model matches or beats a general one.*

**The four patterns people actually deploy** (all observed in this review):

1. **Distill a big model into a tiny specialist** — needle v1 was "Gemini 3.1 distilled into 26M
   params". The category's recipe: take frontier behaviour on *one* task, distil it down, ship at a
   fraction of the cost/latency.
2. **Confidence-gated escalation (the triage pattern)** — run the cheap model, and when its
   confidence is below threshold, route to a bigger model or a human. gemma-4-e2b's probe does this
   *inside* the model; needle3's confidence head does it around the model. This is the single most
   relevant pattern for claims.
3. **On-device structured extraction as the anonymisation gate** — extract PII/fields locally so raw
   text never leaves the boundary; only the typed fields (or redacted text) go onward. Privacy by
   construction, not by policy.
4. **Fine-tune-to-schema** — train the model on *your* tool/schema definitions so "the schema is the
   product"; a 4-layer subnetwork tuned on one product's tools matches a frontier model on that task.

**The dominant pattern** (visible across needle3, gemma-4-e2b, and the broader landscape): a **small
model does the easy majority and escalates the hard minority**, using a confidence signal. That is
the "triage" pattern and it is exactly what a claims-intake queue needs.

**Insurance/fintech applications** (domain reasoning): claims first-notice-of-loss (FNOL) intake and
routing; structured extraction of policy/claim/incident fields from email, forms, and documents;
PII detection and pseudonymisation before data leaves a compliant boundary; synthetic claims for
testing; document understanding (policy PDFs, medical reports); on-device field tools for loss
adjusters (extract + classify on a phone/tablet offline). The French-language caveat (§4.5) is the
single biggest blocker for AXA France specifically — address it by fine-tuning on French claims data.

---

## 10. Combination with Copilot / MCPs / startup-provider MCPs

- **needle3 as an MCP tool-router**: needle3 is *already* an OpenAI-compatible-function-caller —
  it accepts `{"type":"function","function":{...}}` wrappers. An MCP host could hand needle3 the
  tool list and use it as a fast, local, grammar-constrained "which tool + what args" front-end
  before a bigger model or a human executes. Because its output is grammar-guaranteed, it is a
  safer *dispatcher* than a free-form LLM for tool selection.
- **Hybrid small→large**: small model classifies/extracts cheaply and locally; only the uncertain
  band goes to a frontier model or a startup-provider MCP. This is literally gemma-4-e2b's routing
  design, and it applies to Claude/Copilot-class tools as a cost+latency gate.
- **AnythingLLM already speaks MCP** and dynamic model routing — a natural place to bolt a
  startup's MCP server onto the same workspace where the local SLMs run.

---

## 11. Recommendations & next steps

1. **Approve Ollama** (or a GPU llama.cpp build) for the general chat models. Ollama is the
   anything-LLM-native, GPU-automatic path and removes the CPU slowness in §6. One approval unblocks
   it; otherwise `cmake` + `nvidia-cuda-nvcc` (already present) let me rebuild llama.cpp with CUDA.
2. **Mobile access** — run once in an **admin** PowerShell (needs the operator):
   `netsh interface portproxy add v4tov4 listenaddress=192.168.1.36 listenport=3001 connectaddress=172.20.139.222 connectport=3001`
   plus a firewall allow rule for TCP 3001. (WSL IP changes on restart; mirrored networking is the
   durable fix.)
3. **Fine-tune needle3 on real French claims data** to fix the §4.5 French weakness — start from
   the synthetic generator, swap in real (anonymised) claim phrasing, scale to ≥1k examples.
4. **Run the docling→needle3 pipeline end-to-end** on a real claims PDF and score it against human
   extraction (the one integration not yet joined in a single run).
5. **Build the triage queue** around needle3's `act/confirm/refuse` bands with a human-in-the-loop
   review surface (the AnythingLLM UI or a small internal page).

---

## Appendix A — exact commands used

```bash
# venv + packages
uv venv --python 3.12 ~/.venvs/slm
uv pip install --python ~/.venvs/slm/bin/python cactus-needle docling llama-cpp-python fastapi uvicorn sse-starlette pydantic-settings starlette-context "cactus-needle[train,gpu]"

# models (GGUF) to E: (bulk)
export HF_HOME=/mnt/e/VF/hf-cache
# huggingface_hub: Qwen/Qwen2.5-1.5B-Instruct-GGUF, unsloth/Llama-3.2-3B-Instruct-GGUF, bartowski/gemma-2-2b-it-GGUF  (Q4_K_M)

# AnythingLLM
sudo docker run -d --name anythingllm --network host -e DISABLE_TELEMETRY=true -v anythingllm-storage:/app/server/storage mintplexlabs/anythingllm

# OpenAI-compatible model server (CPU today)
~/.venvs/slm/bin/python -m llama_cpp.server --model /mnt/e/VF/gguf-models/qwen2.5-1.5b/qwen2.5-1.5b-instruct-q4_k_m.gguf --host 127.0.0.1 --port 8000 --n_ctx 4096

# needle3 fine-tune
~/.venvs/slm/bin/needle finetune data.jsonl --epochs 20 --batch-size 8 --out adapter.safetensors
~/.venvs/slm/bin/needle build --lora adapter.safetensors --out tuned.cact
```

## Appendix B — sources

- `huggingface.co/Cactus-Compute/needle3` (card, files, community, org page)
- `github.com/cactus-compute/needle` (+ `llms.txt`)
- `cactuscompute.com/needle` and blog guides (finetuning, confidence, tools-design, extraction, python-docs)
- `huggingface.co/Cactus-Compute/{needle,needle2,needle-pebble-ft,parakeet-tdt-0.6b-v3,gemma-4-e2b-it-hybrid-GGUF}`
- `github.com/docling-project/docling`, `github.com/Mintplex-Labs/anything-llm`
