# Cactus-Compute/needle3 — redistributed binaries

- Upstream: https://huggingface.co/Cactus-Compute/needle3 (Apache-2.0, LICENSE in this folder), revision `b274efcb211a9eef48c9a88da4b43bd569696a39`
- Redistributed unmodified: `wasm/needle.js`, `wasm/needle.wasm` → `slm/app/web/public/needle/`
- The model weights (`needle3.cact`, 35 MB) are NOT redistributed: the browser fetches them from Hugging Face on first use and caches them.
- Ours: `slm/app/web/src/lib/needle/*` (the TypeScript wrapper and worker).
