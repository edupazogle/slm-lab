"""Fine-tune forensic: is the LoRA adapter actually in effect?

Control missing from phase 1: run base vs tuned on TRAINING examples the base model gets wrong.
Training loss hit ~0.002, so a tuned model that is really loaded must reproduce these labels.
Base and tuned run in SEPARATE processes (the engine cannot unload weights).
usage: ft_forensic.py base|tuned
"""
import json, sys, os, hashlib
sys.path.insert(0, "/home/edu/Public/Valheim/docs/slm-research/experiments")
import needle
from expand_data import TOOLS

P1 = "/home/edu/Public/Valheim/docs/slm-research/experiments"
which = sys.argv[1]
weights = None if which == "base" else f"{P1}/tuned.cact"
rows = [json.loads(l) for l in open(f"{P1}/data.jsonl")]
# pick training rows by expected tool, to cover every behaviour that was trained
def first(pred, n):
    out = []
    for r in rows:
        if pred(r) and len(out) < n: out.append(r)
    return out
flag_sparse = first(lambda r: r["answers"] and r["answers"][0]["name"]=="flag_for_review" and "insufficient" in json.dumps(r["answers"]), 5)
offtopic    = first(lambda r: not r["answers"], 4)
fr_claims   = first(lambda r: r["answers"] and r["answers"][0]["name"]=="log_claim" and ("Contrat" in r["query"] or "sinistre" in r["query"].lower()) and len(r["answers"])==1, 4)
multi       = first(lambda r: len(r["answers"])==2, 3)
sample = [("sparse->flag", r) for r in flag_sparse] + [("offtopic->[]", r) for r in offtopic] + [("FR log_claim", r) for r in fr_claims] + [("multi", r) for r in multi]

def norm(v):
    return v.lower().strip() if isinstance(v, str) else (round(v, 2) if isinstance(v, float) else v)
def same(calls, exp):
    if [c["name"] for c in calls] != [e["name"] for e in exp]: return False
    return all({k: norm(v) for k, v in c["arguments"].items()} == {k: norm(v) for k, v in e["arguments"].items()} for c, e in zip(calls, exp))

out = []
for tag, r in sample:
    a = needle.Needle(tools=TOOLS, system="date: 2026-09-20 Sun; locale: en-GB", weights=weights)
    res = a.complete(r["query"])
    calls, supp = res.get("function_calls", []), res.get("suppressed_calls", [])
    out.append({"tag": tag, "query": r["query"], "expected": r["answers"], "calls": calls, "suppressed": supp,
                "exact": same(calls, r["answers"]), "confidence": res.get("confidence")})
sig = hashlib.sha256(json.dumps([[o["calls"], o["suppressed"]] for o in out], sort_keys=True).encode()).hexdigest()[:16]
json.dump({"which": which, "weights": weights, "n": len(out), "exact": sum(o["exact"] for o in out), "output_signature": sig, "rows": out},
          open(f"ft_forensic_{which}.json", "w"), indent=1, ensure_ascii=False)
print(which, "exact-match on TRAINING rows:", sum(o["exact"] for o in out), "/", len(out), " signature:", sig)
for o in out:
    names = [c["name"] for c in o["calls"]] or ("SUPPRESSED:" + ",".join(c["name"] for c in o["suppressed"]) if o["suppressed"] else "[]")
    print(f"  {'OK ' if o['exact'] else 'NO '} {o['tag']:<14} got={names}  exp={[e['name'] for e in o['expected']]}")
