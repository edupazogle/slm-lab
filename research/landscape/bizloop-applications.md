# Where small language models fit the BizLoop refactor

2026-09-21 · research subagent for the supervisor session · desk research only: nothing here was built or run.
Every number below is quoted from a file or URL named next to it. **Pass bars are proposals for the operator to set, not
measurements.** Anything not checked against a source is marked UNVERIFIED.

"SLM" here means a model of about 4B parameters or fewer that runs on a laptop CPU/GPU, in a browser (wllama/WebAssembly),
on a phone, or self-hosted on a small server inside the GDAI subscription.

---

## 0. Verdict

- **No SLM application can cite a lab result yet.** The phase-1 paper's confidence, grounding, anonymisation, French and
  speed findings were refuted or shown to be n=1 by the adversarial review (`slm/critique/raw-findings.json`, 80 findings:
  16 critical, 49 major, 15 minor; `CRITIQUE.md` had not been written when this file was finished). The needle v2 eval has
  no results (`slm/experiments/v2/ft2_report.json`: `"n_eval": 240`, `"conditions": {}`). Each candidate below starts
  unproven.
- **The PRDs already solve residency on the server.** Supervisor and PM run on "Azure OpenAI GPT-5.x, Data Zone Standard
  (EU)" (Implementation PRD v2 §2, D3), and the PRD's own diagram labels the partners "Partner SaaS EU: Harvey · CB Insights
  · ElevenLabs" (§4). So "we need an SLM for residency" is mostly false. What is left for SLMs: (a) **data minimisation**
  before partners, experiment providers and traces; (b) **zero-marginal-cost checks that run on every event**; (c) inputs
  that **start on the user's device** and never have to leave it.
- **17 candidates, ranked in §4.** Run first: **(1) the watchdog garble / pane-state classifier**, **(3) the PII
  pseudonymisation gate**, **(4) claim extraction for the review digest (it can only demote a claim, never promote one)**,
  plus the half-day plumbing test **(2)** that puts a self-hosted SLM in `config/models.yaml`.
- **Weak ideas, where a regex, a template, a lookup table or the frontier model wins:** card JSON generation, ISP
  four-bucket classification, cost-line estimation and routing, French generation, guard models, synthetic data, offline
  phone use (§6).

---

## 1. What the PRDs fix before any model is chosen

1. **The model layer is configuration.** "The harness is model-agnostic by contract: supervisor, PM, workers and skills
   runner are configuration, not code" (Implementation PRD v2, §2 Decisions taken, D2). Hard rule 1: "Every LLM call goes
   through `core/models.py`, which resolves a role (`supervisor`, `pm`, `worker`, `skills_runner`, `pm_arm`) to a binding
   in `config/models.yaml` … Bindings carry `residency: eu|non-eu`; in `AXA_ENV=dev|pilot` a non-EU binding raises"
   (`docs/refactor/mvp_bizloop_refactor/CLAUDE.md`, Hard rules). The role list is closed, and no residency value means
   "on the user's device".
2. **Residency rule.** "AXA data (skill inputs, project artefacts, proofs) only reaches deployments in the EU data zone or
   regional EU deployments, or EU-resident partner instances" (Implementation PRD v2, §5 Model layer, "Residency rules").
3. **What the PRDs say about partner tools.** Harvey is a "Confirmed hosted MCP with OAuth per user; EU instance"
   (§6 Backend, "Added in v2"). The architecture diagram labels all three partners EU (§4). I found no sentence that
   confirms an EU instance for **CB Insights** (UNVERIFIED). The Experience PRD plans for the non-EU case: "Partner
   answers: the data, the partner named as source, residency note when outside the EU" (Experience PRD v2, §6.4). A
   CB Insights call carries a company name ("Profile Kalepa for a claims triage pilot", Implementation PRD §9.1). That is
   public data, so there is nothing to anonymise in it.
4. **Where the privacy exposure actually is.** "DPIA (personal data: UPN, decisions; skill inputs may contain vendor and
   pilot data)". "Langfuse traces contain prompts and outputs". "No AXA Confidential data in the experiment track until
   their assessments close" (Implementation PRD v2, §8 Artefacts and Additional controls).
5. **Numbers are measured, never estimated.** "Runtimes that do not report tokens show `n/a`; the product never estimates a
   token count" (`docs/bizloop-enh/PRD_DesignBrief.md`, §8.1 Fleet). Local models are priced at 0 per token, and compute is
   charged separately: "local = 0 tokens price, compute charged below" with `gpu_hour_eur: 1.20`
   (`docs/bizloop-enh/economics.example.yaml`). So an SLM's cost line shows compute, not "free".
6. **Experiments are labelled.** "Experiments are labelled as experiments wherever they appear; production claims never
   cite experiment results" (Experience PRD v2, §4 Rules across surfaces).
7. **Group policy comes before technology.** "Group-sanctioned LLM endpoint: Secure GPT on Azure OpenAI; no public/direct
   consumer model access" (`design/DECISIONS.md`, Constraints from the AXA landscape). Whether open weights on AXA laptops
   or in a GDAI container count as allowed is an ISP question. No document answers it (§8, Q1).
8. **Copilot cannot reach a laptop.** "Copilot services run outside customer VNets: the gateway needs a reachable listener
   (APIM), backends stay private" (`design/DECISIONS.md`). An on-device SLM can never be a tool that Copilot calls.
9. **Every deployment needs a model card.** "One model card per deployment (vendor, version, region, data zone, limits,
   evaluation results, date); stored with the ISP file" (Implementation PRD v2, §5, "Model cards and change control").
10. **The first-party small tier is a direct competitor.** Foundry lists `gpt-5-nano` and `gpt-5.4-nano` among models sold
    by Azure (https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure,
    ms.date 2026-09-04). They bring no new supplier and fall under the same contract. Their Data Zone EU availability is
    UNVERIFIED. Every **server-side** SLM candidate below has to beat "call nano in the EU data zone". Only on-device and
    offline candidates avoid that comparison.

## 2. What is actually known about SLMs here

- **Catalogs** (`slm/research/models/catalog-*.json`, 61 entries): download counts and licences come from the HF API; the
  VRAM figures say "Estimate, not measured"; benchmark figures are vendor claims.
