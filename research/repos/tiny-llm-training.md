# windshadow233/tiny-llm-training - deep-dive dossier

```
WHAT       1,851 lines of Python: one student's hand-written post-training loops (LoRA SFT -> reward model -> PPO-RLHF -> DPO on a 2.1B Chinese base; GRPO on Qwen2.5-1.5B-Instruct/GSM8K) plus a toy BPE. Companion code to a Chinese blog series. No pretraining, no distillation, no export, no UI.
LICENCE    NONE. No LICENSE/NOTICE/COPYING file in the tree, GitHub API `license: null`. All rights reserved -> verdict NO: nothing may be copied into a private or an MIT product. The BPE/ folder is itself copied, unattributed, from another unlicensed repo.
TAKE       Nothing as code. As READING: grpo_training.py (349 LOC) is a compact single-file GRPO loop; GRPO/cot_reward.py (77 LOC) shows rule-based reward shaping. Read, close the tab, use TRL / minimind.
RISK       Two of the six entry points crash as committed (rlhf.py NameError, grpo_testing.py KeyError); PPO reads "reward" from the trainable critic, not the frozen reward model; GRPO policy loss is unmasked. Learning from it uncritically teaches bugs.
SCORES     maturity 1 | code_quality 2 | chat_ux 1 | agentic 1 | mobile_pwa 1
RECOMMEND  Do not vendor, do not depend on. Irrelevant to the browser/PWA chat product. If the operator ever fine-tunes an SLM for the app: TRL (Apache-2.0) or minimind (Apache-2.0) for training, llama.cpp convert_hf_to_gguf.py (MIT) for the GGUF that wllama loads.
```

Evidence base: shallow clone at `/home/edu/.cache/slm-src/windshadow233_tiny-llm-training` (HEAD `dff9d2c`,
2025-12-12), GitHub REST API and Hugging Face Hub API queried 2026-09-21, two pages of the author's blog
fetched through WebFetch (a summarising model - numbers from it are marked as such). **Nothing was run**: no GPU
job, no training, no import of the modules. Every behavioural statement is from reading source unless marked
otherwise. Paths are relative to the repo root. The whole repo was read, every `.py` file, top to bottom.

---

## 1. Licence - read from the tree, not from a badge

| Check | Result | Source |
|---|---|---|
| `LICENSE*`, `NOTICE*`, `COPYING*` anywhere in the tree | none | `find . -iname 'LICEN*' -o -iname 'NOTICE*' -o -iname 'COPYING*'` -> empty |
| Licence statement in README | none | `README.md:1-9` (whole file; it is motivation + one blog link) |
| Licence header in any source file | none | all 18 `.py` files read |
| GitHub API | `"license": null` | `gh api repos/windshadow233/tiny-llm-training` |
| Companion blog | CC BY-NC-SA 4.0 on the blog *text* | blog category page footer (via WebFetch) |

**Verdict: NO.** Absence of a licence is not permission. Under default copyright the author keeps all rights;
GitHub's terms let you view and fork on GitHub, not copy into your own product. This holds equally for a product
kept private and one released as MIT - in the MIT case it is worse, because you would be granting downstream
rights you do not have. The blog's CC BY-NC-SA does not rescue the code: it covers the posts, it is
NonCommercial, and ShareAlike is incompatible with relicensing as MIT anyway.

The only clean route would be to ask the author to add a licence (single contributor, 19 of 19 commits - `gh api
.../contributors` -> `windshadow233 19` - so one person can grant it). It is not worth asking: see section 6.

### 1.1 Provenance problem inside the repo

`BPE/` is not original. GitHub code search for the comment strings in `BPE/main.py` finds an older repo,
`DolbyUUU/byte_pair_encoding_BPE_subword_tokenization_implementation_python` (created 2023-01-30, 19 stars,
**also no licence**), with:

- a `wiki_corpus.txt` of exactly **1,056,523 bytes** - identical to `BPE/wiki_corpus.txt` here (`wc -c`);
- `test.py` whose comments match `BPE/main.py` line for line: `# import the Wikipedia corpus used for training`,
  `# set the hyperparameter of vocabulary size`, `# create a BPE tokenizer object`,
  `# train BPE tokenizer with Wikipedia corpus` (`BPE/main.py:3,8,11,14`);
- a `BPE.py` opening with the same `# install and import libraries` line and the same BERT pre-tokenizer trick
  (`BPE/BPE.py:1,12`).

