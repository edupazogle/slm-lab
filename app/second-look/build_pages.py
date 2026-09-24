#!/usr/bin/env python3
"""Build the static site for GitHub Pages into dist/: copies the page (a full HTML document), the offline shell (sw.js,
manifest, icon), the fonts, and the runtime, Word reader and model chunks that build.sh fetched. Run build.sh first."""
import os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); DIST = os.path.join(HERE, "dist")
FETCHED = ("ort", "models", "vendor")
for d in FETCHED:
    if not os.path.isdir(os.path.join(HERE, d)): sys.exit(f"missing {d}/ — run build.sh first")
if not open(os.path.join(HERE, "index.html"), encoding="utf-8").read().lstrip().lower().startswith("<!doctype html"): sys.exit("index.html must be a full document")
shutil.rmtree(DIST, ignore_errors=True); os.makedirs(DIST)
for f in ("index.html", "sw.js", "manifest.webmanifest", "icon.svg"): shutil.copy(os.path.join(HERE, f), DIST)
for d in FETCHED + ("assets",): shutil.copytree(os.path.join(HERE, d), os.path.join(DIST, d))
open(os.path.join(DIST, ".nojekyll"), "w").close()
n = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DIST) for f in fs)
print(f"dist/: {n/1e6:.1f} MB, {sum(len(fs) for _, _, fs in os.walk(DIST))} files")
