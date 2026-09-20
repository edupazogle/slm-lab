# phanii9/MeowLLM - deep-dive dossier

```
WHAT       A from-scratch 3.45M-parameter Llama-style decoder (PyTorch, ~2,800 LOC Python) plus a template-based synthetic-data generator,
           a rule gate and an eval harness, all for ONE toy persona (a cat that refuses every question). CLI chat only. No browser, no UI, no export.
LICENCE    MIT, (c) 2026 phanii9 (LICENSE read in full, 21 lines; no NOTICE, no third-party licence files). Verdict: YES - keep the copyright + permission notice.
TAKE       The *pattern* in meow/rules.py + meow/eval_cases.py + the generator loop in meow/generate_data.py: one shared rule gate used by both the
           data generator and the eval, with eval-prompt leak exclusion and an LLM-augmentation path behind the same gate. ~450 LOC of reusable Python.
RISK       It is a toy with no path to the product: no GGUF/ONNX/safetensors export, weights are a pickle loaded with weights_only=False, the
           "held-out" val set is 100% seen inputs, and the author's own CHANGELOG says the headline Colab/T4 numbers were never run.
SCORES     maturity 2 | code_quality 4 | chat_ux 1 | agentic 1 | mobile_pwa 1
RECOMMEND  Do not vendor anything into the web/PWA/Android app. Optionally lift the rules-gate + eval-harness pattern into the *training* side of
           a domain-SLM pipeline; for the model itself use an HF Llama/Qwen-family config so convert_hf_to_gguf.py and wllama work unchanged.
```

Evidence base: shallow clone at `/home/edu/.cache/slm-src/phanii9_MeowLLM` (HEAD `d267a6c`, 2026-04-06), GitHub API and Hugging Face Hub API
queried 2026-09-21. I ran two things on CPU, both under 10 s and without writing into the clone: `scripts/test_rules_smoke.py` (34/34 pass) and an
instantiation of `Meow(MeowConfig(vocab_size=1682))` (parameter count + a generate call on random weights). `pytest` is not installed in
`~/.venvs/slm`, so the 68-test suite was NOT run by me; GitHub Actions shows it green (section 3). Paths are relative to the repo root.

---

## 1. What it actually is

Not a browser demo, not a fine-tuning recipe, not a general SLM. It is an educational "character LM": a tiny transformer trained from random
init on 19,000 synthetic (input, output) pairs so that it can only ever speak as one cat. README.md:23:

> "MeowLLM is a ~3.5M parameter language model trained from scratch to speak as a single character ... No system prompt, no persona injection,
> no fine-tuning on top of a foundation model."

By design it cannot answer anything (README.md:50 "It won't answer your questions"), is single-turn (README.md:224) and has a 256-token context.

| Item | Value | Source |
|---|---|---|
| Parameters | 3,447,552 (verified: instantiated the model with vocab 1682) | `meow/model.py:171-203`; my run |
| Shape | 4 layers, d_model 256, 4 heads (head_dim 64), SwiGLU ffn 640, RMSNorm, RoPE base 10000, tied embeddings, no biases | `meow/model.py:29-38,100-164` |
| Vocab | 1,682 byte-level BPE (HF `tokenizers`), 5 special tokens `<pad><bos><eos><user><miso>` | `data/tokenizer.json`; `meow/tokenizer.py:45-54` |
| Chat format | `<bos><user>{input}<miso>{output}<eos>`, single turn | `meow/tokenizer.py:139-153` |
| Context | 256 tokens | `meow/model.py:35` |
| Data | 19,000 train / 1,000 val JSONL, 100% `source: template`, 15 categories | `data/*.jsonl`; my count |
| Runtime deps | `torch>=2.1.0`, `tokenizers>=0.15.0`; optional `anthropic`, `huggingface_hub` | `pyproject.toml:27-38` |
| Code size | `meow/` = 2,787 lines incl. docstrings (1,151 of them are `generate_data.py`, mostly hand-written slot banks) | `wc -l` |
| Docs size | ~2,560 lines of Markdown (README 342 + docs/ 1,788 + persona 138 + changelog 173 + contributing 119) for 2,787 lines of code | `wc -l` |

### Architecture map

