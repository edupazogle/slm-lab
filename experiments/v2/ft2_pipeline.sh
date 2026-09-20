#!/usr/bin/env bash
# v2 fine-tune pipeline: train -> build tuned -> build 4-bit UNTUNED control -> predict x6 -> score.
# Every stage checks the artifact of the previous one: a missing file stops the run loudly instead of
# producing a well-formed report about nothing.
set -u
cd "$(dirname "$0")"
export NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1
export XLA_PYTHON_CLIENT_MEM_FRACTION=0.60     # JAX otherwise grabs ~all VRAM on a GPU shared with the Windows host (run 1 died with CUDA_ERROR_UNKNOWN)
PY=~/.venvs/slm/bin/python; NEEDLE=~/.venvs/slm/bin/needle
CKPT=/home/edu/Public/Valheim/docs/slm-research/experiments/checkpoints/needle3.safetensors
say() { echo "[$(date +%T)] $*"; }
need() { [ -s "$1" ] || { say "FATAL: expected artifact missing: $1"; exit 1; }; }

say "train: 1200 rows, 4 epochs, rank 32, pad 640"
{ time $NEEDLE finetune ft2_train.jsonl --epochs 4 --batch-size 8 --max-len 640 --lora-rank 32 --lora-alpha 64 --seed 7 \
    --checkpoint "$CKPT" --checkpoint-dir ./ft2_ckpt --out ft2_adapter.safetensors ; } > ft2_finetune.log 2>&1
grep -E "^  epoch" ft2_finetune.log | tail -4; grep -E "^real" ft2_finetune.log
need ft2_adapter.safetensors

say "build tuned (4-bit)"; $NEEDLE build "$CKPT" --lora ft2_adapter.safetensors --out ft2_tuned.cact 2>&1 | grep -E "^  (merged|wrote)"; need ft2_tuned.cact

say "control: zero-delta adapter (lr 0) -> 4-bit export of the UNTUNED base (removes the 2-bit vs 4-bit confound)"
head -16 ft2_train.jsonl > ft2_ctrl_rows.jsonl
$NEEDLE finetune ft2_ctrl_rows.jsonl --epochs 1 --batch-size 8 --max-len 640 --lr 0 --lora-rank 32 --lora-alpha 64 --seed 7 \
    --checkpoint "$CKPT" --checkpoint-dir ./ft2_ckpt_ctrl --out ft2_ctrl_adapter.safetensors > ft2_ctrl_finetune.log 2>&1
need ft2_ctrl_adapter.safetensors
$NEEDLE build "$CKPT" --lora ft2_ctrl_adapter.safetensors --out ft2_base4bit.cact 2>&1 | grep -E "^  (merged|wrote)"; need ft2_base4bit.cact

unset XLA_PYTHON_CLIENT_MEM_FRACTION
for sm in sys nosys; do
  say "predict base(2-bit shipped)/$sm";   $PY ft2_predict.py base  $sm                   2>&1 | grep -v Warning | tail -1
  say "predict base4bit(control)/$sm";     $PY ft2_predict.py tuned $sm ft2_base4bit.cact 2>&1 | grep -v -E "Warning|needle.Needle" | tail -1
  mv ft2_pred_tuned_$sm.json ft2_pred_base4bit_$sm.json
  $PY - <<PYX
import json; p="ft2_pred_base4bit_$sm.json"; d=json.load(open(p)); d["which"]="base4bit"; json.dump(d, open(p,"w"), ensure_ascii=False)
PYX
  say "predict tuned/$sm";                 $PY ft2_predict.py tuned $sm ft2_tuned.cact    2>&1 | grep -v -E "Warning|needle.Needle" | tail -1
done
say "score"; $PY ft2_score.py | tee ft2_score.txt
say "PIPELINE DONE"
