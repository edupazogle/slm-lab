# E1a — anonymisation gate: dataset + regex baseline (first half of E1)

Every number is read from `results.json` (written by `eval.py`) unless another file is named. Load when it was written: `16:00:51 up 11:57, load average: 1.21, 1.19, 0.96` (field `load_at_eval (uptime)`). Throughput was not measured.

Written by the Opus delegate on 2026-09-24; its harness refused the `.md` write, so the supervisor pasted this text
after checking the headline numbers against `results.json` (`kill_rule`, `pass_bar`).

## Verdict
**The pass bar is missed in both languages and the kill rule is not triggered.** The model half of E1 goes ahead.
- Leak rate (typed): **FR 0.8747** (426 of 487 documents that hold a direct identifier) and **EN 0.9231** (360 / 390).
- PERSON recall over all 900 documents: **0.3214** (501 / 1,559).

## What was run (from `slm/experiments/e1/`)
- Port check: `.venv/bin/python regex_baseline.py --check-page` asserts that TITLES, FIRST (166), NOT_NAME (199) and MONTHS equal the page's.
- Detect: `.venv/bin/python regex_baseline.py data/combined_dataset.jsonl preds/regex_extended.jsonl --first extended`. The ablation is the same command with `--first page` → `preds/regex_page.jsonl`.
- Parity: `node parity_check.js data/combined_dataset.jsonl preds/js_page.jsonl`, and `node parity_check.js data/combined_dataset.jsonl preds/js_extended.jsonl preds/extra_first.txt`. Then run `.venv/bin/python compare_parity.py preds/regex_<cfg>.jsonl preds/js_<cfg>.jsonl data/combined_dataset.jsonl preds/parity_<cfg>.json`.
- Score: `.venv/bin/python eval.py --data data/combined_dataset.jsonl --preds preds/regex_extended.jsonl --ablation preds/regex_page.jsonl --out results.json`
- Fail proof: `.venv/bin/python eval.py --preds preds/regex_extended.jsonl --shift 5 --out results_shift5.json`
- `preds/extra_first.txt` is made with `.venv/bin/python -c "from first_names import EXTRA_FIRST; print(' '.join(sorted(EXTRA_FIRST)))"`.

**The port is faithful, and this is measured.**
- `parity_check.js` runs the page's own detector block (`slm/app/second-look/index.html`) under node on all 900 documents. `compare_parity.py` finds 0 documents that differ in entities or in name candidates:
  - `preds/parity_page.json`: 2,267 entities, 3,461 candidates.
  - `preds/parity_extended.json`: 2,312 entities, 3,465 candidates.
- JS offsets are UTF-16, so they are mapped to code points before comparing.
- To match, the port reproduces the page's JS semantics, defects included:
  - `\b` is ASCII-only.
  - `\s` is Unicode.
  - `$` means end of string.
  - AMOUNT is dropped.
  - Name candidates without a cue are dropped (the page would ask its model).
  - Overlaps are removed greedily.

**The only intended change:** `first_names.py` adds 644 hand-written EN/FR/ES/DE/IT given names (810 in total). Given names that are also words, places or brands were left out, because the page checks the first-name cue before its place skip.

## Data and scoring
**Data.** 900 documents (`data/combined_dataset.jsonl`, `DATA.md`):
- 400 FR and 400 EN from OpenPII (CC-BY-4.0, Ai4Privacy / Ai Suisse SA).
- 100 synthetic French claims (`gen_fr_claims.py`).

**Failure checks.** `eval.py` exits non-zero when:
- an input file is missing or empty;
- the prediction rows differ from the documents in count or ids;
- a slice does not hold 400 / 100 / 400 documents;
- a slice lacks gold types it must have.

Tested: 899 rows → exit 1; empty file → exit 1; missing file → exit 1. The eval printed "scored 900 documents (fr 500, en 400)".

