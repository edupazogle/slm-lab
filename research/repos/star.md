# Qwen-Applications/STAR — dossier (2026-09-21)

```
WHAT IT IS      Research-code release for an ICLR 2026 paper: a two-phase TRAINING RECIPE (CKD distillation + Sim-RL)
                that turns Qwen3-0.6B/1.7B/4B into function-calling specialists. Python only. No app, no UI, no runtime.
LICENCE         Apache-2.0 (LICENSE read, "Copyright 2026 Alibaba", no NOTICE file). Verdict: CONDITIONS (attribution +
                licence copy + state changes). Weights on HF are also tagged apache-2.0. Shipped DATA is CC-BY-4.0 upstream.
BEST TO TAKE    (1) the released weights star-lab/STAR-0b6 / STAR-1b7 as in-browser tool-calling models (need GGUF conversion,
                none published); (2) simrl.py — a 283-line continuous tool-call similarity scorer usable as an eval metric
                and RL reward in the lab.
BIGGEST RISK    Nothing here is runnable on one RTX 4070 as shipped: scripts hard-code 8 GPUs + Ray + vLLM + DeepSpeed and
                an 8B bf16 teacher (16.4 GB). No evaluation code, no tests, no CI; the data-prep script has broken paths.
SCORES          maturity 2 · code_quality 2 · chat_ux 1 · agentic 3 · mobile_pwa 1
RECOMMENDATION  Do NOT mine it for product code (there is none). Take the WEIGHTS for the wllama model shelf and vendor
                simrl.py into the SLM lab as the tool-calling metric/reward; treat CKD as a method to re-implement small.
```

Sources used throughout: local clone `/home/edu/.cache/slm-src/Qwen-Applications_STAR` (HEAD `ee32021`), `gh api`
(repo, commits, contributors, issues, releases, org), Hugging Face Hub API via `~/.venvs/slm/bin/python`, arXiv API
(`export.arxiv.org/api/query?id_list=2602.03022`). Anything not checked against one of these is marked UNVERIFIED.

---

## 1. What STAR actually is

**A paper's reproduction package, not a framework.** README.md:16 — "This repository contains the code and instructions
necessary to reproduce the experiments presented in the paper … accepted to ICLR 2026." The arXiv entry confirms it:
`2602.03022v2`, published 2026-02-03, updated 2026-02-24, comment "The paper has been accepted to ICLR 2026", authors
Jiliang Ni, Jiachen Pu, Zhongyi Yang, Jingfeng Luo, Conggang Hu, category cs.AI (arXiv API, fetched today).

Problem it addresses (arXiv abstract): transferring function-calling ability from a large model into "super-tiny" ones
(0.6B) without the overfitting / instability of plain SFT-distillation and without the sparse signal of binary RL rewards.

Two components, both really present in the repo:

| Phase | What it is | Where it lives |
|---|---|---|
| **CKD** — Constrained Knowledge Distillation | top-k forward KL against a teacher's top-k log-probs, plus a penalty on the probability mass the student puts on tokens **outside** the teacher's top-k ("suppress confidently incorrect predictions") | `0001-add-ckd.patch` (1,082 lines, a patch against OpenRLHF), driven by `scripts/train_ckd.sh` |
| **Sim-RL** — similarity-guided RL | GRPO-style RL where the reward is a continuous similarity between predicted and gold tool calls (ROUGE-L on string args, exact match on scalars, Jaccard-like normalisation) instead of 0/1 | `simrl.py` (283 lines), driven by `scripts/train_sim_rl.sh` |

Plus a data pipeline (`data_process/`, 2,098 lines) that normalises ToolMind / xLAM / ToolACE / Hammer into one
`{id, messages, tools}` schema, labels and stratifies it, rolls a teacher out over it with SGLang, and renders it through
the Qwen chat template into `{inputs, targets}` jsonl.

It is **not**: an agent framework, an inference runtime, a tool-execution loop, a chat UI, or anything JavaScript.
`find` shows 17 files total; zero `.ts/.js/.html`; no `package.json`, `pyproject.toml`, `setup.py`, tests or `.github/`.

### What it ships