- **Browser constraints from the catalogs:** wllama has a "Single-file limit 2 GiB" (catalog evidence citing wllama
  README.md:38). Qwen3.5-4B Q4_K_M at 2,741 MB breaks it. Ministral-3-3B's official Q4_K_M is "460,640 B under 2 GiB". Gemma-4-E2B,
  Phi-4-mini, BitNet and needle are marked not wllama-compatible. The PII models (GLiNER, OpenAI Privacy Filter,
  Piiranha) are ONNX for transformers.js / onnxruntime-web, not GGUF.
- **Only measured browser number:** `slm/app/bench_results.jsonl` run `smoke2`, SmolLM2-360M-Instruct Q8_0 (386 MB) in
  headless Chromium 153 on a 4-thread VM, WebGPU = SwiftShader (software). Results: 488 prompt tokens, prefill ≈ 29 tok/s,
  decode ≈ 12.3 tok/s, **TTFT ≈ 16.9 s**, load ≈ 19.7 s. `slm/app/web/src/data/findings.json` records this as "functional run
  verified; timed run pending a quiet machine", so it is indicative only. It still settles one design point: **a browser
  SLM with a prompt of a few hundred tokens costs tens of seconds on this class of machine**, so long-context uses (whole
  reviews, whole documents) belong on a server.
- **Phase-1 claims that must not be reused** (critique index → finding):
  - #0, #25, #39, #54: "confidence tracks completeness" attached the 0.55 to the wrong query.
  - #56: the grounding flag has "about 62% precision and 62% recall".
  - #1: the vendor's own chart puts needle3-20L below LFM2.5-1.2B and Qwen3.5-0.8B on DSTC8, SNIPS and BFCL v4.
  - #2: anonymisation rests on one English email, and a date of birth leaked.
  - #8: French. The needle3 tokenizer has an 8,192-piece vocabulary with no "â".
  - #66: the fine-tune "tie" was a harness artefact. With the training schema, tuned scores 0.83 vs base 0.675 (n=6).
  - #74: fine-tuning removes the confidence head. This is also DECISIONS D4.
  - #38: cactus-needle telemetry is on by default.
  - #27, #53: the CPU speed table was a setup artefact.

---

## 3. The candidates

The fields are the same for each: **Serves** (PRD quote, file and heading) · **SLM does** · **Why an SLM** · **Models** (from
the catalogs) · **Experiment** (dataset and size, metric, proposed pass bar, kill condition) · **Effort / Risk** ·
**Verdict**. Candidates are numbered in rank order (§4).

### C1. Garble and pane-state classifier for the fleet watchdog

- **Serves:** "Symptom the operator hit twice: a delegate produces gibberish or sits idle and the supervisor does not
  notice" (`CLAUDE.md`, "The agent-failure lesson that must never recur"). "`GARBLE <job> <agent> non-latin=..%` | output
  is model garbage" (`docs/FLEET-WATCHDOG.md`, events table). In the product: Agent "Status: `working` · `idle` ·
  `blocked` (three values only)" and "`attention` when … an agent is `blocked` > 30 min" (`PRD_DesignBrief.md` §5, §6.3).
- **Today's instrument, and what its failure looks like.** `tools/vf-fleet-watch` `garble_and_mtime()` measures the share
  of characters beyond Latin Extended-B in the last 6,000 bytes, against threshold 0.15. `tools/vf-fleet` `classify()` applies the same ratio
  to 40 pane lines and reports "busy" only if it sees `esc to interrupt|working...`, otherwise "idle". Three blind spots
  follow:
  - Latin-script garbage (repetition loops, word salad, mixed Romance languages) scores about 0 and reads as healthy.
  - Legitimate French or CJK output can trip GARBLE.
  - "idle" lumps together waiting for a permission prompt, waiting for an answer, finished, and an API error such as the
    429 "suspended due to insufficient balance" recorded in `Valheim/cockpit/jobs.jsonl`.
- **SLM does:**
  - (a) perplexity / entropy of the tail window under a small LM, as a garble score;
  - (b) a 7-way pane state (`working`, `waiting-permission`, `waiting-answer`, `finished-report`, `api-error`, `garble`,
    `loop`) from a small instruct model constrained to a JSON enum.
- **Scope limit:** for cockpit **jobs** the run file is structured stream-json. The 59 transcripts in
  `Valheim/cockpit/runs` hold 3,730 `assistant` and 41 `result` events (counted for this file). Completion and failure
  should be parsed from that JSON, not judged by a model. The SLM is for text quality and for the TUI panes, including the
  kimi TUI "which has no cross-session channel" (`CLAUDE.md`).
- **Why an SLM:** it runs every 20 s (`VF_WATCH_INTERVAL` default) on every pane, indefinitely. A frontier call per poll
  makes no sense. It must also keep working when the provider is failing, which is exactly when it matters. Transcripts
  stay on the machine.
- **Models:** for perplexity, Gemma-3-270M-it (292 MB) or LFM2.5-350M (379 MB). For state, LFM2.5-350M or Qwen3.5-0.8B
  (533 MB) (`catalog-general-chat.json`). Run on CPU llama.cpp, not in a browser.
- **Experiment:**
  - Data: 6,000-byte windows from the 59 transcripts (258 MB), plus at least 200 labelled tmux captures (40 lines each).
  - Positives: the real incidents are few (SUPERVISOR-LOG.md mentions "garble" 4 times). Add synthetic positives:
    high-temperature samples, loops, language-switch splices and Latin word salad. Negatives must include clean French and
    CJK text.
  - Baselines: the current non-Latin ratio, zlib compression ratio, a regex list.
  - Metrics: recall and precision per slice, false alarms per agent-hour of clean replay, CPU ms per poll.
  - **Proposed pass bar:** garble recall ≥ 0.95 overall and ≥ 0.90 on the Latin-script slice; ≤ 1 false alarm per 8
    agent-hours; pane-state accuracy ≥ 0.90 with `waiting-permission` and `waiting-answer` recall ≥ 0.95; ≤ 1 s CPU per
    poll.
  - **Kill** if zlib + regex comes within 2 points of the SLM's recall.
- **Effort:** S. **Risk:** low. Real positives are few, so it could overfit to synthetic garble.
- **Verdict:** strong on feasibility. The value is internal today, and the same agent-status signal becomes product value
  (`working/idle/blocked`).

### C2. A self-hosted SLM as a normal binding in `config/models.yaml` (enabler)