```
persona.md (character bible, prose)
      |
meow/rules.py (426)  <---------------------------+  single gate: passes_filters(output, category)
      |                                          |
meow/generate_data.py (1151)                meow/eval_cases.py (242)
  CategorySpec slot banks x15                 38 held-out prompts, 5 checks + full gate
  default_compose(): [opener.] core [sensory][. redirect]
  dedupe + eval-prompt exclusion + gate
  optional AnthropicClient augmentation (same gate)
      |
data/train.jsonl, val.jsonl -> meow/tokenizer.py (186, BPE train + encode_chat)
      |
meow/dataset.py (124, -100 mask on user turn, pad to max_seq_len)
      |
meow/train.py (239, AdamW 3e-4, warmup+cosine, clip 1.0, fp32, best.pt/final.pt)   scripts/train_cpu.py (233, same loop + --resume/--max-minutes)
      |
meow/inference.py (134, torch.load -> generate(top-k 40, T 0.8) -> input() REPL)
```

There is no server, no HTTP API, no web page, no streaming, no tool use. The only "chat experience" is `input("you:  ")` (`meow/inference.py:81-98`).

---

## 2. Licence

`LICENSE` is the unmodified MIT text, "Copyright (c) 2026 phanii9" (LICENSE:1-21). `pyproject.toml:11` points at it, `CITATION.cff:11` says MIT,
and both Hugging Face repos declare `license: mit` (HF API, 2026-09-21). No NOTICE file, no vendored third-party code, no `third_party/` directory.

**Verdict: YES.** Code can be copied into a private product or one released as MIT. The only condition is the MIT one: keep
"Copyright (c) 2026 phanii9" and the permission notice in "all copies or substantial portions" - i.e. a header comment on lifted files or an entry
in a THIRD-PARTY-NOTICES file. No copyleft, no patent clause, no state-changes requirement.