windshadow233 restructured the class (added `export_vocab` / `export_merges`, `BPE/BPE.py:99-111`) but gives no
credit anywhere. So even if this author added MIT tomorrow, `BPE/` would carry a third party's unlicensed code
and a 1 MB Wikipedia extract (Wikipedia text is CC BY-SA - attribution and share-alike, neither honoured here).

---

## 2. What it actually is

### 2.1 Shape

```
README.md            9 lines: "fine-tune a mini LLM on 24 GB VRAM", why, blog link. No usage, no results.
requirements.txt     7 pins: transformers~=4.52.4 torch~=2.7.1 datasets~=3.6.0 accelerate~=1.8.1 peft~=0.15.2 tqdm tensorboard
utils.py        66   MODEL_NAME / GRPO_MODEL_NAME constants, ANSI colour print, param counter, load_model (LoRA-aware)
sft_training.py 156  + SFT/dataset.py   47
rm_training.py   96  + RM/model.py      68  + RM/dataset.py   62
rlhf.py         229  + RLHF/model.py    52  + RLHF/utils.py  118  + RLHF/dataset.py 40
dpo_training.py 160  + DPO/dataset.py   75
grpo_training.py 349 + GRPO/cot_reward.py 77 + GRPO/dataset.py 53
grpo_testing.py  75
BPE/BPE.py      111  + BPE/main.py 17 + BPE/wiki_corpus.txt (1.0 MB, 9,999 lines)
                ----
                1,851 lines of Python total (wc -l)
```

No package, no `pyproject.toml`/`setup.py`, no `__init__.py`, no config files, no notebooks, no tests, no CI
(`gh api .../contents/.github` -> 404), 0 issues, 0 releases, 0 forks.

### 2.2 Training stages covered - claim vs. source

| Stage | In repo? | Evidence |
|---|---|---|
| Tokenizer training | Toy only. Character-level BPE with `</w>`, vocab 3,000, English Wikipedia sample. **Not connected to any model in the repo** - every training script uses the base model's own tokenizer. | `BPE/main.py:9`; `sft_training.py:42` |
| Pretraining | **No.** `grep -i pretrain` finds only `from_pretrained` calls. Blog part 0 is explanation only; the author says he lacks the compute (WebFetch summary of `/blog/12634/`). | grep; blog |
| SFT | Yes. LoRA (r=32, alpha=64, dropout 0.1) on `m-a-p/CT-LLM-Base`, dataset `shibing624/alpaca-zh`, max_length 256, batch 8 x 32 accumulation, lr 1e-4, 3 epochs, fp16 via accelerate. | `sft_training.py:22-32,58-63,77-80`; `SFT/dataset.py:8` |
| Reward model | Yes. Frozen base + a single bias-free `nn.Linear(hidden, 1)` value head; pairwise `-logsigmoid(v_chosen - v_rejected)` averaged over the tokens from the first differing position to the later EOS. Only the head trains. | `RM/model.py:16-17,40-51`; `rm_training.py:46` |
| RLHF (PPO) | Written, **cannot run as committed** (section 4.1). Actor = SFT LoRA, frozen ref, critic and reward both loaded from the RM checkpoint; per-token KL penalty 0.2, GAE lambda 0.95, clip 0.2, clipped value loss. | `rlhf.py:50-71,146-166`; `RLHF/utils.py:81-118` |
| DPO | Yes. Standard sigmoid DPO, beta 0.1, lr 1e-6, summed masked log-probs, chosen+rejected concatenated in one batch. The cleanest script in the repo. | `dpo_training.py:91-106`; `DPO/dataset.py:74-75` |
| GRPO | Yes. `Qwen/Qwen2.5-1.5B-Instruct` + LoRA r=64 on `openai/gsm8k`, group 16, 256+256 tokens, beta 0 (no ref model, no KL), three rule-based rewards. | `grpo_training.py:44-60,89-94,348`; `GRPO/cot_reward.py` |
| Distillation | **No.** `grep -i distill` -> nothing. | grep |
| Evaluation | One script, GSM8K accuracy + format rate, base vs. GRPO. **Cannot run as committed** (section 4.2). | `grpo_testing.py` |
| Merge / quantise / GGUF / ONNX export | **No.** `grep -iE "gguf|llama\.cpp|onnx|quantiz|merge_and_unload"` -> nothing. Output is a PEFT adapter directory. | grep |
| Inference / chat / serving | **No.** Only in-loop sample printing to the terminal. | `sft_training.py:116-145` |

