# E1a — fix round 2 (from the supervisor)

The gold data is right now — thank you. Three defects remain, found by reading `results.jsonl` and `eval.py`:
1. **`regex_baseline.py` never predicts PERSON or DATE.** Its predicted types are EMAIL, PHONE, ID, NIR, PLATE, IBAN,
   POSTCODE, CARD, ADDRESS, AMOUNT only, so PERSON and DATE recall are 0 by construction and the leak rate is ~98 %.
   Port the date pattern (`['DATE', …]` in `PATTERNS`) and the whole name finder — `TITLES`, `FIRST`, `NOT_NAME`, `CAP`,
   `nameCandidates()` with its title / greeting / sign-off / relation / context / first-name cues, the preposition skip
   and the sentence-start rule — from `slm/app/second-look/index.html` into Python, faithfully, then run it. Extend the
   first-name list with common English, French, Spanish, German and Italian given names (≥ 400, one source file,
   licence-free list you write yourself — no copied datasets).
2. **41 of the 900 documents are missing from `results.jsonl`** (e.g. ids 550, 688, 560, 174, 49). Every document must be
   scored: `regex_baseline.py` must write one row per input row and `eval.py` must exit non-zero if the counts differ.
3. **The leak rate counts 6 types**, but the direct-identifier list in `DATA.md` (brief fix 1) has 9: PERSON, EMAIL,
   PHONE, NATIONAL_ID/NIR, IBAN, CARD, PLATE, ID_DOC, ADDRESS. Map your `ID` predictions to ID_DOC/NATIONAL_ID where the
   gold type says so (by overlap), and score all 9. Report DATE separately (not a direct identifier).

Then re-run everything, rewrite `REPORT.md` from `results.json`, and list the 10 worst PERSON misses with their text.
Foreground runs with explicit timeouts; reply with text only at the very end, in the preface's format.
