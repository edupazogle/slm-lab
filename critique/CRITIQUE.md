# Phase 1 of the SLM lab, verified — what survives, what falls, what was never tested

Adversarial review, 2026-09-21. Input: 80 raw findings from six independent hostile lenses
(`raw-findings.json`). Output: 26 merged findings, each re-checked against the artifacts by opening the
file, recounting the number, or re-running a cheap read-only check. Default stance was that the finding is
wrong. Phase-1 artifacts read at `/home/edu/Public/bizloop/slm/phase1/` (checksum-identical to
`/home/edu/Public/Valheim/docs/slm-research/`: `cmp` on FINDINGS.md and SETUP.md returns equal).
Phase-2 remediation judged from `/home/edu/Public/bizloop/slm/experiments/v2/`, `.../app/`, `.../prd/DECISIONS.md`,
`.../plan/EXPERIMENT-PLAN.md` and `critique/evidence/phase1-service-state-before.txt`.

## Executive summary

1. 80 findings merge to 26. Verdicts: **21 CONFIRMED, 5 CONFIRMED-BUT-OVERSTATED, 0 refuted outright** — but
   several *sub-claims* inside otherwise-correct findings are refuted below and are named where they occur.
2. The paper's one positive calibration result — "§4.3 confidence tracks information-completeness" — is an
   off-by-one read of its own file: 0.55 belongs to the **complete** fire claim; the no-amount claim scored 0.77.
3. "The grounding gate … works" rests on **one** suppressed call. In the same log four fabricating calls were
   delivered live, and the `ungrounded` flag scores ~8/13 precision and ~8/13 recall on phase 1's own data.
4. "0.72 → 0.72 … **data, not tooling, is the bottleneck**" falls hardest. The eval prompted the model with a
   different tools block than every training row, scored only `function_calls`, truncated its own printout to 43
   characters, and ran 6 cases. The phase-2 retrain with a 4-bit untuned control (n=240, disjoint phrasings,
   `experiments/v2/ft2_score.txt`, finished 02:09) gives **field F1 +0.176 [+0.141, +0.210] for tuning alone with a
   system turn and +0.185 [+0.152, +0.220] without** — the opposite conclusion, with an interval.
5. The CPU chat table (16.1 / 7.2 / 3.2 tok/s) that drives recommendation #1 is not a property of the models:
   the build had no GPU support at all (`llama_supports_gpu_offload() == False`), tok/s was completion tokens over
   total wall time, n=1 per model, and a JAX/CUDA `pip install` started mid-benchmark.
6. The two use cases the operator named first are the least tested: **anonymisation** is one English email whose
   date of birth the schema cannot hold and no redaction code exists; **document understanding** was a 2 KB
   born-digital ReportLab PDF with 21 text objects and zero images, so "OCR on the GPU" never ran.
7. "AnythingLLM ✅ serving, onboarding complete" was false while it was written: the live instance answered
   `{"onboardingComplete":false}` with no LLM, no workspace and no embeddings, and the model server logged exactly
   **one** chat completion in its whole life.
8. Security: SETUP.md still tells the operator to port-proxy an **unauthenticated** admin UI onto the Wi-Fi;
   `--network host` put `*:3001` and an undocumented `*:8888` on every interface, both reflecting any `Origin`.
   Never applied (`netsh … portproxy show all` is empty), and both services were stopped on 2026-09-21.
9. What holds up: every weakness in §4.5 (relative-time failure, confident-but-wrong at 0.99, fabrication on
   sparse input), the context-bleed lesson, "fine-tuning kills the confidence head", grammar-constrained output,
   and — crucially — phase 1 kept full response envelopes in `needle3_results.jsonl`, which is why this critique
   could be written at all. Six other result blocks kept nothing and cannot be audited.
10. Unproven either way, and still unproven after phase 2: in-browser and on-phone inference, cost/throughput,
    embeddings, enum classification, French quality, OCR, MCP/Copilot, and any comparison with the 2025–2026 small
    models the vendor's own benchmark chart ranks **above** needle3 on extraction.

## Findings

| id | severity | verdict | status | finding |
|---|---|---|---|---|
| C-01 | critical | CONFIRMED | OPEN | §4.3 pins 0.55 on the wrong query; the benchmark kept no arguments and ran on a contaminated agent |
| C-02 | critical | CONFIRMED | OPEN | "The grounding gate works" = 1 suppression against 4 live fabrications; the flag is ~62% precise, ~62% complete |
| C-03 | critical | CONFIRMED | IN PROGRESS | The 0.72-vs-0.72 tie is a harness artefact: eval schema ≠ training schema, scorer blind to suppressed calls, table contradicts its own average |
| C-04 | critical | CONFIRMED | FIXED (measured) | "Data, not tooling, is the bottleneck" is unsupported and now contradicted: +0.176 field F1 from tuning alone (n=240) |
| C-05 | critical | CONFIRMED-BUT-OVERSTATED | IN PROGRESS | The CPU speed table is a setup artefact, and its stated causes are themselves untested |
| C-06 | critical | CONFIRMED | OPEN | "Can it anonymise data? Yes" from one English email; DOB un-extractable by construction; no redaction ever run |
| C-07 | critical | CONFIRMED | IN PROGRESS | AnythingLLM reported "onboarding complete"; the live instance said `onboardingComplete:false`, no LLM, no workspace |
| C-08 | critical | CONFIRMED | IN PROGRESS | SETUP.md publishes an unauthenticated admin UI to the LAN; `--network host` exposed `*:3001` and `*:8888`; both reflect any Origin |
| C-09 | critical | CONFIRMED | IN PROGRESS | "Browser-hosted models … also used on phones" was delivered as a WSL CPU server; needle3's own WASM/Android builds were never noticed |
| C-10 | major | CONFIRMED | OPEN | "All results from real runs (scripts in experiments/)" is false for six result blocks |
| C-11 | major | CONFIRMED-BUT-OVERSTATED | OPEN | "~0.5 s" is the p50 of 5 warm tool calls, quoted for two extractions that took 1.4 s and 1.7 s |
| C-12 | major | CONFIRMED | FIXED | The fine-tune set is malformed: 58 "le le" rows, 102 "450.0 euros" queries, 0/179 reasoning, 16 ungrounded labels, locked entity pools |
| C-13 | major | CONFIRMED-BUT-OVERSTATED | FIXED (v2 eval) | The held-out eval cannot detect an effect: n=6, four cases are training templates, one case penalises the safety feature |
| C-14 | major | CONFIRMED | FIXED (measured) | Quantisation confound: the base is 2-bit (35.3 MB), the tuned model 4-bit (63.5 MB, 1.80×), two variables at once |
| C-15 | major | CONFIRMED | FIXED (as a decision) | Fine-tuning deletes the confidence head, so "fine-tune it" and "route on confidence" are mutually exclusive |
| C-16 | major | CONFIRMED | OPEN | The adapter is keyed to the exact tools JSON, and `e.g.` values in descriptions leak into outputs |
| C-17 | major | CONFIRMED | IN PROGRESS | The French verdict is the vendor's statement about Spanish; own French evidence is n=2; the tokenizer explains the failure |
| C-18 | major | CONFIRMED | OPEN | "Extraction is excellent" rests on n=2, while the vendor's own chart ranks needle3 below three smaller models, and "smaller rungs suffice" is a category error |
| C-19 | major | CONFIRMED | IN PROGRESS | "Find more / all the models that are recommended" not delivered: three 2024 chat models, no candidate list, no tab enumeration |
| C-20 | major | CONFIRMED | OPEN | §4.6 recommends the one embedding use it never tested (ranking), from 3 cosines on 4 sentences |
| C-21 | major | CONFIRMED | OPEN | §4.7 misquotes its own enum (3 labels printed, 6 used) and grades sentiment/urgency with no ground truth |
| C-22 | major | CONFIRMED | OPEN | §6 quality ticks contradict the saved text: 2/3 French answers are wrong, 0/3 JSON parses, every sample cut at 280 chars |
| C-23 | major | CONFIRMED | OPEN | docling: born-digital PDF, no image objects — OCR never exercised; 45 s includes model downloads; the "killer combo" was never run end to end |
| C-24 | major | CONFIRMED-BUT-OVERSTATED | OPEN | Vendor marketing restated as measurement; §8–§10 carry zero citations; BizLoop, Copilot and MCP are never tested |
| C-25 | major | CONFIRMED | OPEN | "Exact commands used" are not the commands that ran; no versions, digests, hashes or licences; telemetry default-on undisclosed |
| C-26 | major | CONFIRMED-BUT-OVERSTATED | IN PROGRESS | The fine-tune ran on a contended GPU (9 CUDA OOMs) and runtime state was committed to git |

---

### C-01 — §4.3's one calibration result is an off-by-one read of its own file · critical · CONFIRMED · OPEN

**Claim.** FINDINGS.md:138-140: "5 claims benchmarked: confidences `[0.98, 0.55, 0.77, 0.94, 0.99]`. The 0.55 was
the one claim with **no amount** … the score dropped exactly where a human would pause." Carried into the summary
at FINDINGS.md:25 and the "strongest fit" verdict at FINDINGS.md:296.