Provenance check (because the README credits `arman-bd/guppylm` as the origin of the idea, README.md:306, and the module names match 1:1 -
`model.py`, `dataset.py`, `train.py`, `inference.py`, `eval_cases.py`, `generate_data.py`): I fetched those six guppylm files via `gh api` and
diffed them against MeowLLM's. `difflib.SequenceMatcher` ratios on stripped non-comment lines are 0.007-0.15 and the only identical long lines
are PyTorch idioms (`optimizer = torch.optim.AdamW(`, `self.apply(self._init_weights)`). **No copied code found**; the MIT grant is not tainted by
upstream. (Side note: guppylm's README says MIT but the GitHub API reports `license: null` and its tree has no LICENSE file - relevant only if
someone later wants guppylm's browser demo, see section 6.)

Data: the 20K dataset is generated by the repo's own templates (every row `source: template`, my count), so it carries the same MIT grant and no
third-party text. The LLM-augmentation path exists but was not used for the shipped data.

---

## 3. README claims vs the source

| Claim | Where | Verdict |
|---|---|---|
| ~3.45M params, 4L/256d/4h/SwiGLU 640/RMSNorm/RoPE/SDPA/tied | README.md:127-139 | TRUE. 3,447,552 measured; all components present in `meow/model.py`. |
| "68 automated tests" | README.md:66 | TRUE by count: `grep -c "def test_"` = 26 + 14 + 14 + 14 = 68. Not run by me (no pytest). CI: last 5 Actions runs all `success` (gh api, 2026-04-06). |
| CI on 3.10/3.11/3.12 incl. generator, tokenizer and a 20-step smoke train | README badge | TRUE, `.github/workflows/test.yml:13,40-59`. Better than most repos in this survey. |
| Loss masking on user turn | README.md:62 | TRUE, `meow/dataset.py:83-87`. |
| Generator and eval share one rules module | README.md:58,179 | TRUE, `meow/generate_data.py` and `meow/eval_cases.py:24-32` both import `meow.rules`. |
| Whole-phrase banned matching | README.md:58 | TRUE, `meow/rules.py:323-328`; smoke test 34/34 on my machine. |
| "bundled `checkpoints/best.pt` ... included in this release" | README.md:189, docs/model_card.md:158 | **FALSE for the git repo.** `.gitignore:34,37` excludes `checkpoints/` and `*.pt`; the v0.1.0 GitHub release has zero assets (gh api). The file exists only on HF (below). |
| "Pretrained weights published to Hugging Face" listed as *Unreleased/planned* | CHANGELOG.md:169 | STALE. `hunt3rx99/meowllm` exists: `best.pt` 13,799,709 bytes (= 3.45M x 4 B, fp32) + `tokenizer.json`, last modified 2026-04-08, **0 downloads**, 4 likes (HF API). |
| "Full training takes ~20 minutes on the free T4 tier" | README.md:88 | **UNVERIFIED BY THE AUTHOR.** CHANGELOG.md:154-161: "Only the smoke-trained checkpoint has been validated. Full-training numbers pending." and "Colab notebook untested on a real Colab instance". |
| 84.2% overall pass on held-out eval | README.md:191-197 | Plausible but unreproducible from the repo alone; it is for a 2,000-step CPU checkpoint, n=38 prompts, sampled at T=0.8 with no fixed seed in `chat_once` (`meow/inference.py:42-70`), so the number moves run to run. |
| Step counts | docs/model_card.md:112 vs :199 | INCONSISTENT. ":112 Epochs: 10 (≈23,750 steps at batch size 64)" is wrong: 19,000/64 = 296 steps/epoch -> 2,960. 23,750 is the batch-size-8 figure. Line 199 says "≈5,940 steps at batch size 32". `train.py:211` default is 64. |
| "initialisation scaled by depth ... residual projections get 1/sqrt(2*n_layers)" | `meow/model.py:191-197` comment | **NOT IMPLEMENTED.** The branch tests `hasattr(m, "_is_residual")` and nothing in the repo ever sets that attribute (`grep -rn _is_residual` -> one hit). I confirmed at runtime: 0 modules carry it. Every Linear gets std 0.02. Harmless at 4 layers; it is dead code that reads like a feature. |
| ONNX / browser | docs/faq.md:239-250, CHANGELOG.md:171 | NOT IMPLEMENTED, and the README does not pretend otherwise: "Yes, with ONNX or transformers.js, but neither is set up in the current repo." |

### The "held-out validation" is not held out

Measured on the shipped data (my script, `data/train.jsonl` + `data/val.jsonl`):

```
train rows 19000 | unique inputs 201 | unique outputs 6916
val rows 1000    | val inputs also in train: 1000/1000 | val outputs verbatim in train: 847/1000
```

The split is a random shuffle of one pool (`meow/generate_data.py:1131-1134`), and the pool has only 201 distinct user inputs. So `val_loss 0.476`
measures memorisation of slot fragments, not generalisation, and the only real generalisation signal is the 38-prompt suite. The FAQ admits the
generator is at its ceiling: "you saw ~11,700 duplicates in the 20K run" (docs/faq.md:157-158). For a domain SLM this is the key lesson NOT to
copy: split by *input* (or by template), never by row.

---

## 4. Repo health

- **History:** one commit on `main` (`d267a6c`, "initial release: MeowLLM v0.1.0", 2026-04-06T22:11Z). GitHub Actions nevertheless lists runs for
  four earlier SHAs the same evening (`31bf0b1`, `228080d`, `7b4be07`, `f6a0a36`), so history was squashed/force-pushed before release. Repo created
  2026-04-06T20:08Z, last push 22:11Z the same day: the whole public life of the code is ~2 hours. Nothing since (5.5 months).
- **People:** 1 contributor (`phanii9`, 1 contribution). 41 stars, 2 forks, 1 open issue ("Treat?", a joke), 0 PRs.
- **Authorship signal:** the tagline is "my cat vibe-coded this" (README.md:19) and docs/faq.md:158 addresses the reader as the person who ran
  the job ("you saw ~11,700 duplicates in the 20K run") - a chat-assistant reply pasted into docs. The code is coherent and runs, so this is
  LLM-assisted-but-working, not README-ware. It does explain the docs-to-code ratio (~0.9 : 1) and the stale/contradictory numbers.
- **Types/lint:** full type hints, `from __future__ import annotations`, ruff configured (`pyproject.toml:58-64`); no mypy/pyright.
- **No telemetry, no network calls** in the package except the optional `anthropic` client (`meow/generate_data.py:948-981`, lazy import, key
  from env) and `huggingface_hub` downloads in the notebooks. No secrets in the tree (`scripts/upload_to_hf.sh:21` requires `HF_TOKEN` from env).

---

## 5. Scores

| Axis | Score | Justification |
|---|---|---|
| maturity | 2 | v0.1.0, one squashed commit, one author, untouched since release day; author states the full training run and Colab path were never executed. |
| code_quality | 4 | Small, typed, readable, 68 tests + CI that smoke-trains end to end; docked for dead init code, fp32-only/no-KV-cache/pad-to-max inefficiencies and the pickle load. |
| chat_ux | 1 | `input()` REPL in a terminal (`meow/inference.py:81-98`); no streaming, no history, no UI of any kind. |
| agentic | 1 | None. Single-turn by design, no tools, no system prompt, model cannot follow instructions (README.md:222). |
| mobile_pwa | 1 | No web code at all; no ONNX/GGUF export; the only artefact is a PyTorch pickle. |

---

## 6. Relevance to the product (browser / on-device via wllama)

### Export path: none in the repo, feasible by hand

Grep for `gguf|onnx|wasm|safetensors|transformers|quantiz` over all `.py/.md/.sh/.ipynb` returns only the FAQ snippet and the roadmap line.
What would it take to get this checkpoint into wllama? My analysis from the source, **UNVERIFIED - nothing was converted or run**:

- The block is Llama-shaped (pre-norm RMSNorm, RoPE, SwiGLU, no biases, tied embeddings), so llama.cpp's `llama` architecture could host it.
- Two mismatches need a custom ~100-line `gguf-py` writer: attention uses a fused `qkv` Linear (`meow/model.py:104`) that must be split into
  `attn_q/k/v`, and the checkpoint is a dict `{"model_state_dict", "config", ...}` (`meow/train.py:70-75`), not an HF `config.json` +
  safetensors layout, so `convert_hf_to_gguf.py` will not accept it.
- RoPE rotates adjacent pairs `x[0::2], x[1::2]` (`meow/model.py:86-93`), which is llama.cpp's native "norm" RoPE layout, so Q/K should need
  no permutation - the opposite of HF Llama checkpoints. This is exactly the kind of detail that silently produces garbage if wrong; treat as a hypothesis.
- Tokenizer is GPT-2-style byte-level BPE from HF `tokenizers` (`meow/tokenizer.py:78-80`); GGUF would need `tokenizer.ggml.model=gpt2`, the
  merges, and a `tokenizer.ggml.pre` value llama.cpp recognises. The chat template would have to be written by hand for `<user>`/`<miso>`.
- At 3.45M params the F16 file is ~7 MB; quantisation is pointless (and 640 is not a multiple of 256, so K-quants would fall back anyway).

Conclusion: doable in a day, but the result is a cat that says "i do not know this word. is it food." That is a landing-page easter egg, not a
product model. If a from-scratch micro-model is ever wanted for the product, define it as an HF `LlamaConfig` from the start and the whole
conversion problem disappears.

The browser demo the operator may have been expecting lives in the **upstream** project, not here: `arman-bd/guppylm` ships `docs/index.html`,
`docs/model.onnx` and `tools/export_onnx.py` (gh api tree listing, 2026-09-21; 3,663 stars). Not reviewed in this dossier; note its missing LICENSE file.

### Training or fine-tuning a domain SLM on one RTX 4070 12 GB

- **From-scratch at this scale** is trivially within a 4070 (3.45M params, fp32, batch 64 x 255 tokens). The repo gives no measured GPU time
  (section 3), and I did not train, so no number is offered. For scale: my CPU-only forward pass generated 40 tokens at ~262 tok/s on random weights
  *without* a KV cache (`generate()` re-runs the full context every token, `meow/model.py:247-249`).
- **But a 3-15M from-scratch model cannot serve a domain assistant.** The author says so: it "can't conditionally follow instructions"
  (README.md:222) and is capped by hand-written slot banks (docs/faq.md:155-160). A domain SLM for the product means LoRA/QLoRA on an existing
  0.5-3B model that already has a GGUF path. **This repo contains zero fine-tuning code**: no PEFT, no HF `transformers`, no checkpoint loading of
  foreign weights, no mixed precision, no gradient accumulation, no packing. `train.py` would be rewritten, not reused.
- Inefficiencies that do not matter at 3M but would at 300M: every sample padded to `max_seq_len - 1` = 255 although mean output is 12 words
  (`meow/dataset.py:91-96`); fp32 only, no `autocast`; `num_workers=0`; tokenisation done per `__getitem__` every epoch; resume exists only in the
  side script `scripts/train_cpu.py:121`.

What IS transferable to a domain-SLM effort is the data discipline, below.

---

## 7. Liftable units

None of these go into the Vite + React + TypeScript app. They are Python, training-side. "Transplant difficulty" is therefore stated twice where it matters.

### 7.1 Shared rule gate + eval harness (the best thing here)
- **Paths:** `meow/rules.py` (426 LOC; the generic machinery is lines 28-38 and 299-427, ~140 LOC, the rest is cat vocabulary),
  `meow/eval_cases.py` (242 LOC; generic part lines 117-230, ~115 LOC), `tests/test_rules.py` (136), `scripts/test_rules_smoke.py` (102).
- **Deps:** stdlib only (`re`, `dataclasses`, `collections`).
- **What it is:** `passes_filters(output, category) -> (ok, reason)` used unchanged by the generator and by the eval, per-check pass rates, a
  `Counter` of failure reasons, and whole-phrase banned-phrase matching:
  ```python
  pattern = r"(?:^|(?<=\W))" + re.escape(phrase) + r"(?:$|(?=\W))"     # meow/rules.py:327
  ```
  so "i can hear the can" passes while "i can help you" fails. The 40-entry `BANNED_PHRASES` list (`rules.py:48-94`) is a usable starter
  list of assistant-speak tells for any persona model.
- **Transplant:** into a Python training pipeline - **easy** (copy two files, replace vocab tables). Into the TS app as a runtime persona/output
  guard for a small in-browser model - **easy**, ~60 lines of TS (one regex builder, three counters); a port, not a copy, so attribution is courtesy.
- **Why take it rather than write it:** it is already tested (26 + smoke 34 cases) and the edge cases are the value (word-boundary handling for
  phrases with apostrophes, short-reply exemption at <=6 words, exempt categories). Honest caveat: it is a keyword gate, not a quality metric;
  it cannot tell a good answer from a fluent wrong one.

### 7.2 Synthetic-data generator skeleton
- **Paths:** `meow/generate_data.py` lines 60-127 (CategorySpec + `default_compose`), 820-915 (round-robin sampling, dedupe on (input, output),
  eval-prompt exclusion, gate, rejection stats), 919-1073 (LLM augmentation: system prompt, `LLMClient` Protocol, `AnthropicClient`,
  `extract_json_array`, per-item gate). ~400 LOC without the slot banks. Tests: `tests/test_generate_data.py` (133).
- **Deps:** stdlib; `anthropic` lazily imported only if LLM augmentation is requested. No default model id is hardcoded (`:948-968`, reads
  `ANTHROPIC_MODEL`) - sensible.
- **Transplant:** **moderate** into a domain pipeline. The loop and the leak/dedupe/gate order are reusable; the slot-bank approach itself does
  not scale to a knowledge domain (201 inputs, duplicate wall at 20K), so realistically only the LLM-augmentation half (~150 LOC) survives, and the
  train/val split at `:1131-1134` must be replaced with a split by input.
- **Why take it:** the rejection-reason accounting and "LLM output goes through the same gate as templates" is the right shape and saves a day.
  It does not beat a purpose-built tool (distilabel, or plain batch calls + this gate) for volume.

### 7.3 Loss-masked single-turn SFT dataset
- **Paths:** `meow/dataset.py` (124 LOC), `meow/tokenizer.py:128-153` (`encode_chat` returning `output_start`).
- **Deps:** `torch`, `tokenizers`.
- **Transplant:** easy, but **low value**: the off-by-one reasoning is carefully commented (`dataset.py:70-87`) and tested, yet TRL's SFTTrainer
  (completion-only / assistant-only loss) does the same for any HF model with packing and multi-turn. Take only if a dependency-free loop is a goal.

### 7.4 Tiny Llama-style model file
- **Paths:** `meow/model.py` (282 LOC), `tests/test_model.py` (120).
- **Deps:** `torch>=2.1`.
- **Transplant:** easy to copy, **but do not**: it is a dead end for the stated goal because nothing downstream (llama.cpp, wllama,
  transformers.js) can load its checkpoint format. HF `LlamaForCausalLM(LlamaConfig(hidden_size=256, num_hidden_layers=4, ...))` gives the same
  network plus safetensors plus a supported GGUF conversion. As teaching material it is clean; as product code it loses to the library.

### 7.5 CI that smoke-trains the whole pipeline
- **Paths:** `.github/workflows/test.yml` (59 LOC), `meow/train.py:222-233` (`--smoke`, `--max-smoke-steps`).
- **Transplant:** easy. Generate 500 rows -> train tokenizer -> 20 optimiser steps -> assert artefacts exist, on CPU torch wheels, in every PR.
  Worth copying as a *pattern* for any training repo the operator starts; cheap insurance against a broken pipeline.

Not worth lifting: `meow/inference.py` (REPL), `meow/train.py` (plain fp32 loop), notebooks (untested per CHANGELOG.md:160), `scripts/upload_to_hf.sh`
(untested per CHANGELOG.md:159), `persona.md` and the slot banks (cat-specific), `assets/`.

---

## 8. Red flags

1. **Unsafe checkpoint format.** Weights are distributed as a Python pickle and loaded with `torch.load(..., weights_only=False)`
   (`meow/inference.py:30`, `scripts/train_cpu.py:121`), and the chat notebook downloads that pickle from a third-party HF account
   (`hunt3rx99/meowllm`, a different handle from the GitHub owner `phanii9`; linked from README.md:7-8) and loads it. Arbitrary code execution
   if that file is ever replaced. No safetensors variant exists. Do not run the chat notebook or `meow-chat` against the HF file on the dev machine;
   if the weights are ever wanted, load with `weights_only=True` in a sandbox and re-save as safetensors.
2. **Headline numbers not reproduced by the author.** "~20 minutes on T4" and the Colab path were never executed (CHANGELOG.md:154-161); the only
   measured result is a 2,000-step CPU run scored on 38 sampled prompts with no seed.
3. **Validation leakage** (section 3): 1000/1000 val inputs and 847/1000 val outputs appear verbatim in train.
4. **Docs contradict the repo**: "bundled checkpoint" that is git-ignored; planned-vs-published weights; three different step counts.
5. **Dead code presented as a feature**: depth-scaled residual init never fires (`meow/model.py:191-197`).
6. **Abandoned-on-arrival shape**: one squashed commit, two public hours of activity, nothing in 5.5 months, bus factor 1, HF model at 0 downloads.
7. **LLM-assisted authorship with pasted chat text** in docs (docs/faq.md:158). Not disqualifying - the code is tested and ran for me - but every
   prose claim needs checking against source, as above.
8. **Scope mismatch with the brief**: zero lines of JS/TS/HTML, no PWA, no server, no streaming, no export. "Promising" holds only for someone
   who wants a readable end-to-end toy-LM tutorial.

No telemetry, no eval/exec, no hardcoded secrets, no heavy dependency beyond torch. Nothing renders HTML.

---

## 9. Recommendation

- **For the web/PWA/Android chat product: take nothing.** There is no front-end, runtime, or export code to take.
- **For a future domain-SLM training repo (RTX 4070):** copy `meow/rules.py` + `meow/eval_cases.py` as the skeleton of a rule-gated data/eval
  loop (keep the MIT header), copy the CI smoke-train pattern, and fix the split-by-row flaw on day one. Use HF `transformers` + PEFT/TRL on a small
  GGUF-convertible base instead of `meow/model.py` / `meow/train.py`.
- **If a from-scratch micro-model demo in the browser is wanted as a landing-page curiosity**, look at upstream `arman-bd/guppylm` (ships an ONNX
  export and an HTML demo) rather than MeowLLM, and resolve its missing LICENSE file first.
