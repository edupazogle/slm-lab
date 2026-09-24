#!/usr/bin/env python3
"""Build the static site for GitHub Pages into dist/: wraps index.html (written in the claude.ai artifact format, which
starts at <title>) in a full HTML document, and copies the runtime and model chunks that build.sh fetched. Run build.sh first."""
import os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); DIST = os.path.join(HERE, "dist")
src = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
cut = src.index("<header")                     # everything before the first <header is head material (title, meta, fonts, style)
head, body = src[:cut], src[cut:]
for d in ("ort", "models"):
    if not os.path.isdir(os.path.join(HERE, d)): sys.exit(f"missing {d}/ — run build.sh first")
shutil.rmtree(DIST, ignore_errors=True); os.makedirs(DIST)
open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="color-scheme" content="light dark">\n' + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
for d in ("ort", "models"): shutil.copytree(os.path.join(HERE, d), os.path.join(DIST, d))
open(os.path.join(DIST, ".nojekyll"), "w").close()
n = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DIST) for f in fs)
print(f"dist/: {n/1e6:.1f} MB, {sum(len(fs) for _, _, fs in os.walk(DIST))} files")