**What is wrong.** `needle3_claims.py:116-122` lists the queries in order: [0] bicycle theft, [1] "Policy AXA-2:
fire damage in the garage on 5 Sept, 12000 euros", [2] "third-party liability … no amount", [3] flood, [4]
windshield. `:123-129` appends `r.get("confidence")` in that order. So 0.549 belongs to the **complete** fire claim
and the no-amount claim scored 0.768. Three further defects: the loop runs on the single module-level agent built
at `:43`, after A1–A4 (the carry-over is visible in `needle3_results.jsonl:2` "Previous call logged a damage
claim…" and `:4`, where the in-domain query "A customer wants to make a claim about their car." is answered as "a
general knowledge question" at confidence 1.0); `rec("D_benchmark", …)` at `:130-135` stores only latency,
confidences and call counts, never the arguments, so no one ever looked at what was extracted; and none of the 5
queries names a claimant although `claimant` is required and `calls_per_query` is `[1,1,1,1,1]`, so every one of
the five calls necessarily carried an invented claimant.

**Evidence checked.** Read `needle3_claims.py:116-135` beside `needle3_results.jsonl:7`
(`"confidences": [0.976, 0.549, 0.768, 0.938, 0.985]`) and zipped them by index. Read the `reasoning` strings on
results lines 1–4. Confirmed `needle.Needle` is constructed once (line 43). I did not re-run needle (a phase-2 GPU/eval
job was running); two independent lenses report the same fresh-agent re-run: `[0.976, 0.886, 0.376, 0.982, 0.970]`
with the claimant fabricated in 5/5 and `ungrounded` naming the claimant in 0/5.

**Corrected statement.** The sentence in §4.3 is false about its own data. With fresh agents the *direction* the
paper wanted (lowest score on the incomplete claim) is reported by both re-runs, so the hypothesis is not dead —
but it has never been tested: n=5, no gold labels, no arguments kept, no threshold sweep, and the only points where
confidence and correctness are both known argue against routing on the score (E2: wrong at 0.9929 with an empty
`ungrounded`; E4: `policy_number="800 euros"` at 0.8729).

**Fix / status.** OPEN. §4.3 is unchanged in FINDINGS.md. Next action: run EXPERIMENT-PLAN E2 (labelled triage set,
fresh agent per message, full envelope stored, AUROC + risk–coverage sweep) and replace §4.3 and summary row 2; until
then mark both "untested".

---

### C-02 — "The grounding gate is the safety feature — and it works" · critical · CONFIRMED · OPEN

**Claim.** FINDINGS.md:142-149, and in the executive summary at :16-17 "its **grounding gate suppressed a
hallucinated claim**"; the mechanism is described at :99 as "the engine withholds calls under 0.1".

**What is wrong.** Suppression happened once in the whole corpus (E3, `needle3_results.jsonl:10`). In the same file
four fabricating calls were **delivered** in `function_calls`, i.e. a client that acts on the response would have
logged them: A2 (`policy_number "MRD-555"` invented, `when` = the phone number, conf 0.22), E1 (`policy_number` and
`claimant` both "MRD-7843" though "Mr. Jean Dupont" is in the input, conf 0.5975), E4 (`policy_number "800 euros"`,
`claimant "theft"`, conf 0.8729, only the date flagged), E2 (name into `contact_number`, phone into `when`, conf
0.9929, `ungrounded: []`). Counting every argument of every call-bearing record: 8 true positives (A2 policy; E1
policy + claimant; E3 four fields; E4 date), 5 false positives (A1 date; A2 date and amount; E1 date and amount —
all five correct values that were merely normalised), 5 false negatives (A2 `when`; E2's two arguments; E4 policy and
claimant). Precision 8/13, recall 8/13. Every correctly normalised ISO date in the corpus (A1, A2, E1) is flagged.
The stated mechanism is wrong too: E3 was withheld at confidence 0.1528, above the 0.1 floor. And on the extraction
path the gate protects nothing: `needle/__init__.py:552` reads
`calls = response.get("function_calls") or response.get("suppressed_calls") or []`, so `extract(..., strict=False)` —
used at `needle3_claims.py:108` — returns suppressed calls as results.

**Evidence checked.** Recounted the flags and arguments across `needle3_results.jsonl` lines 1, 2, 8, 9, 10, 11
against the query text in the two scripts; read `needle/__init__.py:218-226, 250-267, 545-556` and
`_annotate_ungrounded` at `:493`.

**Corrected statement.** The gate blocked 1 of 5 fabricating responses in phase 1's own data. `validation.ungrounded`
behaves like a surface-string test — a fabricated value that is a substring of the input passes, a correct value that
was reformatted fails — giving roughly 62% precision and 62% recall on n=6 responses. Note the mechanism is partly in
the closed engine; only the Python-side annotation was readable.

**Fix / status.** OPEN. Next action: a 40-case missing-required-field suite (EN+FR, each field ablated) scoring
suppression recall and per-field precision/recall of the flag, plus an `agent.run(strict=True)` arm, which is the
documented safe path and was never exercised.

---

### C-03 — The 0.72-vs-0.72 tie is an eval-harness artefact · critical · CONFIRMED · IN PROGRESS

**Claim.** FINDINGS.md:242 "| Accuracy (6 cases) | **0.72** | **0.72** |", :246 "| Multi-action + FR callback | ✅ | ✅ |",
:250-251 "It also did **not** regress".

**What is wrong.** Four independent defects, all verifiable without running the model.
(1) **Schema mismatch.** Every one of the 179 training rows carries one byte-identical tools block (verified: all 179
`tools` fields equal). `eval_tuned.py:17-24` declares a different one. Diffed structurally — exactly three fields
differ, all descriptions on the *other* two tools: `flag_for_review.reason` ("why a human should review it"),
`schedule_callback.contact_number` ("the phone number to call"), `schedule_callback.when` ("when to call, e.g.
'tomorrow morning'"). The tools JSON is part of the prompt, so the tuned model was evaluated on a prompt it never saw.
(2) **The scorer cannot see regressions.** `eval_tuned.py:53` returns only `function_calls`; a fabricated call the
engine suppressed scores as a clean refusal.
(3) **The table contradicts its own average.** With cases 0=1.0, 1=0.8, 2=1.0, 4=0.0, 5=1.0, an average of 0.7167
requires case 3 = 0.5 — yet row :246 ticks the FR callback correct for both arms. Marking it correct implies 0.80.
(4) **The author could not see the difference.** `eval_tuned.py:69` prints each call truncated to 43 characters; the
phase-1 transcript at 18:43:05Z shows the resulting table, where every `schedule_callback` line is cut before `when`.
No eval output file was ever written; `tuned.cact` (20:41:49), `eval_tuned.py` (20:43:02) and FINDINGS.md (20:44:21)
were written inside 2 m 32 s.

**Evidence checked.** Parsed `eval_tuned.py`'s TOOLS literal with `ast` and diffed it field-by-field against
`json.loads(open('data.jsonl').readline())['tools']`; confirmed all 179 rows share one block; did the arithmetic;
read `eval_tuned.py:41-53, 69`; read the 18:42:19Z and 18:43:05Z tool results in the phase-1 transcript; compared
file mtimes with `ls --time-style=full-iso`. The reviewer figure "0.83 tuned vs 0.675 base under the training schema"
is a single-run re-run I did not repeat (no new needle jobs during the phase-2 eval).

**Corrected statement.** The tie is a property of the harness, not of the model: a mismatched prompt, a metric blind
to suppressed calls, an internally inconsistent table, and a 43-character printout. It cannot support "didn't improve".

**Fix / status.** IN PROGRESS. `experiments/v2/ft2_predict.py` imports one `TOOLS` from the data generator, so train
and eval share the schema by construction, and `ft2_score.py` scores fields with bootstrap CIs and records
`suppressed`, `confidence` and `ungrounded` per case. FINDINGS.md itself is uncorrected. Next action: land the v2
numbers and rewrite FINDINGS §0 row 7 and §7.

---

### C-04 — "Data, not tooling, is the bottleneck" was never diagnosed, and is now contradicted · critical · CONFIRMED · FIXED (measured)

**Claim.** FINDINGS.md:31 "a 179-example synthetic dataset didn't improve held-out accuracy (0.72 → 0.72): **data,
not tooling, is the bottleneck.**"; :238 "the tooling works end-to-end".

**What is wrong.** No runtime diagnostic was run before the cause was named. The control that phase 2 did run kills
the claim: with the *training* schema, `tuned.cact` reproduces only 8 of 16 training rows and **0 of the 5
sparse→`flag_for_review`** rows it was trained on for 20 epochs at a final loss of 0.0019 — including a live
fabricated `log_claim(policy_number="800", claimant="theft", amount=800.0)` on the verbatim training string "Log a
theft claim for 800 euros.", and a new fabricated `schedule_callback(contact_number="fire in their kitchen")` on
"Someone called about a fire in their kitchen." Recalling a memorised string needs no generalisation, so "too small
and too uniform" cannot explain it. A concrete tooling cause is visible in the package:
`needle/model/finetune.py:199-213` emits a system turn only `if system` and a think block only `if reasoning`; the
179 rows have neither (0/179 reasoning, no `system` key), while inference always supplies a system turn
(`eval_tuned.py:51`, and `Needle(auto_date=True)` injects a date fact even when `system` is None).

**Sub-claim refuted.** "Byte-identical outputs are the signature of an adapter that never loaded" is wrong: the
adapter does load and does change behaviour (`ft_forensic_tuned.json` vs `ft_forensic_base.json`: FR training rows go
from `damage_type "eaux"`/"madame" to "dégât des eaux"/"vol"; confidence becomes `None`; output signature differs).

**Evidence checked.** Read `experiments/v2/ft_forensic.py` and both result JSONs (base 6/16 exact, tuned 8/16, same
16 rows, separate processes); read `finetune.py:199-213` and `:360-369`; re-read `data.jsonl` (0/179 reasoning, no
system field). Preliminary phase-2 numbers below.

**Corrected statement.** Phase 1 attributed a null result to data volume without excluding the harness, the
train/inference prompt format, or the quantisation change. The v2 retrain (1200 rows, 4 epochs, 240 disjoint eval
cases) finished during this review and says the opposite — `experiments/v2/ft2_score.txt`, 2026-09-21 02:09:40:

| condition | n | tool acc | field F1 | 95% CI | exact |
|---|---|---|---|---|---|
| base (2-bit shipped) / sys | 240 | 0.842 | 0.634 | [0.594, 0.675] | 0.317 |
| base4bit (untuned control) / sys | 240 | 0.846 | 0.703 | [0.675, 0.731] | 0.292 |
| tuned / sys | 240 | 0.942 | **0.879** | [0.852, 0.902] | 0.725 |

Fine-tuning alone (both arms 4-bit): **field F1 +0.176 [+0.141, +0.210]**, tool accuracy +0.096, exact +0.433,
P(Δ≤0)=0.000 — and +0.185 [+0.152, +0.220] without the system turn. Tuning moved the needle by a wide, interval-backed
margin; phase 1's measurement could not see it.

**Fix / status.** FIXED as a measurement (the paper's text is still wrong). Next action: rewrite FINDINGS.md:31 and §7
from `ft2_score.txt`, and add the train-recall gate (10 training rows through the exported artifact, abort under 0.9)
so a silent format mismatch cannot pass again.

---

### C-05 — The CPU speed table is a setup artefact — and so are the reasons given for it · critical · CONFIRMED-BUT-OVERSTATED · IN PROGRESS

**Claim.** FINDINGS.md:212-222 (16.1 / 7.2 / 3.2 tok/s; "**CPU speed is not interactive**"; "The 3B model is unusable
on CPU"), repeated at :29 and SETUP.md:67, and the basis of recommendation #1 "Approve Ollama" (:361-363).

**What is wrong, verified.** (a) There is no benchmark script in `experiments/`; the code exists only as a heredoc in
the phase-1 transcript (17:54:40Z): `Llama(..., n_ctx=4096, n_threads=8, verbose=False)` and
`tok/dt` where `tok = r["usage"]["completion_tokens"]` and `dt` is total wall time — so prompt eval, templating and
sampling are inside the denominator, and `verbose=False` discarded llama.cpp's own counters. (b) n=1 per model, no
warm-up, no repeat, and the headline is a fifth "speed" prompt; the same file's four task prompts give Qwen
5.4/8.1/3.3/9.2, Gemma 2.7/10.1/3.7/6.2, Llama 3.7/2.0/1.6/1.4 — a within-model spread larger than the
between-model gaps the table ranks on. (c) `chat_benchmark.json` implies Qwen produced ~47 tokens in 14.34 s on the same
loaded model that produced ~180 tokens in 11.2 s, which is impossible for a decode-bound process. (d) The build had
**no GPU support at all**: `llama_supports_gpu_offload()` returns `False` today, and `llama_server.log:127+` assigns
every layer to CPU — so "these chat models need GPU" describes an installation accident, not the models. (e) A
JAX/CUDA `uv pip install "cactus-needle[train,gpu]"` was launched at 17:57:02Z while the benchmark (backgrounded at
17:56:47Z) was still running; `chat_benchmark.json` was written at 18:00:48Z. (f) The environment line
"AMD Ryzen 7 7800X3D (8c)" (FINDINGS.md:43) is wrong for the test bed: `lscpu` shows 4 cores / 2 threads per core /
8 logical CPUs in a 12 GB VM.

**Overstated.** The lenses assert the causes: 9p page-faults, SMT oversubscription, mlock failure. Those are
plausible (`findmnt /mnt/e` → 9p, `msize=65536`; `llama_server.log:126` `load_mode = mmap+mlock`; `:919` "failed to
mlock 328663040-byte buffer") but none is measured — the corrected benchmark has not been run yet. The one
llama.cpp-internal figure in the repo (`llama_server.log:1235`, 25.80 tok/s decode for the same Qwen GGUF) comes from
a request whose prompt was cached (`:1234` reports 506,329 tok/s prompt eval), so it is a warm short decode, not a
like-for-like refutation — it is still 1.6× the paper's headline for the same file on the same box.

**Fix / status.** IN PROGRESS. `experiments/v2/bench_llamacpp.py` does it properly (ext4 vs 9p, `use_mmap` on/off,
threads 8/16, warm-up, 3 reps, prefill/decode/TTFT separated); its timed run is still pending a quiet machine.
The in-browser bench already produces honest numbers (`app/bench_results.jsonl`: SmolLM2-360M Q8_0, 4 threads,
decode 12.3 tok/s, TTFT 16.9 s in headless Chromium). Next action: run `bench_llamacpp.py` at load < 1, add a CUDA
build arm, then rewrite §6 and decide whether recommendation #1 still stands.

---

### C-06 — "Can it anonymise data? Yes" is one English email, and the test itself leaks a date of birth · critical · CONFIRMED · OPEN

**Claim.** FINDINGS.md:28 "| Can it anonymise data? | **Yes** — it extracts PII into typed fields on-device, which
can drive a redaction step…"; :131-135 "### 4.2 PII extraction (anonymisation feed) — excellent … every PII field
extracted correctly"; :275 "This is the same job Microsoft Presidio does".

**What is wrong.** n=1. The input (`needle3_claims.py:104-108`) contains "born 12/03/1980"; the schema
(`:95-101`) is six scalar strings with no date-of-birth field, and the recorded output
(`needle3_results.jsonl:6`) has none — so the only anonymisation test in the paper would have left a quasi-identifier
in the text and counted it as perfect. Because every field is a single `str`, a letter naming a claimant, a third
party and a witness cannot be represented: recall is capped by the schema. No redaction or pseudonymisation code
exists anywhere (`grep -n -iE 'redact|mask|pseudonym'` over `experiments/*.py` returns nothing), and `needle.extract`
returns values, not character spans, so "can drive a redaction step" was never executed. No French text, no
multi-person text, no PII-free negative control, and Presidio was named as equivalent without being installed or run.

**Evidence checked.** Read `needle3_claims.py:95-111` and `needle3_results.jsonl:6`; grepped the experiments directory
for redaction code; confirmed the recorded PII output has no DOB field.

**Corrected statement.** For an insurer the metric is recall of every direct identifier and the residual-leak rate
after redaction; neither exists. The honest summary row is "promising on one example; recall unmeasured; redaction
not implemented". Fair to phase 1: a reviewer re-ran experiment C with `strict=True` and got the same six values, so
the `strict=False` at line 108 was not hiding a failure.

**Fix / status.** OPEN. EXPERIMENT-PLAN E1 specifies the right experiment (300 FR + 300 EN from
`ai4privacy/pii-masking-300k` plus 60 hand-built French claim texts with NIR/IBAN/plate/DOB, entity-level P/R/F1,
document-level leak rate, and an anonymise → third-party LLM → re-identify round trip) and is **not started**.

---

### C-07 — "✅ serving, onboarding complete" was false when it was written · critical · CONFIRMED · IN PROGRESS

**Claim.** FINDINGS.md:111 "| **AnythingLLM** | Docker … | `http://localhost:3001` | ✅ serving, onboarding complete |";
SETUP.md:3 "Everything below is already running on this machine"; SETUP.md:9 "onboarding done".

**What is wrong.** The pre-remediation capture (`critique/evidence/phase1-service-state-before.txt`, 2026-09-21
00:55) shows `{"onboardingComplete":false}` and `LLMProvider: None, LLMModel: None, VectorDB: None`. The model server
logged exactly **one** `POST /v1/chat/completions` in its entire life (`grep -c` over `llama_server.log` → 1, at
line 1238; every other request is `GET /v1/models`), so AnythingLLM never sent it a message. PLAN.md:19-20's
Experiment B ("RAG + docling document Q&A, desktop + mobile access") therefore did not happen, and the paper does not
say so. The status column was inferred from the port answering — the "instrument that cannot fail" error.

**Evidence checked.** Read the evidence capture; counted POST lines in `llama_server.log`; the live service is gone
now (`ss -tln` shows nothing on 3001/8000/8888), so I could not re-probe the API myself.

**Corrected statement.** The container was up and unconfigured. The honest cell is "UI up; no LLM attached; no
workspace; no auth; mobile untested".

**Fix / status.** IN PROGRESS. Services stopped 2026-09-21 and DECISIONS D1 replaces the AnythingLLM-as-product path
with a wllama PWA beside a stock AnythingLLM server. FINDINGS.md:111 and SETUP.md:3/9 are still uncorrected. Next
action: correct both lines, and whenever a UI is accepted again, require a positive marker the failing case cannot
produce (a second POST line in the server log plus a non-empty `/api/workspaces`).

---

### C-08 — The quick-start publishes an unauthenticated admin UI to the LAN · critical · CONFIRMED · IN PROGRESS

**Claim.** SETUP.md:34-35 (`netsh interface portproxy add v4tov4 listenaddress=192.168.1.36 listenport=3001 …` plus
`netsh advfirewall firewall add rule name="AnythingLLM 3001" dir=in action=allow protocol=TCP localport=3001`),
repeated as recommendation #2 at FINDINGS.md:364-366. SETUP.md:21 "**API key** = anything (e.g. `local`)".

**What is wrong.** The thing being published has no password: the capture shows `RequiresAuth: False, AuthToken:
False, MultiUserMode: False`. `--network host` (FINDINGS.md:389) also put the document collector on `*:8888`, a port
no phase-1 document mentions, on every interface. Both services reflect a foreign `Origin` with credentials —
`llama_cpp/server/app.py:140-147` sets `allow_origins=["*"], allow_credentials=True`, and the capture shows
`Access-Control-Allow-Origin: https://evil.example` from both 3001 and 8000 — so a page in the operator's browser
could drive them without any LAN exposure at all. The firewall rule as written carries no `profile=` and no
`remoteip=`. This repo's own convention is the opposite ("Everything binds to 127.0.0.1", CLAUDE.md).

**Evidence checked.** Read SETUP.md:27-41 and FINDINGS.md:364-366 and :389; read the CORS middleware in the installed
llama-cpp-python; read the pre-remediation capture (listeners `*:3001` and `*:8888`, container `network=host
restart=unless-stopped`). Ran `netsh.exe interface portproxy show all` (empty) and
`netsh advfirewall firewall show rule name="AnythingLLM 3001"` ("No rules match") — **the exposure was never
applied**, and `ss -tln` shows nothing listening now.

**Corrected statement.** A loaded instruction, not an open hole: the LAN step was never run and the instance held no
documents. The finding stands as written except for tone — the realised risk in phase 1 was the browser-origin path
on loopback, not the Wi-Fi.

**Fix / status.** IN PROGRESS. Live exposure closed on 2026-09-21 (both services stopped; the memory note now records
it), and DECISIONS D6 fixes the policy ("loopback by default; AnythingLLM returns only as `-p 127.0.0.1:3001:3001`,
password-protected"). The dangerous lines are still in SETUP.md:34-41 and FINDINGS.md:364-367. Next action: delete or
rewrite them, and when a LAN path is genuinely wanted, require `AUTH_TOKEN` + `JWT_SECRET` first and verify with
`"RequiresAuth":true` before any firewall change. The `wsl --shutdown` / `networkingMode=mirrored` "durable fix"
(SETUP.md:40-41) must also go: it stops every agent, proxy and cockpit on this shared machine. (The lenses' claim that
mirrored mode automatically exposes every `*`-bound port to the LAN is **not verified** — the Hyper-V firewall
governs that — so that part is an argument, not a measurement.)

---

### C-09 — "Browser-hosted models … so it can also be used on phones" was delivered as a WSL CPU server · critical · CONFIRMED · IN PROGRESS

**Claim.** FINDINGS.md:112 "**Model server** | `llama-cpp-python` … ✅ serving (CPU build)"; :56-58 mobile = a Windows
`netsh portproxy` to that server; :37 claims the needle3 **Files tab** was reviewed.

**What is wrong.** The operator's brief (phase-1 transcript, 2026-09-20T17:33:16Z) reads: "setup a … web interface
that can be used both on desktop and on mobile so that i can test out these **browser hosted models you download**
(prioritze fast download, ffast responses, low gpu usage so that i can also be used on phones)". Phase 1 put all
inference in a WSL Python process, downloaded 1.12 / 1.71 / 2.02 GB GGUFs, and concluded the models "need GPU" —
the opposite of the brief. The needle3 repo it says it reviewed ships exactly what was asked: the cached snapshot's
README line 44 says "Try it in the browser at cactuscompute.com/needle", line 11 tags the model `webassembly`, and
line 68 links "What devices are supported on Needle … the browser, WASI, air-gapped setup". `grep -iE
'wasm|webassembly|webgpu|wllama|transformers\.js|litert|android|in-browser|playground'` over FINDINGS.md, SETUP.md and
PLAN.md returns **zero** hits.

**Evidence checked.** Read the operator's goal text in the transcript; grepped the three documents; read the cached
model card at `~/.cache/huggingface/hub/models--Cactus-Compute--needle3/snapshots/b274efc…/README.md`.

**Corrected statement.** "Browser-hosted" is mildly ambiguous in the brief, but "fast download, low GPU, usable on
phones" is not: the deliverable had to run on the device. Phase 1 read past the WASM and Android artifacts in the
very repo it reviewed.

**Fix / status.** IN PROGRESS, and this is phase 2's main line of work: `app/web` (vendored `ngxson/wllama`
`examples/main`, in-browser chat + `bench.html`, working), `app/web/needle.html` + `experiments/v2/needle_wasm_node.mjs`
(needle3's own 0.7 MB WASM engine driven exactly as a browser would), a Capacitor Android shell (D3), and
DECISIONS D1/D2 recording why AnythingLLM is not the base. Next action: E10 (browser-vs-native agreement, must be
100% or explained) and E12 (WASM vs native on the operator's phone).

---

### C-10 — "All results from real runs (scripts in `experiments/`)" is false for six result blocks · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:125.

**What is wrong.** `experiments/` holds five scripts (`needle3_claims.py`, `needle3_experiment2.py`,
`expand_data.py`, `make_finetune_data.py`, `eval_tuned.py`) and `needle3_results.jsonl` holds exactly 11 records
(A1–A4, B, C, D, E1–E4). A grep of every `.py/.json/.jsonl/.md` in that directory for `\.embed\(|needle2|\.run\(|
docling|DocumentConverter|Llama\(|line_of_business|Amara|POL-2026|flatten|generation=2` returns **no hits**. So §4.6
(embedding cosines), §4.7 (enum misfires), §4.8 (the `run()` chain and the needle2 comparison), §5 (both docling
conversions and the table-vs-flattened result), §6 (the whole chat benchmark) and §7's 0.72/0.72 exist only as prose.
`chat_benchmark.json` survives but records no prompts, max_tokens, thread count or timing method. §11.4 (:370-371)
even concedes the docling→needle3 pipeline was "not yet joined in a single run" while §5 calls the same result
"Measured".

**Evidence checked.** `ls experiments/*.py`; the grep above; listed the 11 experiment names in the JSONL; recovered
the missing code from the phase-1 transcript (17:51:44Z embeddings, 17:51:48Z docling, 17:54:40Z chat benchmark,
18:04:39Z docling→needle3 + classification, 18:08:33Z needle2 + `run()`), which is outside the repo.

**Corrected statement.** Exactly as stated. Several of these unrecorded single trials carry operational advice
("Rule: docling emits tables; needle3 wants prose", "Use it for ranking/dedupe").

**Fix / status.** OPEN. Next action: change line 125 to name which sections have artifacts, tag the rest ANECDOTAL,
and re-create each as a committed script that appends inputs, full outputs, versions and timestamps to a JSONL —
the discipline `experiments/v2` now follows for the fine-tune track only.

---

### C-11 — "~0.5 s" is the p50 of five warm tool calls, quoted for two extractions that took 1.4 s and 1.7 s · major · CONFIRMED-BUT-OVERSTATED · OPEN

**Claim.** FINDINGS.md:15-16 "It extracted a full claim record and a PII record … in ~0.5 s on CPU"; :125 "~0.5 s mean
latency"; :224-225; :275-276; SETUP.md:70.

**What is wrong.** The only 0.5 in the data is `p50_latency_s: 0.496` from `D_benchmark` (n=5, mean 0.592, max 1.082)
— tool calls on the reused agent that §7 later declares invalid. The two runs the executive summary describes are
`B_claim_extraction` 1.435 s and `C_pii_extraction` 1.735 s. With a fresh agent per case, E1–E4 took 2.889, 1.019,
2.701 and 1.025 s (mean 1.91 s) and the first call of the session (A1) took 3.461 s. Nothing distinguishes agent
construction from `complete()`, `time.time()` is used rather than `perf_counter`, and "~105 MB peak RAM" is the
engine's self-reported `peak_ram_mb`, not process RSS.

**Overstated.** "The identical request took 3.5 s an hour later" — the transcript re-timing (3.542 s, 18:08:33Z)
is ~21 minutes after B (19:47:06 local = 17:47:06Z), during the GPU fine-tune, not an hour.

**Evidence checked.** Recomputed from `needle3_results.jsonl` lines 1, 5, 6, 7, 8–11; read the 18:08:33Z transcript
result.

**Corrected statement.** Per-message latency on this machine is roughly 1–3 s for extraction and 0.5–1 s for a warm
tool call; the headline understates the quoted experiments by 3×.

**Fix / status.** OPEN. Next action: time construction and `complete()` separately, 30 reps per task type on a quiet
box, report p50/p95/max and RSS, and correct FINDINGS.md:16, :125, :275 and SETUP.md:70.

---

### C-12 — The fine-tune set is malformed, not merely small · major · CONFIRMED · FIXED in v2

**Claim.** FINDINGS.md:233 "**179 grounded EN+FR examples**"; :249-250 "too small and too uniform"; :264-265 "My
synthetic generator is the right starting point; it needs … 5–10× more volume".

**What is wrong, all recounted here.** 58 of 179 rows contain " le le " — `DATES_FR` values already begin with "le "
(`expand_data.py:48-50`) and the FR templates add another (`:92-94`, `:130`); that is every dated French row.
102 of 179 queries carry a Python float amount ("450.0 euros", "coût 2800.0"). `reasoning` is the empty string in
**179/179** rows (`expand_data.py:81` default, never overridden — the earlier generator `make_finetune_data.py:39`
had them). String labels that do not appear in their query: `log_claim.damage_type` ×16 (the FR multi-action template
at `:130` never says "collision" but the label at `:128` does), `flag_for_review.severity` ×15,
`flag_for_review.reason` ×5 ("insufficient information"), plus 116 ISO dates (legitimate normalisation). Entity pools
are index-locked (`X[i % len(X)]` for every slot, `:96-113`), so each damage label maps to exactly one amount —
"water damage" and "dégât des eaux" always 450.0, "fire damage"/"incendie" always 800.0 — a shortcut the model can
learn instead of reading the number. Class mix: log_claim 84, callback 32, log+callback 32, flag 25 (only **5** of
them sparse-input rows, the behaviour §7 says it targeted), off-topic 6 = 3.4% against the ~1-in-8 the paper itself
quotes at :262-264. The 17-row holdout is a random slice of the same templates (`finetune.py:360-369`), so val 0.032
measures template memorisation.

**Evidence checked.** All counts recomputed from `data.jsonl` with a one-off script; read `expand_data.py` in full;
read `finetune.py:360-369`. The "policy-number precedence bug" (`:99`, `1000+i*13 % 9000 + 1000` = `2000+13i`) is
real but harmless.

**Corrected statement.** With these defects the experiment cannot distinguish "too few examples" from "wrong
examples", so "5–10× more volume" was unsupported.

**Fix / status.** **FIXED.** `experiments/v2/ft2_make_data.py` regenerates the set and I verified the result:
1200 rows, " le le " in 0, float amounts in 0, non-empty `reasoning` in 1200/1200, a `system` turn on 611 rows
(half, by design), 211 refusal rows (17.6%), **every** string label a verbatim span of its query (0 exceptions
outside dates/severity), and train/eval query overlap 0 with disjoint phrasings, names and damage vocabulary
(240 eval cases, 123 EN / 117 FR). The generator asserts both properties at build time.

---

### C-13 — The held-out eval cannot detect an effect · major · CONFIRMED-BUT-OVERSTATED · FIXED (v2 eval)

**Claim.** `expand_data.py:5-6` "eval_cases.json (held-out, unseen entities)"; FINDINGS.md:235-236 "a held-out eval
(6 cases, fresh agent per case)".

**What is wrong.** Only the entity strings are held out. Case 0 is `en_tmpl[0]` with "in the attic" inserted; case 1
is `fr_tmpl[0]`; case 2 is the EN multi-action template almost verbatim; case 3 is the FR callback template verbatim;
case 4 reuses the constant sparse label. With n=6 one case is worth 0.167 and one field 0.033, so 0.72 vs 0.72
carries no information. Case 4 ("A policyholder reported a leak but gave no policy number.") expects
`reason="insufficient information"` under exact string match — a string with no span in the input — and
`eval_tuned.py:53` scores the engine's suppression (`function_calls == []`) as 0.0, i.e. the metric penalises exactly
the behaviour §4.4 calls "precisely what you want".

**Overstated.** "Unpassable by construction" is too strong: the grammar permits that call and the base model
fabricates ungrounded values freely, so it is improbable, not impossible. Phase 2's incomplete slice (labelled `[]`)
scores tool accuracy 1.00 for the tuned model, which shows the behaviour is learnable once the label matches the
engine's contract.

**Evidence checked.** Compared `expand_data.py:58-71` (EVAL) with the templates at `:85-95, :122, :130, :136, :140`;
read `eval_tuned.py:38-53`; read `ft2_eval.json` slices.

**Fix / status.** FIXED for this eval: v2 scored 240 cases from disjoint phrasings with field micro-F1, bootstrap CIs
and per-slice reporting, labelling incomplete claims `[]` so the gate is scored as intended (`ft2_score.txt`, 02:09).
Next action: add a hand-written adversarial slice (negations, two persons, amounts in words) that no generator
produced, and keep the per-slice table in the paper — it is where the real weaknesses show (`flag` 0.63 F1 /
0.65 tool accuracy for the tuned model against 1.00 on off-topic).

---

### C-14 — Quantisation confound: 2-bit base vs 4-bit tuned · major · CONFIRMED · FIXED (measured)

**Claim.** FINDINGS.md:235-236 "`tuned.cact` (63.5 MB, W4A8), and a held-out eval … against the base model";
executive summary :13 "needle3 (121M params, 35 MB)".

**What is wrong.** The published archive is CQ 2-bit; the local exporter can only write 4 bits
(`needle/model/quantize.py:61` `WEIGHT_BITS = 4`; package METADATA line 99: "Local fine-tuning trains and exports at
4 bits. The 2-bit post-training and quantisation behind the shipped model … run on the Cactus Platform"). So every
base-vs-tuned difference mixes LoRA with a precision change. Sizes confirm it:
`~/.cache/cactus-needle/v3/3.0.1/needle3.cact` = 35,335,380 bytes, `tuned.cact` = 63,474,900 bytes = **1.80×** — and
the paper sells a 35 MB on-device model while its own fine-tune path yields 63.5 MB that cannot be recompressed
locally. The per-tensor bit counts (115 tensors at 2 bits in the base, 122 at 4 bits in the tuned archive) come from
a reviewer's struct parse that I did not repeat.

**Evidence checked.** File sizes with `ls`; `WEIGHT_BITS`; the dist-info METADATA line; `finetune.log:60`
"numerics CQ W4 STE + A8 (matches export)".

**Fix / status.** FIXED as a measurement. `ft2_pipeline.sh:22-27` builds a zero-delta (lr 0) adapter and exports
`ft2_base4bit.cact`, an untuned 4-bit control — the right design — and the finished run quantifies the confound:
**quantisation alone is worth field F1 +0.069 [+0.033, +0.106] (sys) / +0.057 [+0.020, +0.094] (nosys)** with no
tool-accuracy change, i.e. about a quarter of the total base→tuned gain, and it *costs* exact-match accuracy
(−0.088 [−0.133, −0.042] nosys). The tuning effect survives it. Next action: state the 63.5 MB artifact size and the
lost 2-bit compression in any mobile plan.

---

### C-15 — Fine-tuning deletes the confidence head the triage design routes on · major · CONFIRMED · FIXED (as a decision)

**Claim.** FINDINGS.md:368-369 (recommendation 3: fine-tune on French claims) and :372-373 (recommendation 5: build
the act/confirm/refuse queue), with the table cell at :247 "| Confidence score | calibrated | **`None`** |".

**What is wrong.** `needle/__init__.py:135-138` warns that "finetuning does not update the confidence head … this
agent reports confidence as None", and `:223-224` forces `response["confidence"] = None` for any tuned agent;
`finetune.log:153` records the same. The paper notes it in §7 and then recommends both things without saying how a
tuned model gets routed. The word "calibrated" in that cell is also contradicted by the paper's own §4.5 (0.99 while
wrong).

**Evidence checked.** Read both source locations and the log line; confirmed `confidence: None` on all 16 tuned rows
of `ft_forensic_tuned.json`.

**Fix / status.** FIXED as a recorded constraint — DECISIONS D4 states it explicitly and prescribes the vendor's
two-model workaround (base model decides, tuned model fills). Untested as an architecture. Next action: measure the
dual-model route (agreement, added latency, two resident models: 35 MB + 63.5 MB) or replace confidence bands for
tuned models with deterministic validators and measure their catch rate.

---

### C-16 — The adapter is keyed to the exact tools JSON, and example values leak into outputs · major · CONFIRMED · OPEN

**Claim.** `expand_data.py:10-29` — one TOOLS constant embedded unchanged in all 179 rows, with descriptions
"the policy number, e.g. AXA-77812" and "when to call, e.g. 'tomorrow morning'"; FINDINGS.md:260-262 presents the
result as a shippable artifact.

**What is wrong.** Since every training prompt carries the same tools block byte for byte, the fine-tune is
conditional on that string; C-03 shows three description edits on *other* tools are enough to change the scored
output. In a product, adding a tool or rewording a description is routine — and because tuned models report
`confidence: None`, there is no signal when it happens. Independently, the literal example values are copied into
answers: in `ft_forensic_tuned.json` the tuned model's suppressed fabrications use `policy_number "AXA-77812"` (the
description's example) on inputs that contain no policy number, and the base model answered "tomorrow afternoon" and
"demain à 14h" with `when = "tomorrow morning"` — the description's example — in reviewer runs.

**Evidence checked.** Verified all 179 rows share one tools block and diffed it against the eval schema (3 fields);
read the fabricated `AXA-77812` values in the phase-2 forensic output.

**Fix / status.** OPEN. v2 still ships "as written, e.g. AXA-77812" in `ft2_make_data.py`'s `log_claim` description
and still uses one fixed tools block for every row. Next action: describe formats instead of giving examples,
randomise tool order/descriptions/distractor tools per row, and add a schema-perturbation arm to the eval that
reports the worst variant.

---

### C-17 — The French verdict is the vendor's statement about Spanish · major · CONFIRMED · IN PROGRESS

**Claim.** FINDINGS.md:27 "| Does it work in French? | **Weak** — non-English fragments ~1.7× more tokens and
confidence is English-calibrated (\"correct Spanish calls measured at 0.0\"). **Fine-tuning is the fix.**"; the same
text sits at :159-160 under the heading ":151 ### 4.5 Weaknesses — measured, not guessed"; escalated at :339-340 to
"the single biggest blocker for AXA France".

**What is wrong.** Both numbers are vendor text about Spanish, read in phase 1 and reproduced without attribution:
the phase-1 transcript's own tool result (17:51:14Z) contains "Non-English text fragments into roughly 1.7 times more
tokens (measured on Spanish)". No Spanish or French token count was ever taken here (`grep -ri spanish
experiments/` → nothing). Phase 1's entire French evidence is two eval cases. And "fine-tuning is the fix" is
contradicted by the paper's own §7 row (:243) where the French case stays "same (unfixed)". A 30-second local check
that was never done explains the failure: the needle3 SentencePiece vocabulary is **8,192** pieces with no "â", so
`dégât des eaux` encodes as `['d','é','g','<0xC3>','<0xA2>','t','▁des','▁e','au','x']` — regenerating it requires
emitting raw UTF-8 byte tokens.

**Evidence checked.** Ran sentencepiece against the cached `tokenizer/tokenizer.model` (vocab 8192, the encoding
above, `▁dégât` and `â` both absent); grepped the experiments directory for Spanish; read the vendor quote in the
transcript; read `eval_cases.json` (2 of 6 French).

**Corrected statement.** French was asserted, not measured. Phase 2's preliminary numbers say both halves of the
verdict need redoing: the shipped base scores field F1 **0.58 on the French slice (n=117) against 0.68 on English
(n=123)** — French really is the weaker language — but after fine-tuning French reaches **0.91 against 0.85 for
English**, so the gap closes and reverses on this set. "Fine-tuning is the fix" may well turn out true; phase 1 had
no evidence for it and its own §7 said the opposite.

**Fix / status.** IN PROGRESS. v2 data and eval are bilingual by construction and report per-language slices;
EXPERIMENT-PLAN E6 (accented perils, French dates, "1 250,50 €", amounts in words) is not started. Next action:
replace FINDINGS.md:27 with measured FR/EN numbers and attribute the Spanish figures to the vendor.

---

### C-18 — "Extraction is excellent" (n=2) and "smaller rungs suffice" (n=1, wrong object) · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:25 and :127 "Structured extraction — excellent"; :185 "Its extraction is the strongest part";
:178-183 "on clean extraction, **needle2 (45M) produced byte-identical output to needle3 (121M)**: the ladder means
you can run the smallest rung that fits".

**What is wrong.** Experiment B is one 20-word sentence with an ISO date and a `#`-prefixed id
(`needle3_claims.py:87-88`); experiment C is one email. Against that, the vendor's own benchmark chart — cached
locally at `…/models--Cactus-Compute--needle3/snapshots/b274efc…/assets/benchmarks.svg`, which I read — puts
Needle3-20L-121M **below** three sub-1.3B models on every extraction set: DSTC8 field F1 LFM2.5-230M 53.0,
Qwen3.5-0.8B 49.0, LFM2.5-1.2B 48.0 vs Needle3 **40.7**; SNIPS gold 43.0 / 35.0 / 34.0 vs **30.2**; SNIPS 7-way
38.0 / 34.0 / 29.0 vs **24.7**; BFCL v4 62.0 / 59.1 / 56.8 vs **50.2**. needle3 wins the two mobile tool-call sets it
was built for (Mobile Actions 86.0, DroidCall 47.0). FINDINGS.md contains zero occurrences of BFCL, DSTC8, SNIPS,
LFM2, Qwen3 or FunctionGemma, and none of those models was run. The "rungs" sentence is also a category error:
`needle/agent/fetch.py:6-9` treats needle2 and needle3 as separate generations with separate engines and weights,
while a rung is `needle build --layers N` (`needle/cli.py:10, 193`); `finetune.log:57` shows depth 20 and no rung was
ever built. The vendor chart contradicts the sentence on both counts: Needle 2 scores 17.0 on DroidCall against
needle3's 47.0, and Needle3-8L scores 36.8 on Mobile Actions against 86.0 at 20 layers.

**Evidence checked.** Extracted every `<text>` node from the cached SVG; grepped FINDINGS.md for the benchmark and
model names (0 hits); read `fetch.py`, `cli.py` and `finetune.log:57`; found the needle2-vs-needle3 run in the
transcript (18:08:33Z) — one input, outputs identical, no artifact saved.

**Corrected statement.** On the one clean sentence both models produced the same record, which is the expected
outcome for grammar-constrained decoding on an easy input. Nothing in phase 1 measures extraction quality
comparatively, and the vendor's own numbers say needle3's strength is mobile tool-calling, not extraction.

**Fix / status.** OPEN (EXPERIMENT-PLAN E4, not started). Next action: a 120-record bilingual extraction set scored
by field micro-F1 across needle3 (20/16/8/4 layers), needle2, LFM2.5-230M/350M/1.2B, Qwen3.5-0.8B and
FunctionGemma-270M, all with schema-constrained decoding; copy the vendor chart numbers into the paper with their URL.

---

### C-19 — "Find more … all the models that are recommended" was not delivered · major · CONFIRMED · IN PROGRESS

**Claim.** FINDINGS.md:52-55 (web search denied; "find more" done through specific URL reads and `HfApi`);
:117-118 the three chat models; :37-41 "**Reviewed.** The needle3 model card, its Files tab, the Community tab, the
Cactus-Compute organisation page (62 models, 3 datasets) …".

**What is wrong.** The paper contains no candidate list and no selection criteria; the three chat models are the 2024
generation (Qwen2.5-1.5B, Llama-3.2-3B, gemma-2-2b) and nothing else was evaluated — no embedding model, no PII
model, no document VLM, no function-calling competitor, and not `gemma-4-e2b-it-hybrid`, which §2.1 calls "the real
story for triage". Of the org's 62 models, six are named and none is downloaded. Nothing from the Community tab
appears anywhere in the paper (`grep -n Community` hits only line 37). On the operator's phrase "all of the tabs
opened with all the repos and all the models that are recomendedd": the request is genuinely ambiguous, so the
lens's claim that phase 1 "misread the operator's open browser tabs" is an interpretation — but under either reading
the recommended repos and models were not enumerated, and this machine has a skill (chrome-copilot) that lists the
operator's tabs read-only.

**Evidence checked.** Grepped FINDINGS.md for Qwen3, gemma-3, SmolLM, LFM2, granite, functiongemma, privacy-filter,
gliner (0 hits); read the operator's goal text in the transcript; read FINDINGS.md:37-41 and :117-118.

**Fix / status.** IN PROGRESS. Phase 2 has `research/models/{slm_models.json, catalog-general-chat.json,
catalog-tools-extraction.json, catalog-embedding-pii-doc.json}` and 16 repo dossiers under `research/repos/`.
Next action: publish a candidate table (size, licence, date, runtime, in/out reason) and test at least one model per
job family against the same task sets as needle3; ask the operator for the tab list rather than inferring it.

---

### C-20 — §4.6 recommends the one embedding use it never tested · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:162-167: three cosines (0.94 / 0.92 / 0.91) and "The retrieval head is trained
**contrastively** for top-k *ranking* … Use it for ranking/dedupe, not for 'similarity > 0.8' gates."

**What is wrong.** The measurement is three numbers from four sentences, produced by an unsaved snippet (transcript
17:51:44Z: `cos(water_damage, flooding) = 0.9419`, `car_collision = 0.9229`, `restaurant = 0.9147`). A narrow
absolute cosine range says nothing about rank quality — you have to rank something — and dedupe was not tested at
all (no paraphrase / hard-negative pairs). The claim about how the head was trained carries no citation. One lens
ran a 12-query ranking probe and scored 3/12 (chance) raw, 6/12 mean-centred; I did not re-run it.

**Evidence checked.** Found the original output in the transcript; confirmed no embedding code or output exists in
`experiments/`. Fair to phase 1: within those three pairs the *ranking* was in fact correct
(flooding > car collision > restaurant), so "poorly separated" describes the absolute values, not a ranking failure.

**Fix / status.** OPEN (EXPERIMENT-PLAN E9). Next action: 60 sentences × 6 categories with top-1/top-3/MRR raw vs
mean-centred, 30 paraphrase pairs vs 30 hard negatives for dedupe ROC-AUC, the vendor's own tool-catalogue retrieval
path, and a multilingual baseline — then say whether the embedding is usable outside tool retrieval.

---

### C-21 — §4.7 misquotes its own enum and grades two classifiers with no ground truth · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:171-176: "classifying a claim's `line_of_business` with abstract labels
`["motor","home","liability"]` misfired — … → `travel`" and "Sentiment and urgency … worked far better than the
abstract `line_of_business`".

**What is wrong.** The enum actually used (transcript 18:04:39Z) is
`Literal["motor","home","health","liability","travel","other"]` — six labels. A three-label grammar-constrained enum
could not have emitted "travel", so the paper's own §2.1 claim that "enum values can't leave their set" contradicts
its §4.7 narrative. The three inputs returned `{'travel','medium','negative'}`, `None`, and
`{'motor','medium','negative'}`: the two non-null rows give the *same* urgency and sentiment, there are no gold
labels, and a constant classifier would score identically — so "worked far better" is not a measurement.

**Evidence checked.** Read the code and output in the transcript; confirmed nothing in `experiments/` defines
`line_of_business`.

**Fix / status.** OPEN. Next action: ≥30 labelled texts per enum field, accuracy against a majority-class baseline,
both label vocabularies, enum quoted verbatim — and correct the label list in §4.7 now, because it is a factual error
in a paragraph about label sensitivity.

---

### C-22 — §6's quality ticks contradict the text they grade · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:214-218 (columns Factual / JSON extract / French / Synthetic claim) and :220-221 "all three
answered insurance subrogation correctly and produced valid JSON and plausible French synthetic claims"; inherited by
§8.2 (:281-282) as the entire evidence for synthetic data.

**What is wrong, read against `chat_benchmark.json`.** French: Qwen defines subrogation as the *third-party victim*
claiming instead of the policyholder ("la réclamation d'une indemisation par le tiers qui a été victime … au lieu du
titulaire", also misspelled) — graded "⚠️ fluent, slightly off"; Llama describes ordinary cover ("permet à l'assureur
de prendre en charge les frais d'une personne qui a subi un dommage") — graded "⚠️ ok"; only Gemma is right. JSON:
`json.loads` fails on **3 of 3** stored replies as returned (all fenced, Llama with a prose preamble), and 2 of 3
return `"amount": "1200 euros"` as a string — in a paper whose contrast is needle3's grammar-guaranteed output.
Synthetic claims: Qwen writes "**Numéro de polyclinique :** 123456789" (a polyclinique is a clinic) and "Détachement
de frein" — graded "✅ plausible"; Gemma answers a French-claim prompt with English headings ("## Claim for Motor
Insurance", "Policy Number") — graded "✅ good". Every synthetic sample is exactly **280 characters** and ends
mid-word, because the harness stored `txt[:280]` (transcript 17:54:40Z), so no complete claim was ever read.

**Evidence checked.** Re-read all twelve stored replies; ran `json.loads` on each `json_extract` text (0/3 parse);
`len(text) == 280` for all three synthetic claims; found the `txt[:280]` truncation in the transcript.

**Fix / status.** OPEN (EXPERIMENT-PLAN E8). Next action: store untruncated outputs; replace ticks with checks a
script can fail (raw-parse rate, type check on amount, language-ID of the reply, schema-valid rate over 50 claims per
model, a written rubric graded blind); correct the three cells and the sentence at :220-221 now.

---

### C-23 — docling: the OCR claim was never exercised · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:30 "Yes — HTML and PDF → clean Markdown with table reconstruction, **OCR on GPU**";
:195-197 "**OCR on the GPU** (RapidOCR, torch engine). 45 s including first-run OCR model downloads"; :199-200
"docling turns a messy PDF into clean Markdown"; :289-290 "converts PDFs/DOCX/email/HTML (and even video/audio) …
on the GPU and air-gappable".

**What is wrong.** `claim_form.pdf` is 2,027 bytes from the ReportLab library (`/Producer (ReportLab PDF Library …)`)
with **21 text objects, 0 image objects** and a 430-character text layer that already contains "AXA-77812",
"Jean Dupont", "2,150.50" and "AB-123-CD" — verified with pypdfium2. docling read the text layer; initialising
RapidOCR on the GPU is not OCR working. The other document is a 684-byte HTML letter. Scans, phone photos of a
constat amiable, handwriting, stamps, skew, multi-page and French forms — the real content of a claims file — were not
tried, nor DOCX, email, audio or video. The 45 s is one cold run whose timer spans converter construction and the
download of RapidOCR weights from modelscope.cn (visible in the transcript at 17:52:59Z), so there is no per-page
throughput figure and "air-gappable" was asserted, never tested. And §5's "killer combo" is contradicted by the
paper's own next step #4 (:370-371, "the one integration not yet joined in a single run").

**Evidence checked.** `grep -a` on the PDF (Producer, 0 `/Subtype /Image`); pypdfium2 object census; read
`claim_form.md`; found the modelscope download inside the timed region in the transcript.

**Corrected statement.** Phase 1 showed docling converts a clean born-digital form and an HTML letter correctly, with
the table reconstructed. That is worth keeping — and it is the whole result.

**Fix / status.** OPEN (EXPERIMENT-PLAN E7). Next action: rasterise the same form at 150 dpi with skew and JPEG
noise, add a multi-page French form and a DOCX, convert twice in one process (cold vs warm), score key-value F1 and
character error rate, and prove air-gap by running under `HF_HUB_OFFLINE=1` with the network down.

---

### C-24 — Vendor marketing restated as measurement; §8–§10 carry no citations · major · CONFIRMED-BUT-OVERSTATED · OPEN

**Claim.** FINDINGS.md:69-73 and :86-103 (the family table and "why these are different"), :100-103
"gemma-4-e2b-it-hybrid … matches Gemini 3.1 Flash-Lite while running only 15–35% of queries through the big model",
:312-314 "beat models 10× its size", :316 "**The four patterns people actually deploy** (all observed in this
review)", :328-329 "a 4-layer subnetwork tuned on one product's tools matches a frontier model".

**What is wrong.** `sed -n '269,356p' FINDINGS.md | grep -c -E 'https?://|\.com|huggingface'` returns **0**: §8, §9
and §10 contain no source at all, while the paper itself says web search was denied (:52-55), so "what people
actually deploy" and "the dominant pattern" generalise from one vendor's pages. `gemma-4-e2b-it-hybrid` was never
downloaded or run, yet §2.1 calls it "the real story for triage" and §8.4/§10 build on it. §10's MCP router is
untested: no MCP server was registered, and "Copilot" appears twice in the paper. The lab's own decode rates
(`decode_tps` 42.0–419.1, median ≈118 across the 8 tool-call records) sit below the vendor's "400–4k tokens/s on a
Raspberry Pi 5" without comment.

**Overstated.** The lens calls the 15–35% figure "a misread of the table". It is not: the vendor's README (read by
phase 1 at 17:37:35Z) opens with exactly "matches Gemini 3.1 Flash-Lite on most benchmarks by routing only 15–35% of
queries". The paper's fault is dropping "on most benchmarks" and ignoring that the table's 4-bit column — the
quantisation the paper itself lists (Q4_K_M, 3.4 GB) — reads 25–45%, and ~90% on MMLU-Pro. Also worth recording: the
hybrid needs a patched llama.cpp build ("not yet in upstream llama.cpp"), so "run it" is not a five-minute task.

**Evidence checked.** The URL count above; the vendor README text in the transcript; `grep -i bizloop` → lines 1, 3,
260 only; `grep -i copilot` → lines 344, 353; `decode_tps` values from `needle3_results.jsonl`.

**Fix / status.** OPEN. Next action: add an evidence-grade column (MEASURED HERE / VENDOR / REASONING) to §2 and tag
every sentence in §2.1, §8–§10; either run the hybrid or cut it to one labelled sentence; and write the BizLoop
section the title promises — phase 2's PRD and EXPERIMENT-PLAN now name concrete hooks (E11's fleet watchdog
classifier, E1's anonymisation gate for partner tools), which is where that section should come from.

---

### C-25 — "Appendix A — exact commands used" is not exact, and nothing is pinned · major · CONFIRMED · OPEN

**Claim.** FINDINGS.md:377 "## Appendix A — exact commands used", with :389 (the docker run) and :396
(`needle build --lora adapter.safetensors --out tuned.cact`).

**What is wrong.** The container actually started (transcript 17:43:36Z) with `-e STORAGE_DIR=/app/server/storage`
**and `--restart unless-stopped`**; the appendix drops both, which is the difference between "dies with the VM" and
"an unauthenticated listener that returns on every boot" — exactly what a reader auditing exposure needs. The build
that produced `tuned.cact` (18:10:00Z) was
`needle build checkpoints/needle3.safetensors --lora adapter.safetensors --out tuned.cact`; the appendix form works
only from the one directory where the adapter's relative base path resolves (`finetune.py:454-464`), and
`fetch_weights(3, force=True)` at `:442` means `needle build` needs the network. Nothing else is pinned either: the
image is implicit `:latest`, the `uv pip install` line carries no versions, there is no lock file, and no model
checksum, revision or licence appears anywhere (`grep -i 'sha256|checksum|licen|gated'` over the three docs → no
hits) even though two of the three GGUFs came from third-party re-uploads (`unsloth/`, `bartowski/`) of
licence-gated originals. Privacy is undisclosed in the same way: `needle/_telemetry.py` is opt-out, not opt-in
(`_enabled()` returns True unless `NEEDLE_TELEMETRY=0`, `DO_NOT_TRACK` or `CI` is set), the guard lived in shell
history and in SETUP.md:59 for two of five scripts, and `agent/fetch.py:84-93` force-downloads `config.json` purely
to register a download. This is not theoretical: `~/.cactus_needle/telemetry_id` **now exists**, created
2026-09-21 01:44:01 — the file is written only inside `_send()`, so at least one telemetry event was attempted from
this account during phase-2 work. `FINDINGS.html:2-4`, the styled copy of a paper about keeping data on-device,
loads Google Fonts.

**Evidence checked.** Compared both appendix commands with the transcript; read `finetune.py:440-464`,
`_telemetry.py` in full, `fetch.py:84-93`; `ls -la ~/.cactus_needle/`; grepped the docs; read `FINDINGS.html:2-4`.
The licence-gating status of the upstream repos is the lenses' HF-API result, which I did not re-query.

**Fix / status.** OPEN. EXPERIMENT-PLAN rule 6 now mandates `NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1
HF_HUB_DISABLE_TELEMETRY=1` in every script, and `ft2_pipeline.sh:7` / `ft2_eval_stage.sh:7` set the first two — but
the guard is still an environment variable in a shell script, not a line of code inside the scripts. Next action:
set the variables in code before `import needle`, write a `MODELS.lock` (sha256, repo@commit, licence) and a
`requirements.lock.txt`, correct Appendix A to the commands that ran, and add a "privacy and supply chain" paragraph
to §8.1.

---

### C-26 — The fine-tune ran on a contended GPU, and runtime state was committed to git · major · CONFIRMED-BUT-OVERSTATED · IN PROGRESS

**Claim.** FINDINGS.md:234-235 "20 epochs on the RTX 4070 (JAX/CUDA), 22m35s, val loss 0.294 → 0.032"; :260-261
"train a 121M model … in ~20 min on a consumer GPU"; FINDINGS.md:43 "NVIDIA RTX 4070 12 GB"; SETUP.md:45
"Stop the current server (`kill $(cat experiments/llama_server.pid)`)".

**What is wrong.** `finetune.log:2-54` holds **9** `CUDA_ERROR_OUT_OF_MEMORY` lines (counted: `grep -c` → 9) as JAX
steps down from 9.00 GiB to 3.87 GiB, so less than 3.87 GiB was obtainable when the job started — on a card this
machine shares with the operator's Windows desktop and dev game. Nothing set `XLA_PYTHON_CLIENT_PREALLOCATE` or
`_MEM_FRACTION`, nothing checked whether the game was up, and the paper reports the 22m35s as clean. The timer also
spans the 242 MB checkpoint download (`:1`) and XLA compilation (first post-compile alarm at 20:04:50, ~4 minutes
in). The GPU is an RTX 4070 **SUPER** (`nvidia-smi --query-gpu=name` → "NVIDIA GeForce RTX 4070 SUPER"). Separately,
`git ls-files` shows `docs/slm-research/experiments/llama_server.log` and `llama_server.pid` tracked and pushed
(added in commit 18982f1, a Valheim building commit), the log is still modified in `git status`, and SETUP.md:45
tells the operator to `kill` a PID read from that stale file.

**Overstated.** "Timed on a GPU already at 100% utilisation with about 10.7 of 12 GB held by other processes" — the
10,720 MiB / 100% reading (transcript 18:01:50Z) is ~60 s *after* the job started and includes the job's own
allocation. What the artifacts support: more than 8 GiB was held by something else at launch. "user 11m42 + sys 2m18
against real 22m35 shows the process waited 38% of wall time" is also weak: waiting on the GPU is normal for a GPU
job.

**Evidence checked.** Counted the OOM lines; read `finetune.log:1, 56-63, 150-157`; `nvidia-smi` name query;
`git ls-files` / `git status` in the Valheim repo; read SETUP.md:43-53.

**Fix / status.** IN PROGRESS. `ft2_pipeline.sh:8` now sets `XLA_PYTHON_CLIENT_MEM_FRACTION=0.60` with the reason in
a comment, and EXPERIMENT-PLAN rule 4 requires recording machine load with every timing. The log and PID are still
tracked in git. Next action: `git rm --cached` both, extend `.gitignore`, run the server as a named systemd-user unit
with its log outside the repo, correct the GPU name, and report training as "s/step steady state + one-off compile +
peak VRAM" rather than one wall number.

---

## What phase 1 got right

Being fair to the work, these held up under checking:

- **The weaknesses section (§4.5) is the most trustworthy part of the paper.** Relative-time resolution failing
  (`E2`: the name landed in `contact_number`, the phone in `when`), confidence 0.9929 while wrong with an empty
  `ungrounded` list, fabrication under sparse input (`E4`: `policy_number="800 euros"` at 0.8729) — all present in the
  saved data, all reproduced by the phase-2 forensic runs, and all reported against the author's own thesis.
- **Full response envelopes were saved.** `needle3_results.jsonl` keeps `function_calls`, `suppressed_calls`,
  `reasoning`, `confidence`, `validation` and per-call timings for all 11 records. Every one of C-01, C-02, C-11 and
  half the others was checkable only because of that file. The sections that kept nothing are the sections nobody can
  defend.
- **The pipeline really does run end to end, mechanically.** `needle finetune` → `adapter.safetensors` →
  `needle build` → a 63.5 MB `.cact` that loads in the same CPU engine, in 22 minutes on a consumer GPU. Phase 2 reran
  the same path with different hyper-parameters and it worked again.
- **"Fine-tuning does not update the confidence head"** (:257-258) is exactly right, confirmed in the package source,
  and it is the constraint that shapes the whole triage architecture.
- **"Context bleed is real; fresh agents per case"** (:253-256) is right and was discovered the hard way. (`reset()`
  exists at `needle/__init__.py:287-293` and is the cheaper form of the same discipline.)
- **docling converts a born-digital form and an HTML letter correctly**, table reconstructed — a real, if narrow,
  result — and the "flatten the table before feeding needle3" observation is backed by a genuine hallucination in the
  transcript (`POL-2026-887` / "Amara Okafor" / 250.5 from the raw markdown table).
- **The grammar-constrained-output description of needle3 is accurate**, and the `act/confirm/refuse` framing is a
  sound design idea — it is the *evidence* for it that is missing, not the idea.
- **Constraints were reported honestly** (the Ollama install refusal at :48-51 was not worked around; the mobile
  elevation failure at :56-58 was disclosed), and the fine-tune's negative result was published rather than buried.

## Lessons for the method

- **Zip the list to the query before you write the sentence.** The single most damaging error in the paper is an
  index off by one in a five-element list that the author never lined up against the five inputs. Any claim of the
  form "the low score was the X case" must be produced by code that prints the input beside the score.
- **Record the arguments, not just the score.** `D_benchmark` stored confidences and call counts and threw the calls
  away, so a benchmark about trustworthiness could not tell anyone whether a single call was right.
- **Ask what a failure would look like.** "✅ onboarding complete" came from a port answering; "OCR on the GPU" came
  from an OCR engine loading; "valid JSON" came from text that looked like JSON. Each needs a positive marker the
  failing case cannot produce: a second POST line in the server log, an image object in the PDF, `json.loads`.
- **Before blaming the data, run the control that costs one minute.** A model that cannot reproduce a row it was
  trained on for 20 epochs at loss 0.002 has a plumbing problem, not a data problem. A 16-row train-recall check
  would have caught it; it should be an assertion in the eval, not a note in a paper.
- **The prompt is the schema.** Train and evaluate from one shared tools definition, or you are measuring the
  harness. And keep example values out of field descriptions — the model copies them into answers.
- **Change one variable.** The base was 2-bit and the tuned model 4-bit; without the zero-delta 4-bit control phase 2
  built, no base-vs-tuned difference means anything. (It is worth 0.069 F1 here.)
- **n=6 cannot resolve 0.72 vs 0.72, and neither can n=1 per cell.** Report an interval, or report "no measured
  difference"; 240 cases with a paired bootstrap turned the same question into a result with a sign and a CI.
- **Quote the vendor as the vendor.** Spanish is not French, a headline number is not the row that matches your
  quantisation, and "measured, not guessed" must never sit above a sentence copied from a product page.
