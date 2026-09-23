# Four practitioner topics for small language models at an insurer

**Anonymisation · synthetic data · document understanding (docling) · fine-tuning**

**Date:** 2026-09-21 · **Audience:** AI-innovation team, insurer (AXA), French + English, EU data residency

**Target hardware for every recipe:** one RTX 4070 12 GB (WSL2 host) · a laptop browser (wllama / WebAssembly / WebGPU) · a phone

**All sources accessed 2026-09-21** (full list at the end). Every number below carries the URL it came from.

---

## 0. How to read this report

Rules applied while writing it, because the previous paper in this lab failed on exactly these points (see `../../critique/raw-findings.json`, lens `coverage-gaps`):

1. **A number without a URL is not in this report.** Vendor self-reported numbers are labelled *self-reported*.
2. **Every model id was checked against the Hugging Face API** on 2026-09-21 (`HfApi.model_info` / `dataset_info`). Anything not checkable is marked **UNVERIFIED**.
3. **Recall is the metric that matters for anonymisation**, F1 hides it — so recall is reported separately wherever the source gives it.
4. **Licence is a hard gate at an insurer.** A model whose licence forbids commercial use by a company over $10M revenue is unusable at AXA in production, no matter how good. That is called out per model.
5. Timings are marked *measured here* (this machine, with the command), *published* (with URL) or *not measured*. Nothing is estimated silently.

### TL;DR — the four recommended stacks