| Artefact | Verified how | Notes |
|---|---|---|
| Code | local clone | 5 Python data scripts + `simrl.py` + 3 shell scripts + 1 OpenRLHF patch |
| Weights `star-lab/STAR-0b6` | HF API | 1 safetensors, 1,503,300,328 B (bf16); base `Qwen/Qwen3-0.6B`; `license:apache-2.0`; 44 downloads, 3 likes; last modified **2025-10-22** |
| Weights `star-lab/STAR-1b7` | HF API | 4,063,515,640 B; base Qwen3-1.7B; apache-2.0; 15 downloads |
| Weights `star-lab/STAR-4b` | HF API | 2 shards, 8.04 GB; base Qwen3-4B; apache-2.0; 10 downloads |
| Weights `star-lab/Teacher-8B` | HF API | 4 shards, 16.4 GB bf16; finetune of Qwen3-8B; apache-2.0; 18 downloads |
| GGUF / quantised builds | HF API `base_model:quantized:star-lab/STAR-*` → **empty** for all three; search "STAR-0b6" returns only the original | **None exist.** The model card's line "Ollama, LMStudio, MLX-LM, llama.cpp … have also supported STAR-0b6" is boilerplate copied from the Qwen3 card — UNVERIFIED and unsupported by any published artefact |
| Datasets on HF | HF API `list_datasets(author="star-lab")` → empty | No training set released; you must rebuild it |
| In-repo data | local | `example_messages.jsonl` 1,024 rows (xLAM sample); `data/hammer_messages.jsonl` 6,763 rows (irrelevance/refusal samples) |
| Eval code | `grep -rni "bfcl\|acebench"` over `*.py *.sh` → **0 hits** | The headline numbers cannot be reproduced from this repo |

### Reported results (their claim; not reproduced by me)

From `assets/main_results_table.png` ("Table 3", read by eye) and the STAR-0b6 model card:

| Model | BFCLv3 overall | ACEBench normal |
|---|---|---|
| Qwen3-0.6B (base) | 47.33 | 27.20 |
| **STAR-0.6B** | **51.70** | **53.00** |
| Qwen3-1.7B (base) | 54.70 | 51.60 |
| **STAR-1.7B** | **56.05** | **60.90** |
| Qwen3-4B (base) | 63.39 | 71.80 |
| **STAR-4B** | **65.24** | **74.10** |
| Teacher-8B | 67.74 | 72.70 |
| Qwen3-8B | 66.34 | 72.90 |

Critical reading: the BFCL gain is modest (+4.4 / +1.4 / +1.9 points); the large jump is on ACEBench for the 0.6B
(+25.8), i.e. the recipe mostly fixes a tiny model's *robustness/format* failures. Numbers are self-reported, single
table, no variance, no eval harness in the repo. Treat as a claim with a date.

---

## 2. Licence — read from the file, not the badge

- `LICENSE` (201 lines) is the verbatim Apache License 2.0. `diff` against `apache.org/licenses/LICENSE-2.0.txt` shows
  exactly two differences: a leading blank line and line 189 `Copyright 2026 Alibaba` in place of the placeholder.
- **No `NOTICE` file**, no third-party licence files, no per-file licence headers in any `.py`.
- GitHub API reports `Apache-2.0`. LICENSE was added in its own commit `b52f82d` (2026-02-04), same day as the initial commit.
- The patch modifies **OpenRLHF**, which is itself Apache-2.0 (`gh api repos/OpenRLHF/OpenRLHF` → `Apache-2.0`), pinned at
  commit `c1fc63a` (exists, dated 2025-08-01). The patch carries a personal author line (`From: peter <…@gmail.com>`,
  `0001-add-ckd.patch:2`), not an Alibaba address — cosmetic, but it is the only authorship metadata on the core algorithm.

**Verdict: `conditions`.** Copying code into a private product or an MIT-released one is allowed, provided:

1. Keep a copy of the Apache-2.0 licence text with the vendored files (§4a).
2. Keep the copyright notice — add a header such as `Copyright 2026 Alibaba — from github.com/Qwen-Applications/STAR @ee32021, Apache-2.0` (§4c; there are no headers to preserve, so add one).
3. **State changes** in every modified file (§4b) — this applies to a TypeScript port too; a port is a derivative work.
4. No NOTICE obligations (§4d) because upstream has none.
5. The repo as a whole can be MIT, but the vendored files **stay Apache-2.0**; say so in `THIRD_PARTY_LICENSES`.
   Apache-2.0 also carries a patent grant and its termination clause (§3) — harmless here.

