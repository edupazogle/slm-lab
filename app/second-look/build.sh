#!/usr/bin/env bash
# Rebuilds the files the page loads beside index.html: the ONNX Runtime Web script and wasm, the Word reader, and the two models,
# the models as base64 text chunks (the artifact host serves .wasm and text, not arbitrary binaries;
# each chunk stays under its 16 MB text limit). Run from this directory. Nothing here is committed.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ort models tmp vendor
curl -sfL -o ort/ort-wasm-simd.wasm https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort-wasm-simd.wasm
# the two scripts, served beside the page so that a reload works offline (the page falls back to the CDN if they are missing)
curl -sfL -o vendor/ort.wasm.min.js https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.wasm.min.js
curl -sfL -o vendor/mammoth.browser.min.js https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.12.3/mammoth.browser.min.js
curl -sfL -o models/vocab.txt https://huggingface.co/MoritzLaurer/xtremedistil-l6-h256-zeroshot-v1.1-all-33/resolve/main/vocab.txt
curl -sfL -o tmp/xtremedistil.onnx https://huggingface.co/MoritzLaurer/xtremedistil-l6-h256-zeroshot-v1.1-all-33/resolve/main/onnx/model_quantized.onnx
curl -sfL -o tmp/minilm.onnx https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx
python3 - <<'PY'
import base64
CH = 11_500_000
for name, src in (("xtremedistil-zeroshot-int8", "tmp/xtremedistil.onnx"), ("minilm-l6-int8", "tmp/minilm.onnx")):
    raw = open(src, "rb").read()
    for i in range(0, len(raw), CH):
        open(f"models/{name}.b64.part{i // CH}.txt", "wb").write(base64.b64encode(raw[i:i + CH]))
    print(name, len(raw), "bytes")
PY
rm -rf tmp
# the byte counts index.html expects (FILES in the page script)
wc -c ort/*.wasm models/*.txt vendor/*.js
