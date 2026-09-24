# E1a — fix round 1 (from the supervisor, after reading your data)

The numbers in your report cannot be used yet, for two reasons the files show:
- **The gold labels are almost all missing.** `data/combined_dataset.jsonl` has 438 gold spans and every one is EMAIL. Your
  `entity_mapping` in `build_dataset.py` uses label names that OpenPII does not have (`PHONE_NUMBER`, `IBAN`, `PERSON`,
  `SOCIAL_SECURITY_NUMBER`…). OpenPII's real labels, from its dataset card (README "Label" table): `DATE`, `GIVENNAME`,
  `SURNAME`, `EMAIL`, `CITY`, `TITLE`, `TELEPHONENUM`, `AGE`, `STREET`, `BUILDINGNUM`, `ZIPCODE`, `IDCARDNUM`,
  `CREDITCARDNUMBER`, `DRIVERLICENSENUM`, `GENDER`, `TAXNUM`, `SEX`, `SOCIALNUM`, `PASSPORTNUM`. It has **no IBAN and no
  plate label** — those types come from your synthetic emails only.
- **The 100 synthetic French emails have `spans: []`**, although their text contains a NIR, an IBAN, a plate, a SIREN,
  a date of birth, names and a garage.

The licence is fine: the card says CC-BY-4.0 ("research, commercial use, redistribution… subject to attribution"); the Hub
metadata says "other" with `license_name: cc-by-4.0`. Record both in `DATA.md` and the attribution
"Ai4Privacy / Ai Suisse SA", with the repository link.

Do this:
1. **Map the real labels** in `build_dataset.py`: GIVENNAME, SURNAME → PERSON; TELEPHONENUM → PHONE; EMAIL → EMAIL;
   DATE → DATE; STREET + BUILDINGNUM → ADDRESS; ZIPCODE → POSTCODE; CITY → CITY; SOCIALNUM → NATIONAL_ID; TAXNUM → TAX_ID;
   IDCARDNUM, PASSPORTNUM, DRIVERLICENSENUM → ID_DOC; CREDITCARDNUMBER → CARD. Keep TITLE, AGE, GENDER, SEX as recorded but
   out of scoring. Filter rows by the dataset's own language field (check its name in the data) to exactly 400 `fr` + 400 `en`.
2. **Build synthetic spans by construction** in `gen_fr_claims.py`: assemble each email from pieces and record each inserted
   value's start/end as you append it. Types: PERSON (both people), NIR, IBAN, PLATE, SIREN, DATE (date of birth and the
   claim date), PHONE, EMAIL, ORG (the garage). Assert, for every span, `text[start:end] == value`; assert at least 9 spans
   per email; the script must exit non-zero if an assertion fails.
3. **Direct identifiers** for the leak rate (write the list in `DATA.md`): PERSON, EMAIL, PHONE, NATIONAL_ID/NIR, IBAN, CARD,
   PLATE, ID_DOC, ADDRESS.
4. **`eval.py` must refuse empty gold:** print gold span counts per type per slice (FR OpenPII, EN OpenPII, FR synthetic) and
   exit non-zero if any direct-identifier type that the slice should contain has 0 gold spans (synthetic must contain PERSON,
   NIR, IBAN, PLATE, PHONE, EMAIL; OpenPII must contain PERSON, EMAIL, PHONE). Map your regex types onto the gold types the
   same way before scoring. Report per-type recall and precision per slice, the document leak rate per slice, and a
   precision breakdown: which predicted types produce the false positives.
5. **Round trip:** pseudonymise → restore → exact-match rate, per slice.
6. **Prove a metric can fail:** shift every predicted span by +5 characters and show recall falls.
7. Rewrite `REPORT.md` from `results.json` (not `.jsonl`) only.

Run long steps in the foreground with explicit timeouts; reply with text only at the very end, in the preface's format.