The GitHub description says "24G 显存训练（微调）一个小型大语言模型" (train/fine-tune on 24 GB). The honest reading
is "fine-tune": there is no from-scratch training anywhere, and the README title itself says 微调.

### 2.3 Models, data, hardware

| Item | Value | Source | Licence of the thing itself |
|---|---|---|---|
| Base model (SFT/RM/PPO/DPO) | `m-a-p/CT-LLM-Base`, **2,134,509,568** params, `LlamaForCausalLM`, fp16, vocab 125,824, 32 layers, hidden 2048; tokenizer class `BaichuanTokenizer` (custom code -> `trust_remote_code`) | `utils.py:7`; HF Hub API + `config.json` / `tokenizer_config.json` | **no licence declared on the Hub card** (`license: None`) |
| Base model (GRPO) | `Qwen/Qwen2.5-1.5B-Instruct`, **1,543,714,304** params, vocab 151,936, 28 layers, 2 KV heads | `utils.py:8`; HF Hub API + `config.json` | apache-2.0 |
| SFT data | `shibing624/alpaca-zh` | `SFT/dataset.py:8` | cc-by-4.0 (Hub card) - note it is GPT-4-generated Alpaca data; upstream terms UNVERIFIED |
| Preference data (RM, PPO, DPO) | `OpenLLMAI/comparison_data`; RM uses rows 0-75,000, PPO and DPO rows 0-25,000 (overlapping the RM's training rows) | `RM/dataset.py:8`, `rm_training.py:29-30`, `rlhf.py:28-29`, `dpo_training.py:28-29` | **no licence declared** (`license: None`), 14 downloads |
| GRPO data | `openai/gsm8k` `main` | `GRPO/dataset.py:7` | mit |
| Hardware | "24G 显存" GPU borrowed from a lab; exact card **not stated** in README or the two blog posts fetched | `README.md:1,7` | - |
| Reported result | GSM8K accuracy 0.4314 -> 0.5610, strict-format rate 0.6088 -> 0.9121 after 400 GRPO steps | **blog only**, via WebFetch summary of `/blog/12877/`; not in the repo, not reproduced, UNVERIFIED | - |

Would it fit the operator's RTX 4070 12 GB? **UNVERIFIED - nothing was run.** My arithmetic only: the PPO
script holds four 2.1B fp16 models at once (actor, ref, critic, reward - `rlhf.py:50-68`) = ~4.3 GB x 4 = ~17 GB
of weights before activations, so PPO does **not** fit 12 GB. GRPO holds one 1.5B model (~3.1 GB) but scores a
16 x 512-token group in one forward (`grpo_training.py:193`): the logits alone are 16 x 512 x 151,936 x 2 B =
~2.5 GB, and `log_softmax` materialises a second copy (`:133`) - tight on 12 GB, plausible with a smaller group.
SFT/DPO with LoRA at length 256 should fit. All scripts hard-code `mixed_precision="fp16"`, not bf16.

---

## 3. Code-quality facts

Measured by parsing every file with `ast` (in memory, nothing written to the clone):

- 87 functions/methods; **4** carry any type annotation; **2** docstrings in the whole repo (`RLHF/utils.py:5-14,82-88`).
- 0 tests, 0 CI, 0 linters configured, 0 `__init__.py`. Packages work only as implicit namespace packages, and only
  when the scripts are launched from the repo root; `BPE/main.py:1` (`from BPE import BPE`) works only from inside `BPE/`.
- No CLI for GRPO: hyper-parameters are class attributes (`grpo_training.py:44-60`) and the training **runs at import
  time** - module-level code at `grpo_training.py:341-349`, no `if __name__ == "__main__"`. `grpo_testing.py:42-75` likewise.
- Paths between stages are hard-coded strings: `'model/sft'` (`rlhf.py:50,59`; `dpo_training.py:50,58`),
  `'model/reward_model'` (`rlhf.py:64,68`), while `--output_dir` is a CLI flag on the producing side - change one and the chain breaks.
- Duplication: `RM/model.py` and `RLHF/model.py` define two different classes both named `RewardModel` with the same
  `__init__`/`save_pretrained`/`from_pretrained` bodies; the three preference datasets repeat the same `build_inputs`;
  the 25-line "print a coloured sample" block is pasted into `sft_training.py:116-145`, `rlhf.py:184-218`, `dpo_training.py:120-150`.
- `RewardModel.from_pretrained` loads the 2.1B base **twice**: `cls()` pulls `MODEL_NAME` from the Hub cache
  (`RLHF/model.py:11-15`), then line 38 replaces it with the checkpoint. PPO does this for two instances.
- `from RLHF.utils import *` (`rlhf.py:13`) is how `torch` reaches `rlhf.py` - the file never imports it, yet uses
  `torch.clip`, `torch.min`, `torch.inference_mode` (`:159-166,194`). It works by accident of a star import.
- Prompt format is a bare `指令:{instruction}\n输出:` with the **BOS token used as the prompt/response separator**
  (`SFT/dataset.py:21-27`), not a chat template. Fine for a lab exercise; it produces a model no chat runtime's
  template (llama.cpp / wllama included) would drive correctly.

Commit history (`gh api .../commits`, 19 total, single author): 18 commits in 28 days, 2025-06-24 -> 2025-07-22, under
the git name "Eric Fan", with messages like `debug`, `debug`, `some modification`, `去掉了冗余代码`; then nothing for
~5 months until a one-line README link fix on 2025-12-12. That last push is what makes the repo look recent. The
code has been untouched for 14 months.

---

## 4. README / blog claims checked against the source - the bugs

These were found by reading; none was executed. Each is stated with what would happen and why.

### 4.1 `rlhf.py` raises `NameError` on the first training step

```python
rlhf.py:42      # writer = SummaryWriter(log_dir='runs/rlhf')
rlhf.py:179     writer.add_scalar('RLHF/Actor-Loss', loss_actor.item(), global_step)
```

`writer` is never otherwise defined (`grep -n writer rlhf.py` -> lines 42, 179-182 only; `RLHF/utils.py` exports no such
name). The commit that commented it out is `4f390b4`, 2025-07-16, "去掉了冗余代码" ("removed redundant code") - its patch
shows `-    writer = ...` / `+    # writer = ...`. That was the last commit ever to touch `rlhf.py`, so the PPO stage
has been broken at HEAD since then. Lines 179-182 sit outside any `step % N` guard: it fails on step 1, after four
2.1B models have been loaded.

### 4.2 `grpo_testing.py` raises `KeyError` on the first sample, and points at a directory the trainer never writes

```python
GRPO/dataset.py:50-53    return {'prompt': prompt, 'answer': str(answer)}
grpo_testing.py:56-57    input_ids = data['input_ids'].cuda()
                         attention_mask = data['attention_mask'].cuda()
```

Commit `e4d6903` (2025-07-22) removed `input_ids`/`attention_mask` from the dataset's return value; `grpo_testing.py`
was last touched in `c9cb5e6` two days earlier and never updated. Separately, it loads `'model/grpo'`
(`grpo_testing.py:46`) but the trainer saves only to `model/grpo/checkpoint-{step}` (`grpo_training.py:335-338`), so
`load_model` would find neither `adapter_config.json` nor a model config there. The blog's 0.43 -> 0.56 numbers
therefore came from a version of the code that is not the one published.

### 4.3 PPO never consults the frozen reward model

```python
RLHF/utils.py:61-62   value_old = model_critic(generated_ids, attention_mask=generated_attention_mask)
                      reward = model_reward.get_reward(generated_ids.to(reward_device), values=value_old.to(reward_device))
RLHF/model.py:42-45   def get_reward(self, input_ids, attention_mask=None, values=None):
                          if values is None: ... values = self(input_ids, attention_mask)
```

Because `values=value_old` is passed, `get_reward` skips its own forward pass and just indexes the **critic's** value at
the EOS position. At step 0 critic and reward model are identical copies, so it is numerically harmless; from the first
critic update onward the "reward" is whatever the trainable critic says. The critic is trained toward
`adv + value_old` (`rlhf.py:163`), so the reward signal is self-referential and can drift. The frozen `model_reward`
costs ~4.3 GB of VRAM and is never run. Anyone learning PPO from this file learns a broken reward path.

### 4.4 GRPO policy loss is not masked

```python
grpo_training.py:234   loss = - torch.min(ratio * advantages, ratio_clip * advantages)
grpo_training.py:235-239   if self.model_ref is not None: ... kl uses action_mask ...
grpo_training.py:240   loss = loss.sum(1) / action_mask.sum(1)
```

`action_mask` is applied to the KL term only, and with the default `beta = 0.0` (`:51`) that branch is dead. The
surrogate term is summed over all 256 response positions, including every pad position after EOS, then divided by the
count of real tokens. Pad positions have ratio ~1 and a non-zero gradient (`adv * d log p(pad)`), so short answers with
positive advantage push up pad-after-pad probability, scaled by how much padding they have. It also divides by zero if
a sample's first generated token is EOS. TRL's `GRPOTrainer` masks and guards the same reduction -
`((per_token_loss * mask).sum(-1) / mask.sum(-1).clamp(min=1.0)).mean()` (`trl/trainer/grpo_trainer.py:3205` on main,
2026-09-21; the file is ~3.2k lines) - this file does neither.

### 4.5 Smaller ones

- `RM/model.py:40` - `(chosen != rejected).nonzero(...)[0][0]` raises `IndexError` when a chosen/rejected pair is identical
  after truncation to 256 tokens (long shared prompt). No guard.
- RM trains on rows 0-75,000 and PPO/DPO draw prompts from rows 0-25,000 of the same dataset: the policy is optimised
  against a reward model on that model's own training prompts. No held-out split, no RM accuracy metric.
- `sft_training.py:148` calls `model.half().save_pretrained(...)` on the PEFT wrapper: it saves the adapter, not a merged
  model. There is no `merge_and_unload` anywhere, so nothing in this repo produces a checkpoint that
  `convert_hf_to_gguf.py` could take directly.
- `grpo_training.py:256` - `torch.cuda.empty_cache()` after every micro-step: a throughput cost, a symptom of fighting the 24 GB limit.
- Evaluation samples at temperature 1.0 (`grpo_testing.py:18`), single run, no seed anywhere in the repo - the
  reported accuracy is one noisy draw.

---

## 5. Security / hygiene

| Item | Finding |
|---|---|
| Secrets, tokens, keys | none (`grep -iE "api_key|token=|http"` -> only the README blog URL) |
| Telemetry / network calls | none of its own; only `datasets.load_dataset` and HF `from_pretrained` (the latter with `local_files_only=True` for tokenizers) |
| `eval` / `exec` / `subprocess` / `os.system` | none. A commented-out import of a non-existent `GRPO.pot_reward.run_code_from_text` (`grpo_testing.py:5`) shows a code-executing reward was tried and not published |
| `trust_remote_code=True` | 12 occurrences. Needed for CT-LLM's `BaichuanTokenizer`; **not** needed for Qwen2.5 or for the Llama-architecture model weights, but passed everywhere (`utils.py:55,63`). Executes whatever Python the model repo ships |
| `torch.load` without `weights_only` | `RM/model.py:66`, `RLHF/model.py:37` - pickle load of `v_head.pt`. Under the pinned torch 2.7 the default is `weights_only=True`, so safe as pinned; unsafe if run on torch < 2.6 |
| Dependencies | 7, all mainstream, all `~=` pinned to mid-2025 versions. No lockfile |
| Web-facing code | none - there is no HTML/JS in the repo, so no XSS surface |

---

## 6. Scores

| Axis | Score | One-line justification |
|---|---|---|
| maturity | **1** | 3 stars, 0 forks, 1 author, 28 days of work then dormant 14 months; 2 of 6 entry points crash at HEAD; no release, no tests, no CI. |
| code_quality | **2** | Readable and short, DPO and the GAE helpers are correct and clear - but copy-paste everywhere, hard-coded cross-stage paths, import-time training, star-import dependency, and two algorithm-level bugs (4.3, 4.4). |
| chat_ux | **1** | There is no chat, no inference script, no UI; output is coloured `print` inside training loops. |
| agentic | **1** | No tools, no function calling, no agent loop; the one code-execution reward was not published. |
| mobile_pwa | **1** | Pure PyTorch/CUDA training scripts; no web, no WASM, no GGUF export, no quantisation. Nothing touches the product's stack. |

---

## 7. Liftable units

**None.** Two independent reasons, either sufficient:

1. **Legal:** no licence (section 1). Copying any file, or a "lightly edited" version of one, is infringement.
2. **Fit:** the product is a Vite + React + TypeScript chat app running GGUF models through wllama. This repo is
   Python/CUDA training code. There is no file here that a browser app could execute; "transplant difficulty" is not
   easy/moderate/hard, it is not-applicable. The nearest the two worlds meet is "fine-tune a model -> merge LoRA ->
   convert to GGUF -> quantise -> ship to wllama", and this repo stops before the second arrow.

What is worth **reading** (ideas are not copyrightable; do not paste, do not port line-by-line):

| Read this | LOC | What you learn | Caveat |
|---|---|---|---|
| `grpo_training.py` | 349 | The whole GRPO loop on one screen: sample a group of 16, rule rewards, group-normalised advantage (`:204-208`), replay buffer sized to one optimiser step (`:305-330`), clipped surrogate. Easier to follow than TRL's ~3.2k-line trainer. | Loss masking bug (4.4); read TRL's `grpo_trainer.py` beside it. |
| `GRPO/cot_reward.py` | 77 | Reward shaping for "`<think>`...`</think>` `<answer>`...`</answer>`": partial credit per tag, -0.5 per duplicate tag (`:21-48`), +0.5 for a pure-number answer, +2.0 for correct (`:51-67`). Useful if the operator ever RL-tunes an SLM to emit a strict output format (e.g. tool-call JSON). | Same recipe is in Unsloth's and TRL's GRPO GSM8K examples under Apache-2.0. |
| `RLHF/utils.py:81-118` | 38 | Per-token KL-shaped reward, TD delta, GAE written as three tiny functions. Correct as far as I can tell by reading. | The caller wires the reward wrongly (4.3). |
| `dpo_training.py:91-106` | 16 | DPO in 16 lines - concatenated chosen/rejected batch, masked sum of log-probs, `-logsigmoid(beta * diff)`. | Nothing here TRL's `DPOTrainer` does not do. |

What the operator can take away as lessons rather than code:

- Post-training a 1.5-2B model with LoRA is a single-GPU, few-hundred-line job; the hard parts are data and evaluation,
  and this repo has neither a held-out set nor a seeded eval.
- A rule-based reward + GRPO is the cheapest way to force an output **format** onto a small model (blog reports strict-format
  rate 0.61 -> 0.91 in 400 steps; UNVERIFIED, see 2.3). That is the one idea with a plausible line to the product: an
  on-device SLM that reliably emits a tool-call or JSON schema.
- Four-model PPO is the wrong tool on consumer VRAM; DPO or GRPO with beta=0 needs one or two models.

---

## 8. Licensed projects that cover the same ground (all verified to exist today via `gh api repos/<name>`)

| Need | Project | Licence (API `spdx_id`) | Stars / last push | What it has that this repo lacks |
|---|---|---|---|---|
| SFT, reward model, DPO, GRPO, KTO, RLOO, distillation (GKD, MiniLLM under `trl/experimental/`) | `huggingface/trl` | Apache-2.0 | 19,348 / 2026-09-20 | `trl/trainer/{sft,reward,dpo,grpo,kto,rloo}_trainer.py` verified present. Note: **no `ppo_trainer.py`** in `trl/trainer/` or `trl/experimental/` today - for PPO use the next two rows. Tests, CI, PEFT integration, vLLM rollouts. |
| Every stage from scratch in small readable files, 26M-scale models, Chinese: tokenizer -> pretrain -> SFT -> LoRA -> DPO -> PPO -> GRPO -> distillation | `jingyaogong/minimind` | Apache-2.0 | 61,837 / 2026-09-20 | `trainer/train_{tokenizer,pretrain,full_sft,lora,dpo,ppo,grpo,distillation,agent}.py` verified present. This is the direct, licensed superset of tiny-llm-training - same audience, same language, actually covers pretraining and distillation. |
| Pretrain -> mid-train -> SFT -> RL -> chat web UI in one repo | `karpathy/nanochat` | MIT | 58,176 / 2026-09-07 | End-to-end including tokenizer and a served chat UI. |
| Pretraining only, minimal | `karpathy/nanoGPT` | MIT | 63,259 / 2025-11-12 | The canonical ~300-line GPT trainer. |
| BPE tokenizer, educational | `karpathy/minbpe` | MIT | 10,730 / 2024-07-01 | Byte-level BPE + regex split + GPT-4 tokenizer reproduction, with tests. Replaces `BPE/` outright. |
| BPE tokenizer, production | `huggingface/tokenizers` | Apache-2.0 | 11,050 / 2026-09-20 | Rust, what every model here already uses. |
| PPO / RLHF at scale | `OpenRLHF/OpenRLHF` | Apache-2.0 | 10,020 / 2026-09-17 | Ray + vLLM PPO, REINFORCE++, GRPO. Note the preference dataset this repo uses is from the same org (`OpenLLMAI`). |
| GRPO in a few hundred lines | `lsdefine/simple_GRPO` | Apache-2.0 | 1,709 / 2025-11-21 | Same "one file GRPO on Qwen2.5 + GSM8K" idea, licensed. |
| GRPO "R1-zero" reproduction on small models | `Jiayi-Pan/TinyZero` | Apache-2.0 | 13,237 / 2026-02-27 | Countdown/multiplication tasks, 0.5-3B models. |
| Low-VRAM LoRA SFT/DPO/GRPO (fits 12 GB) | `unslothai/unsloth` | Apache-2.0 | 76,497 / 2026-09-20 | 4-bit QLoRA kernels, GSM8K GRPO notebooks, **direct GGUF export** - the piece the product needs. |
| Config-driven fine-tuning | `hiyouga/LlamaFactory` | Apache-2.0 | 74,929 / 2026-09-14 | SFT/RM/PPO/DPO/KTO behind YAML + web UI. |
| HF checkpoint / LoRA -> GGUF | `ggml-org/llama.cpp` | MIT | 128,971 / 2026-09-20 | `convert_hf_to_gguf.py`, `convert_lora_to_gguf.py` verified present at repo root. The bridge to wllama. |
| Book-style from-scratch LLM | `rasbt/LLMs-from-scratch` | API says `NOASSERTION`; `LICENSE.txt` opens with the Apache-2.0 text - read the whole file for added terms before copying (UNVERIFIED beyond line 12) | 105,299 / 2026-09-17 | Pretrain + SFT + DPO chapters with tests. |

Star counts and push dates are from the GitHub API on 2026-09-21.

---

## 9. Red flags, in order of weight

1. **No licence** - cannot be copied. Full stop for a "take the code with attribution" strategy.
2. **Unattributed third-party code and data inside it** (`BPE/`, section 1.1) - so a future licence grant by this author would not cover the whole tree.
3. **Broken at HEAD**: `rlhf.py` (NameError) and `grpo_testing.py` (KeyError + wrong path). The published numbers come from code that is not what is published.
4. **Algorithm-level errors** in the two RL loops (reward read from the critic; unmasked GRPO loss). For a repo whose only value is pedagogical, this is the serious one.
5. **Dormant**: real work ended 2025-07-22; the 2025-12-12 push is a README link edit. 3 stars, 0 forks, 0 issues - nobody has exercised it.
6. **Upstream assets with no declared licence**: the base model `m-a-p/CT-LLM-Base` and the preference set `OpenLLMAI/comparison_data` both show `license: None` on the Hub. A model fine-tuned by following this repo's recipe would have unclear redistribution rights - fatal for a model shipped inside a PWA/APK.
7. **Chinese-only recipe** for four of the five stages (prompt format `指令:/输出:`, zh data, zh base). Only GRPO is English.
8. Not README-ware in the "generated filler" sense: the code is plainly hand-written by someone learning, and the README does not over-claim. The "promising" flag most likely came from the description ("24 GB, hand-rolled training pipeline") and the topic tags (`dpo grpo ppo rlhf tiny-llm`), not from the content.

---

## 10. Recommendation

Drop it from the take-list. It contributes nothing to the web landing / PWA / Android chat client, it cannot legally be
copied, and as a learning resource it is strictly dominated by `jingyaogong/minimind` (Apache-2.0, same scope plus
pretraining and distillation, 61k stars, pushed yesterday) and by TRL's trainers.

If a fine-tuning track is ever opened for the product (e.g. a format-reliable tool-calling SLM for on-device use), the
licensed path on this machine's 12 GB card is: Unsloth or TRL + PEFT (Apache-2.0) on an Apache-2.0 base such as
Qwen2.5-1.5B-Instruct -> merge LoRA -> llama.cpp `convert_hf_to_gguf.py` + quantise (MIT) -> serve through wllama
(see `wllama.md` in this folder). The only thing worth carrying over from tiny-llm-training into that track is the
*idea* in `GRPO/cot_reward.py` - graded partial credit for output format - re-written from scratch.
