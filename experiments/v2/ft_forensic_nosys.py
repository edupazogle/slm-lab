"""Same forensic, but the tuned model is called the way it was TRAINED: no system turn, no auto date."""
import json, sys
sys.path.insert(0, "/home/edu/Public/Valheim/docs/slm-research/experiments")
import needle
from expand_data import TOOLS
P1 = "/home/edu/Public/Valheim/docs/slm-research/experiments"
which = sys.argv[1]; weights = None if which == "base" else f"{P1}/tuned.cact"
prev = json.load(open(f"ft_forensic_{which}.json"))
def norm(v): return v.lower().strip() if isinstance(v, str) else (round(v, 2) if isinstance(v, float) else v)
def same(calls, exp):
    if [c["name"] for c in calls] != [e["name"] for e in exp]: return False
    return all({k: norm(v) for k, v in c["arguments"].items()} == {k: norm(v) for k, v in e["arguments"].items()} for c, e in zip(calls, exp))
ok = 0; by = {}
for o in prev["rows"]:
    a = needle.Needle(tools=TOOLS, weights=weights, auto_date=False)
    r = a.complete(o["query"]); calls = r.get("function_calls", [])
    hit = same(calls, o["expected"]); ok += hit
    by.setdefault(o["tag"], [0, 0]); by[o["tag"]][0] += hit; by[o["tag"]][1] += 1
print(which, "NO-SYSTEM-TURN exact on training rows:", ok, "/", len(prev["rows"]), by)
