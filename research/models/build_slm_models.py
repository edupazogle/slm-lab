"""Merge the three part-catalogs into ONE file in the operator's schema: {"slm_models": [...]}.

The operator's schema requires model_name, huggingface_url, downloads_last_month and
wllama_compatibility{is_compatible, quantization_format}; the parts add the fields needed to load a model
(gguf_repo, gguf_file, gguf_size_mb, params_b, licence, capabilities, phone_ok, evidence), which are kept.
Duplicates (same original HF repo in two parts) are merged, first part wins, capabilities unioned.
Numbers are copied, never recomputed: they came from the HF API on 2026-09-21 (see each entry's evidence).
"""
import json, sys
PARTS = ["catalog-general-chat.json", "catalog-tools-extraction.json", "catalog-embedding-pii-doc.json"]
REQUIRED = ["model_name", "huggingface_url", "downloads_last_month", "wllama_compatibility"]
out, seen = [], {}
for part in PARTS:
    for m in json.load(open(part)):
        key = (m.get("huggingface_url") or m["model_name"]).rstrip("/").lower()
        if key in seen:
            prev = seen[key]
            prev["capabilities"] = sorted(set(prev.get("capabilities", [])) | set(m.get("capabilities", [])))
            prev.setdefault("catalog_parts", []).append(part)
            continue
        m = dict(m); m["catalog_parts"] = [part]
        seen[key] = m; out.append(m)
bad = [(m["model_name"], k) for m in out for k in REQUIRED if m.get(k) is None]
bad += [(m["model_name"], "wllama_compatibility." + k) for m in out for k in ("is_compatible", "quantization_format")
        if m.get("wllama_compatibility", {}).get(k) is None]
json.dump({"slm_models": out}, open("slm_models.json", "w"), indent=1, ensure_ascii=False)
print(f"{len(out)} unique models -> slm_models.json | wllama-compatible: {sum(m['wllama_compatibility']['is_compatible'] for m in out)}"
      f" | phone_ok: {sum(bool(m.get('phone_ok')) for m in out)}")
if bad:
    print("MISSING REQUIRED FIELDS (left null on purpose by the catalog agents, see evidence):"); [print("  ", b) for b in bad]