- **Serves:** D2 above. "Model endpoints: Anthropic API, OpenAI-compatible APIs, local runtimes (vLLM, llama.cpp)
  reporting usage blocks" (`PRD_DesignBrief.md` §13). PoC success criterion: "Code changes needed to deploy to the AXA
  `dev` environment | Parameters and bindings only" (Implementation PRD v2, §9.5). The llama.cpp usage hook already
  exists (`docs/bizloop-enh/ROADMAP.md` #11, done).
- **SLM does:** runs a llama.cpp or vLLM endpoint in the GDAI subscription in an EU region, bound as
  `{provider: selfhosted, deployment: <model>-q4, region: <EU>, residency: eu, price_ref: local_compute, pinned_version:
  <gguf sha256>}`. Every other server-side candidate needs this.
- **Why an SLM:** it gives moment 7 ("Switch the brain", Experience PRD §2) a third kind of endpoint, open weights you host
  yourself, next to GPT-5.x EU and Mistral. Residency follows the region you pick. Foundry's data-zone labels do not apply
  here: "Open-source and custom models that use managed compute don't use these types"
  (https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types, ms.date 2026-08-06). For a
  sovereign on-premises variant: Foundry Local on Azure Local, preview and by request, "Use OpenAI-compatible REST patterns",
  "Operate in disconnected environments"
  (https://learn.microsoft.com/en-us/azure/azure-sovereign-clouds/private/foundry-local/overview, ms.date 2026-09-13).
- **Models:** Ministral-3-3B-Instruct-2512 (Apache-2.0; French vendor, which fits Option 2's story) or Qwen3.5-2B
  (Apache-2.0).
- **Experiment:** run the VC-105 unit tests (`design/BUILD_BRIEF.md`) with the SLM binding, plus one sample card on
  `worker`. Checks:
  - (i) the usage block is collected, with tokens reported and not estimated;
  - (ii) the guard passes `eu` and raises on `non-eu`;
  - (iii) `bizloop.get_models` produces the residency sentence;
  - (iv) zero diff in `core/`.
  - **Pass:** all four. **Kill:** the test needs code changes.
- **Effort:** S. **Risk:** governance (§1.7) and supply chain. Phase 1 pulled ungated re-uploads of gated models
  (critique #17), so pin hash and licence in the model card. Contract gap: to mark on-device runs, add
  `location: device|tenant|vendor` beside `residency` rather than a third residency value, so the guard stays binary.
- **Verdict:** do it early. It is plumbing, not an application.

### C3. PII pseudonymisation gate before partners, experiment providers and traces

- **Serves:** the residency rule and the DPIA, Langfuse and experiment-track lines in §1.2 and §1.4. "Cards may be
  forwarded: minimum data on the card, depth behind sign-in" (Experience PRD v2, §9.3).
- **SLM does:** finds direct identifiers (names, emails, phones, IBAN, French NIR, plates, addresses, dates of birth) and
  swaps them for stable placeholders before text reaches three places: Harvey ("legal Q&A, knowledge-source research,
  Vault document analysis", Implementation PRD §6), the Mistral/Scaleway experiment track, and Langfuse traces. The
  placeholders are restored in the answer. It runs in `partner_proxy` and the skills runner (server-side, EU), or in the
  portal/tab for files uploaded there.
- **Why an SLM, stated honestly:** the argument is **data minimisation and experiment-track eligibility**, not "the
  partner is outside the EU" (§1.3). CB Insights needs no gate. Regex handles structured identifiers well (email, IBAN
  mod-97, the NIR key). Names and addresses in free French text need a model. Asking a frontier model to find the PII
  means sending it the PII, which is circular only for the experiment track. **"It never left your device" is false for
  anything attached in Copilot Chat:** that file has already reached Microsoft 365 before any tool runs. The claim holds
  only for inputs that start in BizLoop's own client surfaces.
- **Models** (`catalog-embedding-pii-doc.json`):
  - GLiNER multi PII v1: Apache-2.0; en/fr/de/es/pt/it; ONNX int8 349 MB. GLiNER.js has 27 stars and its last push was
    2025-03-02, "treat it as unmaintained".
  - OpenAI Privacy Filter: Apache-2.0, "Primarily English". The French fine-tune ships safetensors only.
  - LFM2-350M-Extract / LFM2-1.2B-Extract: prompt-driven, "recall is UNVERIFIED", LFM Open License.
  - Excluded: Piiranha (cc-by-nc-nd-4.0). Presidio has no France recognisers (critique #2 evidence).
- **Experiment:** the design already written in critique #2's fix action.
  - Data: 300 FR + 300 EN rows from `ai4privacy/pii-masking-300k`, plus 60 hand-built French claim and vendor emails
    (NIR, IBAN FR76, plate AB-123-CD, date of birth, two people, a garage).
  - Systems: regex; Presidio with custom FR recognisers; GLiNER multi PII; GLiNER2-multi; Privacy Filter; LFM2-Extract;
    Qwen3.5-2B with `json_schema`.
  - Metrics: span precision/recall per entity type; **document leak rate** (share of documents with ≥ 1 missed direct
    identifier); ms per document; placeholder round-trip.
  - **Proposed pass bar:** leak rate ≤ 1% per language (the DPO sets the real number); the best model + regex pipeline
    at least halves the regex-only leak rate; 100% placeholder restoration; ≤ 1 s per page on CPU.
  - **Kill** if regex plus recognisers meets the bar alone.
- **Effort:** M. **Risk:** a gate that misses one name in 50 creates false assurance. Placeholders may degrade partner
  answers: measure on 20 Harvey cases, if access allows (UNVERIFIED).
- **Verdict:** the most valuable external candidate. It feeds the DPIA (pilot week 2) and is the lab's most overstated
  claim.

### C4. Claim extraction for did / verified / claimed-not-verified (demote-only)

- **Serves:** "Separates verified from claimed | Every review: did · verified · claimed-not-verified, in that order"
  (Experience PRD v2, §5 Behaviour requirements). Review digest: "did / verified / claimed-not-verified (≤ 3 each)" (§6.1).
  "Done means reproduced" (refactor `CLAUDE.md`, Hard rule 8). "A delegate's report is a claim" (`CLAUDE.md`).
- **SLM does:** it does **not** assign buckets. Whether something is "verified" is a fact in the event log: a `done` event
  written after the supervisor reproduced the proof, stored under `proofs/<project>/<card>/`. The SLM turns free-text
  agent reports into records `{claim, card_id, artefact, evidence_cited}`. The schema has **no "verified" value**, so the
  model can only list claims. A claim moves to "verified" only through a join with the event log.
- **Why an SLM:** it runs on every report. A project produces "96 reviews (24h × 4)" per sprint (`PRD_DesignBrief.md`
  §14). It is a narrow extraction task and its inputs stay in the tenant.
- **Models:** LFM2-1.2B-Extract (French listed), NuExtract-2.0-2B (MIT), Qwen3.5-2B with `json_schema`. Run server-side.
- **Experiment:**
  - Data: result texts of the 53 finished jobs in `Valheim/cockpit/jobs.jsonl` (59 dispatched, 53 finished, 6 timeout,
    4 stopped) and 22 `docs/briefs/*.report.md`. Use the SUPERVISOR-LOG.md verdicts as ground truth on which claims later
    held. Target: about 400 labelled claim sentences.
  - Baseline: a regex cue list ("pass", "green", "OK", "deployed", test counts).
  - Metrics: claim recall (a missed claim silently drops out of "claimed-not-verified"), precision, card-link accuracy.
  - **Proposed pass bar:** recall ≥ 0.95, precision ≥ 0.80, zero promotions (guaranteed by the schema).
  - **Kill** if the regex reaches recall ≥ 0.90.
- **Effort:** M. **Risk:** misses are silent, so the frontier supervisor still reviews the list. The SLM only drafts it.
- **Verdict:** strong. It sits on the P0 honesty behaviour and the data is already in the repo.

### C5. Scan proof artefacts for secrets and PII before display

- **Serves:** "Proof screenshots are reviewed for secrets before display (P1 automated)" (`PRD_DesignBrief.md` §14
  Security). "Retention of proof screenshots and logs (they may contain business data)" (§16, Q7).
- **SLM does:** OCRs screenshots, then runs regex/entropy secret detectors and C3's PII pass, then blocks or blurs.
- **Why an SLM:** only the OCR step. The part that catches secrets is regex, and proofs never leave the tenant.
- **Models:** granite-docling-258M (English only); Qwen3-VL-2B-Instruct (multilingual, "~2.2 GB working set -
  desktop-class"); or non-LM OCR (docling's RapidOCR), which may be enough.
- **Experiment:**
  - Data: 212 PNG + 2 JPG proofs from `Valheim/cockpit/stakeholder/media` (game screenshots, clean negatives), plus 100
    synthetic terminal and browser shots with planted fake keys, tokens, emails and names.
  - **Proposed pass bar:** 100% planted-secret recall; ≤ 5% false blocks on the real proofs.
  - **Kill the model part** if non-LM OCR matches its recall.
- **Effort:** S–M. **Risk:** low-contrast text is missed, so the "scanned" badge must state the instrument's limits.
- **Verdict:** real requirement, but regex carries the load. Medium.

### C6. A labelled SLM track in the bake-off ("Switch the brain")

- **Serves:** "Evaluation set: 40 tasks from real BizLoop sprints … plus 20 skill runs"; "Decision rule: … best
  consensus score at no more than 1.5× the cost per Done card of the cheapest candidate scoring within 5 points"
  (Implementation PRD v2, §5 Bake-off). Experiment result card: "track (Mistral, sovereign infra), what was tested,
  result vs baseline, labelled 'experiment'" (Experience PRD v2, §6.1).
- **SLM does:** runs as an extra candidate on **worker tasks and skill runs only**, never as supervisor or PM ("Open-ended
  reasoning and factual recall are weak in models under 2B parameters", `findings.json` limits). Two uses:
  - an honest floor for the PRD's own "Model Router on worker tasks: small model first, escalate on rejection" (§5 Routing);
  - a check on the eval set itself: a slice where a 3B model scores close to the frontier does not discriminate between
    candidates.
- **Models:** Ministral-3-3B-Instruct-2512, Qwen3.5-4B (server only; above the wllama file limit), SmolLM3-3B.
- **Experiment:** run VC-504's `config/bakeoff.yaml` unchanged, with PRD metrics (first-pass acceptance, proof
  reproduction, consensus, findings per Done card, cost per Done card, latency).
  - **"Useful" bar:** within 5 points of the best candidate on at least one worker-task category, at ≤ the cheapest
    candidate's cost.
  - Otherwise it is reported as the floor. Either way the result is shown as an experiment.
- **Effort:** S once VC-504 exists. **Risk:** an audience reads a labelled experiment as an endorsement, which is the PRD
  anti-pattern "experiment results presented as production" (§8).
- **Verdict:** cheap and on-narrative. It depends on the refactor's bake-off being built.

### C7. Decision-vs-question triage in front of the Decision card

- **Serves:** "The PM asks decisions, not questions it could answer from the project" (Experience PRD v2, §4).
  "Proactivity boundaries: … may not start a sprint, change a rate card, switch a model or accept a card as Done — those
  belong to the owner, the admin, the operator and the supervisor" (§5). "Decision-first contact | … ranked by waiting
  time and impact" (§8).
- **SLM does:** sorts each candidate interrupt into one of four routes: owner decision; answerable from the project (back
  to the supervisor, with the source); an operator, admin or supervisor matter; or batch it into the next review. Its
  confidence comes from label-token logprobs, with an abstain band that falls back to the frontier PM.
  **Do not use needle3 confidence** (critique #0, #56; D4).
- **Why an SLM:** a cheap gate on every event. The saving is modest: the PM model composes the card anyway, so only
  non-decisions are saved.
- **Models:** Qwen3.5-2B; LFM2.5-1.2B-Instruct (vendor IFEval 86.23); Granite-4.0-1B.
- **Experiment:**
  - Data: 300 candidate interrupts from `Valheim/cockpit/SUPERVISOR-LOG.md` (832 lines), `stakeholder/feed.json`
    (11 decisions, 40 findings, 21 log entries) and `answers.jsonl` (15), each labelled by two people.
  - Metrics: missed-decision rate (a real decision routed away, the costly error), false-decision rate, ECE.
  - **Proposed pass bar:** at ≥ 60% auto-routed coverage, missed decisions ≤ 1% and false decisions ≤ 5%.
  - **Kill** if the PM prompt alone meets this at acceptable cost. That needs `price_ref`, which no file I read gives.
- **Effort:** M. **Risk:** subjective labels, little real data.
- **Verdict:** medium.

### C8. Filling card slots under a JSON schema (not generating card JSON)

- **Serves:** "Adaptive Cards: schema 1.5, `Action.Execute` for state changes, `refresh` block … card templates in
  `pm/cards/` with a test that renders each with sample data" (refactor `CLAUDE.md`, Conventions). Slot constraints:
  Decision "2–4 lines of context"; Skill result "summary ≤ 120 words" (Experience PRD v2, §6.1).
- **SLM does:** fills the **data object** (question, context lines, rationale, digest bullets) under a JSON schema with
  `maxLength`/`maxItems`. The template supplies the layout: "Templating enables the separation of data from the layout in
  an Adaptive Card" (https://learn.microsoft.com/en-us/adaptive-cards/templating/). That page names templating SDKs for
  .NET and NodeJS only. The PM is Python (VC-401), and a Python templating package is UNVERIFIED. Numbers bypass the model
  entirely: "Every number is traceable" (Hard rule 7).
- **Why an SLM:** routine cards (hourly digest, sprint status, morning digest) for every owner. Grammar-constrained
  decoding makes invalid JSON impossible: "wllama exposes response_format json_schema + GBNF grammar" (catalog evidence).
  Osmosis-Structure-0.6B's "only job is to re-emit another model's free-text answer as schema-valid JSON".
- **Models:** LFM2.5-1.2B-Instruct, Qwen3.5-2B, Osmosis-Structure-0.6B.
- **Experiment:** 100 event bundles, turned into slots for Decision, Review digest and Sprint status.
  - **Proposed pass bar:** 100% schema-valid; ≥ 98% within length limits; ≤ 1% unsupported facts (two raters against
    the source events); 0 breaches of "Vocabulary (use verbatim)" (`design/DECISIONS.md`); render tests green.
- **Effort:** S. **Risk:** faithfulness below 2B.
- **Verdict:** weak as "generate cards"; medium as a slot filler.

### C9. Embedding dedupe and learning which insights get dismissed

- **Serves:** "never two cards for one event" (Experience PRD v2, §5). "dismissed categories learnt" (§8). The semantic
  cache must be "scoped per entity; never shared across entities" (Implementation PRD v2, §8).
- **SLM does:** near-duplicate suppression, and nearest dismissed category for insights.
- **Models:** multilingual-e5-small (118M, MIT); Granite Embedding 97M Multilingual R2 (community GGUF only, "numerical
  parity … UNVERIFIED"); EmbeddingGemma 300M. Not needle3 embeddings: a ranking probe scored 3/12 (critique #31).
- **Experiment:** 500 labelled pairs from events, reviews and the feed, split FR/EN.
  - **Proposed pass bar:** precision ≥ 0.95 at recall ≥ 0.80.
  - **Kill** if idempotency keys (event id + card id) already remove ≥ 90% of duplicates. "One event, one card" is mostly
    a key problem, not a semantic one.
- **Effort:** S. **Risk:** low. If APIM's semantic cache already brings an embedding deployment (not named in the PRD;
  UNVERIFIED), reuse it.
- **Verdict:** medium-low.

### C10. Groundedness check on skill results and knowledge answers

- **Serves:** "Provenance: every result names its source, engine, model and residency when relevant" (Experience PRD v2,
  §7). "Knowledge answers: answer, citations (page or document + section)" (§6.4). "a figure without a source is not
  shown" (`PRD_DesignBrief.md` §12).
- **SLM does:** scores each summary sentence against its cited chunk, as an independent second opinion.
- **Models:** the catalogs hold rerankers (bge-reranker-v2-m3, Qwen3-Reranker-0.6B). They measure **relevance, not
  entailment**, and no NLI model is catalogued, which is a gap. Granite Guardian 3.2's groundedness mode is UNVERIFIED from
  the catalog.
- **Experiment:** 100 skill outputs with 20% planted unsupported sentences.
  - **Proposed pass bar:** AUROC ≥ 0.90; ≤ 10% false flags.
  - **Kill** if only a frontier judge reaches it.
- **Effort:** M. **Risk:** false comfort.
- **Verdict:** medium value, low feasibility today.

### C11. The docling sandbox: "Parse these PDFs into a table"

- **Serves:** "Sandbox | 'Parse these PDFs into a table' … | Structured output or a recorded run, labelled sandbox |
  docling, cua, coder | P2 (demo optional)" (Experience PRD v2, §7). "`docling.parse` via docling-mcp in Container Apps
  dynamic sessions" (Implementation PRD v2, §6).
- **SLM does:** docling produces Markdown or DocTags, then an extractor maps it to the columns the user asked for.
- **Models:** granite-docling-258M ("French NOT listed"), NuExtract-2.0-2B, LFM2-1.2B-Extract; Qwen3-VL-2B for French
  scans. Phase-1 docling evidence is unusable: the PDF was born-digital and OCR was never exercised (critique #5, #61), and
  the table-flatten rule rests on n=1 (#62).
- **Experiment:** 50 PDFs (25 scanned, half French; public or synthetic, since the PoC has no AXA data) with gold tables.
  Metrics: cell F1, TEDS, pages per minute; compare docling + regex, + SLM, + frontier VLM.
  - **Proposed pass bar:** cell F1 ≥ 0.90 born-digital, ≥ 0.80 scanned, French within 5 points of English.
- **Effort:** M. **Risk:** P2, so little demo value.
- **Verdict:** medium-low.

### C12. French

- **Serves:** "French for owner-facing text at pilot (P1)" (Experience PRD v2, §5 Tone). "English or French first for
  testers?" (§9.5, Q4). "owner-facing strings in `pm/i18n/en.json` (French at pilot)" (refactor `CLAUDE.md`).
- **SLM does:** would translate dynamic owner-facing text into French and normalise French free-text answers.
- **Why not:** the PM model of record writes French in the same call, and static strings are i18n files. A local niche
  exists in the portal: Edge's on-device Translator API is listed as stable (Edge 148) in
  https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/
  (status as summarised by the fetch tool; verify). Teams' WebView2 is not mentioned there (UNVERIFIED).
- **Better use:** make French a required slice of C1, C3, C4, C7, C8 and C11. critique #8 asks for every evaluation set to
  be "bilingual by construction".
- **Models:** SmolLM3-3B (French native), Ministral-3-3B, Qwen3.5-2B.
- **Experiment:** 200 strings compared blind against GPT-5.x by two native speakers.
  - **Proposed pass bar:** SLM wins or ties in ≥ 45% of pairs, with 0 vocabulary breaches. Otherwise kill.
- **Effort:** S. **Verdict:** weak as a feature; essential as a test slice.

### C13. ISP security-control four-bucket classification

- **Serves:** "Classify the security controls in this questionnaire | Four-bucket table, redlines, next steps — opens in
  Word | vendor-procurement | P0" (Experience PRD v2, §7). "ISP 41-control classification (four buckets; run with the
  `vendor-procurement` skill)" (Implementation PRD v2, §8). The buckets are "A — Vendor Responsibility", "B — Deployer
  Responsibility", "C — Not Applicable (SaaS)", "D — Scope-Limited", with "Never leave a control unanswered"
  (`vendor-procurement/SKILL.md`, Step 2).
- **Why an SLM loses here:** there are 41 fixed controls. For a given deployment model (SaaS), the bucket is mostly a
  property of the control. A **reviewed lookup table** (control ID × deployment model → default bucket) is deterministic
  and auditable. The variable part (D, the redlines, the next steps) needs judgement and polished prose, which is frontier
  work. The labelled data is one precedent ("reusing the Harvey file", Implementation PRD v2, §10).
- **Experiment (to kill):** the Harvey file plus ≥ 4 more vendors (about 200 labelled pairs). Baseline: the lookup table.
  The SLM earns a place only if it beats the table by ≥ 10 points on rows where table and reviewer disagree.
- **Models if tried:** Ministral-3-3B or Qwen3.5-4B, with Qwen3-Embedding-0.6B and bge-reranker-v2-m3 for retrieval.
- **Effort:** M. **Risk:** confidential labels; ISP credibility.
- **Verdict:** weak. Build the table.

### C14. Synthetic test data

- **Serves:** "a test that renders each with sample data" (refactor `CLAUDE.md`). The bake-off's "20 skill runs with
  graded reference outputs" (Implementation PRD v2, §5).
- **Why not:** the volumes are small, so there is no cost argument. The phase-1 SLM synthetic text was graded wrong
  ("Numéro de polyclinique", wrong French subrogation; critique #36, #50). Faker or a frontier model does this better.
- **Effort:** S. **Verdict:** weak. No experiment recommended.

### C15. A local guard model for partner outputs

- **Serves:** "Partner outputs are data … Prompt Shields run at APIM on inputs and outputs" (refactor `CLAUDE.md`, Hard
  rule 6). Risk row "Prompt injection through partner outputs" (Implementation PRD v2, §11).
- **Why not:** Prompt Shields at APIM is first-party and already specified. Llama-Guard-3-1B and ShieldGemma are
  harm-category classifiers; that they detect prompt injection is UNVERIFIED. A second guard adds latency and a supplier.
- **Experiment (to kill):** 200 outputs, 50 with planted injections. The SLM stays only if it catches ≥ 90% of what
  Prompt Shields misses, at ≤ 2% false positives.
- **Effort:** S. **Verdict:** weak.

### C16. Routing and cost-line estimation

- **Serves:** "Cost: every skill run shows a cost line"; "Progress: anything over ten seconds says so with an estimate"
  (Experience PRD v2, §7). "Model Router on worker tasks: small model first, escalate on rejection; supervisor never
  routed" (Implementation PRD v2, §5).
- **Why not:** cost lines are measured after the run, and an estimated token count breaks §8.1 ("never estimates").
  Option 1 already has a Foundry "Model Router for cheap-to-expensive escalation" (§4 component list). ETAs and timeouts
  are a regression on brief size × model speed ("Right-size timeouts", `FLEET-WATCHDOG.md` next step #4). Card sizing (HEE,
  `OPERATIONS.md` §3.3) drives the savings figure, so model drift would move BEI. It stays with the supervisor.
- **Experiment (to kill):** predict job duration for the 59 dispatches in `jobs.jsonl` with linear regression vs an SLM.
  The SLM must cut MAE by ≥ 20%.
- **Effort:** S. **Verdict:** weak.

### C17. Offline use in the field on a phone

- **Serves:** "Owner-facing surfaces … usable on a phone" (`PRD_DesignBrief.md` §14). Out of scope: "Mobile app; the
  responsive web surfaces in §14 are enough" (§15). SLM lab D3 (two Android tracks).
- **Why not, for BizLoop:** the personas are office Microsoft 365 users. Decisions are server state (`Action.Execute`,
  `refresh`), so an offline answer cannot be recorded. No PRD asks for offline use. This could be a **deliverable of a
  BizLoop project** (for example the claims-intake demo on :8094), not a BizLoop feature.
- **Measured and known limits:** TTFT ≈ 16.9 s for a 488-token prompt on a desktop VM (§2); phones UNVERIFIED. "A phone
  reaching the app over plain http on the LAN is not a secure context, so it runs single-threaded" (`findings.json`).
- **Experiment, if pursued:** 60 FR/EN FNOL transcripts on a named mid-range Android, LFM2-350M-Extract vs Qwen3.5-0.8B,
  comparing the wllama PWA with llama.rn.
  - **Proposed pass bar:** field F1 ≥ 0.85; TTFT ≤ 5 s for ≤ 200-token inputs.
- **Effort:** L. **Verdict:** weak for BizLoop.

---

## 4. Ranking (value × feasibility, each 1–5; my judgement, justified above)

| # | Candidate | Value | Feas. | Score | Effort |
|---|---|---|---|---|---|
| 1 | Garble and pane-state classifier (watchdog) | 3 | 5 | 15 | S |
| 2 | Self-hosted SLM as a `models.yaml` binding (enabler) | 3 | 5 | 15 | S |
| 3 | PII pseudonymisation gate | 4 | 3 | 12 | M |
| 4 | Claim extraction for the review digest, demote-only | 4 | 3 | 12 | M |
| 5 | Proof artefact secret/PII scan | 3 | 4 | 12 | S–M |
| 6 | Labelled SLM track in the bake-off | 3 | 3 | 9 | S (after VC-504) |
| 7 | Decision-vs-question triage | 3 | 3 | 9 | M |
| 8 | Card slot filling under a schema | 2 | 4 | 8 | S |
| 9 | Embedding dedupe and dismissal learning | 2 | 4 | 8 | S |
| 10 | Groundedness check | 3 | 2 | 6 | M |
| 11 | docling sandbox extraction | 2 | 3 | 6 | M |
| 12 | French | 2 | 3 | 6 | S |
| 13 | ISP four-bucket classification | 2 | 2 | 4 | M |
| 14 | Synthetic test data | 1 | 4 | 4 | S |
| 15 | Local guard model | 1 | 3 | 3 | S |
| 16 | Routing and cost estimation | 1 | 3 | 3 | S |
| 17 | Offline phone use | 1 | 2 | 2 | L |

## 5. Run these three first

1. **C1, the watchdog classifier.** It is the cheapest candidate and has a baseline to beat (the non-Latin ratio). The data
   is on disk (59 transcripts, 258 MB), it touches no AXA data, needs no ISP approval, and attacks the failure the harness
   says "must never recur". **Pass:** garble recall ≥ 0.95 (≥ 0.90 on Latin-script garble); ≤ 1 false alarm per 8
   agent-hours; pane-state accuracy ≥ 0.90 with `waiting-permission`/`waiting-answer` recall ≥ 0.95; ≤ 1 s CPU per poll.
   Kill if zlib + regex comes within 2 points.
2. **C3, the PII gate bake-off.** It has the highest value, it answers a DPIA question due in pilot week 2, it decides
   whether redacted data may enter the experiment track, and the experiment is already designed (critique #2). **Pass:**
   document leak rate of direct identifiers ≤ 1% for FR and for EN separately (the DPO sets the real bar); the model +
   regex pipeline at least halves the regex-only leak rate; 100% placeholder round-trip; ≤ 1 s per page on CPU. Kill if
   regex plus recognisers passes alone.
3. **C4, claim extraction (demote-only).** It serves a P0 behaviour that fires on every review, it is safe because it
   cannot promote a claim, and the data is in the repo (53 finished job reports, 22 brief reports). **Pass:** claim recall
   ≥ 0.95, precision ≥ 0.80, zero promotions. Kill if a regex cue list reaches recall ≥ 0.90.

**Also do C2** as a half-day spike. C3 and C4 need it if they are served in the tenant, and it is VC-105's test anyway.
**Why not C5 first:** regex does the part that catches secrets, and the model's only job there is OCR.

## 6. Weak ideas, and where a frontier model or a regex is simply better

- **Generating card JSON.** Templates are deterministic and testable. An SLM only fills slots (C8).
- **ISP buckets.** A reviewed lookup table covers most rows. Redlines need frontier prose (C13).
- **Cost-line estimation.** Forbidden by §8.1 ("never estimates"). ETA is a regression, and routing is the Foundry Model
  Router (C16).
- **Deciding verified vs claimed.** That is an event-log join. The SLM only extracts claims (C4).
- **Secrets in proofs.** Regex and entropy detectors catch them. The model only OCRs (C5).
- **"One event, one card."** An idempotency key, not semantics (C9).
- **French generation.** The PM model already writes French (C12).
- **Guard models.** Prompt Shields at APIM covers this. Llama Guard's taxonomy is harm categories (C15).
- **Synthetic data.** Faker or a frontier model does better; phase-1 output was graded wrong (C14).
- **Offline phone.** Out of scope, and decisions need the server (C17).
- **Confidence-gated anything on needle3.** Its confidence evidence was misread (critique #0), its grounding flag is
  about 62% precision/recall (#56), and fine-tuning deletes the confidence head (D4).
- **Anonymising CB Insights queries.** A company name is public data.
- **Every server-side candidate** must also beat `gpt-5-nano` / `gpt-5.4-nano` on first-party Azure (§1.10) before it is
  worth a new model card.

---

## 7. Integration with Copilot / MCP

### 7.1 What each Microsoft surface allows

| Surface | Can it use an SLM? | Source |
|---|---|---|
| Declarative agent ("GDAI Venture Clienting") | **Not as its brain.** "Declarative agents run on the same orchestrator, foundation models, and trusted AI services that power Microsoft 365 Copilot." An SLM is reachable only as a tool. | learn.microsoft.com/…/overview-declarative-agent (ms.date 2026-06-18) |
| Copilot Studio + MCP | Yes, as MCP **tools/resources** over **Streamable HTTP only**: "Copilot Studio no longer supports SSE for MCP after August 2025"; "Copilot Studio currently supports MCP tools and resources"; generative orchestration is required; auth is None / API key / OAuth 2.0. Connections are governed: "if a data policy regulates Power Platform connectors, it also regulates access to the MCP server". MCP servers can also be registered through Agent 365 ("Bring your own (BYO) MCP server"). | …/copilot-studio/mcp-add-existing-server-to-agent (2026-05-28); …/agent-extend-action-mcp (2026-08-26) |
| APIM gateway (D1) | Yes, as REST-as-MCP or pass-through of an existing MCP server. "API Management currently supports MCP server tools, but doesn't support MCP resources or prompts." Available on every tier from Developer up; the self-hosted gateway is supported. | …/api-management/mcp-server-overview (2026-09-11) |
| Copilot Studio prompts (BYOM) | Yes, a Foundry **chat-completions** deployment as a Prompt tool. "The GPT-5 family and later models … aren't currently supported for bring your own model in prompts." | …/copilot-studio/bring-your-own-model-prompts (2026-07-14) |
| Custom engine agent ("BizLoop PM", Agents SDK) | **Yes, in its pipeline.** The comparison table gives the Agents SDK "Any model of your choice", and the page says "Whether your agent needs a specific foundation model, a small language model, or a fine-tuned model…". | …/overview-custom-engine-agent (2026-08-05) |
| On-device runtimes | Foundry Local: "Your data never leaves the device", OpenAI-compatible, Windows/macOS/Linux, "isn't designed as a server inference stack". It still downloads models and components on first run. Windows Phi Silica is a Limited Access Feature and "is being replaced by Aion Instruct" (Phi Silica removed from retail devices in November 2026), so it is a moving target. Edge's Prompt API offers Phi-4-mini, with Aion-1.0-Instruct in developer preview. | …/foundry-local/what-is-foundry-local (2026-05-15); …/windows/ai/apis/phi-silica (2026-07-15); Edge blog 2026-06-02 |

### 7.2 Three placements that fit this architecture

```mermaid
flowchart LR
  U[Teams · Copilot Chat · Office] --> DA[Declarative agent<br/>Copilot's own model]
  U --> CE[BizLoop PM<br/>custom engine agent]
  DA --> APIM[APIM · MCP tools only]
  CE --> APIM
  APIM --> T[A · tenant SLM as MCP tool<br/>pseudonymise · extract_table · claim_extract]
  CE -. core/models.py .-> B[B · SLM inside the PM pipeline<br/>triage · slot fill · dedupe]
  TAB[Teams tab / portal · Windows app · VS Code] --> C[C · on-device SLM<br/>wllama · Edge Prompt API · Foundry Local · local stdio MCP]
  C -- already-minimised data --> APIM
```

- **A. An SLM hosted in the tenant, behind APIM as MCP tools** in `gdai-skills`, `sandbox` or `partner_proxy`. Examples:
  `privacy.pseudonymise` (C3), `docling.extract_table` (C11), `review.extract_claims` (C4). Both agents can reach it.
  Residency is the chosen EU region (C2). Anything over 20 s follows "Long work is a job" (Hard rule 4). It needs
  `side_effect: false`, a JSON schema, a scope and a contract test, like every tool (Hard rule 5).
- **B. An SLM inside the PM (custom engine agent)** through `core/models.py`. This needs a contract change: a utility role
  beyond the five fixed roles (§1.1), recorded in the `sprint` event like the others.
- **C. On-device, only in client surfaces BizLoop controls:**
  - the Teams personal tab or portal (a "web view", Experience PRD §9.3), running wllama or Edge's Prompt API;
  - a Windows desktop tool with Foundry Local;
  - VS Code for the IT channel, with a local stdio MCP server ("Local MCP servers: MCP clients use standard input/output",
    APIM overview). Whether the "Registry only" policy (Implementation PRD §7) allows local servers is UNVERIFIED.

  Copilot's cloud cannot call this placement (§1.8). Its output is posted to the gateway as data, already minimised.
  UNVERIFIED for the Teams tab: whether its host allows cross-origin isolation (COOP/COEP), which the lab needs for
  multi-threaded WASM (`slm/app/BUILD-SPEC.md` §1), and whether corporate proxies and storage quotas allow a download of
  several hundred MB.

### 7.3 What does not work

- Copilot Studio or a declarative agent calling a model on a user's laptop.
- Swapping the declarative agent's model.
- SSE transport.
- MCP prompts or resources through APIM (tools only).
- BYOM of GPT-5.x in Copilot Studio prompts (as of the page date).

### 7.4 "Where does my data go?" for SLM runs

The answer is **templated from `bizloop.get_models` and from measurements, never generated by a model** (Experience PRD
§6.4: "a two-line answer naming the model, the region and the residency, with a link to the model card"; BUILD_BRIEF
VC-304: "residency sentence from `get_models`").

- **Placement A:** "Names were replaced by GLiNER multi PII v1 in the GDAI subscription, <EU region>, before Harvey saw the
  text."
- **Placement C:** the lab's receipt pattern is the right instrument. `GenerationStats.ranOn: "this device"` plus
  `networkRequests` from Resource Timing (`slm/app/web/src/utils/network-meter.ts`). Show its stated blind spot with the
  number: "requests made from inside a Web Worker land on the worker's own timeline and are NOT seen here". A "0" that
  cannot see the worker is a reading to qualify, not a proof.
- **Cost line:** "n/a (ran on your device)" for placement C, because compute on the user's machine is not measured and
  §8.1 forbids estimating it. Placement A shows `local_compute`.

### 7.5 Governance items each SLM brings with it

- A model card (§1.9).
- Pinned weights hash and licence. The catalogs flag the LFM Open License ("commercial-use revenue threshold"), Gemma
  terms, the Llama 3.2 licence, and exclude cc-by-nc models (Hammer2.1, xLAM-2).
- Telemetry audit. cactus-needle sends usage events by default (critique #38). anythingllm-mobile ships Firebase Analytics
  "with no opt-out" (`research/repos/anythingllm-mobile.md`).
- The same DLP data policy as any other connector (§7.1).

## 8. Open questions for the operator

1. **ISP stance.** Is a self-hosted open-weights model in the GDAI subscription, or a model inside a Teams tab on an AXA
   laptop, compatible with "Group-sanctioned LLM endpoint: Secure GPT on Azure OpenAI"? If the answer is no, only
   candidates in placement A survive, and only as a Secure GPT / Foundry deployment.
2. **CB Insights residency.** Is its instance EU? The PRD diagram says "Partner SaaS EU", but only Harvey's EU instance is
   "confirmed" (§6).
3. **Contract.** Should `config/models.yaml` gain a utility role and a `location` field (placement B), or should SLMs stay
   MCP tools only (placement A)?
4. **Pass bars.** Will the DPO set the acceptable document leak rate for C3? Will two people label 300 interrupts for C7
   and about 400 claims for C4?
5. **Scope.** Is the dev-harness watchdog (C1) in the refactor's scope, or does it stay in `bizloop/tools`?
6. **Small first-party tier.** Is `gpt-5-nano` / `gpt-5.4-nano` in Data Zone EU available on the PoC subscription? If so,
   it is the baseline every server-side SLM must beat.

## Sources

Repo files (all read in full unless noted):
- `docs/copilot-experience/Experience-PRD-v2-final.md`, `Experience-PRD-v1.md`
- `docs/refactor/mvp_bizloop_refactor/` Implementation PRD v2, `CLAUDE.md`, `design/BUILD_BRIEF.md`,
  `design/DECISIONS.md`
- `docs/bizloop-enh/` PRD_DesignBrief, README, ROADMAP, OPERATIONS, SECOND-PROJECT, DELIVERED, STATUS,
  economics.example.yaml
- `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/FLEET-WATCHDOG.md`, `docs/TOKEN-ACCOUNTING.md`
- `tools/vf-fleet-watch`, `tools/vf-fleet` (garble and state logic)
- `slm/prd/DECISIONS.md`, `slm/phase1/FINDINGS.md`, `slm/critique/raw-findings.json` (80 findings; CRITIQUE.md absent)
- `slm/research/models/catalog-*.json`, `slm/research/repos/{wllama,localmode,anything-llm-architecture,anythingllm-mobile}.md`
  (summary boxes)
- `slm/app/{BUILD-SPEC.md,bench_results.jsonl}`, `slm/app/web/src/data/findings.json`,
  `slm/app/web/src/utils/network-meter.ts`, `slm/experiments/v2/ft2_report.json`
- Valheim harness data used only for counts: `cockpit/jobs.jsonl`, `cockpit/runs/`, `cockpit/SUPERVISOR-LOG.md`,
  `cockpit/stakeholder/{feed.json,answers.jsonl,media/}`, `docs/briefs/*.report.md`
- `~/.claude/skills/synced/…/vendor-procurement/SKILL.md` (Step 2 buckets)

Web (fetched 2026-09-21):
- https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-declarative-agent
- https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-custom-engine-agent
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/bring-your-own-model-prompts
- https://learn.microsoft.com/en-us/azure/api-management/mcp-server-overview
- https://learn.microsoft.com/en-us/azure/foundry-local/what-is-foundry-local
- https://learn.microsoft.com/en-us/azure/azure-sovereign-clouds/private/foundry-local/overview
- https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types
- https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
- https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica
- https://learn.microsoft.com/en-us/adaptive-cards/templating/
- https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/
  (read through a summarising fetch; API statuses to be verified on the page)
