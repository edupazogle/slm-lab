#!/usr/bin/env bash
# Rebuilds the files the page loads beside index.html: the ONNX Runtime Web script and wasm, the Word reader, and the two models,
# the models as base64 text chunks (the artifact host serves .wasm and text, not arbitrary binaries;
# each chunk stays under its 16 MB text limit). Run from this directory. Nothing here is committed.
# What is fetched, from where, and what it must be is in models.lock: each file's size and sha256 are checked and the build
# stops on a mismatch. The page hard-codes the sizes, and an unpinned resolve/main let a change upstream break every build.
#   ./build.sh          fetch and check (GitHub Pages, the Dockerfile, CI)
#   ./build.sh --lock   where huggingface.co is reachable: fetch from resolve/main, pin each Hugging Face file to the commit
#                       its x-repo-commit header names, record every sha256, and rewrite models.lock (the sizes must still match)
set -euo pipefail
cd "$(dirname "$0")"
MODE=${1:-}
case "$MODE" in ''|--lock) ;; *) echo "usage: $0 [--lock]" >&2; exit 2;; esac
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
mkdir -p ort models tmp vendor
: > tmp/lock.rows; unpinned=0; left=0
while read -r dest url bytes sum <&3; do
  case "$dest" in ''|'#'*) continue;; esac
  if [ "$MODE" = --lock ]; then
    url=$(printf '%s' "$url" | sed -E 's#(huggingface\.co/[^/]+/[^/]+/resolve/)[^/]+/#\1main/#')
    curl -sfL -D tmp/headers -o "$dest" "$url"
    case "$url" in *huggingface.co/*)
      rev=$(tr -d '\r' < tmp/headers | awk 'tolower($1) == "x-repo-commit:" { print $2; exit }')
      if printf '%s' "$rev" | grep -Eq '^[0-9a-f]{40}$'; then url=$(printf '%s' "$url" | sed "s#/resolve/main/#/resolve/$rev/#")
      else left=$((left + 1)); echo "warning: no x-repo-commit header for $url: left at main" >&2; fi;;
    esac
  else
    curl -sfL -o "$dest" "$url"
  fi
  got=$(wc -c < "$dest" | tr -d ' '); gsum=$(sha256 "$dest")
  if [ "$bytes" != - ] && [ "$got" != "$bytes" ]; then echo "$dest: $got bytes, but models.lock and the page expect $bytes ($url)" >&2; exit 1; fi
  if [ "$MODE" = --lock ]; then echo "$dest $url $got $gsum" >> tmp/lock.rows
  elif [ "$sum" = - ]; then unpinned=$((unpinned + 1))
  elif [ "$gsum" != "$sum" ]; then echo "$dest: sha256 $gsum, but models.lock pins $sum ($url)" >&2; exit 1; fi
done 3< models.lock
if [ "$MODE" = --lock ]; then
  status="# Status: locked $(date -u +%F) by ./build.sh --lock"
  if [ "$left" -gt 0 ]; then status="$status; $left Hugging Face file(s) sent no x-repo-commit and still read resolve/main"; fi
  { grep '^#' models.lock | grep -v '^# Status:' || true; echo "$status"; cat tmp/lock.rows; } > tmp/models.lock && mv tmp/models.lock models.lock
  echo "models.lock rewritten: size and sha256 of $(grep -vc '^#' models.lock) files, $left of them still at resolve/main"
elif [ "$unpinned" -gt 0 ]; then
  echo "note: $unpinned file(s) have no sha256 in models.lock yet, so only their size was checked: run ./build.sh --lock where huggingface.co is reachable" >&2
fi
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