**Scoring rules.**
- **Coverage:** a gold span is covered when at least 50 % of its characters fall inside predictions of an allowed type. A prediction is correct when at least 50 % of its characters fall inside gold spans of an allowed type. This is character coverage, not IoU, because OpenPII splits given name and surname into separate spans.
- **Type map:** NIR → NIR or NATIONAL_ID; ID → ID_DOC or NATIONAL_ID.
- **Direct identifiers (9):** PERSON, EMAIL, PHONE, NATIONAL_ID/NIR, IBAN, CARD, PLATE, ID_DOC, ADDRESS.
- **Leak rate:** the share of documents holding at least one direct identifier where one or more is not covered. `leak_rate_any_type` also accepts a mask of the wrong type.
- **DATE** is scored separately.
- **Precision** for the bar is micro precision over the direct-identifier prediction types.
- **Round trip:** the page's `placeholders()` and `applyPlaceholders()`, then each placeholder is restored to the text first given to it.

## Results
| | FR (500) | EN (400) |
|---|---|---|
| Leak rate, typed (bar ≤ 0.01) | 0.8747 (426/487) | 0.9231 (360/390) |
| Leak rate, any type masks | 0.8583 | 0.9128 |
| Precision, direct identifiers (bar ≥ 0.80) | 0.9147 (1,161 predictions) | 0.9249 (586) |
| PERSON recall (bar ≥ 0.95) | 0.2796 (241/862) | 0.3730 (260/697) |
| PERSON precision | 0.8602 | 0.9290 |
| NATIONAL_ID/NIR recall (bar ≥ 0.98) | 0.5183 (99/191) | 0.1081 (8/74) |
| EMAIL recall | 0.9935 | 0.9956 |
| PHONE recall | 0.8008 | 0.7176 |
| IBAN recall | 1.0000 | no gold |
| PLATE recall | 1.0000 | no gold |
| CARD recall | 0.1290 | 0.0722 |
| ID_DOC recall | 0.0385 | 0.0781 |
| ADDRESS recall | 0.1933 | 0.0000 |
| Round trip (bar = 1.0) | 0.998 (499/500) | 1.000 |
| DATE recall / precision | 0.6282 / 0.9966 | 0.6454 / 0.9915 |
| Pass bar met | no | no |

By slice (typed leak rate · PERSON recall):

| Slice | Leak rate | PERSON recall |
|---|---|---|
| FR OpenPII | 0.9406 | 0.1526 |
| FR synthetic | 0.6200 | 0.7000 |
| EN OpenPII | 0.9231 | 0.3730 |

**Pass-bar checks** (`pass_bar`):
- FR passes precision, IBAN, EMAIL and PLATE; it fails leak, NIR, PHONE, PERSON and round trip.
- EN passes precision, EMAIL and round trip; it fails leak, NIR, PHONE and PERSON. IBAN and PLATE have no gold, so they cannot be measured.

**Kill rule** (`kill_rule`): `triggered: false`.

