#!/usr/bin/env bash
# Predict x6 + score only (train/build already produced ft2_tuned.cact and ft2_base4bit.cact).
# Split out of ft2_pipeline.sh after the 2026-09-21 run: the predict stage died on an import-time argv parse
# in ft2_make_data.py (fixed), and retraining to reach it would have cost 30 min for nothing.
set -u
cd "$(dirname "$0")"
export NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1
PY=~/.venvs/slm/bin/python
say() { echo "[$(date +%T)] $*"; }
need() { [ -s "$1" ] || { say "FATAL: expected artifact missing: $1"; exit 1; }; }
need ft2_tuned.cact; need ft2_base4bit.cact; need ft2_eval.json
for sm in sys nosys; do
  say "predict base(2-bit shipped)/$sm";   $PY ft2_predict.py base  $sm                   2>&1 | grep -v Warning | tail -1; need ft2_pred_base_$sm.json
  say "predict base4bit(control)/$sm";     $PY ft2_predict.py tuned $sm ft2_base4bit.cact 2>&1 | grep -v -E "Warning|needle.Needle" | tail -1
  need ft2_pred_tuned_$sm.json; mv ft2_pred_tuned_$sm.json ft2_pred_base4bit_$sm.json
  $PY - <<PYX
import json; p="ft2_pred_base4bit_$sm.json"; d=json.load(open(p)); d["which"]="base4bit"; json.dump(d, open(p,"w"), ensure_ascii=False)
PYX
  say "predict tuned/$sm";                 $PY ft2_predict.py tuned $sm ft2_tuned.cact    2>&1 | grep -v -E "Warning|needle.Needle" | tail -1; need ft2_pred_tuned_$sm.json
done
say "score"; $PY ft2_score.py | tee ft2_score.txt
say "EVAL STAGE DONE"
