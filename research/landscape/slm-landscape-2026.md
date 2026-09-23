# Small language models in production, and inference at the edge — landscape report

**Date: 2026-09-21.** Written for the AXA AI-innovation team planning a refactor of **BizLoop**, an agentic PM
product that lives inside Microsoft 365 Copilot, under a hard **EU data-residency** requirement.

**How to read this.** Every factual claim carries a URL; the Sources list at the end repeats them with the
access date (all 2026-09-21). Three labels are used throughout:

- **[measured]** — a number published by the party that ran the measurement, with the device/config stated.
- **[vendor]** — a vendor's own marketing or press claim. Treated as a claim, not evidence.
- **[UNVERIFIED]** — I could not confirm it from a primary source in the time available. Do not act on it
  without checking.

Anything not labelled is a documented fact from a primary source (a regulation, a vendor doc page, a model
card, a repository, an API response). Where two sources disagree, both are shown. Numbers from benchmark
leaderboards are reproduced exactly as published; none are estimated, interpolated or rounded by me.

Local inputs used (read for orientation only, not cited as evidence):
`/home/edu/Public/bizloop/slm/research/repos/*.md` (17 repo dossiers) and
`/home/edu/Public/bizloop/slm/research/models/catalog-*.json` (61 model rows, collected 2026-09-21).

---

## 1. Dominant deployment patterns

### 1.1 Distil-to-specialist (train a small model on a big model's outputs for one task)

This is the most evidence-backed pattern, and the one with peer-reviewed results.