**Ablation** (`ablation_page_first_list`, the page's 166 names → the extended list):

| | FR | EN |
|---|---|---|
| PERSON recall | 0.2425 → 0.2796 | 0.3659 → 0.3730 |
| PERSON precision | 0.8724 → 0.8602 | 0.9329 → 0.9290 |
| Leak rate | 0.9158 → 0.8747 | 0.9256 → 0.9231 |

## Why PERSON is missed (`person_miss_diagnosis`, 1,058 misses)
| Cause | Misses |
|---|---|
| A candidate with no cue, which the page defers to its model (there is no model here) | 949 |
| Capitalised, but no candidate | 84 |
| A cued candidate lost to an overlap | 24 |
| Not capitalised | 1 |

So the regex half is a lower bound of the page, not the page itself.

Defects in the page (reported, not fixed here — `slm/app/` is outside this experiment's folder):
- `Nom:` is not a cue, and every synthetic claim has a `- Nom: <name>` line.
- JS `\b` is ASCII-only, so a name starting with an accented capital ("Édith") is never picked up.
- Hyphenated first names such as `Patrick-Xavier` never match the list.
- The name pattern takes at most 4 words, so long names are split.
- `Le` alone reuses the placeholder of `Albesjan Le Mao`. This is the one round-trip failure (document 776).
- CARD wins a tie against NIR: 10 NIRs are masked, but as CARD (their 15 digits pass Luhn and CARD comes first in PATTERNS).

## The 10 worst PERSON misses (`worst_person_misses`)
These are fully exposed (no prediction of any type touches the name), longest first, taken round-robin over the three slices. All ten are candidates with no cue.
1. FR synthetic, synthetic_096: "Alexandrie-Claudine Martineau" (`- Nom: Alexandrie-Claudine Martineau - Téléphone: …`)
2. FR OpenPII, 227: "Dovi-Apelete Willommet Kumarasinghage" (`Bonjour Sen Soraida Dovi-Apelete Willommet Kumarasinghage, …`)
3. EN OpenPII, 172: "Kangakumar Velauthampillai Cengic" (`Employee: Gamar Kangakumar Velauthampillai Cengic Age: 39`)
4. FR synthetic, synthetic_004: "Frédérique Deschamps-Ferrand" (`- Nom: …`)
5. FR OpenPII, 361: "Nicchiotti Wentzlaff-Eggebert Baroth" (`Mtre Serdjan Nicchiotti … vous adresse ce courriel`)
6. EN OpenPII, 581: "Maffezzini Ryhiner Majidzadeh" (`Dear Mayoress Sunanda Iasna Maffezzini Ryhiner Majidzadeh, …`)
7. FR synthetic, synthetic_081: "Arnaude Étienne du Petitjean" (`- Nom: …`)
8. FR OpenPII, 258: "Abbasi-Khalili Holecek Gyapoentsang" (`Mtre Zhao Sixtus Abbasi-Khalili … Organisation « Eau Pure …`)
9. EN OpenPII, 629: "Kapánek Iencarelli von Kampen" (`Wissem Kapánek Iencarelli von Kampen, born on 2022-01-30…`)
10. FR synthetic, synthetic_073: "Victoire Delahaye Le Peron" (`- Nom: …`)

## NIR on the synthetic claims (`nir_miss_diagnosis_fr_synthetic`)
- **82** are caught as NIR.
- **10** well-formed NIRs are masked as CARD (the tie above).
- **8** gold NIRs are malformed: 14 characters, because the birth year is written unpadded by `randint(0, 99)` in `gen_fr_claims.py`. 7 of them are uncovered.

The generator should be fixed before the model half is scored on NIR.

## A metric that can fail (`fail_proof_shift_plus5`, `results_shift5.json`)
Every predicted span moved +5 characters:

| Metric | Before | After +5 |
|---|---|---|
| Leak rate FR | 0.8747 | 0.9713 |
| Leak rate EN | 0.9231 | 0.9513 |
| PERSON recall FR | 0.2796 | 0.2367 |
| PERSON recall EN | 0.3730 | 0.2755 |
| EMAIL recall FR | 0.9935 | 0.9677 |
| Precision FR | 0.9147 | 0.8105 |
| Round trip FR | 0.998 | 0.902 |

DATE recall does not move: a 10-character date shifted by 5 is still exactly 50 % covered, because the 50 % rule is lenient.

## What the second half should target
1. PERSON names with no cue (949 of 1,058 misses). This needs a NER model or the page's NLI check.
2. ID_DOC, CARD, OpenPII NATIONAL_ID and ADDRESS. The page's patterns are shaped for French claims.
3. International PHONE formats.
4. A NIR key check, SIREN detection, and the CARD-vs-NIR tie.

## Not done, and why
- Throughput was not measured.
- SIREN detection and the NIR key check are not in the page, and this brief asked for a faithful port.
- The page's defects are reported, not fixed: the port must match the page.
- The 8 malformed synthetic NIRs are reported; the dataset is unchanged.
- The old debug scripts and `results.jsonl` (41 documents missing) were removed; they remain in git history (fe97f87).

## Addendum 2026-09-24: the page defects fixed, the port re-checked, the documents re-scored

The six page defects listed above were fixed in `slm/app/second-look/index.html` the same day: `Nom:`, `Name:` and
`Prénom:` labels are a name cue; CAP and the place skip start with `(?<![\p{L}\p{N}_])` instead of the ASCII-only `\b`,
so "Édith" is a candidate and "à" is a place cue; the first part of a hyphenated given name is checked against the list;
CAP takes up to 6 words; a surname alone never reuses a placeholder through a particle ("Le"); NIR sits before CARD in
`PATTERNS`. `gen_fr_claims.py` now pads the birth year; the dataset itself is unchanged, so its 8 malformed NIRs remain.

`regex_baseline.py` and the round trip in `eval.py` follow the page. Parity re-run on the 900 documents: 0 differ
(`preds/parity_v2_page.json`: 2,386 entities, 3,199 candidates; `preds/parity_v2_extended.json`: 2,406 / 3,203; the
inputs are `preds/js_v2_*.jsonl` and `preds/regex_v2_*.jsonl`). Scored again with the extended list
(`results_v2.json`, ablation `preds/regex_v2_page.jsonl`):

| | before (`results.json`) | after (`results_v2.json`) |
|---|---|---|
| Leak rate, typed, FR | 0.8747 (426/487) | 0.7639 (372/487) |
| Leak rate, typed, EN | 0.9231 (360/390) | 0.9051 (353/390) |
| PERSON recall, all 900 | 0.3214 (501/1,559) | 0.4150 (647/1,559) |
| PERSON precision, all 900 | 0.8889 | 0.9018 |
| Precision, direct identifiers, FR / EN | 0.9147 / 0.9249 | 0.9281 / 0.9237 |
| NATIONAL_ID/NIR recall, FR | 0.5183 (99/191) | 0.5812 (111/191) |
| NIR recall, FR synthetic | 0.82 (82/100) | 0.92 (92/100) |
| Well-formed NIRs masked as CARD | 10 | 0 |
| Round trip, FR | 0.998 (499/500) | 1.000 (500/500) |
| FR synthetic slice: leak rate · PERSON recall | 0.62 · 0.70 | 0.12 · 0.95 |
| FR OpenPII slice: leak rate · PERSON recall | 0.9406 · 0.1526 | 0.9302 · 0.2069 |
| EN OpenPII slice: PERSON recall | 0.3730 | 0.4591 |
| Pass bar met | no | no |

The pass bar is still missed in both languages and the kill rule is still not triggered: the regex half remains a lower
bound of the page, because name candidates without a cue still go to the model, which this scoring does not run. The 8
gold NIRs of 14 characters stay uncovered until the synthetic claims are regenerated with the fixed generator.

## Addendum 2026-09-24 (2): PLATE and POSTCODE no longer cross a tab or a line break

Found by the page's QA round on a spreadsheet: cells are joined by tabs and rows by line breaks, and the PLATE and POSTCODE
patterns used `\s` between their parts, so "1250⏎CLM" (an amount, then the next row's claim id) became a Spanish plate and
"55013⇥Mr Oliver" a postcode that swallowed the name after it. The separator is now a space, a no-break space or a narrow
no-break space (U+202F, which French typesetting puts between a postcode and its city), in the page and in
`regex_baseline.py` alike. Parity re-run on the 900 documents: 0 differ (`preds/parity_v3_page.json`: 2,383 entities, 3,199
candidates; `preds/parity_v3_extended.json`: 2,403 / 3,203; inputs `preds/js_v3_*.jsonl`, `preds/regex_v3_*.jsonl`).
Scored again (`results_v3.json`): only POSTCODE moves, 35 → 32 predictions and 30 → 29 gold postcodes covered. The three
dropped predictions ran into the next line's field label ("53883⏎Adresse", "20581⏎Numéro", "95440⏎Ville"); the last one had
counted as covering its gold postcode only because more than half its characters did. Leak rates, PERSON and every direct
identifier are unchanged (POSTCODE is not a direct identifier).

## Addendum 2026-09-25 (3): the 8 malformed synthetic NIRs corrected, the documents re-scored

The synthetic claims could not be regenerated. They were drawn unseeded, and two fresh runs of the fixed generator differed
from the committed file, and from each other, on all 100 rows. Regenerating would therefore have replaced every synthetic
claim, not just the 8 NIRs.

So the 8 NIRs were corrected in place in `data/synthetic_claims.jsonl`:
- the birth year is zero-padded;
- the key is recomputed with the generator's own formula;
- every later span moves +1.

This is what the fixed generator would have written from the same random draws. The other 92 claims are byte-identical,
and `combine_dataset.py` changes exactly the same 8 lines of `data/combined_dataset.jsonl` (details in `DATA.md`).
`gen_fr_claims.py` is now seeded (`SEED = 42`).

| Id | NIR before (14 characters) | NIR after (15 characters) |
|---|---|---|
| synthetic_016 | 2 5 03 77 874 296 07 | 2 05 03 77 874 296 14 |
| synthetic_023 | 2 0 12 02 637 143 81 | 2 00 12 02 637 143 88 |
| synthetic_026 | 2 7 05 44 698 162 38 | 2 07 05 44 698 162 45 |
| synthetic_027 | 1 3 09 15 793 487 45 | 1 03 09 15 793 487 97 |
| synthetic_031 | 1 1 07 18 124 174 43 | 1 01 07 18 124 174 95 |
| synthetic_034 | 1 2 10 57 333 176 89 | 1 02 10 57 333 176 44 |
| synthetic_073 | 1 1 05 2A 268 851 31 | 1 01 05 2A 268 851 83 |
| synthetic_077 | 1 6 10 63 406 912 06 | 1 06 10 63 406 912 58 |

**Checked first.** The v3 run was reproduced before the data changed. On the old data, `regex_baseline.py` and
`parity_check.js` gave byte-identical `preds/regex_v3_*` and `preds/js_v3_*`, and `eval.py` gave the same numbers as
`results_v3.json`. The page's detector block changed after v3 only in how it computes the sentence around a name, and that
sentence is not part of parity.

**Run from `experiments/e1/` with python3.**
- Port check: `regex_baseline.py --check-page`.
- Detect: `regex_baseline.py data/combined_dataset.jsonl preds/regex_v4_extended.jsonl --first extended`. The ablation is
  the same command with `--first page` → `preds/regex_v4_page.jsonl`.
- Parity: `node parity_check.js data/combined_dataset.jsonl preds/js_v4_page.jsonl`, and the same with
  `preds/js_v4_extended.jsonl preds/extra_first.txt`. Then `compare_parity.py` → `preds/parity_v4_<cfg>.json`.
- Score: `eval.py --data data/combined_dataset.jsonl --preds preds/regex_v4_extended.jsonl --ablation preds/regex_v4_page.jsonl --out results_v4.json`.

**Parity: 0 of 900 documents differ, in either configuration.**
- `preds/parity_v4_page.json`: 2,390 entities (v3: 2,383) and 3,199 candidates.
- `preds/parity_v4_extended.json`: 2,410 entities (v3: 2,403) and 3,203 candidates.
- The +7 entities are 8 new NIRs, minus the 1 CARD that had covered a malformed NIR.

| | v3 (`results_v3.json`) | v4 (`results_v4.json`) |
|---|---|---|
| NIR recall, FR synthetic | 0.92 (92/100) | 1.00 (100/100) |
| NATIONAL_ID/NIR recall, FR | 0.5812 (111/191) | 0.6230 (119/191) |
| NATIONAL_ID/NIR recall, all 900 | 0.4491 (119/265) | 0.4792 (127/265) |
| Leak rate, typed, FR | 0.7639 (372/487) | 0.7495 (365/487) |
| Leak rate, any type, FR | 0.7577 | 0.7454 |
| Leak rate, typed, all 900 | 0.8267 (725/877) | 0.8187 (718/877) |
| FR synthetic slice: leak rate, typed · any type | 0.12 (12/100) · 0.11 | 0.05 (5/100) · 0.05 |
| Precision, direct identifiers, FR | 0.9281 (1,238 predictions) | 0.9293 (1,245) |
| Precision, direct identifiers, all 900 | 0.9267 (1,841) | 0.9275 (1,848) |
| NIR predictions, FR (all correct) | 111 | 119 |
| CARD predictions, FR (precision) | 17 (0.7059) | 16 (0.7500) |
| `nir_miss_diagnosis_fr_synthetic` | 92 caught; 8 malformed (7 uncovered, 1 masked as CARD) | 100 caught |
| Ablation (the page's 166 names), FR: leak rate · precision | 0.7659 · 0.9339 | 0.7515 · 0.9351 |
| Fail proof (+5 shift), FR precision | 0.8207 | 0.8225 |
| Pass bar met, FR / EN | no / no | no / no |

**What moved.** The 8 corrected NIRs are now all caught as NIR.
- 7 of their 8 documents no longer leak.
- `synthetic_023` still leaks through its name, "Denis Lopes de la Chrétien".
- All 5 FR synthetic documents that still leak are "de la" names: `synthetic_000`, `012`, `023`, `032` and `093`.
- FR still fails the NIR bar (0.6230 < 0.98), because FR OpenPII NATIONAL_ID stays at 0.2088 (19/91).

**Everything else is unchanged:**
- every EN number;
- PERSON recall and precision (FR 0.3794, EN 0.4591, all 0.4150);
- EMAIL, PHONE, IBAN, PLATE, ID_DOC and ADDRESS recall, CARD recall, POSTCODE and DATE;
- the round trip (1.000 in both languages) and `person_miss_diagnosis`;
- the FR OpenPII slice;
- the kill rule, which is still not triggered.

The only other difference in the file is text: the context of `worst_person_misses[0]` (`synthetic_023`) now shows the
corrected NIR.

`results_v3.json` records its ablation input as a scratch copy (`py_page.jsonl`). `preds/regex_v3_page.jsonl` gives the
same v3 ablation numbers, and v4 scores the ablation from `preds/regex_v4_page.jsonl`.

## Addendum 4 (2026-09-25): v5, the page's UK forms

Second Look's detectors gained UK dates ("3rd of May 1961", "3 May, 1961"), English-order street addresses ending at the
street type, and standalone UK postcodes; `regex_baseline.py` changed identically (`--check-page` passes). Same data as
v4, same pipeline: `results_v5.json`, `preds/*_v5_*`. Parity with the page's JS: 0 of 900 documents differ in both
configurations (entities 2,451 with the page's list, 2,471 with the extended list).

| | v4 | v5 |
|---|---|---|
| English typed leak rate | 0.9051 (353/390) | 0.8846 (345/390) |
| English typed leak rate, page's 166-name list | 0.9103 | 0.8897 |
| English ADDRESS recall · predictions (precision) | 0.0 · 1 (0.0) | 0.3763 · 58 (0.8966) |
| English POSTCODE recall | 0.0 | 0.0104 |
| French ADDRESS recall · predictions (precision) | 0.1933 · 26 (0.8462) | 0.2082 · 28 (0.8571) |
| All 900: typed leak rate · ADDRESS recall | 0.8187 · 0.0935 | 0.8096 · 0.2950 |

Unchanged: every French leak rate (0.7495; 0.7515 with the page's own 166-name list, the figure Second Look shows),
PERSON, NIR, PHONE, EMAIL, IBAN, CARD, PLATE and DATE recall (the data holds no "of" dates), the round trip (1.0). The
pass bar is still missed in both languages and the kill rule is still not triggered. Precision moved by less than 0.002
everywhere; two more ADDRESS false positives land on gold ADDRESS spans (partial overlaps).
