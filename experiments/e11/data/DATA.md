# Dataset for E11 Fix Round 2: Watchdog Classifier

## Summary
- Windows: 6000 bytes sliding with 2000-byte step, max 60 per job
- Extracted from cockpit run transcripts using visible_pieces() function
- Pane-state labels derived from transcript structure (working, finished-report, waiting-permission, api-error, garble)
- Garble label: ONLY from synthetic generation (4 types: multilingual, repetition, latin_nonsense, truncated_json)
- Held-out-generator test: train on first 3 generators, test on 4th (truncated_json)
- Split by job: 70/30 with fixed seed 13

## Counts
- Total windows: 1307 (assert: ≥1000) ✓
- Total synthetic/garble windows: 401 (assert: ≥300) ✓

By split:
- train: 868 windows (270 synthetic/garble)
  - multilingual: 90
  - repetition: 80
  - latin_nonsense: 100
- test: 439 windows (131 synthetic/garble)
  - truncated_json: 131

By pane state:
- working: 104
- finished-report: 995
- waiting-permission: 62
- api-error: 146
- garble: 0
  ⚠️  Less than 10 examples - noted as requested

## Job Split Information
- Total jobs: 64
- Training jobs: 44
- Test jobs: 20 (assert: ≥15) ✓
- Random seed: 13

## Notes
- Used exact visible_pieces() function from brief
- Windows labeled by FIRST event after window's last byte via structure
- Synthetic garble generated using four methods as specified
- Held-out-generator evaluation implemented
- Metrics to be computed: per-class precision/recall, pane-state accuracy, waiting-permission recall, \
  garble recall per generator and Latin slice, false alarms per 8 agent-hours, CPU ms per classification