**Data is a separate question.** `example_messages.jsonl` is a slice of `Salesforce/xlam-function-calling-60k`, which the
HF API reports as `license:cc-by-4.0`, `gated=auto`. `data/hammer_messages.jsonl` has ids `hammer-irrelevance-*`; the
likely source `MadeAgents/xlam-irrelevance-7.5k` is `cc-by-4.0` (source mapping UNVERIFIED — the repo names no dataset id
for it). CC-BY-4.0 permits reuse with attribution, but the repo's Apache LICENSE does **not** relicense that data and the
repo gives no attribution beyond one README sentence. Do not ship these files inside a product; use them in the lab with
attribution to Salesforce / MadeAgents. `Nanbeige/ToolMind` and `Team-ACE/ToolACE` are apache-2.0;
`tryumanshow/ToolACE-Qwen-cleaned` (the one the code actually loads, `format_data.py:507`) has **no licence tag**.

---

## 3. Architecture, from the source

```
example_messages.jsonl ─┐
HF datasets ─ format_data.py ─ labeling_messages.py ─ data_proportion.py ─┐      (RL prompts)
   (828)          (319)                (400)                              ├─ messages_to_trainset.py ─ rl_data.jsonl
data/hammer_messages.jsonl ───────────────────────────────────────────────┘            (50)
seed messages ─ teacher_rollout.py (501, SGLang, n=8, format-filter, md5 dedup) ─ messages_to_trainset.py ─ kd_data.jsonl

Phase 1  scripts/train_ckd.sh     → patched OpenRLHF train_ppo_ray: ppo_coef 0.0, kd_kl_coef 1.0, fkl, L1 coef 10, teacher 8B
Phase 2  scripts/train_sim_rl.sh  → patched OpenRLHF train_ppo_ray: group_norm (GRPO), reward = simrl.py, dynamic filtering
```

### 3.1 Sim-RL reward (`simrl.py`) — implemented, and I exercised it

Entry point `reward_func(queries, prompts, labels)` (`simrl.py:200`), OpenRLHF's custom-reward signature. Logic:

- Parse exactly one `<think>…</think>` then either `<tool_call>{json}</tool_call>` blocks or free text (`simrl.py:34-54`).
- **Hard −1** if: think tag count ≠ 1, JSON fails to parse, tool name not in the prompt's `<tools>` block, or any argument
  key not in that tool's schema (`simrl.py:88-101`, `226-253`).
- Otherwise reward ∈ [0,1]: bucket gold calls by name, greedily match each predicted call to its most similar gold call,
  score per argument — ROUGE-L F for strings, equality for scalars, `str()` equality for everything else — and normalise
  Jaccard-style by `|pred args| + |unmatched gold args|` (`simrl.py:113-176`). Text-reply turns score ROUGE-L vs gold.

I ran it on CPU with `rouge_score` **stubbed** (not installed in `~/.venvs/slm`; stub = difflib ratio, so string-arg values
below are illustrative, control flow is real):

```
exact          reward=+1.000 format=+1      halluc_param   reward=-1.000 format=-1
partial_arg    reward=+0.750 format=+1      halluc_tool    reward=-1.000 format=-1
missing_arg    reward=+0.500 format=+1      no_think       reward=-1.000 format=-1
text_instead   reward=+0.000 format=+1      bad_json       reward=-1.000 format=-1
```

So the README claim "fine-grained, similarity-based reward" is real. Weaknesses visible in the code: no type check of
values against the schema, no `required` check, nested dict/list args are all-or-nothing via `str()` (`simrl.py:131-132`),
greedy (not optimal) matching, and the `<think>` requirement means a model trained with it **always** emits reasoning
tokens — a latency cost that matters in a browser.

### 3.2 CKD loss (`0001-add-ckd.patch`) — implemented

- New Ray actor `TeacherModelActor` returns **top-k log-probs + ids** per position instead of full vocab
  (`patch:776-846`; `--kd_topk` default 100, `patch:88`).
- Loss (`patch:939-975`): forward KL over the teacher's top-k, `f_kl = Σ p_T (log p_T − log p_S)`; options `rkl` and an
  adaptive `akl` (head/tail split at cumulative 0.5, `patch:947-959`). The "constrained" part:

