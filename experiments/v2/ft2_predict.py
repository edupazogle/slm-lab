"""Run one model condition over the v2 eval set and save raw predictions.

usage: ft2_predict.py <base|tuned> <sys|nosys> [weights.cact]
One process per condition: the needle engine cannot unload tuned weights, and the C API owns one
process-global conversation, so a fresh agent is built per case (no cross-case context bleed).
"""
import json, sys, time
import needle
from ft2_make_data import TOOLS, SYSTEM

which, sysmode = sys.argv[1], sys.argv[2]
weights = (sys.argv[3] if len(sys.argv) > 3 else "ft2_tuned.cact") if which == "tuned" else None
cases = json.load(open("ft2_eval.json"))
out, t_all = [], time.perf_counter()
for i, c in enumerate(cases):
    kw = dict(tools=TOOLS, weights=weights)
    kw.update(dict(system=SYSTEM[c["_lang"]]) if sysmode == "sys" else dict(auto_date=False))
    a = needle.Needle(**kw)
    t0 = time.perf_counter(); r = a.complete(c["query"]); dt = time.perf_counter() - t0
    out.append({"i": i, "calls": r.get("function_calls", []), "suppressed": r.get("suppressed_calls", []),
                "confidence": r.get("confidence"), "ungrounded": (r.get("validation") or {}).get("ungrounded", []),
                "latency_s": round(dt, 4), "decode_tps": r.get("decode_tps"), "prefill_tps": r.get("prefill_tps")})
    if (i + 1) % 60 == 0: print(f"  {which}/{sysmode}: {i+1}/{len(cases)}", flush=True)
json.dump({"which": which, "sysmode": sysmode, "weights": weights, "wall_s": round(time.perf_counter() - t_all, 1), "preds": out},
          open(f"ft2_pred_{which}_{sysmode}.json", "w"), ensure_ascii=False)
print(f"done {which}/{sysmode}: {len(out)} cases in {time.perf_counter() - t_all:.0f}s")