- **LoRA Land** — 310 LoRA-fine-tuned small models; the technical report claims the adapters "rival GPT-4"
  on narrow tasks (<https://arxiv.org/pdf/2405.00732>). Predibase's own write-up says 25 fine-tuned
  Mistral-7b models "outperform base models by 70% and GPT-4 by 4-15%, depending on the task", each trained
  "for less than $8.00 on average" and all served from a single A100 with LoRAX **[vendor]**
  (<https://predibase.com/blog/lora-land-fine-tuned-open-source-llms-that-outperform-gpt-4>).
- **Clinical extraction by distillation**, *npj Digital Medicine*, 10 May 2025: teacher
  Llama-3.1-70B-Instruct, students at 8B/3B/1B. The distilled 8B reached "average Balanced Accuracy of 0.93
  and Micro-F1 of 0.94" against the 70B teacher's 0.89 / 0.92, and inference for 10,000 patients across 23
  criteria "would cost less than $1000" for the 8B versus "over $4000" for the 70B **[measured]**
  (<https://pmc.ncbi.nlm.nih.gov/articles/PMC12065832/>). This is the closest published analogue to
  insurance document triage: long unstructured notes, fixed criteria, audited output.
- **Distillation as the pre-training method itself.** Swiss AI's Apertus v1.1 (0.5B/1.5B/4B) states:
  "Instead of standard pre-training, Apertus-v1.1 models were created using pre-training distillation (PD)
  from the Apertus-8B-2509 teacher model … trained on 1.7T tokens", with a "90%/10% mix of KL-Divergence and
  label cross-entropy" (<https://huggingface.co/swiss-ai/Apertus-v1.1-4B-Instruct>).
- **The position paper everyone quotes**: NVIDIA's "Small Language Models are the Future of Agentic AI"
  (<https://arxiv.org/abs/2506.02153>), arguing SLMs are "sufficiently powerful, inherently more suitable,
  and necessarily more economical for many invocations in agentic systems".
- Commercial packaging of the pattern exists (distil labs sells "fine-tune a compact SLM with just a prompt
  and a few dozen examples", claiming "models up to 400x smaller") **[vendor]**
  (<https://www.distillabs.ai/learn/model-distillation-tutorial/>).

### 1.2 Confidence-gated escalation, cascades and routing

- **FrugalGPT** (arXiv 2305.05176): an LLM cascade "can match the performance of the best individual LLM
  (e.g. GPT-4) with up to 98% cost reduction"; on the HEADLINES financial-news dataset it reports 98% cost
  reduction while exceeding GPT-4 (<https://arxiv.org/abs/2305.05176>).
- **RouteLLM** (arXiv 2406.18665, LMSYS): routers between a strong and a weak model give "cost reductions of
  over 85%" on MT Bench, "45%" on MMLU and "35%" on GSM8K while retaining 95% of GPT-4 performance
  (GPT-4-Turbo strong / Mixtral-8x7B weak); the matrix-factorisation router hits 95% of GPT-4 "using 26%
  GPT-4 calls", falling to "14% of total calls" with LLM-judge data augmentation
  (<https://www.lmsys.org/blog/2024-07-01-routellm/>, <https://arxiv.org/abs/2406.18665>). Note the
  reference implementation is effectively dormant — last push to `lm-sys/RouteLLM` was 2024-08-10, 5,518
  stars (`gh api repos/lm-sys/RouteLLM`, queried 2026-09-21). Routing has moved into platforms.
- **Platform routing**: Microsoft Foundry's **model router** is "a trained language model that intelligently
  routes your prompts in real time to the most suitable large language model", shipped as a single
  deployment (<https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-router>). A Microsoft
  community-hub measurement reports savings of "4.5% in Balanced, 4.7% in Cost, and 14.2% in Quality mode"
  **[vendor / single test]**
  (<https://techcommunity.microsoft.com/blog/azuredevcommunityblog/optimising-ai-costs-with-microsoft-foundry-model-router/4494776>).
  The gap between FrugalGPT's 98% and this 4.5–14.2% is the difference between a task-specific cascade you
  tune and a general-purpose router you buy.

### 1.3 On-device privacy gate (small model local, escalate only when needed)

- **Apple** ships a ~3B on-device model and escalates to Private Cloud Compute, "which ensures that user data
  is never stored or shared with anyone, including Apple"
  (<https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models>,
  <https://arxiv.org/abs/2507.13575>).
- **Android**: Gemini Nano runs inside the AICore system service; ML Kit GenAI APIs sit on top
  (<https://developer.android.com/ai/gemini-nano>). Gemma 4 is available through the AICore Developer
  Preview (<https://android-developers.googleblog.com/2026/04/AI-Core-Developer-Preview.html>).
- **Chrome**: the Prompt API exposes an on-device model to web pages; the model "is downloaded separately the
  first time an origin uses the API" (<https://developer.chrome.com/docs/ai/prompt-api>).
- **Microsoft Foundry Local**: "Your data never leaves the device, responses start immediately with zero
  network latency, and your app works offline. There are no per-token costs"
  (<https://learn.microsoft.com/en-us/azure/foundry-local/what-is-foundry-local>).

### 1.4 Fine-tune-to-schema / constrained structured output

- Constrained decoding is now a platform feature, not a library trick: Chrome's Prompt API takes a
  `responseConstraint` (JSON Schema or regex) (<https://developer.chrome.com/docs/ai/prompt-api>,
  <https://developer.chrome.com/blog/new-in-chrome-148?hl=en>); Apple's Foundation Models framework "exposes
  guided generation, constrained tool calling, and LoRA adapter fine-tuning"
  (<https://arxiv.org/abs/2507.13575>).
- Purpose-built extraction models are a real product category: NuExtract3 (4.5B, Apache-2.0, 60,871
  downloads/30d) and NuExtract-2.0-2B (MIT, 119,259/30d) (<https://huggingface.co/numind/NuExtract3>);
  LFM2-1.2B-Extract (<https://huggingface.co/LiquidAI/LFM2-1.2B-Extract>); Osmosis-Structure-0.6B
  (Apache-2.0) (<https://huggingface.co/osmosis-ai/Osmosis-Structure-0.6B>). Download figures from the HF
  API, queried 2026-09-21.

### 1.5 Speculative decoding drafts

The clearest 2026 signal is that **model vendors now ship a matching drafter with the model**:

- `LiquidAI/LFM2.5-2.6B-DSpark` — a 327.7M-parameter draft model for LFM2.5-2.6B; "In SGLang, decoding runs
  about 2.6× faster … It also runs on-device on Apple silicon through the Metal backend"
  (<https://huggingface.co/LiquidAI/LFM2.5-2.6B-DSpark>). The GGUF drafter repos alone show 154,537
  downloads/30d (HF API, 2026-09-21).
- NVIDIA publishes DSpark/DFlash drafters for Nemotron (241,067 downloads/30d for
  `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4-DSpark`), openbmb for MiniCPM5-2B, Mistral an EAGLE
  head for Mistral-Medium-3.5 (HF API, 2026-09-21).
- Google Research documents that "speculative decoding enables AI Overviews in Google Search to produce
  results faster than before, while maintaining the same quality of responses"
  (<https://research.google/blog/looking-back-at-speculative-decoding/>). EAGLE-3 is in production serving
  stacks per LMSYS/Vertex (<https://www.lmsys.org/blog/2025-12-01-eagle3-vertex/>).
- On-device too: LiteRT-LM reports "up to a 2.2x speedup" from multi-token prediction
  (<https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/>).

**Relevance to an SLM strategy:** a drafter is a *second* small model whose only job is to be cheap. If you
already operate a 1–3B model, you have the skills to operate a 300M drafter in front of a bigger one.

### 1.6 Guardrails / guard models (the most under-rated small-model use)

| Model | Size | Licence | Note |
|---|---|---|---|
| Llama Guard 4 | 12B | `other` (Llama) | multimodal safety classifier, released 2025-04-30 (<https://huggingface.co/blog/llama-guard-4>) |
| Llama Prompt Guard 2 | 86M / 22M | `other` | prompt-injection & jailbreak detection (<https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M>) |
| Qwen3Guard-Gen / -Stream | 0.6B / 4B / 8B | apache-2.0 | 119 languages; token-level streaming variant; "Qwen3Guard-0.6B-Gen … rivals or exceeds … Guard models that are more than 10× larger" **[vendor]** (<https://arxiv.org/abs/2510.14276>) |
| **Shieldstral 1.0** | 3B | **apache-2.0** | Mistral, 2026-07-16. "policy-adaptive"— the policy is natural language at inference time; **French among 12 languages**; single forward pass (<https://huggingface.co/mistralai/Shieldstral-1.0-3B>) |
| Granite Guardian 4.1 | 8B | apache-2.0 | IBM, 2026-04-16, "Bring Your Own Criteria" (<https://huggingface.co/ibm-granite/granite-guardian-4.1-8b>) |
| Presidio | n/a (framework) | MIT | PII detection/anonymisation, 10,958 stars, moved to `data-privacy-stack/presidio` (`gh api`, 2026-09-21) |

### 1.7 Edge / offline

Runtime health as of 2026-09-21 (`gh api repos/...`, stars / last push / latest release):
llama.cpp 128,974 ★ (2026-09-20); google-ai-edge/gallery 24,740 ★; ONNX Runtime 21,900 ★; mlc-ai/mlc-llm
23,170 ★ (last push 2026-08-17); mlc-ai/web-llm 19,155 ★ (v0.2.85, 2026-09-08); huggingface/transformers.js
16,305 ★ (4.3.0, 2026-09-16); LiteRT-LM 6,483 ★ (v0.17.1, 2026-09-16); cactus 6,039 ★; pytorch/executorch
5,040 ★ (v1.5.0, 2026-09-16); microsoft/foundry-local 2,555 ★; ngxson/wllama 1,267 ★ (3.6.1, 2026-08-27);
mybigday/llama.rn 1,041 ★.

---

## 2. Documented enterprise and insurance / financial-services uses

### 2.1 In production, with numbers (large models unless stated)

| Who | What | Published numbers | Source |
|---|---|---|---|
| **Aviva** (with McKinsey QuantumBlack) | 80+ AI models across motor claims | liability assessment time for complex cases cut by **23 days**; routing accuracy **+30%**; complaints **−65%**; **>£60m** saved in motor claims in 2024 | <https://www.mckinsey.com/capabilities/tech-and-ai/how-we-help-clients/rewired-in-action/aviva-rewiring-the-insurance-claims-journey-with-ai> |
| **Allianz** (Australia) | "Project Nemo": 7 specialised agents for food-spoilage claims < AUD$500 | days → "one day—or even just hours"; "less than five minutes from the minute Laura filed the claim until the final human review"; live July 2025; built "in under 100 days"; "payout decisions are never automated" | <https://www.allianz.com/en/mediacenter/news/articles/251103-when-the-storm-clears-so-should-the-claim-queue.html> |
| **Hiscox** (Google Cloud / Gemini) | GenAI-enhanced lead underwriting, London Market | lead open-market quotes "from three days to three minutes"; first risk written with WTW | <https://www.hiscoxgroup.com/news/press-releases/2024/12-08-24> |
| **AIG** (Palantir Foundry/AIP + Claude via Bedrock) | underwriter assistant for submissions | submissions from "three to four weeks" to "less than one day"; 100% of applicable submissions reviewed; trade press adds +30% quoted submissions, −55% time to quote, ~+40% bound in Lexington middle-market property, data accuracy ~75% → >90% **[trade press]** | <https://www.carriermanagement.com/features/2025/04/28/274588.htm>, <https://www.aiintelreport.com/enterprise-ai/aig-underwriting-by-aig-assist-lexington-ai-win> |
| **Lemonade** | AI Jim claims bot | "automates about 55% of claims, with 96% of first notices of loss taken without human intervention" as of 2025-12-31; loss-adjustment-expense ratio ~5% **[from 10-K summary, not read in the filing itself — UNVERIFIED against the SEC document]** | <https://www.stocktitan.net/sec-filings/LMND/10-k-lemonade-inc-files-annual-report-33aac5b74a32.html> |
| **AXA** | AXA Secure GPT on Azure OpenAI | built in three months; first stage 1,000 AXA GO employees, target "all 140,000 employees globally" | <https://www.axa.com/en/press/press-releases/axa-offers-securegenerative-ai-to-employees> |

### 2.2 Small models specifically, in financial services

- **Cathay Financial Holdings** (NVIDIA GTC Taipei 2026): fine-tuned **open-source SLMs** for customer-intent
  classification; the fine-tuned SLM "achieved performance close to mainstream closed-source LLMs"; the study
  used **fully synthetic data** "ensuring that no real customer information was used during model training";
  finding: fine-tuned SLMs "may reduce dependence on complex prompt engineering and vector retrieval
  modules" **[vendor-adjacent PR, but methodologically explicit]**
  (<https://en.prnasia.com/releases/apac/cathay-financial-holdings-leverages-open-source-small-language-models-to-identify-customer-intent-536906.shtml>).
- **Warranty-claim automation with LoRA fine-tuning** (arXiv 2602.16836, 18 Feb 2026): LoRA fine-tunes on
  "millions of historical warranty claims", producing structured corrective-action recommendations for
  adjusters, reporting "approximately 80% near-identical matches to ground-truth corrective actions"; the
  domain-specific model "substantially outperformed commercial general-purpose and prompt-based LLMs"
  (<https://arxiv.org/abs/2602.16836>). No insurer is named — treat as academic, not as a carrier reference.
- **BNP Paribas × Mistral AI**: partnership renewed for three years; Mistral "facilitates controlled
  deployment of cutting edge models **on premises**", explicitly for KYC where "data sensitivity, security
  and compliance requirements are particularly high"
  (<https://group.bnpparibas/en/press-release/bnp-paribas-and-mistral-ai-extend-their-partnership-to-support-the-next-phase-of-generative-ai-deployment-within-the-group>).

### 2.3 PII redaction and document extraction — the small-model sweet spot

- **OpenAI Privacy Filter** (`openai/privacy-filter`, HF repo created 2026-04-17, **Apache-2.0**, 235,593
  downloads/30d, 1,761 likes — HF API 2026-09-21): a bidirectional token-classification model for PII
  detection/masking, "1.5B total parameters but only 50M active at inference" with 128 experts / top-4
  routing, reported "96% F1 on the public PII-Masking-300k benchmark" **[vendor-reported]**
  (<https://huggingface.co/openai/privacy-filter>,
  <https://www.marktechpost.com/2026/04/28/openai-releases-privacy-filter-a-1-5b-parameter-open-source-pii-redaction-model-with-50m-active-parameters/>).
  It has a first-class integration path in `transformers`
  (<https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/openai_privacy_filter.md>).
- **Licence traps in the PII corner**: `iiiorg/piiranha-v1-detect-personal-information` is **cc-by-nc-nd-4.0**
  — non-commercial, no derivatives — despite 228,860 downloads/30d; `urchade/gliner_multi_pii-v1` is
  Apache-2.0 (HF API, 2026-09-21). Check the licence, not the popularity.
- **Document→structure**: granite-docling-258M (Apache-2.0, 49,707/30d) for document conversion
  (<https://huggingface.co/ibm-granite/granite-docling-258M>).

### 2.4 Announced, or vendor marketing (not evidence)

- **Shift Technology**: "catches over $5 billion in fraud annually … 3x higher detection hit rates"
  **[vendor]**; the verifiable fact is the **five-year renewal with AXA announced March 2026**, a
  relationship running since 2016
  (<https://www.shift-technology.com/resources/news/five-year-renewal-of-collaboration-between-shift-technology-and-axa-to-accelerate-ai-powered-insurance-transformation>).
- **Roots / Bevaya "InsurGPT"**: "300M+ insurance documents", "120+ production deployments", "98%+ accuracy"
  **[vendor]** (<https://www.roots.ai/news/roots-ai-powered-document-indexing-accelerator-validated-by-guidewire-transforming-claims-processing-with-automation>).
- **Mistral's AXA customer page** states Mistral models are "integrated into AXA Secure GPT" **[vendor]**
  (<https://mistral.ai/fr/customers/axa/>). Worth confirming internally — it is the single most relevant
  data point for an EU-sovereign SLM path at AXA and it is currently only a vendor page.
- **Zurich**: an enterprise language model for claims extraction/summarisation/redaction is described on
  third-party sites, not on a Zurich primary source I could verify — **[UNVERIFIED]**. Zurich's own AI page:
  <https://www.zurich.com/about-us/ai-at-zurich>.

**Pattern across all of these:** the *published* insurance wins are large-model, cloud, human-in-the-loop, and
measured in cycle time (weeks→days, days→minutes), not in model size. The small-model wins are one layer
down — classification, extraction, redaction, routing — and are mostly published by banks, vendors and
academics rather than insurers.

---

## 3. In-browser and on-device inference — state of the art, September 2026

### 3.1 Availability

- **WebGPU global support is 87.35%** ("85.72% + 1.63%") per caniuse (<https://caniuse.com/webgpu>).
- **Chrome Android**: WebGPU ships per-GPU — "ARM/Qualcomm/Intel, Android 12+: 121", "Imagination, Android
  16+: 139", "Samsung Xclipse, Android 12+: probably 154"; caniuse shows Chrome for Android 152 as
  supported. **Safari 26** enables WebGPU by default on macOS, iOS, iPadOS and visionOS. **Firefox**: 141 on
  Windows, 147 on macOS; Linux/Android still Nightly. (<https://github.com/gpuweb/gpuweb/wiki/Implementation-Status>,
  page last updated 2026-08-13; <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>)
- **Chrome built-in AI**: the Prompt API is stable for web pages in **Chrome 148** (release blog 2026-05-05)
  alongside Summarizer, Translator and Language Detector; Writer/Rewriter/Proofreader remain in origin trial.
  Requirements: Windows 10/11, macOS 13+, Linux or ChromeOS (Chromebook Plus); **at least 22 GB free space**,
  **>4 GB VRAM** or 16 GB RAM + 4 cores; **not supported on Chrome for Android or iOS**. Supported languages
  are **en, ja, es, de, fr**. Structured output via `responseConstraint` (JSON Schema); text, audio and image
  input; text output. (<https://developer.chrome.com/docs/ai/prompt-api>, page updated 2026-08-26)

### 3.2 The runtimes, compared

| Runtime | Where it runs | Notable constraint | Evidence |
|---|---|---|---|
| **WebLLM** | browser, WebGPU only | needs WebGPU; model cache via Cache API / IndexedDB / OPFS | <https://github.com/mlc-ai/web-llm> |
| **wllama** | browser, WebAssembly (CPU) | **max file size 2 GB** (ArrayBuffer limit) → split models; multi-thread needs **COOP+COEP headers**; separate "compat" build for Firefox/Safari | <https://github.com/ngxson/wllama> (README) |
| **Transformers.js v4** | browser, Node, Deno | new **C++ WebGPU runtime** built with the ONNX Runtime team; released 2026-02-09 | <https://huggingface.co/blog/transformersjs-v4> |
| **ONNX Runtime Web** | browser | the engine under Transformers.js/Foundry Local | <https://github.com/microsoft/onnxruntime> |
| **MediaPipe LLM Inference** | Android/iOS/Web | **maintenance-only**; Google says migrate to LiteRT-LM | <https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference> |
| **LiteRT-LM** | Android/iOS/Web/desktop | powers "Chrome, ChromeOS, the Pixel Watch, and … Google AI Edge Gallery" | <https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/> |
| **Chrome built-in AI** | Chrome desktop only | no Android/iOS; 22 GB disk; model chosen by Google, not by you | <https://developer.chrome.com/docs/ai/prompt-api> |
| **Apple Foundation Models** | Apple devices | Swift API; on-device processing "free per request"; model chosen by Apple | <https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models> |
| **Foundry Local** | Windows / macOS (Apple silicon) / Linux x64 | GA 2026-04-09; ONNX Runtime; OpenAI-compatible; ~20 MB runtime; **not a server** ("single-user inference") | <https://devblogs.microsoft.com/foundry/foundry-local-ga/>, <https://learn.microsoft.com/en-us/azure/foundry-local/what-is-foundry-local> |
| **ExecuTorch / llama.rn / MLC / Cactus** | native mobile | v1.5.0 released 2026-09-16 (ExecuTorch) | `gh api`, 2026-09-21 |

### 3.3 Published tokens/second (every row is a published figure; none estimated)

**Phones and tablets**

| Model / quant | Device | Backend | Prefill | Decode | Source |
|---|---|---|---|---|---|
| Apple on-device ~3B, 3.7 bits/weight | iPhone 15 Pro | ANE/Apple silicon | TTFT "about 0.6 millisecond per prompt token" | **30 tok/s** | <https://machinelearning.apple.com/research/introducing-apple-foundation-models> |
| Llama 3.2 1B SpinQuant | OnePlus 12 | CPU (XNNPACK+KleidiAI) | 260.5 tok/s | **50.2 tok/s** (TTFT 0.3 s) | <https://github.com/pytorch/executorch/blob/main/examples/models/llama/README.md> |
| Llama 3.2 3B SpinQuant | OnePlus 12 | CPU | 89.7 tok/s | 19.7 tok/s | same |
| Llama 3 8B, 4-bit gw128 | Galaxy S22 / S24 / OnePlus 12 | CPU | — | 7.85 / 10.91 / 10.85 tok/s | same |
| Gemma 3 1B-IT, int4 QAT | Galaxy S24 Ultra | CPU | 379 tok/s | 55 tok/s (529 MB model, 1,009 MB RAM) | <https://huggingface.co/litert-community/Gemma3-1B-IT> |
| Gemma 3 1B-IT, int4 QAT | Galaxy S24 Ultra | GPU | 2,531 tok/s | 49 tok/s | same |
| Gemma 3 1B-IT, a16w4 QAT | Galaxy S25 Ultra | **NPU** | 5,836 tok/s | 85 tok/s | same |
| Gemma 4 E2B/E4B | Galaxy S26 Ultra / iPhone 17 Pro | GPU (OpenCL) / Metal | — | 52 tok/s / 56 tok/s (up to 2.2× with MTP) | <https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/> |
| LFM2.5-1.2B-Instruct Q4_0 | Galaxy S25 Ultra (Snapdragon Gen4) | CPU, llama.cpp | 335 tok/s | **70 tok/s**, 719 MB | <https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct> |
| Qwen3-1.7B Q4_0 (same test) | Galaxy S25 Ultra | CPU, llama.cpp | 181 tok/s | 40 tok/s, 1,306 MB | same |
| LFM2.5-1.2B-Instruct | ROG Phone 9 Pro | **NPU** (NexaML) | 4,391 tok/s | 82 tok/s, 0.9 GB | same |
| Qwen2.5-1.5B 4-bit | iPhone 16 Pro | — | — | "loses nearly half its throughput within two iterations" (thermal) | <https://arxiv.org/abs/2603.23640> |

**Laptops, PCs and the browser**

| Model | Device | Runtime | Figure | Source |
|---|---|---|---|---|
| Phi Silica | Copilot+ PC | NPU prompt processing | "first token latency is at 650 tokens/second"; generation "about 27 tokens/second"; "about 1.5 Watts" | <https://blogs.windows.com/windowsdeveloper/2024/05/21/unlock-a-new-era-of-innovation-with-windows-copilot-runtime-and-copilot-pcs/> |
| Llama-3.1-8B | MacBook Pro M3 Max | WebLLM vs native MLC | **41.1 tok/s in browser** vs 57.7 native (71.2% retained) | <https://arxiv.org/abs/2412.15803> |
| Phi-3.5-mini | MacBook Pro M3 Max | WebLLM vs native | 71.1 vs 89.3 tok/s (79.6% retained); "up to 80% native performance" | same |
| Gemma 3 1B-IT int4 | MacBook Pro M4 Max | **WebGPU** | 4,339 tok/s prefill, **133 tok/s decode**, TTFT 0.51 s | <https://huggingface.co/litert-community/Gemma3-1B-IT> |
| Gemma 4 E2B/E4B | MacBook Pro | WebGPU (LiteRT-LM) | "up to 76 tokens/sec decode" | <https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/> |
| GPT-OSS 20B | M4 Pro Max | Transformers.js v4 WebGPU | "approximately 60 tokens/sec" **[vendor blog]** | <https://huggingface.co/blog/transformersjs-v4> |
| Qwen2.5-1.5B 4-bit | RTX 4050 laptop | GPU | "131.7 tok/s at 34.1 W" | <https://arxiv.org/abs/2603.23640> |
| Qwen2.5-1.5B 4-bit | Raspberry Pi 5 + Hailo-10H | NPU | "6.9 tok/s at under 2 W with near-zero variance" | same |

**Reading of the table (my analysis):** a 1–2B model at int4 gives 40–85 tok/s on a 2025/26 flagship phone
and 60–133 tok/s in a browser on a recent Mac — i.e. faster than a person reads. Prefill on an NPU is 1–2
orders of magnitude faster than decode, so *long-context* on-device work (a 10-page claim file) is bound by
memory, not by prefill. Sustained load is the real constraint: the iPhone thermal result above is the one
number to quote when someone proposes an always-on on-device agent.

---

## 4. Microsoft 365 Copilot + MCP: where a local or self-hosted SLM can actually sit

Microsoft renamed the product: "Microsoft 365 Copilot is now named Microsoft Copilot"
(<https://learn.microsoft.com/en-us/microsoft-365/copilot/connect-to-ai-subprocessor>, updated 2026-09-18).

### 4.1 The four insertion points, and what each allows

| Option | Can you choose the model? | Where your code runs | Source |
|---|---|---|---|
| **Declarative agent** | **No.** "Declarative agents run on the same orchestrator, foundation models, and trusted AI services that power Microsoft 365 Copilot." You supply instructions, actions, knowledge. | Microsoft cloud | <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-declarative-agent> |
| **Declarative agent + MCP plugin** | No (model), **yes** (your tools) | your MCP server; Copilot calls it | <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins> |
| **Copilot Studio agent + MCP / BYOM prompts** | Partly: "bring your own model" for *prompts* from the Azure AI Foundry catalogue (chat-completions endpoint; GPT-5 family "aren't currently supported") | Copilot Studio + your Foundry deployment | <https://learn.microsoft.com/en-us/microsoft-copilot-studio/bring-your-own-model-prompts> |
| **Custom engine agent** | **Yes — any model, any orchestrator.** "Flexible AI models – Choose from foundation models, fine-tuned models, or industry-specific AI"; orchestrator "Bring your own (for example, Semantic Kernel, LangChain)" | your hosting; surfaced in Copilot/Teams via Agents SDK / Foundry | <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-custom-engine-agent> |

**MCP specifics in Copilot Studio** (doc updated 2026-08-26): MCP gives access to Resources, Tools and
Prompts, but "Copilot Studio currently supports MCP **tools and resources**"; "You must turn on generative
orchestration to use MCP"
(<https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp>). MCP went GA in
Copilot Studio on 2025-05-29, with streamable HTTP preferred and SSE deprecated
(<https://www.microsoft.com/en-us/copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio/>).
Governance rides on the connector layer: "MCP servers are made available to Copilot Studio using connector
infrastructure. This means they can employ enterprise security and governance controls such as Virtual
Network integration, Data Loss Prevention controls, multiple authentication methods"
(<https://www.microsoft.com/en-us/copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/>).
For declarative agents, the Agents Toolkit (≥6.12.0) wraps an MCP server as a plugin with **OAuth (static or
dynamic registration) or Entra SSO**, and configures **dynamic tool discovery** so tools resolve at runtime
(<https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins>). The MCP
specification's latest revision directory is **2026-07-28**
(`gh api repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification`, 2026-09-21).

**The reachability constraint (this is the crux for a local SLM).** Copilot's MCP wizard needs a
public HTTPS endpoint; a private MCP server is reached through a Power Platform custom connector plus the
on-premises data gateway, or through a VNet/Private Link path **[third-party write-ups, not a single
Microsoft doc — UNVERIFIED as an official supported pattern]**
(<https://practical365.com/how-to-plan-mcp-deployment-for-copilot-studio-agents/>,
<https://github.com/fooshen/MCPwithVnet>). **Foundry Local runs on the end user's device and is explicitly
not a server** ("Foundry Local is optimized for hardware-constrained devices where a single user accesses
the model at a time … it isn't designed as a server inference stack"
<https://learn.microsoft.com/en-us/azure/foundry-local/what-is-foundry-local>) — so a Foundry Local model
**cannot** be called by cloud-hosted Copilot. A device-local SLM can only serve a device-local surface (a
Teams/desktop app, an Office add-in, a browser tab), or act as a pre/post-processor in front of the cloud
call. *(analysis)*

### 4.2 Governance and EU residency inside Copilot — three facts to put in front of the DPO

1. **Anthropic models are excluded from the EU Data Boundary.** "Anthropic models deployed in Microsoft
   offerings such as Microsoft Copilot, Researcher, Copilot Studio, Power Platform, and Copilot in Microsoft
   365 apps are currently excluded from the EU Data Boundary, and when applicable, in-country processing
   commitments. Customers within the EU Data Boundary and customers in the UK have Anthropic models disabled
   by default." Some Anthropic models ("with Data Retention") sit outside the Microsoft DPA entirely, with
   Anthropic acting as an independent processor and retaining data up to 30 days (longer for flagged
   content) (<https://learn.microsoft.com/en-us/microsoft-365/copilot/connect-to-ai-subprocessor>).
2. **Flex routing.** "Flex routing lets customers in the European Union (EU) and the European Free Trade
   Association (EFTA) allow large language model (LLM) inferencing to occur outside the EU Data Boundary
   during periods of peak demand." Inferencing "may occur in the United States, Canada, or Australia". It is
   **"on by default for eligible tenants that were created after March 25, 2026"**; existing tenants must
   check the Message Center. Admins can select "Do not allow flex routing"
   (<https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-flex-routing>).
3. **Agent identity and control plane.** Microsoft Agent 365 reached GA on 2026-05-01, giving each agent an
   Entra Agent ID with Conditional Access and Purview integration **[Microsoft security blog]**
   (<https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/>,
   <https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id>).

Also relevant: Microsoft and Mistral expanded their partnership on 2026-07-21, putting **Mistral Medium 3.5
in Copilot Studio** and the same models across **Microsoft Foundry and Foundry Local / Azure Local**,
pitched at "financial services, manufacturing, healthcare, critical infrastructure"
(<https://news.microsoft.com/source/2026/07/21/microsoft-and-mistral-expand-strategic-partnership-to-give-enterprises-and-regulated-industries-frontier-ai-they-can-control/>).

---

## 5. Regulation: what on-device processing does and does not buy you

### 5.1 What it helps with

- **Data minimisation and data protection by design** — GDPR Art. 5(1)(c) and Art. 25. Keeping raw claim
  text on the device and sending only a structured, redacted result is the textbook implementation
  (<https://eur-lex.europa.eu/eli/reg/2016/679/oj>).
- **Transfers** — if the data never leaves the device (and never leaves the EU), Chapter V (Arts. 44–49) is
  not engaged for that step. Contrast with cloud Copilot, where **flex routing** can move inferencing to the
  US, Canada or Australia (§4.2).
- **Sub-processor sprawl** — Art. 28. An on-device model removes one processor and one set of flow-down
  obligations. Note Microsoft added Anthropic as a subprocessor effective 2026-01-07 for most commercial
  tenants (<https://learn.microsoft.com/en-us/microsoft-365/copilot/connect-to-ai-subprocessor>).
- **Security of processing** — Art. 32: less data in transit, smaller blast radius.
- **Third-party ICT risk under DORA** (Regulation (EU) 2022/2554, applicable since 17 January 2025): a model
  that runs in your own perimeter is not a critical ICT third-party dependency
  (<https://eur-lex.europa.eu/eli/reg/2022/2554/oj>).

### 5.2 What it does **not** help with

- **It is still processing.** GDPR Art. 4(2) defines processing as "any operation … performed on personal
  data … whether or not by automated means". Running on the data subject's own phone does not make AXA less
  of a controller; the household exemption (Art. 2(2)(c)) is for natural persons, not for a controller's
  software (<https://eur-lex.europa.eu/eli/reg/2016/679/oj>).
- **Automated decision-making, Art. 22**, is untouched by where the compute happens. The CJEU's SCHUFA
  judgment (C-634/21) treats a score that plays a determining role as an automated decision in itself
  (<https://curia.europa.eu/juris/liste.jsf?num=C-634/21>) **[cited from the case reference; text not read
  in full here — UNVERIFIED wording]**.
- **DPIA, Art. 35**, is still required for high-risk profiling; on-device does not remove it.
- **The AI Act is use-based, not location-based.** Annex III point 5(c) classes as high-risk "AI systems
  intended to be used for risk assessment and pricing in relation to natural persons in the case of life and
  health insurance" (<https://artificialintelligenceact.eu/annex/3/>), and Art. 27 requires a **fundamental
  rights impact assessment** from "deployers of high-risk AI systems referred to in points 5 (b) and (c) of
  Annex III" (<https://artificialintelligenceact.eu/article/27/>). A 1.2B model on a laptop doing life/health
  pricing is exactly as high-risk as a 400B model in a data centre.
- **Transparency, Art. 50(1)**: "Providers shall ensure that AI systems intended to interact directly with
  natural persons are designed and developed in such a way that the natural persons concerned are informed
  that they are interacting with an AI system" (<https://artificialintelligenceact.eu/article/50/>).
- **Timing changed in July 2026.** Regulation (EU) 2026/1744 (the "Digital Omnibus on AI", adopted 8 July
  2026, OJ 24 July 2026, in force 27 July 2026) sets "the date of application of Sections 1, 2 and 3 of
  Chapter III … to 2 December 2027 for AI systems classified as high-risk pursuant to Article 6(2) and Annex
  III", and 2 August 2028 for Annex I products; Art. 4 is softened to "take measures to support the
  development of AI literacy" (<https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng>;
  practitioner summary: <https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/>).
  **This is a delay, not a repeal** — and Art. 50 transparency still applies from 2 August 2026.
- **Sector supervision is already here.** EIOPA's Opinion on AI governance and risk management
  (EIOPA-BoS-25-360, 6 August 2025) situates AI inside Solvency II, IDD, DORA and GDPR and covers data
  governance, record-keeping, fairness, cyber security, explainability and human oversight — and it applies
  whatever the model size
  (<https://www.eiopa.europa.eu/publications/opinion-artificial-intelligence-governance-and-risk-management_en>).
- **Fine-tuning on claims data does not anonymise it.** EDPB Opinion 28/2024 (17 Dec 2024): an AI model
  trained on personal data "cannot, in all cases, be considered anonymous"; anonymity must be assessed
  case-by-case against a high threshold
  (<https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_en>).
  A distilled specialist trained on real FNOL text is, on this reading, still personal-data-bearing.
- **Putting model weights on a user's device touches ePrivacy Art. 5(3)** ("the storing of information, or
  the gaining of access to information already stored, in the terminal equipment"), per EDPB Guidelines
  2/2023 v2.0, adopted 7 October 2024
  (<https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf>).
  My reading is that caching weights for a service the user explicitly requested falls under the "strictly
  necessary" exemption, but **that is my analysis, not case law — UNVERIFIED**.

---

## 6. The small-model frontier, September 2026

### 6.1 Who leads, by size band

All parameter counts, repo creation dates, licences and 30-day download counts below come from the Hugging
Face API, queried **2026-09-21**. Repo-creation date ≠ announcement date where noted.

**≤ 1B**

| Model | Params | Licence | Downloads/30d | Note |
|---|---|---|---|---|
| Qwen3-0.6B | 0.75B | apache-2.0 | **23,745,227** | still the most-downloaded true SLM |
| Qwen3.5-0.8B | 0.87B | apache-2.0 | 2,376,732 | repo created 2026-02-28 |
| Gemma 3 1B-it | 1.0B | gemma | 3,077,946 | the on-device reference for LiteRT benchmarks |
| Llama-3.2-1B-Instruct | 1.24B | llama3.2 | 6,922,063 | ageing (Sept 2024) |
| LFM2.5-350M / 230M | 0.35B / 0.23B | LFM Open (`other`) | 83,728 / 56,550 | fastest published phone decode in its class (§3.3) |
| FunctionGemma-270M-it | 0.27B | gemma | 23,331 | tool-calling-only tiny model |
| EmbeddingGemma-300M | 0.31B | gemma | 2,674,650 | embeddings, 100+ languages |

**1–2B**: Qwen3.5-2B (2.27B, apache-2.0, 4,770,035/30d), Qwen3-1.7B (2.03B, 3,619,571), MiniCPM5-1B (1.08B,
apache-2.0, 611,026, repo 2026-05-21), LFM2.5-1.2B-Instruct (1.17B, `other`, 201,456), Granite-4.0-1b
(1.63B, apache-2.0), OpenAI privacy-filter (1.4B total / 50M active, apache-2.0, 235,593).

**3–4B**: Qwen3.5-4B (4.66B, apache-2.0, **6,819,426**/30d), Gemma 4 E2B/E4B (apache-2.0, 3,350,157 /
4,419,383), MiniCPM5-2B (2.52B, apache-2.0, 420,622, repo 2026-09-06), Granite 4.1-3b / 4.2-3b (3.4B / 3.66B,
apache-2.0), Ministral-3-3B-Instruct-2512 (3.85B, apache-2.0, 121,495), SmolLM3-3B (3.08B, apache-2.0,
613,886), LFM2.5-2.6B (2.7B, `other`), Phi-4-mini-instruct (3.84B, MIT, 383,540), Apertus-v1.1-4B (3.83B,
apache-2.0), Shieldstral-1.0-3B (3.85B, apache-2.0).

### 6.2 Tool calling / structured output — the only independent leaderboard

**Berkeley Function Calling Leaderboard V4**, page states "last updated 2026-04-12"; figures below are from
`https://gorilla.cs.berkeley.edu/data_overall.csv`, downloaded 2026-09-21
(<https://gorilla.cs.berkeley.edu/leaderboard.html>).

| Rank | Overall Acc | Model (≤ ~4B unless noted) |
|---|---|---|
| 1 | 77.47% | Claude-Opus-4-5 (FC) — best overall, for scale |
| 24 | 51.45% | GPT-5-nano (FC) |
| **25** | **51.40%** | **Nanbeige4-3B-Thinking-2511 (FC)** — best ≤4B open model on the board |
| 42 | 41.22% | xLAM-2-3b-fc-r (FC) |
| 54 | 35.68% | Qwen3-4B-Instruct-2507 (FC) |
| 56 | 35.36% | Arch-Agent-3B |
| 60 | 32.14% | Arch-Agent-1.5B |
| 65 | 30.44% | xLAM-2-1b-fc-r (FC) |
| 68 | 29.71% | Hammer2.1-3b (FC) |
| 71 | 28.41% | Qwen3-1.7B (FC) |
| 92 | 23.93% | Qwen3-0.6B (FC) |
| 98 | 21.95% | Llama-3.2-3B-Instruct (FC) |
| 101 | 19.62% | Gemma-3-4b-it (Prompt) |
| 103 | 18.98% | Granite-4.0-350m (FC) |
| 107 | 10.82% | Llama-3.2-1B-Instruct (FC) |
| 109 | 7.17% | Gemma-3-1b-it (Prompt) |

**Three things this table tells you.** (a) A tuned 3B beats GPT-5-nano's neighbourhood on function calling.
(b) Multi-turn is where small models fall off a cliff — Nanbeige4-3B scores 51.12% multi-turn while
Qwen3-1.7B scores 11.00% and Llama-3.2-1B 0.00%. (c) The board has **not** been updated with Qwen3.5, Gemma
4, LFM2.5, Granite 4.1/4.2 or Ministral 3 — so for the current generation you are left with vendor numbers.

**Vendor-reported BFCL v4 (not comparable across cards — different modes and harnesses):** Qwen3.5-2B 43.6
and Qwen3.5-0.8B 25.3 against Qwen3-4B-2507's 39.9 on Qwen's own card
(<https://huggingface.co/Qwen/Qwen3.5-2B>); Qwen3.5-4B 50.3 in thinking mode
(<https://huggingface.co/Qwen/Qwen3.5-4B>); Granite 4.2 3B/8B/30B 52.41 / 52.39 / 61.39
(<https://huggingface.co/ibm-granite/granite-4.2-3b>); MiniCPM5's card puts MiniCPM5-2B at 66.6 with
LFM2.5-2.6B 61.1, Qwen3.5-4B 56.8, granite-4.2-3B 52.2, Gemma-4-E4B 47.0, Gemma-4-E2B 36.6
(<https://huggingface.co/openbmb/MiniCPM5-2B>). **The headline: a 2B model in 2026 out-scores a 4B model
from 2025 on the same benchmark.**

### 6.3 Multilingual, including French

- **Ministral 3 3B/8B** (Apache-2.0): "Supports dozens of languages, including English, French, …"
  (<https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512>).
- **Granite 4.1/4.2**: tested languages include French explicitly
  (<https://huggingface.co/ibm-granite/granite-4.2-3b>).
- **LFM2.5**: 1.2B lists 8 languages including French; 2.6B lists 16 including French
  (<https://huggingface.co/LiquidAI/LFM2.5-2.6B>).
- **SmolLM3-3B**: "6 natively supported (English, French, Spanish, German, Italian, and Portuguese)"; its
  card reports French MLMM-HellaSwag **63.94** (<https://huggingface.co/HuggingFaceTB/SmolLM3-3B>).
- **Shieldstral-1.0-3B** guard model covers French (<https://huggingface.co/mistralai/Shieldstral-1.0-3B>).
- **Sovereign options**: OpenLLM-France **Luciole-1B/8B-Instruct-1.1** (Apache-2.0, LINAGORA + OpenLLM-France,
  BPI/France 2030, trained on Jean Zay) — but read the card: "Luciole-1B-Instruct-1.1 was post-trained
  almost entirely on **English** data (in contrast to its base model … roughly 30% French data)"
  (<https://huggingface.co/OpenLLM-France/Luciole-1B-Instruct-1.1>). **Apertus v1.1** (Swiss AI, Apache-2.0)
  claims "1811 natively supported languages" and full data/recipe openness
  (<https://huggingface.co/swiss-ai/Apertus-v1.1-4B-Instruct>). **Cohere Tiny Aya** (3.35B, 44 languages +
  English) is **CC-BY-NC — not usable commercially** (<https://huggingface.co/CohereLabs/tiny-aya-l2-thinker>).
- **Evaluation for French**: COLE, "a comprehensive benchmark composed of 23 diverse tasks", evaluated 94
  LLMs (<https://arxiv.org/abs/2510.05046>). The French public arena **compar:IA** (Ministère de la Culture,
  DINUM, ALT-EDIC) is the obvious place to source French preference data
  (<https://comparia.beta.gouv.fr/>). I could not retrieve a public compar:IA model ranking page —
  **UNVERIFIED**.

### 6.4 What changed in the last six months (2026-03-21 → 2026-09-21)

1. **Gemma 4 shipped under Apache-2.0** in E2B, E4B, 31B and 26B-A4B on **2026-03-31**, plus a 12B Unified
   model on 2026-06-03 (<https://ai.google.dev/gemma/docs/releases>,
   <https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/>). Licence change from the
   bespoke Gemma terms to Apache-2.0 removes a standing legal objection to the family.
2. **Qwen3.5's small tier arrived** (0.8B/2B/4B/9B; repos created 2026-02-27/28, published early March per
   <https://www.alibabacloud.com/blog/qwen3-5-towards-native-multimodal-agents_602894>), claiming 201
   languages.
3. **IBM Granite 4.1 (2026-04-29, 3B/8B/30B, Apache-2.0)** and Granite 4.2 (repos 2026-08-07), "optimized for
   … vLLM, SGLang, and llama.cpp" (<https://research.ibm.com/blog/granite-4-1-ai-foundation-models>).
4. **Liquid filled every rung below 3B** — LFM2.5-350M (Mar 31), 230M (Jun 24), 8B-A1B (May 28), 2.6B
   (Jul 28), VL-3B (Aug 11) — with published NPU/CPU phone numbers (HF API, 2026-09-21).
5. **Vendor-shipped speculative drafters became normal** (DSpark/DFlash/EAGLE heads from Liquid, NVIDIA,
   openbmb, Mistral) — see §1.5.
6. **OpenAI released an Apache-2.0 PII model** (2026-04) — the first time a frontier lab has shipped a
   small, self-hostable privacy primitive (<https://huggingface.co/openai/privacy-filter>).
7. **Mistral released an Apache-2.0, French-capable, policy-adaptive 3B guard model** (Shieldstral,
   2026-07-16).
8. **Browser inference consolidated**: Transformers.js v4 with a C++ WebGPU runtime (2026-02-09), Chrome 148
   stabilising the Prompt API for web pages (2026-05-05), MediaPipe LLM Inference put into maintenance in
   favour of LiteRT-LM (2026-05-19).
9. **Platform/governance**: Foundry Local GA (2026-04-09), Agent 365 GA (2026-05-01), MCP spec revision
   2026-07-28, Microsoft×Mistral (2026-07-21).
10. **Regulation moved once**: Digital Omnibus on AI in force 2026-07-27, Annex III high-risk to 2027-12-02.

---

## What this means for an insurer's AI-innovation team — **my analysis**

*(Everything in this section is my judgement, not a sourced fact. The facts it rests on are above.)*

1. **Do not refactor BizLoop "onto small models". Refactor it into steps, then size each step.** The
   published evidence supports SLMs for classification, extraction, redaction, routing, drafting and tool
   selection — and shows them collapsing on multi-turn agentic control (BFCL multi-turn: 51% for the best
   3B, 0–11% for 1B-class). Keep a frontier model as the orchestrator; push the high-volume leaf calls down.
2. **Build the cascade with a measured gate, not a vibe.** FrugalGPT-style cascades report up to 98% savings;
   a bought router reported 4.5–14.2%. The difference is task-specific calibration. Instrument every leaf
   call with a confidence signal and an escalation threshold from day one, and log the escalation rate as a
   product KPI.
3. **Treat the EU-residency problem as a Copilot-configuration problem first, and a model problem second.**
   Two switches decide more than any model choice: **flex routing** (on by default for tenants created after
   2026-03-25; inference can go to the US/Canada/Australia) and **Anthropic-as-subprocessor** (excluded from
   the EUDB, off by default in EU/EFTA/UK). Verify both in the AXA tenant this quarter and record the
   decision. A locally-run SLM does not compensate for a cloud orchestrator that flexes out of the boundary.
4. **If BizLoop must keep using a self-chosen model, it is a custom engine agent — not a declarative agent.**
   Declarative agents are contractually bound to Microsoft's orchestrator and models. Custom engine agents
   let you bring any model and any orchestrator and still surface inside Copilot/Teams. Budget for the
   hosting, the Entra/Bot plumbing and the Purview obligations that come with it.
5. **Put the SLM behind MCP, in your own EU perimeter — not on the end user's device.** Foundry Local is
   explicitly single-user and not a server, so it cannot serve cloud Copilot. The clean architecture is:
   Copilot/Copilot Studio → MCP tool (Streamable HTTP, Entra SSO or OAuth) → your service in an EU region →
   your 1–4B specialist. That path inherits connector-level DLP, VNet and auth controls.
6. **Ship one on-device capability only where it buys a real privacy claim**: a local **PII gate** that
   redacts before anything crosses the boundary. `openai/privacy-filter` (Apache-2.0, 1.5B total / 50M
   active) plus Presidio is a defensible, auditable first deliverable, and it is the one on-device story the
   DPO will actually value. In the browser, 1–2B int4 models run at 60–133 tok/s on a recent Mac — fast
   enough — but assume Chrome-desktop only (no Android/iOS for the Prompt API; 22 GB disk, >4 GB VRAM).
7. **Pick the model shortlist on licence and French first, benchmark second.** Apache-2.0 and French-tested:
   **Ministral 3 3B**, **Granite 4.1/4.2 3B**, **Qwen3.5-2B/4B**, **Gemma 4 E2B/E4B**, **SmolLM3-3B**. Treat
   Liquid's `LFM Open License` and anything `cc-by-nc` (Piiranha, Tiny Aya) as blocked until legal clears
   them. Run your own French eval (COLE tasks + your own claim corpus); do not trust a card's MMMLU row.
8. **Distil one specialist end-to-end as the pilot, and measure it like an actuary would.** The npj Digital
   Medicine result (8B student beating a 70B teacher at a quarter of the cost, on a criteria-matching task)
   is the template. Pick one BizLoop step with ground truth — e.g. task/ticket classification or field
   extraction from a PM document — generate synthetic training data the way Cathay did (no real customer
   data in training), and report balanced accuracy plus cost per 1,000 items against the incumbent.
9. **Write the AI Act position before the model choice, not after.** If any refactored component touches
   life/health risk assessment or pricing, it is Annex III 5(c) high-risk, an Art. 27 FRIA is owed, and the
   2027-12-02 date is the planning horizon; Art. 50(1) disclosure applies from 2026-08-02 regardless. Also
   assume that a model fine-tuned on real claims data is **not** anonymous (EDPB 28/2024) and keep it inside
   the same controls as the data it learned from.
10. **Add two small models that are not the product**: a **guard model** (Shieldstral 3B — Apache-2.0,
    French, policy-as-prompt) on inputs and outputs, and a **drafter** for whatever large model you keep
    (vendors now ship them; ~2.6× decode in SGLang for LFM2.5). Both are cheap, both are invisible to users,
    and both are easier to get approved than a user-facing model swap.
11. **Instrument for the failure mode that has already bitten this domain**: a small model that answers
    confidently and wrongly looks identical to one that answers correctly. Require a positive marker the
    failing case cannot produce — schema-valid output *plus* a field-level agreement check against the
    source document — before any leaf call is allowed to skip the escalation.

---

## Sources

All URLs accessed **2026-09-21**. `gh api` and Hugging Face API queries also run 2026-09-21.

**Patterns**
1. <https://arxiv.org/pdf/2405.00732> — LoRA Land: 310 fine-tuned LLMs, technical report
2. <https://predibase.com/blog/lora-land-fine-tuned-open-source-llms-that-outperform-gpt-4> — Predibase LoRA Land **[vendor]**
3. <https://pmc.ncbi.nlm.nih.gov/articles/PMC12065832/> — Synthetic data distillation, npj Digital Medicine, 2025-05-10
4. <https://arxiv.org/abs/2506.02153> — NVIDIA, SLMs are the Future of Agentic AI
5. <https://www.distillabs.ai/learn/model-distillation-tutorial/> — distil labs **[vendor]**
6. <https://arxiv.org/abs/2305.05176> — FrugalGPT
7. <https://arxiv.org/abs/2406.18665> and <https://www.lmsys.org/blog/2024-07-01-routellm/> — RouteLLM
8. <https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-router> — Foundry model router
9. <https://techcommunity.microsoft.com/blog/azuredevcommunityblog/optimising-ai-costs-with-microsoft-foundry-model-router/4494776> — router savings **[vendor]**
10. <https://research.google/blog/looking-back-at-speculative-decoding/> — speculative decoding in AI Overviews
11. <https://www.lmsys.org/blog/2025-12-01-eagle3-vertex/> — EAGLE-3 to production on Vertex
12. <https://huggingface.co/LiquidAI/LFM2.5-2.6B-DSpark> — vendor-shipped drafter, 2.6× in SGLang
13. <https://huggingface.co/blog/llama-guard-4>, <https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M> — Meta guard models
14. <https://arxiv.org/abs/2510.14276> — Qwen3Guard technical report
15. <https://huggingface.co/mistralai/Shieldstral-1.0-3B> — Mistral Shieldstral 3B
16. <https://huggingface.co/ibm-granite/granite-guardian-4.1-8b> — Granite Guardian 4.1

**Insurance / financial services**
17. <https://www.mckinsey.com/capabilities/tech-and-ai/how-we-help-clients/rewired-in-action/aviva-rewiring-the-insurance-claims-journey-with-ai> — Aviva
18. <https://www.allianz.com/en/mediacenter/news/articles/251103-when-the-storm-clears-so-should-the-claim-queue.html> — Allianz Project Nemo
19. <https://www.hiscoxgroup.com/news/press-releases/2024/12-08-24> — Hiscox / Google Cloud
20. <https://www.carriermanagement.com/features/2025/04/28/274588.htm> and <https://www.aiintelreport.com/enterprise-ai/aig-underwriting-by-aig-assist-lexington-ai-win> — AIG **[trade press]**
21. <https://www.stocktitan.net/sec-filings/LMND/10-k-lemonade-inc-files-annual-report-33aac5b74a32.html> — Lemonade AI Jim **[filing summary]**
22. <https://www.axa.com/en/press/press-releases/axa-offers-securegenerative-ai-to-employees> and <https://www.microsoft.com/en/customers/story/1760377839901581759-axa-gie-azure-insurance-en-france> — AXA Secure GPT
23. <https://mistral.ai/fr/customers/axa/> — Mistral's AXA page **[vendor]**
24. <https://en.prnasia.com/releases/apac/cathay-financial-holdings-leverages-open-source-small-language-models-to-identify-customer-intent-536906.shtml> — Cathay FHC fine-tuned SLMs
25. <https://arxiv.org/abs/2602.16836> — Claim automation with LoRA-fine-tuned LLMs
26. <https://group.bnpparibas/en/press-release/bnp-paribas-and-mistral-ai-extend-their-partnership-to-support-the-next-phase-of-generative-ai-deployment-within-the-group> — BNP Paribas × Mistral, on-prem KYC
27. <https://www.shift-technology.com/resources/news/five-year-renewal-of-collaboration-between-shift-technology-and-axa-to-accelerate-ai-powered-insurance-transformation> — Shift × AXA
28. <https://www.roots.ai/news/roots-ai-powered-document-indexing-accelerator-validated-by-guidewire-transforming-claims-processing-with-automation> — Roots/Bevaya **[vendor]**
29. <https://huggingface.co/openai/privacy-filter> and <https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/openai_privacy_filter.md> — OpenAI Privacy Filter
30. <https://www.marktechpost.com/2026/04/28/openai-releases-privacy-filter-a-1-5b-parameter-open-source-pii-redaction-model-with-50m-active-parameters/> — its architecture/F1 **[trade press]**

**Browser / on-device**
31. <https://caniuse.com/webgpu> — WebGPU support 87.35%
32. <https://github.com/gpuweb/gpuweb/wiki/Implementation-Status> — per-browser WebGPU status (page updated 2026-08-13)
33. <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/> — WebGPU in Safari 26
34. <https://developer.chrome.com/docs/ai/prompt-api> and <https://developer.chrome.com/blog/new-in-chrome-148?hl=en> — Chrome Prompt API
35. <https://arxiv.org/abs/2412.15803> — WebLLM engine paper (browser vs native tok/s)
36. <https://huggingface.co/blog/transformersjs-v4> — Transformers.js v4 **[vendor]**
37. <https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference> — MediaPipe LLM Inference in maintenance mode
38. <https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/> — LiteRT-LM figures
39. <https://huggingface.co/litert-community/Gemma3-1B-IT> — Gemma 3 1B CPU/GPU/NPU/Web benchmark table
40. <https://github.com/pytorch/executorch/blob/main/examples/models/llama/README.md> — ExecuTorch Llama phone numbers
41. <https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct> — LFM2.5 phone CPU/NPU numbers
42. <https://machinelearning.apple.com/research/introducing-apple-foundation-models> — 30 tok/s, 0.6 ms/token on iPhone 15 Pro
43. <https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models> and <https://arxiv.org/abs/2507.13575> — AFM 3 / 2025 tech report
44. <https://blogs.windows.com/windowsdeveloper/2024/05/21/unlock-a-new-era-of-innovation-with-windows-copilot-runtime-and-copilot-pcs/> — Phi Silica 650 / 27 tok/s, 1.5 W
45. <https://learn.microsoft.com/en-us/azure/foundry-local/what-is-foundry-local> and <https://devblogs.microsoft.com/foundry/foundry-local-ga/> — Foundry Local
46. <https://developer.android.com/ai/gemini-nano> and <https://android-developers.googleblog.com/2026/04/AI-Core-Developer-Preview.html> — AICore / Gemma 4 on Android
47. <https://arxiv.org/abs/2603.23640> — edge inference under sustained load (thermal throttling)
48. <https://github.com/ngxson/wllama>, <https://github.com/mlc-ai/web-llm> — browser runtime constraints

**Microsoft 365 Copilot / MCP**
49. <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-declarative-agent>
50. <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-custom-engine-agent>
51. <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins>
52. <https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp>
53. <https://learn.microsoft.com/en-us/microsoft-copilot-studio/bring-your-own-model-prompts>
54. <https://www.microsoft.com/en-us/copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio/> and <https://www.microsoft.com/en-us/copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/>
55. <https://learn.microsoft.com/en-us/microsoft-365/copilot/connect-to-ai-subprocessor> — Anthropic subprocessor / EUDB exclusion
56. <https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-flex-routing> — flex routing
57. <https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/> and <https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id> — agent governance
58. <https://news.microsoft.com/source/2026/07/21/microsoft-and-mistral-expand-strategic-partnership-to-give-enterprises-and-regulated-industries-frontier-ai-they-can-control/>
59. <https://practical365.com/how-to-plan-mcp-deployment-for-copilot-studio-agents/>, <https://github.com/fooshen/MCPwithVnet> — private MCP reachability **[third-party]**

**Regulation**
60. <https://eur-lex.europa.eu/eli/reg/2016/679/oj> — GDPR
61. <https://eur-lex.europa.eu/eli/reg/2024/1689/oj> — AI Act; <https://artificialintelligenceact.eu/annex/3/>, <https://artificialintelligenceact.eu/article/27/>, <https://artificialintelligenceact.eu/article/50/>
62. <https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng> — Digital Omnibus on AI (in force 2026-07-27)
63. <https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/> — practitioner summary
64. <https://www.eiopa.europa.eu/publications/opinion-artificial-intelligence-governance-and-risk-management_en> — EIOPA Opinion, 2025-08-06
65. <https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_en> — EDPB Opinion 28/2024
66. <https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf> — EDPB Guidelines 2/2023 v2.0
67. <https://eur-lex.europa.eu/eli/reg/2022/2554/oj> — DORA

**Models / leaderboards**
68. <https://gorilla.cs.berkeley.edu/leaderboard.html> (+ `data_overall.csv`) — BFCL V4
69. <https://ai.google.dev/gemma/docs/releases>, <https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/> — Gemma 4
70. <https://www.alibabacloud.com/blog/qwen3-5-towards-native-multimodal-agents_602894>, <https://huggingface.co/Qwen/Qwen3.5-2B>, <https://huggingface.co/Qwen/Qwen3.5-4B> — Qwen3.5
71. <https://research.ibm.com/blog/granite-4-1-ai-foundation-models>, <https://huggingface.co/ibm-granite/granite-4.2-3b> — Granite 4.1 / 4.2
72. <https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512>, <https://huggingface.co/HuggingFaceTB/SmolLM3-3B>, <https://huggingface.co/openbmb/MiniCPM5-2B>, <https://huggingface.co/LiquidAI/LFM2.5-2.6B>
73. <https://huggingface.co/OpenLLM-France/Luciole-1B-Instruct-1.1>, <https://huggingface.co/swiss-ai/Apertus-v1.1-4B-Instruct>, <https://huggingface.co/CohereLabs/tiny-aya-l2-thinker>
74. <https://arxiv.org/abs/2510.05046> — COLE French benchmark; <https://comparia.beta.gouv.fr/> — compar:IA
75. <https://huggingface.co/numind/NuExtract3>, <https://huggingface.co/osmosis-ai/Osmosis-Structure-0.6B>, <https://huggingface.co/ibm-granite/granite-docling-258M>, <https://huggingface.co/urchade/gliner_multi_pii-v1>, <https://huggingface.co/iiiorg/piiranha-v1-detect-personal-information>