```python
# patch:962-975 — mass the student's top-m puts on tokens the teacher's top-k does not contain
matches = student_idx_expanded == teacher_idx_expanded
is_mistake_mask = ~matches.any(dim=-1)
mistake_prob_sum = (is_mistake_mask * student_logps_topk_vals.exp()).sum(-1)
kd_kl = kd_kl + self.args.kd_kl_l1_coef * mistake_loss        # coef 10.0 in scripts/train_ckd.sh:67
```

- Final loss mixes four terms (`patch:1012-1017`): `ppo_coef·actor + kl + kd_kl_coef·kd + op_kl_coef·on-policy-kl`.
  CKD run sets `ppo_coef 0.0` (`train_ckd.sh`), i.e. it is pure distillation executed inside the PPO trainer, with
  on-policy rollouts generated and then ignored — wasteful, but it is what they ran.
- The patch touches 12 OpenRLHF files (+525/−39). It only applies to commit `c1fc63a` (2025-08-01); OpenRLHF has moved on,
  so this is frozen to `vllm==0.11.0`, `torch==2.8.0`, `deepspeed==0.18.3`, `ray==2.48.0`, `sglang==0.5.2`,
  a prebuilt `flash-attn 2.8.1 cu12 / cp312` wheel (`requirements_uv.txt:39,56,203,221,239,259`) — 271 pinned packages.

### 3.3 Data pipeline — implemented, partly broken as shipped

Good ideas worth noting:
- `filter_on_simrl` (`format_data.py:454-492`) scores every gold label **against itself** with the reward function and
  drops anything < 0.99 — a cheap guarantee that every training label is parseable and schema-valid by the same code
  that will later judge the model. This is exactly the "instrument that can fail" check the lab should copy.
- `labeling_messages.py` tags each assistant turn `response / single / parallel / multi-step` + turn index;
  `data_proportion.py:147-211` greedy-samples to per-category minimum quotas. Simple, dependency-light (jsonlines, tqdm).
- `teacher_rollout.py`: n-sample rollouts, format-validated, md5-deduplicated (`:233-256`), incremental append-saves.
  Note it filters on **format only**, not correctness against the gold call — teacher mistakes go into the KD set.

Defects I verified:
| # | Where | Defect |
|---|---|---|
| 1 | `scripts/prepare_rl_data.sh:36` | calls `python ./messages_to_trainset.py` — the file is `data_process/messages_to_trainset.py`; the step fails. No `set -e`, so the script carries on silently |
| 2 | `prepare_rl_data.sh:36` vs `train_sim_rl.sh:18`, `train_ckd.sh:19` | writes `./data/trainset.jsonl`; trainers read `${ROOT_DIR}/rl_data.jsonl`. Never reconciled |
| 3 | `format_data.py:455` | `AutoTokenizer.from_pretrained("Qwen/Qwen3-14B/")` — `huggingface_hub.validate_repo_id` rejects the trailing slash (checked today); only works if a local dir of that name exists, i.e. on the authors' machine. It is on the unconditional path (`format_data.py:826`), so **every** `format_data.py` run hits it |
| 4 | README.md:85-86 | documents fields `inputs`/`outputs`; code writes `targets` (`messages_to_trainset.py:44`) and scripts pass `--label_key targets` |
| 5 | README.md:105 | "128 instances"; `wc -l example_messages.jsonl` = 1,024 (a commit titled "Correct sample count in README" exists, `b672e9f`, and it is still wrong) |
| 6 | README.md:73 | "We use the Qwen-8B model as the teacher" — actually `star-lab/Teacher-8B`, itself a finetune whose training is not described in the repo |
| 7 | `train_ckd.sh:39,53` | `--prompt_max_len 5120` passed twice (harmless) |
| 8 | three copies | `parse_generation` / `extract_tools_from_prompt` / `check_tool_calls_valid` duplicated in `simrl.py`, `teacher_rollout.py` (with a *different return type*: tuple vs bool, `teacher_rollout.py:92-115`) and the whole reward duplicated again as `compute_score` in `format_data.py:178-320` |

### 3.4 Process signals