| Topic | Stack to build on | Best published number | Licence gate |
|---|---|---|---|
| 1. Anonymisation | Presidio 2.2.364 (regex + FR custom recognisers + `fr_core_news_lg`) **∪** GLiNER2-PII (`fastino/gliner2-privacy-filter-PII-multi`), union-of-detectors, `encrypt`/`decrypt` for reversibility | GLiNER2-PII **avg span F1 0.471** on SPY, best of 5 systems incl. `openai/privacy-filter` (0.373) — [arXiv 2605.09973](https://arxiv.org/html/2605.09973) | Presidio MIT, GLiNER2 Apache-2.0 → OK. **LFM2.5-Encoder-PII and Piiranha are blocked** (see §1.3) |
| 2. Synthetic data | llama.cpp/wllama GBNF `--json-schema` grammar + NeMo **Data Designer** (Apache-2.0) seeded with **Nemotron-Personas-France** (1M, CC-BY-4.0), validated with SDMetrics (MIT) + Anonymeter | XGrammar **up to 100× speedup** on constrained decoding — [arXiv 2411.15100](https://arxiv.org/abs/2411.15100); Persona-driven: Qwen2-7B on 1.07M persona-generated problems → **64.9% MATH** — [arXiv 2406.20094](https://arxiv.org/html/2406.20094) | Apache/MIT/CC-BY → OK. SDV is BSL (internal use only, no "synthetic data service") |
| 3. Documents | docling **2.129.0** (installed here) standard pipeline + RapidOCR `iso:fr` + TableFormer `accurate`; `granite_docling` VLM only as A/B; docling-serve for the service, docling-mcp for agents | TableFormer **TEDS 0.90 struct / 0.89 with text on FinTabNet**, but **0.80 / 0.69 on OmniDocBench** — [docling-eval](https://github.com/docling-project/docling-eval/blob/main/docs/evaluations/FinTabNet/evaluation_FinTabNet_tableformer_TEDS_struct-only.txt) | MIT → OK |
| 4. Fine-tuning | Unsloth/TRL QLoRA on the 4070 (≤14B fits), all-linear adapters, rank 256, LR ≈10× full-FT; merge → GGUF → wllama | FunctionGemma-270M on Mobile Actions **58% → 85%** after fine-tuning — [Google blog](https://blog.google/technology/developers/functiongemma/); multi-turn tool calling **9.9% → 96.0%** with 5,000 synthetic examples — [distil labs](https://www.distillabs.ai/blog/making-functiongemma-work-multi-turn-tool-calling-at-270m-parameters/) | Unsloth/TRL/Axolotl/LLaMA-Factory Apache-2.0 → OK |

---

## 1. Anonymisation / pseudonymisation before sending text to a third-party LLM

### 1.1 The legal frame — state it before the tooling

- **Pseudonymised data is still personal data.** GDPR Art. 4(5) defines pseudonymisation as processing after which data "can no longer be attributed to a specific data subject without the use of additional information"; Recital 26 keeps it in scope. The EDPB adopted **Guidelines 01/2025 on Pseudonymisation** on 16 January 2025 and states pseudonymised data remains personal data as long as it can be linked to an individual with additional information — [edpb.europa.eu (PDF)](https://www.edpb.europa.eu/system/files/2025-01/edpb_guidelines_202501_pseudonymisation_en.pdf).
- **But the recipient's position now matters.** CJEU **C-413/23 P, EDPS v SRB, 4 September 2025**: sufficiently strongly pseudonymised data may be personal data for the original controller and *not* for a recipient who cannot reverse the pseudonymisation and cannot identify the subject by other means — [curia press release (PDF)](https://curia.europa.eu/site/upload/docs/application/pdf/2025-09/cp250107en.pdf), analysis: [Clifford Chance](https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2025/09/pseudonymized-data-after-edps-v-srb.html). Practical reading for this lab: **the re-identification table never leaves our VPC**; that separation is what the judgment turns on. It is not a licence to call the pipeline "anonymisation".
- **Removing identifiers does not stop inference.** Staab et al., *Beyond Memorization* (ICLR 2024): LLMs infer location, income, sex etc. from anonymous text at **up to 85% top-1 / 95.8% top-3 accuracy**, and the paper states that "common mitigations, i.e. text anonymization and model alignment, are currently ineffective" — [arXiv 2310.07298](https://arxiv.org/abs/2310.07298). Follow-up (*LLMs are Advanced Anonymizers*, ICLR 2025) shows adversarial LLM anonymisation beats industry tools on privacy **and** utility — [arXiv 2402.13846](https://arxiv.org/abs/2402.13846).

### 1.2 Microsoft Presidio — what it gives you and the France-shaped hole

- The project **moved**: `github.com/microsoft/presidio` now redirects to **[data-privacy-stack/presidio](https://github.com/data-privacy-stack/presidio)** (10,958 stars, pushed 2026-09-20), docs at **[presidio.dataprivacystack.org](https://presidio.dataprivacystack.org/anonymizer/)**. Latest release **2.2.364, 2026-07-22** (`gh api repos/data-privacy-stack/presidio/releases/latest`).
- **Country packs shipped:** `australia, canada, finland, germany, india, italy, korea, nigeria, philippines, poland, singapore, south_africa, spain, sweden, thai, turkey, uk, us` — [predefined_recognizers/country_specific](https://github.com/data-privacy-stack/presidio/tree/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific). **There is no `france` folder.** Germany ships 13 recognisers (incl. `de_kfz_recognizer.py` for plates) — that file is the template to copy.
- What *does* work for France out of the box: `PhoneRecognizer.DEFAULT_SUPPORTED_REGIONS = ("US", "GB", "DE", "FR", "IL", "IN", "CA", "BR")` — [phone_recognizer.py:29](https://github.com/data-privacy-stack/presidio/blob/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/generic/phone_recognizer.py) — plus generic IBAN (with ISO 13616 check), credit card, email, IP, URL, crypto, date.
- **Custom French recognisers to write** (each is a `PatternRecognizer` + a validator; all four rules verified):
  - **NIR / numéro de sécurité sociale**: 13 digits + 2-digit key; key = `97 − (NIR mod 97)`, with Corsica substitution **2A→19, 2B→18** — [fr.wikipedia.org/Numéro_de_sécurité_sociale_en_France](https://fr.wikipedia.org/wiki/Num%C3%A9ro_de_s%C3%A9curit%C3%A9_sociale_en_France). Reference implementation you can lift: Faker's [`faker/providers/ssn/fr_FR/__init__.py`](https://github.com/joke2k/faker/blob/master/faker/providers/ssn/fr_FR/__init__.py) (`calculate_checksum`, lines 6-9, with the same Corsica rule).
  - **IBAN FR**: generic `IbanRecognizer` already validates mod-97; FR IBANs are 27 characters.
  - **SIREN (9) / SIRET (14)**: Luhn — Faker [`providers/company/fr_FR`](https://github.com/joke2k/faker/blob/master/faker/providers/company/fr_FR/__init__.py) uses `calculate_luhn` (line 354).
  - **Plaque SIV**: `AA-123-AA` since 15 April 2009, and **I, O, U are not used** — [service-public.gouv.fr F17638](https://www.service-public.gouv.fr/particuliers/vosdroits/F17638); `SS` and `WW` combinations are also excluded ([plaques24](https://www.plaques24.fr/blog/lettres-interdites-plaque-immatriculation/), trade source).
- **Multi-language**: one recogniser supports one language; configure the NLP engine per language — [docs/analyzer/languages.md](https://github.com/data-privacy-stack/presidio/blob/main/docs/analyzer/languages.md). For French use spaCy **`fr_core_news_lg` 3.8.0: ENTS_P 84.16 / ENTS_R 84.20 / ENTS_F 84.18**, labels only `LOC, MISC, ORG, PER`, 545 MB, trained on WikiNER — [spacy-models release notes](https://github.com/explosion/spacy-models/releases/tag/fr_core_news_lg-3.8.0). Stronger French NER if you can afford it: **`flair/ner-french` F1 90.61 (WikiNER)** ([card](https://huggingface.co/flair/ner-french)); **`Jean-Baptiste/camembert-ner` P 0.8859 / R 0.8971 / F1 0.8914, PER F1 0.9483** ([card](https://huggingface.co/Jean-Baptiste/camembert-ner)).
- **Model-based recognisers inside Presidio**: `GLiNERRecognizer` (default model `urchade/gliner_multi_pii-v1`, threshold 0.30, optional ONNX backend, 250-char chunking) — [ner/gliner_recognizer.py](https://github.com/data-privacy-stack/presidio/blob/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/ner/gliner_recognizer.py); `HuggingFaceNerRecognizer`; and **LLM-based** `BasicLangExtractRecognizer`, whose shipped config points at a **local Ollama `qwen2.5:1.5b`** with `max_char_buffer: 400` — [conf/langextract_config_basic.yaml](https://github.com/data-privacy-stack/presidio/blob/main/presidio-analyzer/presidio_analyzer/conf/langextract_config_basic.yaml). That is the supported "LLM-based redaction" path, and it stays on-premise.

### 1.3 Small models for PII — published numbers, and which ones AXA may actually use

All ids verified on the Hub 2026-09-21 (downloads = last 30 days).

| Model | Size | Languages | Published number (source) | Licence → usable at AXA? |
|---|---|---|---|---|
| `fastino/gliner2-privacy-filter-PII-multi` (GLiNER2-PII) | 205M (card) / "0.3B" (paper) | en, fr, es, de, it, pt, nl | **SPY avg span F1 0.471** (legal P .354/R .722/F1 .475; medical .355/.681/.467) — best of 5 — [paper](https://arxiv.org/html/2605.09973); card says avg **0.477** | Apache-2.0 → **yes** |
| `urchade/gliner_multi_pii-v1` | 0.29B | en, fr, de, es, pt, it | SPY avg F1 **0.384** (P 0.522 / R 0.308 legal) — same table | Apache-2.0 → yes |
| `nvidia/gliner-PII` | 0.57B (gliner_large-v2.1 base) | English | strict F1 **0.70** Argilla-PII, **0.64** AI4Privacy, **0.87** Nemotron-PII @thr 0.3 — [card](https://huggingface.co/nvidia/gliner-PII) (self-reported) | NVIDIA Open Model Licence → yes, read it |
| `knowledgator/gliner-pii-large-v1.0` | ~0.3B | multilingual (FR not itemised) | P **87.42%** / R **79.4%** / F1 **83.25%** on its *own* `synthetic-multi-pii-ner-v1` — [card](https://huggingface.co/knowledgator/gliner-pii-large-v1.0) (in-domain, self-reported) | Apache-2.0 → yes |
| `openai/privacy-filter` | 1.5B total / **50M active** MoE, 128k ctx, 8 labels | "primarily English" | SPY avg F1 **0.373** ([paper](https://arxiv.org/html/2605.09973)); independent: EN macro-F1 strict **0.1547** but **boundary 0.4976** — [HeyNeo, 2026-04-30](https://heyneo.com/blog/pii-filter-model-eval) | Apache-2.0 → yes; runs in-browser (transformers.js, `device:'webgpu', dtype:'q4'`) |
| `OpenMed/privacy-filter-multilingual` | same backbone | 16 langs incl. **French**, 54 categories | no per-language numbers published — [card](https://huggingface.co/OpenMed/privacy-filter-multilingual) | Apache-2.0 → yes |
| `LiquidAI/LFM2.5-Encoder-350M-PII-Detector` | 0.4B, 40 types | 16 langs | partial-F1 **SPY 0.428, Gretel 0.880, TAB 0.867, ai4privacy 0.715, Nemotron 0.855, MAPA 0.236** — [card](https://huggingface.co/LiquidAI/LFM2.5-Encoder-350M-PII-Detector) | **LFM1.0: commercial use not licensed above $10M annual revenue** ([LICENSE §5, "Threshold"](https://huggingface.co/LiquidAI/LFM2-350M-Extract/raw/main/LICENSE)) → **research only at AXA** |
| `Meddies/meddies-pii-v2` | 0.4B (LoRA r=128 on the LFM2.5 encoder) | 17 langs incl. FR | exact typed micro-F1 **0.8937**; **ai4privacy_fr exact F1 0.844**; ONNX + WebGPU browser build — [card](https://huggingface.co/Meddies/meddies-pii-v2), [paper](https://arxiv.org/html/2609.12544) | **CC-BY-NC-4.0** → evaluation only |
| `iiiorg/piiranha-v1-detect-personal-information` | 0.28B | en, fr, de, it, nl, es | widely used (228k dl/30d) | **CC-BY-NC-ND-4.0** → **no** (non-commercial *and* no derivatives) |

**The two numbers that should change your mind about benchmarks:**

- **PIIBench** (2,369,883 sequences, 3.35M mentions, 48 canonical types, 10 datasets): *every* system scores span-level F1 **below 0.14**, best = Presidio at **0.1385**, "still producing zero recall on most entity types" — [arXiv 2604.15776](https://arxiv.org/pdf/2604.15776). That is a taxonomy-mismatch artefact, not a claim that Presidio is useless — and it is exactly why **you must score against your own label set**.
- **Scoring tier flips the ranking.** HeyNeo: GLiNER beats `openai/privacy-filter` on strict spans (0.3667 vs 0.1547) and *loses* on boundary matching (0.4162 vs 0.4976), because of tokenizer offset drift — [heyneo.com](https://heyneo.com/blog/pii-filter-model-eval). Decide your matching tier before you run.

### 1.4 Evaluation data with French

- **`ai4privacy/pii-masking-openpii-1.5m`** — **1,636,375 examples** (1,309,912 train / 326,463 val), **19 labels**, **30 languages incl. `fr`**, 11,866,674 span annotations, columns `source_text, masked_text, privacy_mask (value/start/end/label), language, region, mbert_tokens, mbert_token_classes`, **CC-BY-4.0, commercial use permitted with attribution** (+ Llama Community License, it was generated with Llama 3.1/3.3) — [dataset card](https://huggingface.co/datasets/ai4privacy/pii-masking-openpii-1.5m). **This is the one to use.**
- **`ai4privacy/pii-masking-400k` / `-300k`** carry a *different* licence: "Access to this dataset is granted exclusively for academic research and non-commercial purposes… Strictly no licensing is available directly for companies without prior discussion" — [license.md](https://huggingface.co/datasets/ai4privacy/pii-masking-400k/raw/main/license.md). Do not build a product benchmark on them.
- **SPY** (NAACL-SRW 2025): 4,491 medical consultations + 4,197 legal questions, 7 PII types, entities injected with Faker at load time — [ACL Anthology](https://aclanthology.org/2025.naacl-srw.23/), [code](https://github.com/LogicZMaksimka/SPY_Dataset). English.
- **`nvidia/Nemotron-PII`** — ~100k synthetic records, CC-BY-4.0, English — [dataset](https://huggingface.co/datasets/nvidia/Nemotron-PII).
- French-specific labelled PII corpora remain thin: OpenPII's `fr` slice + your own hand-built claim emails is the realistic answer. (A public *French insurance* PII corpus: **none found** — UNVERIFIED that one exists.)

### 1.5 What runs in a browser

- `openai/privacy-filter` ships ONNX + **Transformers.js** and the card shows `device: 'webgpu', dtype: 'q4'` — [card](https://huggingface.co/openai/privacy-filter). Same for `Meddies/meddies-pii-v2-onnx` (WebGPU demo).
- GLiNER in JS: **[Knowledgator/GLiNER.js](https://github.com/Knowledgator/GLiNER.js)** on onnxruntime-web (`wasm`/`webgpu` execution providers) — last push 2025-03-02, 27 stars → **low-maintenance risk**. `onnx-community/gliner_multi_pii-v1` exists (int8 349 MB, q4f16 472 MB) but its Transformers.js pipeline support is **UNVERIFIED** (card shows "Unknown pipeline tag" and no snippet).
- Do **not** expect GLiNER/DeBERTa PII models in wllama: they are encoder architectures llama.cpp does not carry (`deberta` absent from `llama-arch.cpp`, per this lab's own catalogue `../models/catalog-embedding-pii-doc.json`).

### 1.6 Reversible pseudonymisation

Presidio anonymizer operators: **replace, redact, hash, mask, encrypt, custom, keep**; deanonymizer: **decrypt**; `AnonymizerEngine.anonymize(..., operators={"PERSON": OperatorConfig("encrypt", {"key": ...})})` → `DeanonymizeEngine.deanonymize(..., OperatorConfig("decrypt", {"key": ...}))` — [docs](https://presidio.dataprivacystack.org/anonymizer/). **Since 2.2.361 `hash` uses a random salt by default**, so pass an explicit `salt` if you need the *same* pseudonym for the same person across documents (referential integrity) — and then treat that salt as key material.

Architecture that satisfies §1.1: detect → replace each span with a stable token (`[PERSONNE_1]`) → keep the `token → plaintext` map in a vault inside the EU VPC → call the third-party LLM with the tokenised text → map back on return. The vault is the "additional information" of Art. 4(5); it is also what keeps the recipient in the *EDPS v SRB* position.

### 1.7 Recipe (RTX 4070 / browser / phone)

```bash
# host, one venv, no GPU needed for Presidio itself
python -m venv ~/.venvs/pii && ~/.venvs/pii/bin/pip install \
  "presidio-analyzer[gliner]" presidio-anonymizer spacy       # extras name verified in pyproject.toml
~/.venvs/pii/bin/python -m spacy download fr_core_news_lg     # 545 MB, ENTS_F 84.18
```

```python
# analyzer: French NLP engine + FR custom recognisers + GLiNER, union of detectors
from presidio_analyzer import AnalyzerEngine, RecognizerRegistry, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_analyzer.predefined_recognizers import GLiNERRecognizer

nlp = NlpEngineProvider(nlp_configuration={"nlp_engine_name": "spacy",
      "models": [{"lang_code": "fr", "model_name": "fr_core_news_lg"}]}).create_engine()
reg = RecognizerRegistry(); reg.load_predefined_recognizers(languages=["fr"], nlp_engine=nlp)
reg.add_recognizer(PatternRecognizer(supported_entity="FR_NIR", supported_language="fr",
    patterns=[Pattern("nir", r"\b[1-8]\s?\d{2}\s?\d{2}\s?(\d{2}|2[AB])\s?\d{3}\s?\d{3}\s?\d{2}\b", 0.4)],
    context=["sécurité sociale", "numéro de sécu", "NIR", "assuré social"]))   # + validate_result() with 97-mod key
reg.add_recognizer(PatternRecognizer(supported_entity="FR_PLATE", supported_language="fr",
    patterns=[Pattern("siv", r"\b[A-HJ-NP-TV-Z]{2}-\d{3}-[A-HJ-NP-TV-Z]{2}\b", 0.6)],  # I,O,U excluded
    context=["immatriculation", "plaque", "véhicule"]))
reg.add_recognizer(GLiNERRecognizer(model_name="fastino/gliner2-privacy-filter-PII-multi",
                                    supported_language="fr", threshold=0.30))   # see note below
analyzer = AnalyzerEngine(registry=reg, nlp_engine=nlp, supported_languages=["fr"])
```

*Note:* `GLiNERRecognizer` loads through the `gliner` package; GLiNER2 models are loaded with the **`gliner2`** package (`GLiNER2.from_pretrained(...)`, [card](https://huggingface.co/fastino/gliner2-privacy-filter-PII-multi)). Whether the shipped `GLiNERRecognizer` accepts a GLiNER2 checkpoint is **UNVERIFIED** — budget an afternoon for a thin `EntityRecognizer` subclass around `gliner2` if it does not.

- **GPU**: a 0.3B GLiNER at fp16 is ~0.6 GB — it and a 2B extraction model coexist inside 12 GB.
- **Browser**: `openai/privacy-filter` via Transformers.js/WebGPU for a "redact before paste" demo.
- **Phone**: same page over HTTPS on the LAN; on a 2 GB-RAM budget use the int8 ONNX build. Phone throughput **not measured**.

### 1.8 Failure modes (honest list)

1. **Recall, not F1, is the risk.** A 0.47-F1 system that *leaks a name once per 20 documents* is a breach generator. Report per-type recall and document-level leak rate.
2. **Taxonomy mismatch destroys scores** (PIIBench: best F1 0.1385 across 48 types) — always map to your labels.
3. **Strict-span scoring punishes offset drift, not detection failures** (HeyNeo flip).
4. **French formats are absent from Presidio**; without custom recognisers NIR/SIRET/plate go undetected — and `fr_core_news_lg` only knows PER/LOC/ORG/MISC, so a *garage name* is ORG but a *policy number* is nothing.
5. **Quasi-identifiers survive redaction** — dates, commune, job, vehicle model. Staab: 85% top-1 attribute inference. Redaction ≠ anonymisation, legally or practically.
6. **Pseudonym consistency is a security decision**: salted hashes with a random salt break linkage (good for privacy, bad for "same claimant across 3 documents"); a fixed salt makes the salt a secret key.
7. **LLM-based redaction can hallucinate spans that do not exist** and silently rewrite content; keep it as a *recall booster* in a union, never as the only detector, and always verify spans against the source text.
8. **Chunking loses context**: `GLiNERRecognizer` default chunk is 250 chars with 50 overlap — an address split across a boundary is detected twice or not at all.

### 1.9 Proposed experiment **E1 — "does anything catch French PII at insurer recall?"**

- **Dataset**: 400 FR + 400 EN rows sampled from `ai4privacy/pii-masking-openpii-1.5m` (spans, CC-BY-4.0) **+ 100 hand-written French claim emails / constat narratives** containing, by construction: 2 named persons, a NIR with valid key, an IBAN FR76, a SIV plate, a SIREN of a garage, a mobile in 3 formats, a DOB, a policy number. Hold the 100 hand-written ones as the *hard set* (they are what AXA actually receives).
- **Systems (7 arms)**: (a) regex-only baseline; (b) Presidio + `fr_core_news_lg`; (c) b + FR custom recognisers; (d) GLiNER2-PII; (e) `urchade/gliner_multi_pii-v1`; (f) `openai/privacy-filter`; (g) union(c, d) — the deployable candidate.
- **Metrics**: per-type **recall** and precision at *boundary* matching (report strict too); **document-level leak rate** = share of documents with ≥1 missed direct identifier; utility = % of non-PII tokens preserved; latency p50/p95 per document.
- **Pass bar**: on the FR hard set, **document-level leak rate ≤ 1%** for direct identifiers (name, NIR, IBAN, phone, email, address, plate, policy number) at **precision ≥ 0.80**; per-type recall **≥ 0.98** for the regex-checkable types (NIR, IBAN, plate, email) and **≥ 0.95** for PERSON. If no arm passes, the answer is "human-in-the-loop + tokenisation vault", not "ship it".

---

## 2. Synthetic data for testing AI systems

### 2.1 Schema-constrained generation — the part that makes it reproducible

- **llama.cpp GBNF**: grammars in `llama-server` (`grammar` body field), `llama-cli --grammar/--grammar-file`, JSON-schema via `json_schema` body field, `response_format` on `/chat/completions`, or `-j` on the CLI — [grammars/README.md](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md).
- **Known limitations, verbatim from that file** (these bite when generating claims): `minimum, exclusiveMinimum, maximum, exclusiveMaximum: only supported for "type": "integer" for now, not "number"` (so **euro amounts cannot be range-bounded by the grammar**); `patterns must start with ^ and end with $`; `Unsupported features are skipped silently`; `Nested $refs are broken`; `Can't mix properties w/ anyOf/oneOf`. And: "The JSON schema is only used to constrain the model output and **is not injected into the prompt**".
- **wllama 3.7.0** (the browser engine this lab pins, llama.cpp `c7bda030`, 2026-09-03) exposes `SamplingParams.grammar?: string` ([src/types/types.ts:119](https://github.com/ngxson/wllama/blob/master/src/types/types.ts)) and an OpenAI-compatible `response_format: {type: 'json_schema', json_schema: {...}}` ([src/types/oai-compat.ts:122-124](https://github.com/ngxson/wllama/blob/master/src/types/oai-compat.ts)) → **the same grammar runs in the browser**. Limits: max file size **2 GB** (ArrayBuffer), split at 512 MB chunks, COOP/COEP headers required for threads — [README](https://github.com/ngxson/wllama#limitations).
- **Alternatives**: **Outlines** 1.3.3 (Apache-2.0, backends: transformers, llama.cpp, vLLM, Ollama; Pydantic output types) — [repo](https://github.com/dottxt-ai/outlines); **XGrammar** v0.2.7 (Apache-2.0), **up to 100× speedup** over prior constrained decoding — [arXiv 2411.15100](https://arxiv.org/abs/2411.15100); **llguidance** (MIT). Comparative ground truth: **JSONSchemaBench**, 10K real-world schemas across Guidance, Outlines, llama.cpp, XGrammar, OpenAI, Gemini — [arXiv 2501.10868](https://arxiv.org/abs/2501.10868) (per-framework numbers are in the paper; not reproduced here because the abstract page does not carry them).
- **Cost of constraining**: *Let Me Speak Freely?* (EMNLP 2024 Industry) reports a significant decline in reasoning under format restriction, worse the stricter the constraint, while classification improves — [arXiv 2408.02442](https://arxiv.org/abs/2408.02442). So: constrain the *record*, not the *reasoning*.

### 2.2 Generators, personas, seeds

- **NVIDIA NeMo Data Designer** — Apache-2.0, `v0.9.2` (2026-09-03), [repo](https://github.com/NVIDIA-NeMo/DataDesigner). Column types: samplers (category, distributions, **person**), LLM text/structured/code/**judge** columns, Python/SQL/LLM validators, expression columns. **`person` sampler supports `fr_FR`** and can be backed by the Nemotron-Personas France dataset (`ngc registry resource download-version "nvidia/nemotron-personas/nemotron-personas-dataset-fr_fr"`) — [person_sampling.mdx](https://github.com/NVIDIA-NeMo/DataDesigner/blob/main/fern/versions/latest/pages/concepts/person_sampling.mdx). Providers include custom/local OpenAI-compatible endpoints → it can drive **your** llama.cpp server.
- **`nvidia/Nemotron-Personas-France`** — **1,000,000 personas**, 21 columns (sex, age, commune, département, education, occupation, professional/sports/arts/travel/culinary personas…), **CC-BY-4.0**, synthetic — [dataset](https://huggingface.co/datasets/nvidia/Nemotron-Personas-France). This is the best French seed corpus available for insurance role-play.
- **Persona Hub** (1B personas, method paper): Qwen2-7B fine-tuned on **1.07M** persona-generated math problems reaches **64.9% on MATH** — [arXiv 2406.20094](https://arxiv.org/html/2406.20094). Licence **CC-BY-NC-SA-4.0** ([dataset](https://huggingface.co/datasets/proj-persona/PersonaHub)) → method yes, data no.
- **distilabel** (Apache-2.0) — pipelines-as-code for generation + AI feedback, but **latest release 1.5.3 dated 2025-01-28** (`gh api .../releases/latest`) while the repo still receives commits → treat as *stable but slow-moving*; Data Designer is the more active choice in 2026.
- **Tabular**: **SDV** v1.38.3 — **Business Source License 1.1**: internal use allowed, but you may not offer a "Synthetic Data Service" to third parties; converts to MIT four years after each release — [LICENSE](https://github.com/sdv-dev/SDV/blob/main/LICENSE). **SDMetrics** is MIT (v0.31.1) — use it for scoring whatever generator you pick. **mostlyai** SDK (Apache-2.0, v6.1.4) and **synthcity** (Apache-2.0, last release 2025-05-08) are the permissive alternatives.
- **Deterministic French filler**: Faker `fr_FR` (MIT, v40.39.0) gives valid **NIR with key**, **SIREN/SIRET with Luhn**, IBAN FR, plates. **Trap**: its plate format is `"??-###-??"` with no exclusion of I/O/U ([automotive/fr_FR](https://github.com/joke2k/faker/blob/master/faker/providers/automotive/fr_FR/__init__.py)), so Faker will happily emit `IO-123-UU`, which a correct SIV validator rejects — your generator and your validator must agree.
- **Insurance-specific open data**: `bdr-ai-org/claims-synthetic-dataset` (MIT, motor+medical, English, expert ground-truth decisions approve/reject/escalate — [card](https://huggingface.co/datasets/bdr-ai-org/claims-synthetic-dataset)); `bitext/Bitext-insurance-llm-chatbot-training-dataset` (5.13M tokens, EN). **A French synthetic claims corpus: none found** — this is why E2 below builds one.

### 2.3 Metrics: validity, diversity, privacy

- **Validity**: schema-valid % is *free* under a grammar (it is 100% by construction) — which is exactly why you must measure **business-rule validity** instead: date ≤ today, amount within peril band, narrative mentions the declared peril, NIR key correct, plate matches SIV.
- **Diversity**: distinct-n, **self-BLEU** (lower = more diverse), and embedding-based scores such as the Vendi score / DCScore — survey and a new measure in *Measuring Diversity in Synthetic Datasets* [arXiv 2502.08512](https://arxiv.org/pdf/2502.08512). Low diversity is not cosmetic: *Synthetic Eggs in Many Baskets* shows synthetic-data diversity drives distribution collapse in downstream fine-tuning [arXiv 2511.01490](https://arxiv.org/pdf/2511.01490).
- **Privacy leakage**:
  - **Do not trust DCR/NNDR.** *The DCR Delusion* (Yao, Krčo, Ganev, de Montjoye): "datasets deemed private by proxy metrics are highly vulnerable to MIAs"; distance metrics are "uninformative of actual membership inference risk" — [arXiv 2505.01524](https://arxiv.org/abs/2505.01524).
  - **Use attack-based evaluation**: **Anonymeter** v1.1.0 (Clear BSD) runs singling-out, linkability and inference attacks with main/control/baseline arms, and was **positively reviewed by the CNIL** — [repo](https://github.com/statice/anonymeter), [paper arXiv 2211.10459](https://arxiv.org/pdf/2211.10459).
  - **For text generators**, memorisation grows log-linearly with model capacity, duplication and context length (Carlini et al., *Quantifying Memorization*, [arXiv 2202.07646](https://arxiv.org/abs/2202.07646)) → check verbatim n-gram overlap between outputs and seeds, and plant canaries in the seed set.

### 2.4 Recipe (RTX 4070)

```bash
# 1. serve a small model with grammar support (GPU, ~7 GB for a 4B Q4_K_M + 8k ctx)
llama-server -hf Qwen/Qwen3-4B-Thinking-2507-GGUF -ngl 99 -c 8192 --port 8080

# 2. generate under a JSON schema — schema constrains output, prompt must still describe it
curl -s localhost:8080/v1/chat/completions -H 'Content-Type: application/json' -d '{
 "messages":[{"role":"system","content":"Tu es un conseiller sinistres AXA. Rédige un récit de sinistre réaliste en français."},
             {"role":"user","content":"Persona: <persona fr_FR>. Péril: dégât des eaux. Canal: e-mail."}],
 "response_format":{"type":"json_schema","json_schema":{"schema":{
   "type":"object","required":["numero_contrat","assure","date_sinistre","peril","montant_estime","recit"],
   "properties":{"numero_contrat":{"type":"string","pattern":"^AXA-[0-9]{5}$"},
                 "assure":{"type":"string"},"date_sinistre":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},
                 "peril":{"type":"string","enum":["degat_des_eaux","incendie","bris_de_glace","vol","collision"]},
                 "montant_estime":{"type":"number"},"recit":{"type":"string"}}}}},
 "temperature":0.9,"seed":7}'
```

```bash
# 3. same grammar, in the browser (wllama), for the on-device demo
npm i @wllama/wllama     # loadModelFromHF(...); createCompletion(prompt, {sampling:{grammar: gbnf}})
```

Validation layer: `jsonschema` for shape (redundant under grammar, keep as a tripwire), custom French validators (NIR key, SIV letters, decimal comma), SDMetrics for column-level stats, Anonymeter for the privacy arms. **Expected time: not measured here** — the only timing this lab has measured on the 4070 is the needle fine-tune (§4.6).

### 2.5 Failure modes

1. **"Valid JSON" proves nothing** once you use a grammar — it is 100% by construction. Measure semantics.
2. **The schema is not in the prompt** (llama.cpp note above): the model does not know your field means "euros", so it fills it with anything numeric. Describe fields in the prompt too.
3. **Numeric bounds are not enforced** (`minimum/maximum` integers only) → a 12-euro house fire passes.
4. **Index-locked templates fake diversity**: the v1 experiment in this repo sampled every field with the same index `i`, so damage type perfectly predicted amount (critique, `finetune-forensics`). Sample independently.
5. **Mode collapse**: a single generator at temperature 0.9 still produces a narrow style; rotate seeds, personas, channels and at least two generator models.
6. **Privacy theatre**: synthetic ≠ anonymous. Run the attacks (2.3), and never seed a generator with real claim text unless you are prepared to defend memorisation.
7. **Licence contamination**: PersonaHub (NC), ai4privacy 400k (academic-only), SDV (BSL) — a pilot that trains on those cannot ship.

### 2.6 Proposed experiment **E2 — a French claims corpus you can defend**

- **Dataset to build**: **1,000 French claim records** (500 motor, 500 MRH/habitation) = persona (sampled from `nvidia/Nemotron-Personas-France`) × peril × channel (e-mail / phone transcript / constat free text) × completeness (complete / missing amount / missing policy), generated under the grammar above by **two** models (Qwen3-4B and SmolLM3-3B) with recorded seeds. Plus **100 human-written** French items as the *held-out generator* control.
- **Metrics**: business-rule validity %; distinct-2 and self-BLEU on `recit`; exact-duplicate rate of names/policies; canary/verbatim-overlap check against the seed personas (max shared n-gram ≤ 8 tokens); Anonymeter singling-out risk on the structured columns; and the **downstream** metric — extraction F1 of a fixed small model trained on this data, measured on the 100 human-written items.
- **Pass bar**: 100% schema-valid; **≥ 95% business-rule valid**; **self-BLEU ≤ 0.35**; **≤ 1% exact duplicate** policy numbers/names; **0 verbatim seed spans > 8 tokens**; Anonymeter singling-out risk **< 0.1**; and downstream **+3 F1 or more vs a template-only dataset of equal size, with a 95% bootstrap CI excluding 0**.

---

## 3. Document understanding with docling

### 3.1 What is installed here (checked 2026-09-21, `~/.venvs/slm`)

`docling 2.129.0`, `docling-core 2.97.1`, `docling-ibm-models 4.0.3`, `docling-parse 7.20.0`, `rapidocr 3.9.2`, `transformers 5.17.0`, `torch 2.14.0`. **EasyOCR, Tesseract and onnxruntime are NOT installed.** Upstream `docling` is MIT, v2.129.0 released 2026-09-18 (`gh api repos/docling-project/docling/releases/latest`).

Pipelines available: `legacy | standard | native | vlm | asr` (`docling convert --help`). VLM presets: `smoldocling, granite_docling (default), deepseek_ocr, granite_vision, pixtral, got_ocr, phi4, qwen, nanonets_ocr2, nemotron_parse_v2, gemma_12b, gemma_27b, dolphin, glm_ocr, lightonocr, falcon_ocr, chandra_ocr2, unlimited_ocr, dots_ocr, dots_mocr`. Table engines: TableFormer v1 (`docling_tableformer`), **v2 (`docling_tableformer_v2`)**, `granite_vision_table`. OCR engines: `auto` (default), `rapidocr`, `easyocr`, `tesseract`, `tesserocr`, `nemotron-ocr`, `ocrmac`, `kserve_v2_ocr` (`datamodel/pipeline_options.py`, lines 154-760 of the installed package).

**Three French traps found by reading the installed code:**

1. `RapidOcrOptions.lang` **defaults to `["ch"]` (Simplified Chinese)** — you must pass `--ocr-lang iso:fr`.
2. `NemotronOcrOptions`: French "is routed to the English model as a best effort, with a warning: **NVIDIA validates none of them**".
3. `OcrAutoOptions` (the default) picks the engine by what is installed — "EasyOCR if GPU is present, Tesseract otherwise" — so **the same command gives different OCR on two machines**. Pin the engine explicitly.

### 3.2 Published accuracy

- **granite-docling-258M** (Apache-2.0, 0.3B), [model card](https://huggingface.co/ibm-granite/granite-docling-258M): layout **mAP 0.27, F1 0.86, P 0.92, R 0.88**; full-page OCR **edit-distance 0.45, F1 0.84, BLEU 0.65**; code **F1 0.988**; equations **F1 0.968**; **FinTabNet 150 dpi TEDS 0.97 (structure) / 0.96 (with content)**; OCRBench 500. **Languages: English; Japanese, Arabic, Chinese experimental. French is not listed.**
- **docling's own end-to-end evaluation** (`docling-eval`, first-party, MIT):
  - OmniDocBench (981 pages): **TableFormer TEDS struct-only mean 0.80 / struct-with-text mean 0.69**; layout **mAP[0.5:0.95] mean 0.24** — [OmniDocBench evaluations](https://github.com/docling-project/docling-eval/tree/main/docs/evaluations/OmniDocBench).
  - FinTabNet: **TEDS struct-only 0.90 / with-text 0.89** — [FinTabNet evaluations](https://github.com/docling-project/docling-eval/tree/main/docs/evaluations/FinTabNet).
  - **Read those two lines together**: the same table model scores 0.90 on clean financial PDFs and 0.69 on the mixed real-world benchmark. A claims mailbox looks like the second one.
- **Throughput** (Docling Technical Report, [arXiv 2408.09869](https://arxiv.org/html/2408.09869v5), 225-page test set, **OCR disabled**): Apple M3 Max 16 threads **1.34 pages/s** (native backend) / **2.45 pages/s** (pypdfium); Intel Xeon E5-2690 16 threads **0.92 / 1.57 pages/s**; memory **2.42–6.20 GB**; "Typical tables require between 2 and 6 seconds to be processed on a standard CPU". Layout = RT-DETR retrained on DocLayNet.
- Cross-check for the "is docling still competitive" question: OmniDocBench leaders in 2026 are full OCR-VLMs (PaddleOCR-VL-1.6 reported at 96.33 overall on v1.6; GLM-OCR at 94.62 on one registry) — [Spheron round-up](https://www.spheron.network/blog/best-open-source-ocr-vlm-self-host-gpu-cloud-2026/), [CodeSOTA](https://www.codesota.com/ocr/benchmark/omnidocbench). These are **third-party blog aggregations — treat as indicative, not as a benchmark you ran.** docling's value is the *pipeline* (layout + tables + provenance + chunking + serve + MCP), not a leaderboard position.

### 3.3 Known weaknesses (open issues, checked 2026-09-21)

| Issue | Why it matters here |
|---|---|
| [#4255](https://github.com/docling-project/docling/issues/4255) TableFormer *accurate* emits degenerate OTSL at the 1023-step cap → **all data rows dropped** while the table still appears; regression **introduced in 2.118.0** | **We run 2.129.0.** A table can come back empty and *look* successful — the exact "failure that resembles success" this lab bans |
| [#2788](https://github.com/docling-project/docling/issues/2788) potential memory leak in PDF conversion; [#3671](https://github.com/docling-project/docling/issues/3671) `std::bad_alloc` / silent failures on large PDFs | batch jobs die mid-run |
| [#1635](https://github.com/docling-project/docling/issues/1635) RapidOCR merges words; [#2673](https://github.com/docling-project/docling/issues/2673) scanned PDFs lose whitespace between words | French scanned constats are exactly this case |
| [#3329](https://github.com/docling-project/docling/issues/3329) layout model classifies the same PDF differently on macOS ARM vs Linux x86 | your dev result ≠ the server result |
| [#3033](https://github.com/docling-project/docling/issues/3033) VLM pipeline returns nothing | granite-docling path needs a positive-marker check |

### 3.4 Serving and agents

- **docling-serve** v1.34.0 (MIT): FastAPI, stable **v1 API**, `/v1/convert/source`, `/v1/chunk/*`, CUDA images at `quay.io/docling-project/docling-serve` — [repo](https://github.com/docling-project/docling-serve), [docs](https://docling-project.github.io/docling/usage/api_server/).
- **docling-mcp** v3.2.0 (MIT): `uvx --from docling-mcp docling-mcp-server --transport stdio`; conversion, generation and RAG tools; `DOCLING_MCP_CONVERSION_MODE=remote` + `DOCLING_MCP_SERVICE_URL` to delegate to docling-serve — [repo](https://github.com/docling-project/docling-mcp).

### 3.5 docling → small extraction model

docling 2.129.0 already ships a beta `DocumentExtractor` with a **NuExtract** VLM pipeline (`docling/models/extraction/nuextract_transformers_model.py`, `ExtractionModelType.NUEXTRACT`) — so the chain is supported in-library, not just in your glue code.

| Extractor | Size | Published number | Licence |
|---|---|---|---|
| `numind/NuExtract-2.0-2B` | 2B (Qwen2-VL base), text **+ image** | benchmark of ~1,000 diverse extraction examples vs 4B/8B and GPT-4o — [card](https://huggingface.co/numind/NuExtract-2.0-2B) (chart only; per-model values not in text) | **MIT** → yes |
| `numind/NuExtract3` | 4B, VLM + reasoning | **0.651** avg vs Qwen3.5-9B **0.479**, Qwen3.5-4B **0.417** on NuMind's ~600-document internal benchmark — [card](https://huggingface.co/numind/NuExtract3) (self-reported) | **Apache-2.0** → yes |
| `LiquidAI/LFM2-350M-Extract` | 0.35B, FR supported | "outperforms Gemma 3 4B at this task, a model more than 11× its size" on 5,000 documents / 5 metrics — [card](https://huggingface.co/LiquidAI/LFM2-350M-Extract) | **LFM1.0 — blocked above $10M revenue** |
| `Cactus-Compute/needle3` | 0.121B, `.cact`, own engine + WASM | grammar-constrained by construction; French weak (this lab's §4.6) | Apache-2.0 → yes |

### 3.6 Recipe (RTX 4070)

```bash
# A. standard pipeline, French OCR pinned, accurate tables, JSON with provenance
docling convert dossier.pdf --pipeline standard \
  --ocr --ocr-engine rapidocr --ocr-lang iso:fr --ocr-mode full_page \
  --tables --table-mode accurate --device cuda --num-threads 8 \
  --to json --to md --output ./out

# B. VLM A/B on the same file (granite-docling, ~0.6 GB VRAM at bf16)
docling convert dossier.pdf --pipeline vlm --vlm-model granite_docling --device cuda --to md --output ./out_vlm

# C. service + agent
docker run --gpus all -p 5001:5001 quay.io/docling-project/docling-serve-cu124   # then POST /v1/convert/source
uvx --from docling-mcp docling-mcp-server --transport stdio
```

Then feed `out/dossier.json` (text + table cells + provenance boxes) to the extractor — keeping **provenance** is what lets you show a human *where* a field came from, which is the difference between a demo and a claims tool.

**Timing**: the only published figures are §3.2 (CPU, OCR off). GPU per-page time on this 4070 is **not measured** — measure it before quoting it.

### 3.7 Failure modes

1. **A table that silently loses its rows** (#4255) — your extractor sees a header and no numbers and answers confidently. Add a positive marker: assert `n_rows ≥ 2` and that at least one cell matches `\d`.
2. **Default OCR language is Chinese** for RapidOCR, and `auto` picks a different engine per machine.
3. **granite-docling does not claim French** — for French scans prefer standard + RapidOCR/EasyOCR `fr`, and treat the VLM as a challenger you A/B, not the default.
4. **Born-digital tests prove nothing about OCR**: the previous paper's "OCR on the GPU" ran on a 2 KB ReportLab PDF with a full text layer (critique, `coverage-gaps`). Rasterise and degrade, or you have not tested OCR.
5. **Tables → prose gap**: extraction models want sentences; a Markdown table often needs flattening first.
6. **Memory/stability on long PDFs** (#2788, #3671) — cap pages per process, restart workers.

### 3.8 Proposed experiment **E3 — French claim documents, end to end**

- **Dataset**: **60 French documents** with gold key-values for 12 fields (contrat, assuré, date, péril, montant, IBAN, plaque, garage/SIREN, téléphone, adresse, franchise, tiers): 20 born-digital (ReportLab/Word, incl. 5 with a table crossing a page break), 20 the same pages rasterised at 150 dpi + 2-5° rotation + JPEG q40 + a stamp, 20 photos of printed *constats amiables* with handwritten fields (or **NOT TESTED** if the operator cannot shoot them). Tables in 25 of the 60.
- **Arms**: standard+RapidOCR(fr), standard+EasyOCR(fr), standard+Tesseract(fra), VLM granite_docling, plus one outside reference (`lightonocr` or `qwen` preset). Each feeding the *same* extractor (`NuExtract-2.0-2B`).
- **Metrics**: field-level normalised accuracy end to end; table **TEDS** on the 25; empty-table rate (the #4255 tripwire); wall-clock per page on the 4070; peak VRAM/RAM; failure count.
- **Pass bar**: field accuracy **≥ 0.90 born-digital**, **≥ 0.75 rasterised**; **empty-table rate 0**; **≤ 8 s/page** on the 4070; and every arm's result reproducible twice with the same hash.

---

## 4. Fine-tuning small models in 2026

### 4.1 Toolchain (all Apache-2.0, all checked 2026-09-21)

| Tool | Version / activity | Use it for |
|---|---|---|
| [Unsloth](https://github.com/unslothai/unsloth) | v0.1.811-beta, 2026-09-18, 76.5k★ | fastest single-GPU QLoRA + one-line GGUF export |
| [TRL](https://github.com/huggingface/trl) | v1.13.0, 2026-09-10 | SFT/DPO/GKD, the reference implementation |
| [Axolotl](https://github.com/axolotl-ai-cloud/axolotl) | v0.19.0, 2026-09-10 | YAML-declared runs, multi-GPU |
| [LLaMA-Factory](https://github.com/hiyouga/LlamaFactory) | v0.9.5, 2026-05-30 | GUI + breadth of methods |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | v0.4.1, 2026-09-14 | `convert_hf_to_gguf.py`, **`convert_lora_to_gguf.py`**, quantisation |

### 4.2 What fits in 12 GB

Unsloth's published table ([docs](https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements)):

| Params | QLoRA (4-bit) | LoRA (16-bit) |
|---|---|---|
| 3B | **3.5 GB** | 8 GB |
| 7B | **5 GB** | 19 GB |
| 8B | **6 GB** | 22 GB |
| 14B | **8.5 GB** | 33 GB |
| 27B | 22 GB | 64 GB |

→ On a 4070 12 GB: **QLoRA up to ~14B**, **LoRA-16bit up to ~3B**, with context length and batch eating the remainder. (These are Unsloth's figures, not measured here.)

### 4.3 How to configure LoRA so it is not a waste of a GPU-hour

From *LoRA Without Regret* (Schulman & Thinking Machines Lab, 2025) and its TRL reproduction ([blog](https://thinkingmachines.ai/blog/lora/), [TRL guide](https://huggingface.co/docs/trl/main/en/lora_without_regret)):

- Apply LoRA to **all linear layers** (`target_modules="all-linear"`), not attention only — "increasing the rank does not compensate for this restriction".
- **Rank 256 for SFT at post-training scale**; rank 1-32 suffices for RL.
- **Learning rate ≈ 10× full fine-tuning** (their SmolLM3-3B run: LoRA 1.0e-5 vs full-FT 1.0e-6).
- **Effective batch size < 32** — LoRA is less tolerant of large batches than full FT.
- Result: LoRA matches full fine-tuning at **~67% of the compute** in the "low-regret regime"; it falls behind on pre-training-scale datasets.
- Counterweight: *LoRA Learns Less and Forgets Less* (TMLR 2024) — at ~100K instruction pairs and ~20B-token continued pretraining in code/maths, LoRA **underperforms** full FT but **forgets less**, and full FT produces weight updates of rank **10–100×** typical LoRA ranks — [arXiv 2405.09673](https://arxiv.org/abs/2405.09673).

### 4.4 How much data actually moves tool-calling and extraction

| Evidence | Number |
|---|---|
| FunctionGemma-270M, Google's own eval | Mobile Actions **58% → 85%** after fine-tuning — [blog.google](https://blog.google/technology/developers/functiongemma/) |
| FunctionGemma-270M multi-turn, distil labs | Smart Home **38.82 → 96.71**, Banking **23.35 → 90.86**, Shell **9.90 → 96.04** (teacher 120B scored 92.11 / 96.95 / 97.03); the shell task used **5,000 synthetic examples generated from 20–100 seed conversations** — [distillabs.ai](https://www.distillabs.ai/blog/making-functiongemma-work-multi-turn-tool-calling-at-270m-parameters/) |
| APIGen / xLAM (NeurIPS 2024) | **60,000** three-stage-verified calls; xLAM-7B **88.24%** and xLAM-1B **78.94%** overall on BFCL; adding semantically incorrect data cost **−4.06%**, adding execution failures a further **−5.94%** — [arXiv 2406.18518](https://arxiv.org/pdf/2406.18518), [dataset](https://huggingface.co/datasets/Salesforce/xlam-function-calling-60k) (CC-BY-NC-4.0) |
| Distillation with rationales | *Distilling Step-by-Step*: a **770M** T5 beats few-shot **540B** PaLM using **80%** of the available data — [arXiv 2305.02301](https://arxiv.org/abs/2305.02301) |
| needle3 (this lab's own model family) | vendor guide: "a few hundred clean examples" for tool **selection**, "thousands" for argument **grounding**; include off-topic rows with `"answers": []` — "about one in eight" — [cactuscompute.com/blog/finetuning-needle](https://cactuscompute.com/blog/finetuning-needle) |

**Working rule**: ~1–5k task-specific, *verified*, *diverse* examples is the band where a sub-1B model goes from unusable to production for a **narrow, schema-fixed** task. Verification quality beats volume (the xLAM ablation is the cleanest published evidence of that).

### 4.5 Evaluation design — the part that silently invalidates everything

- **Held-out generator, not template twins.** If your eval is produced by the training generator with new names, you are measuring template recall. GSM-Symbolic shows how sensitive models are to *surface* changes alone: average drops of **0.3%–9.2%** just from changing names/numbers, and **up to 65%** when a distracting clause is added — [Apple ML research](https://machinelearning.apple.com/research/gsm-symbolic).
- **Score fields, not whole calls**; accept a resolved ISO date for a relative expression; never exact-match a free-text `reason` (make it an enum).
- **Report paired bootstrap CIs** for tuned-minus-base; with n=6 cases nothing below ~0.17 is resolvable (the v1 failure in this repo).
- **Include a control arm that isolates quantisation** from fine-tuning (see 4.6).
- **Prove the adapter loaded**: run training rows back through the tuned artefact and require high recall — a positive marker a broken pipeline cannot produce.

### 4.6 What the v2 needle3 experiment in this repo already does right

`/home/edu/Public/bizloop/slm/experiments/v2/` (`ft2_make_data.py`, `ft2_predict.py`, `ft2_score.py`, `ft2_pipeline.sh`) is, by construction, an answer to the v1 critique — worth reusing as the template for any fine-tune here:

- **Grounded labels only**: an assertion fails the build if any string label is not a verbatim span of the query (`check_grounded`) — the v1 set taught the model to invent `"collision"` in a sentence that never said it.
- **Disjoint train/eval phrasings, names, damage types and off-topic pools**, plus an assert on query overlap → a real held-out generator (4.5).
- **System-turn ablation**: half the rows carry a system turn; every condition is evaluated `sys` and `nosys`.
- **A zero-delta control arm**: an lr=0 adapter is exported to 4-bit so that "2-bit shipped → 4-bit export" can be separated from "fine-tuning" (`ft2_base4bit.cact`). This is the control v1 lacked, and it is what turns a delta into evidence.
- **Field micro-F1 + paired bootstrap CIs + slice tables**, not exact-match over 6 cases.
- **Measured here** (from `ft2_finetune.log`, `ft2_eval_stage.log`, 2026-09-21): training 1,200 rows × 4 epochs, rank 32, pad 640 took **9 min 37 s** on the RTX 4070 (JAX, `XLA_PYTHON_CLIENT_MEM_FRACTION=0.60` because the card is shared with the Windows host); inference over 240 eval cases took **110 s for the shipped 2-bit base (~0.46 s/case)**, **292 s for the 4-bit control (~1.22 s/case)** and **390 s for the 4-bit tuned model (~1.63 s/case)**. **The local 4-bit export is ~2.7× slower and ~1.8× larger (35 MB → 63.5 MB) than the shipped 2-bit artefact** — a real cost of local fine-tuning nobody quotes. *(The scoring stage was still running at the time of writing: `ft2_report.json` is empty. No accuracy delta is claimed here.)*
- Known constraint, from the vendor: **fine-tuning does not update the confidence head, so tuned weights report `confidence: None`** — a tuned needle cannot drive confidence-banded routing ([guide](https://cactuscompute.com/blog/finetuning-needle)).

### 4.7 Export to GGUF / wllama

```bash
# merge the adapter into the base, then convert and quantise (llama.cpp)
python convert_hf_to_gguf.py ./merged-model --outfile model-f16.gguf --outtype f16
llama-quantize model-f16.gguf model-Q4_K_M.gguf Q4_K_M
llama-gguf-split --split-max-size 512M model-Q4_K_M.gguf model     # wllama: 2 GB hard cap, 512 MB chunks
# adapters can also travel separately:
python convert_lora_to_gguf.py ./adapter --outfile adapter.gguf     # loaded with --lora in llama.cpp
```

- **wllama** exposes `lora_adapters: {path, scale}[]` in its load config ([types.ts:62](https://github.com/ngxson/wllama/blob/master/src/types/types.ts)) **but its README TODO still reads "Add support for LoRA adapter"** ([README](https://github.com/ngxson/wllama#todo)) → **UNVERIFIED** whether adapters load in the browser. **Merge before export** and ship one GGUF.
- Quantisation caveat: merging before quantising is the recommended order, and aggressive Q4 can shrink a small LoRA delta into rounding noise. A rigorous single study of "Q4 erases LoRA deltas" was **not found** (searched; nearest work is quantisation-aware adaptation such as [LoTA-QAF](https://arxiv.org/pdf/2505.18724) and [LQER](https://arxiv.org/pdf/2402.02446)) → **treat as a hypothesis and test it as an arm**, exactly like the zero-delta control in 4.6.

### 4.8 Failure modes

1. **Catastrophic forgetting** — mitigated but not eliminated by LoRA (4.3); always keep an out-of-domain control set.
2. **Overfitting a tiny set** — v1 here reached train loss 0.0019 and still failed rows it had memorised, because the *inference* prompt did not match the *training* prompt (system turn / reasoning field).
3. **Schema-keyed adapters** — this lab measured it: deleting three tool *descriptions* on unrelated tools reverted a tuned field to the base error, because every training prompt carried one byte-identical tools block (critique, `finetune-forensics`). **Randomise the schema during training** (order, wording, distractor tools) or your adapter silently dies on the next product change.
4. **Quantisation confound** — comparing a 2-bit base with a 4-bit tuned model changes two variables at once.
5. **Eval harness drift** — a different tools block in the evaluator than in training turned a real +0.155 gain into a "0.72 vs 0.72 tie" in v1.
6. **The metric can be pinned at zero**: v1 scored a correct refusal as a failure because the scorer ignored `suppressed_calls`.
7. **Losing an auxiliary head** (needle's confidence) — check what the fine-tune *removes*, not just what it adds.

### 4.9 Proposed experiment **E4 — a French claims extractor that survives its own export**

- **Base models (licence-clean only)**: `Qwen/Qwen3-4B-Thinking-2507` (Apache-2.0) and `HuggingFaceTB/SmolLM3-3B` (Apache-2.0, declares fr). Excluded: LFM2/LFM2.5 (revenue threshold), xLAM/Hammer (CC-BY-NC).
- **Data**: 2,000 rows from E2 (grammar-generated, business-rule-validated, 50/50 FR/EN, 12% off-topic, 10% incomplete→refuse), with reasoning lines and a randomised tools/schema block per row.
- **Eval**: the 100 human-written French items from E2 (**held-out generator**) + a 200-row out-of-domain control (general instruction following) for the forgetting check.
- **Arms**: base; QLoRA all-linear r=256, lr 1e-4 (≈10× full-FT), batch < 32; the same adapter merged and exported to **Q4_K_M GGUF**; and a **zero-delta quantised control**.
- **Metrics**: field micro-F1, exact-record match, refusal correctness, paired bootstrap 95% CI, p50/p95 latency and VRAM, artefact size.
- **Pass bar**: **+5 field-F1 or more over base with the 95% CI excluding 0** on the human-written French set; **≤ 2 points** degradation on the out-of-domain control; **≥ 98% of the tuned F1 retained after Q4_K_M export**; the Q4 artefact runs in wllama in the browser at **≥ 5 tok/s** (measure, do not assume); and training completes in **≤ 60 min on the 4070**.

---

## 5. Sequencing suggestion (what to do first)

1. **E1 (anonymisation)** — it is the gate for every other pilot that touches a third-party LLM, and it is the only one with a legal deadline attached. Two weeks.
2. **E2 (synthetic French claims)** — it unblocks E3's gold set and E4's training data. One week, mostly generation + validators.
3. **E3 (documents)** — needs the operator to photograph real constats; start the data collection now, in parallel with E1.
4. **E4 (fine-tuning)** — last, because it consumes E2 and is the easiest to invalidate with a sloppy harness.

Cross-cutting rule for all four, from this repo's CLAUDE.md and paid for twice already: **before believing a reading, ask what a failure would look like — if it looks identical to success, the reading is worthless.** Every experiment above therefore carries a positive marker the failing case cannot produce (an empty-table tripwire, a canary string, a zero-delta control arm, a train-recall assertion).

---

## Sources

All URLs accessed **2026-09-21**. Local package/version facts were read from `~/.venvs/slm` on the same date.

**Law and privacy**
1. EDPB, *Guidelines 01/2025 on Pseudonymisation* (adopted 16 Jan 2025) — https://www.edpb.europa.eu/system/files/2025-01/edpb_guidelines_202501_pseudonymisation_en.pdf
2. CJEU, *EDPS v SRB*, C-413/23 P, 4 Sep 2025, press release — https://curia.europa.eu/site/upload/docs/application/pdf/2025-09/cp250107en.pdf ; commentary — https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2025/09/pseudonymized-data-after-edps-v-srb.html
3. Staab et al., *Beyond Memorization: Violating Privacy via Inference with LLMs*, ICLR 2024 — https://arxiv.org/abs/2310.07298
4. Staab et al., *Large Language Models are Advanced Anonymizers*, ICLR 2025 — https://arxiv.org/abs/2402.13846

**Anonymisation tooling and models**
5. Presidio repo (now `data-privacy-stack/presidio`) — https://github.com/data-privacy-stack/presidio ; docs — https://presidio.dataprivacystack.org/anonymizer/ ; languages — https://github.com/data-privacy-stack/presidio/blob/main/docs/analyzer/languages.md ; phone regions — .../generic/phone_recognizer.py ; GLiNER recognizer — .../ner/gliner_recognizer.py ; LangExtract config — .../conf/langextract_config_basic.yaml
6. presidio-research (evaluation toolkit, MIT) — https://github.com/data-privacy-stack/presidio-research
7. GLiNER2-PII paper — https://arxiv.org/html/2605.09973 ; model — https://huggingface.co/fastino/gliner2-privacy-filter-PII-multi
8. `urchade/gliner_multi_pii-v1` — https://huggingface.co/urchade/gliner_multi_pii-v1 ; `nvidia/gliner-PII` — https://huggingface.co/nvidia/gliner-PII ; `knowledgator/gliner-pii-large-v1.0` — https://huggingface.co/knowledgator/gliner-pii-large-v1.0
9. `openai/privacy-filter` — https://huggingface.co/openai/privacy-filter ; `OpenMed/privacy-filter-multilingual` — https://huggingface.co/OpenMed/privacy-filter-multilingual
10. `LiquidAI/LFM2.5-Encoder-350M-PII-Detector` — https://huggingface.co/LiquidAI/LFM2.5-Encoder-350M-PII-Detector ; LFM Open License v1.0 text — https://huggingface.co/LiquidAI/LFM2-350M-Extract/raw/main/LICENSE
11. Meddies-PII paper — https://arxiv.org/html/2609.12544 ; model — https://huggingface.co/Meddies/meddies-pii-v2
12. HeyNeo PII shootout (2026-04-30) — https://heyneo.com/blog/pii-filter-model-eval
13. PIIBench — https://arxiv.org/pdf/2604.15776 ; SPY (NAACL-SRW 2025) — https://aclanthology.org/2025.naacl-srw.23/ , https://github.com/LogicZMaksimka/SPY_Dataset
14. OpenPII 1.5M — https://huggingface.co/datasets/ai4privacy/pii-masking-openpii-1.5m ; restrictive licence of pii-masking-400k — https://huggingface.co/datasets/ai4privacy/pii-masking-400k/raw/main/license.md
15. spaCy `fr_core_news_lg-3.8.0` — https://github.com/explosion/spacy-models/releases/tag/fr_core_news_lg-3.8.0 ; `flair/ner-french` — https://huggingface.co/flair/ner-french ; `Jean-Baptiste/camembert-ner` — https://huggingface.co/Jean-Baptiste/camembert-ner
16. French identifiers: NIR structure and key — https://fr.wikipedia.org/wiki/Num%C3%A9ro_de_s%C3%A9curit%C3%A9_sociale_en_France ; SIV plates — https://www.service-public.gouv.fr/particuliers/vosdroits/F17638 and https://www.plaques24.fr/blog/lettres-interdites-plaque-immatriculation/ ; Faker fr_FR providers — https://github.com/joke2k/faker/tree/master/faker/providers
17. GLiNER.js — https://github.com/Knowledgator/GLiNER.js ; GLiNER — https://github.com/urchade/GLiNER ; GLiNER2 — https://github.com/fastino-ai/GLiNER2

**Synthetic data**
18. llama.cpp GBNF / JSON-schema guide and limitations — https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md
19. wllama (grammar, response_format, 2 GB limit, LoRA TODO) — https://github.com/ngxson/wllama
20. XGrammar — https://arxiv.org/abs/2411.15100 , https://github.com/mlc-ai/xgrammar ; Outlines — https://github.com/dottxt-ai/outlines ; JSONSchemaBench — https://arxiv.org/abs/2501.10868
21. *Let Me Speak Freely?* (EMNLP 2024 Industry) — https://arxiv.org/abs/2408.02442
22. NeMo Data Designer — https://github.com/NVIDIA-NeMo/DataDesigner ; person sampling / fr_FR — https://github.com/NVIDIA-NeMo/DataDesigner/blob/main/fern/versions/latest/pages/concepts/person_sampling.mdx
23. `nvidia/Nemotron-Personas-France` — https://huggingface.co/datasets/nvidia/Nemotron-Personas-France ; Persona Hub — https://arxiv.org/html/2406.20094 , https://huggingface.co/datasets/proj-persona/PersonaHub
24. distilabel — https://github.com/argilla-io/distilabel ; SDV (BSL 1.1) — https://github.com/sdv-dev/SDV/blob/main/LICENSE ; SDMetrics — https://github.com/sdv-dev/SDMetrics ; mostlyai — https://github.com/mostly-ai/mostlyai ; synthcity — https://github.com/vanderschaarlab/synthcity
25. Anonymeter — https://github.com/statice/anonymeter , https://arxiv.org/pdf/2211.10459 ; *The DCR Delusion* — https://arxiv.org/abs/2505.01524 ; Carlini et al., *Quantifying Memorization* — https://arxiv.org/abs/2202.07646
26. Diversity: *Measuring Diversity in Synthetic Datasets* — https://arxiv.org/pdf/2502.08512 ; *Synthetic Eggs in Many Baskets* — https://arxiv.org/pdf/2511.01490
27. Insurance data: https://huggingface.co/datasets/bdr-ai-org/claims-synthetic-dataset , https://huggingface.co/datasets/bitext/Bitext-insurance-llm-chatbot-training-dataset

**Documents**
28. docling — https://github.com/docling-project/docling ; technical report — https://arxiv.org/html/2408.09869v5 ; docling-eval numbers — https://github.com/docling-project/docling-eval/tree/main/docs/evaluations
29. granite-docling-258M — https://huggingface.co/ibm-granite/granite-docling-258M
30. Open issues cited: #4255, #3671, #3329, #3033, #2788, #2673, #1635 — https://github.com/docling-project/docling/issues/<n>
31. docling-serve — https://github.com/docling-project/docling-serve , https://docling-project.github.io/docling/usage/api_server/ ; docling-mcp — https://github.com/docling-project/docling-mcp
32. OmniDocBench — https://github.com/opendatalab/OmniDocBench ; 2026 OCR-VLM round-ups (indicative only) — https://www.spheron.network/blog/best-open-source-ocr-vlm-self-host-gpu-cloud-2026/ , https://www.codesota.com/ocr/benchmark/omnidocbench
33. Extractors: https://huggingface.co/numind/NuExtract-2.0-2B , https://huggingface.co/numind/NuExtract3 , https://huggingface.co/LiquidAI/LFM2-350M-Extract

**Fine-tuning**
34. Unsloth VRAM table — https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements ; repo — https://github.com/unslothai/unsloth
35. *LoRA Without Regret* — https://thinkingmachines.ai/blog/lora/ ; TRL reproduction guide — https://huggingface.co/docs/trl/main/en/lora_without_regret
36. *LoRA Learns Less and Forgets Less* (TMLR 2024) — https://arxiv.org/abs/2405.09673
37. FunctionGemma — https://blog.google/technology/developers/functiongemma/ , https://developers.googleblog.com/a-guide-to-fine-tuning-functiongemma/ , https://huggingface.co/google/functiongemma-270m-it ; distil labs multi-turn results — https://www.distillabs.ai/blog/making-functiongemma-work-multi-turn-tool-calling-at-270m-parameters/
38. APIGen / xLAM — https://arxiv.org/pdf/2406.18518 , https://huggingface.co/datasets/Salesforce/xlam-function-calling-60k
39. *Distilling Step-by-Step* — https://arxiv.org/abs/2305.02301
40. GSM-Symbolic — https://machinelearning.apple.com/research/gsm-symbolic , https://github.com/apple/ml-gsm-symbolic
41. needle fine-tuning guide — https://cactuscompute.com/blog/finetuning-needle
42. Quantisation-aware adaptation (context for the Q4 hypothesis) — https://arxiv.org/pdf/2505.18724 , https://arxiv.org/pdf/2402.02446

**Local artefacts referenced** (not web sources)
43. `/home/edu/Public/bizloop/slm/phase1/FINDINGS.md` — phase-1 paper (several claims overturned)
44. `/home/edu/Public/bizloop/slm/critique/raw-findings.json` — 80 findings, lenses `coverage-gaps` and `finetune-forensics`
45. `/home/edu/Public/bizloop/slm/experiments/v2/` — `ft2_make_data.py`, `ft2_predict.py`, `ft2_score.py`, `ft2_pipeline.sh`, `ft2_finetune.log`, `ft2_eval_stage.log`
46. `/home/edu/Public/bizloop/slm/research/models/catalog-embedding-pii-doc.json`, `catalog-tools-extraction.json` — verified model catalogue (wllama compatibility, VRAM, licences)