- 12 commits total (`gh api …/commits`): initial drop 2026-02-04, 8 of 12 are README edits, last real change
  2026-04-23 "Fix args in sim-rl training script". 3 contributors (peterjc123 6, jn2707 5, YangZyyyy 1).
- 1 issue ever (#1 "Training data preprocessing", closed), 0 PRs, 0 releases, no `.github/` (404), no tests, no type
  checking config, no lint config. 65 stars / 2 forks.
- Org `Qwen-Applications` = "Qwen Business Unit", created 2025-12-22, `is_verified: false`, 18 public repos, all
  paper-code drops. It is **not** the `QwenLM` org. README attributes it to "Algorithm Platform Team, AI Hardware
  Division, Alibaba". Provenance is plausible (ICLR paper, consistent authors) but not platform-verified.
- Pattern: publish-and-leave research code. Five months without a commit. Expect no support.

---

## 4. Scores

| Axis | Score | Why |
|---|---|---|
| maturity | **2** | Paper artefact: 12 commits, no releases/tests/CI/eval code, idle since 2026-04-23; weights exist and are licensed, which is the only thing lifting it off 1 |
| code_quality | **2** | Readable, docstrings, some type hints — but triple-duplicated parser, broken paths in the only end-to-end script, hard-coded local tokenizer path, core algorithm delivered as a 1,082-line patch against a frozen third-party commit |
| chat_ux | **1** | There is no UI of any kind |
| agentic | **3** | Genuinely about tool calling and the reward/parse/validate logic is sound; but it is single-step next-action *training*, with no tool executor, no loop, no runtime |
| mobile_pwa | **1** | Nothing. (Indirect value only: a 0.6B tool-calling checkpoint small enough for wllama once converted) |

---

## 5. Liftable units

Honest framing: **this repo contains nothing for the Vite + React + TS chat app's source tree.** What is worth taking
is a model and lab code. Ordered by value.

### U1 — The weights: `star-lab/STAR-0b6` (and `STAR-1b7`) as browser tool-calling models  *(not in the git repo)*
- What: Qwen3-0.6B / 1.7B finetunes, apache-2.0 tag, bf16 safetensors 1.50 GB / 4.06 GB.
- Why it beats doing it fresh: reproducing it needs an 8-GPU node and a dataset nobody published. The weights are the product of the paper.
- Transplant: **moderate.** No GGUF exists (verified), so: `convert_hf_to_gguf.py` + `llama-quantize` on the lab box
  (CPU job, minutes; Qwen3 is a standard llama.cpp architecture — conversion of *these* checkpoints UNVERIFIED, not run
  under the no-long-jobs rule). Expected size by analogy with Qwen3-0.6B GGUFs: a few hundred MB at Q4/Q8 — UNVERIFIED
  until converted. Then host the GGUF, shard it for wllama, and feed tools through the Qwen3 Hermes-style template
  (`<tools>` in system prompt, `<tool_call>{json}</tool_call>` out — the exact format `simrl.py:20-26,62-85` parses).
- Caveats: always emits `<think>` (trained with a −1 penalty otherwise) → extra tokens per turn on a phone; en/zh only
  per model card; claims are self-reported — **run it through the lab's own tool-calling bench against plain
  Qwen3-0.6B before giving it a slot**; if the delta does not reproduce at Q4, drop it.
- Obligations: model licence apache-2.0 + base-model (Qwen3, apache-2.0) attribution in the app's model credits.

### U2 — `simrl.py` — continuous tool-call similarity scorer (283 LOC)
- Paths: `simrl.py`.
- Deps: `rouge_score` (pure Python, small), `torch` only for the final tensor wrap (`simrl.py:275-283`) — drop it and
  return floats and the file is dependency-light.
- Use in the lab: (a) **eval metric** for tool-calling and structured-extraction experiments — a partial-credit score
  separates "wrong tool" / "right tool, wrong arg" / "format broken", which a pass/fail metric hides; (b) **RL reward**
  for a single-GPU GRPO run (TRL `GRPOTrainer` wants `f(prompts, completions, **kw) -> list[float]`; adapter ≈ 20 lines,
  UNVERIFIED — not run); (c) **label sanity filter** (self-score ≥ 0.99, §3.3) for synthetic-data pipelines.
- Transplant: into the Python lab **easy** (copy file, add header, strip torch). Into the TS app **easy but low value**:
  only `parse_generation` + `check_tool_calls_valid` (~40 LOC) are useful client-side, as a guard that an SLM's tool call
  names a real tool and real parameters before execution. That is small enough that "port with attribution" and "write
  fresh" cost the same; port it and keep the header so the behaviour matches the model's training-time validator.
- Why better than fresh: it is the exact validator STAR models were optimised against, so using it at inference/eval
  time measures what the model was trained to satisfy. Fix on import: add `required`-param and type checks, replace
  `str()` equality on nested args with recursive comparison.

### U3 — `data_process/labeling_messages.py` + `data_process/data_proportion.py` (319 + 400 LOC)
- What: tag tool-calling conversations by shape and quota-sample a balanced set.
- Deps: `jsonlines`, `tqdm`; `transformers` tokenizer optional (`data_proportion.py:54-103` falls back to chars//3).
- Transplant: **easy** into the lab's synthetic-data tooling (both run standalone on the `{id,messages,tools}` schema;
  neither touches the broken tokenizer path). Value is moderate — it is ~100 lines of logic wrapped in ~600 of
  report printing — but it gives the claims-triage / extraction datasets the same balance discipline for free.

### U4 — `data_process/teacher_rollout.py` (501 LOC) — pattern, not code
- Best-of-n teacher rollouts with format validation + md5 dedup + resumable appends. Bound to `sglang.Engine` and its
  `ServerArgs` CLI (`:13-14,170,469`). On the 4070 the lab uses llama.cpp / an OpenAI-compatible endpoint, so lifting
  means replacing the engine: **moderate**, and at that point only `message_to_hash` and the validate-then-keep loop
  survive. Copy the idea; add a correctness filter it lacks.

### U5 — `0001-add-ckd.patch` CKD loss (≈85 LOC of real maths inside a 1,082-line patch)
- **Hard** to transplant: welded to OpenRLHF internals at one 2025-08 commit, Ray actors, DeepSpeed, vLLM colocations.
  The reusable part is `patch:925-1000`. For the lab, re-express it as a custom `compute_loss` over **pre-computed
  teacher top-k log-probs** (store top-100 ids+values per token offline, then train the student alone). That is a
  derivative of Apache-2.0 code — keep the attribution header. Only worth doing if the lab commits to a distillation track.

**Not liftable:** `format_data.py` (dataset-specific glue + broken path), the three `scripts/*.sh` (8-GPU constants),
`requirements_uv.txt` (271 pins for a CUDA 12 / cp312 training box).

---

## 6. What runs on one RTX 4070 12 GB

| Task | Fits? | Basis |
|---|---|---|
| Inference STAR-0b6 / 1b7 bf16 (transformers) | Yes | 1.5 GB / 4.06 GB weights (HF file sizes) |
| Inference STAR-4b bf16 | Marginal | 8.04 GB weights leaves < 4 GB for KV + activations; quantise instead |
| Inference Teacher-8B bf16 | **No** | 16.4 GB weights > 12 GB; needs 4-bit (GGUF/AWQ) — and then its top-k log-probs differ from the paper's teacher |
| `scripts/train_ckd.sh` as shipped | **No** | `--actor_num_gpus_per_node 8`, `--vllm_num_engines 8`, `--ref_num_gpus_per_node 8` (`train_ckd.sh:26-31`), colocated 8B teacher + student + vLLM, `ray start … --num-gpus 8` (README:138) |
| `scripts/train_sim_rl.sh` as shipped | **No** | same 8-GPU constants (`train_sim_rl.sh:24-29`); `prompt_max_len 5120`, 8 samples/prompt, batch 128 |
| Sim-RL on Qwen3-0.6B via TRL GRPO + LoRA with `simrl.py` as reward | Plausible — UNVERIFIED | 0.6B policy is small; nothing in the repo supports this path, you write the glue |
| Offline CKD (4-bit teacher dumps top-k once, student trains alone) | Plausible — UNVERIFIED | requires re-implementing U5; deviates from the paper (quantised teacher, no on-policy mix) |
| Data scripts U2/U3 | Yes (CPU) | no GPU needed |
| `teacher_rollout.py` | No as shipped | SGLang + bf16 8B; README example uses `--dp-size 8` (README:125) |

No VRAM or wall-clock figures are given anywhere in the repo or README; the paper's compute budget is UNVERIFIED (PDF not read).

### Fit with the lab's five themes
- **Tool-calling**: direct — candidate model (U1) + metric/reward (U2).
- **Structured extraction**: U2's scorer generalises: treat the target JSON record as one "tool call" and get per-field
  partial credit (ROUGE-L on strings, exact on numbers/enums). Useful for claims-triage field extraction evals.
- **Anonymisation**: no direct fit. A span-list target could be scored the same way, but purpose-built PII metrics are better.
- **Synthetic data**: U3 balance sampling, U4 rollout-dedup pattern, and the self-score label filter (§3.3).
- **Claims triage**: only via the extraction metric and, if tool routing is part of triage, the STAR checkpoints.

---

## 7. Red flags

1. **Publish-and-leave.** Last commit 2026-04-23; 8/12 commits are README edits; 1 issue ever; no releases. No one will fix anything.
2. **Headline numbers are not reproducible from the repo.** Zero evaluation code (`grep bfcl|acebench` → nothing in code); the training set is not published; the teacher's own training is undocumented.
3. **The documented end-to-end data script does not run** (§3.3 defects 1–3) and the README disagrees with the code on field names and sample counts (defects 4–6). README-accuracy is below average even for research code.
4. **Core algorithm shipped as a patch** against a 13-month-old OpenRLHF commit with 271 frozen pins including a CUDA-specific flash-attn wheel URL. Bit-rot is already certain.
5. **Redistributed gated data.** `example_messages.jsonl` contains 1,024 rows of the *gated* xLAM dataset (CC-BY-4.0) with no attribution file; `hammer_messages.jsonl` contains model-generated refusals from an unnamed model ("requires model rollout", `prepare_rl_data.sh:28`). Keep both out of any product bundle.
6. **Security posture of the training scripts**: `VLLM_ALLOW_INSECURE_SERIALIZATION=1` (`train_ckd.sh:23`, `train_sim_rl.sh:21`; pickle between Ray/vLLM workers), `trust_remote_code=True` when loading tokenizers (`teacher_rollout.py:465`, `data_proportion.py:327`), Ray bound to `0.0.0.0` in the README (`README.md:138`). Acceptable on an isolated cluster, **not** on the operator's shared workstation — bind Ray to 127.0.0.1 if ever run. No `eval`/`exec`/`subprocess`, no secrets, no telemetry, no network calls beyond HF downloads (grep verified; `ast.literal_eval` at `format_data.py:166` is the safe variant).
7. **Unverified org.** `Qwen-Applications` is not `QwenLM`, `is_verified:false`. Low risk given the ICLR paper trail, but do not describe the weights as "official Qwen".
8. **Model-card boilerplate**: "Ollama, LMStudio, … llama.cpp … have also supported STAR-0b6" and `max_new_tokens=32768` are lifted from the Qwen3 card; no quantised build exists. Context length "32,768" is the base model's, while training used `prompt_max_len 5120` + `generate_max_len 512` — long-context tool use is untested by the authors.
9. **Always-think behaviour** baked in by the −1 format penalty (`simrl.py:36-37,226-234`): on-device latency cost with no off switch proven.

---

## 8. Recommendation

- **Product (web/PWA/Android chat):** take **no source code** from this repo. Add `STAR-0b6` (and `STAR-1b7` for
  desktop-class devices) to the candidate list for the wllama tool-calling slot; convert to GGUF in the lab, benchmark
  against stock Qwen3-0.6B/1.7B at the same quantisation on the lab's own tool-calling set, and ship it only if the
  claimed delta survives Q4. Credit: "STAR-0b6 © Alibaba, Apache-2.0, arXiv:2602.03022; base model Qwen3-0.6B, Apache-2.0".
- **SLM lab:** vendor `simrl.py` (with header + stated changes) as the partial-credit metric for tool-calling and
  structured-extraction experiments and as the label sanity filter for synthetic data; optionally vendor U3. Treat CKD as
  a method to re-implement in ~100 lines if a distillation track is opened — the patch itself is not worth carrying.
- "Promising" is fair for the **idea and the checkpoints**; it is not fair for the **repository**, which is a thin,
  partly broken reproduction package.
