"""Score the v2 eval: tool selection, field micro-F1, refusals, slices, paired bootstrap CIs.

v1's scorer was exact-match on the whole call over 6 cases and marked the engine's CORRECT date
resolution ("next Tuesday" -> 2026-09-23) as an error. This one:
  - scores fields individually (micro-F1, the metric the needle card reports for extraction);
  - accepts `when` either verbatim or as an ISO date/datetime on the expected resolved day;
  - normalises case, whitespace, trailing punctuation, and compares amounts numerically;
  - reports 95% bootstrap CIs and a PAIRED bootstrap for tuned-minus-base.
"""
import json, random, re, sys, glob
from collections import defaultdict

cases = json.load(open("ft2_eval.json"))
R = random.Random(11)

def norm_s(v): return re.sub(r"\s+", " ", str(v)).strip().strip(".,;:").casefold()
def field_ok(k, got, exp, exp_call):
    if got is None: return False
    if k == "amount":
        try: return abs(float(got) - float(exp)) < 0.005
        except Exception: return False
    if k == "incident_date": return str(got)[:10] == str(exp)[:10]
    if k == "when":
        g = str(got)
        return norm_s(g) == norm_s(exp) or (bool(re.match(r"^\d{4}-\d{2}-\d{2}", g)) and g[:10] == exp_call.get("_when_date"))
    if k == "contact_number": return re.sub(r"\D", "", str(got))[-9:] == re.sub(r"\D", "", str(exp))[-9:]
    return norm_s(got) == norm_s(exp)

def score_case(c, p):
    exp, got = c["answers"], p["calls"]
    names_ok = [e["name"] for e in exp] == [g["name"] for g in got]
    tp = fp = fn = 0
    by_name = defaultdict(list)
    for g in got: by_name[g["name"]].append(g)
    for e in exp:
        g = by_name[e["name"]].pop(0) if by_name[e["name"]] else None
        for k, v in e["arguments"].items():
            if g is not None and field_ok(k, g["arguments"].get(k), v, e): tp += 1
            else: fn += 1
        if g is not None:
            fp += sum(1 for k, v in g["arguments"].items() if k not in e["arguments"] or not field_ok(k, v, e["arguments"][k], e))
    for rest in by_name.values():
        for g in rest: fp += len(g["arguments"])          # a call that should not exist: every field is a false positive
    exact = names_ok and fp == 0 and fn == 0
    return {"tool_ok": names_ok, "tp": tp, "fp": fp, "fn": fn, "exact": exact,
            "refusal_expected": not exp, "refused": not got, "hallucinated_call": (not exp) and bool(got)}

def agg(rows):
    n = len(rows); tp = sum(r["tp"] for r in rows); fp = sum(r["fp"] for r in rows); fn = sum(r["fn"] for r in rows)
    pr = tp / (tp + fp) if tp + fp else 1.0; rc = tp / (tp + fn) if tp + fn else 1.0
    neg = [r for r in rows if r["refusal_expected"]]
    return {"n": n, "tool_acc": sum(r["tool_ok"] for r in rows) / n, "exact": sum(r["exact"] for r in rows) / n,
            "field_f1": 2 * pr * rc / (pr + rc) if pr + rc else 0.0, "field_p": pr, "field_r": rc,
            "false_call_rate": (sum(r["hallucinated_call"] for r in neg) / len(neg)) if neg else None}

def ci(rows, key, B=1000):
    vals = []
    for _ in range(B):
        s = [rows[R.randrange(len(rows))] for _ in rows]; vals.append(agg(s)[key])
    vals.sort(); return vals[int(.025 * B)], vals[int(.975 * B)]

def paired(a, b, key, B=2000):
    d = []
    for _ in range(B):
        idx = [R.randrange(len(a)) for _ in a]
        d.append(agg([b[i] for i in idx])[key] - agg([a[i] for i in idx])[key])
    d.sort(); return d[int(.025 * B)], d[int(.975 * B)], sum(1 for x in d if x <= 0) / B

runs = {}
for f in sorted(glob.glob("ft2_pred_*.json")):
    P = json.load(open(f)); runs[f"{P['which']}/{P['sysmode']}"] = ([score_case(c, p) for c, p in zip(cases, P["preds"])], P)

report = {"n_eval": len(cases), "conditions": {}, "paired": {}, "slices": {}}
print(f"{'condition':<14}{'n':>5}{'tool_acc':>10}{'field_F1':>10}{'  95% CI':>16}{'exact':>8}{'false_call':>12}{'ms/case':>9}")
for name, (rows, P) in runs.items():
    a = agg(rows); lo, hi = ci(rows, "field_f1")
    lat = sorted(p["latency_s"] for p in P["preds"]); med = lat[len(lat) // 2] * 1000
    report["conditions"][name] = {**a, "field_f1_ci95": [lo, hi], "median_latency_ms": med}
    fc = "-" if a["false_call_rate"] is None else f"{a['false_call_rate']:.3f}"
    print(f"{name:<14}{a['n']:>5}{a['tool_acc']:>10.3f}{a['field_f1']:>10.3f}   [{lo:.3f},{hi:.3f}]{a['exact']:>8.3f}{fc:>12}{med:>9.0f}")

PAIRS = [("base4bit", "tuned", "fine-tuning alone (both 4-bit)"), ("base", "base4bit", "quantisation alone (2-bit shipped -> 4-bit export)"), ("base", "tuned", "what a user would see")]
for sm in ("sys", "nosys"):
    for x, y, why in PAIRS:
        if f"{x}/{sm}" in runs and f"{y}/{sm}" in runs:
            a, b = runs[f"{x}/{sm}"][0], runs[f"{y}/{sm}"][0]
            print(f"  [{sm}] {y} minus {x}  ({why})")
            for key in ("field_f1", "tool_acc", "exact"):
                lo, hi, p = paired(a, b, key)
                report["paired"][f"{sm}:{y}-{x}:{key}"] = {"delta": agg(b)[key] - agg(a)[key], "ci95": [lo, hi], "p_le_0": p, "meaning": why}
                print(f"      {key:<9} delta={agg(b)[key]-agg(a)[key]:+.3f}  95% CI [{lo:+.3f},{hi:+.3f}]  P(delta<=0)={p:.3f}")

print("\nslices (field_F1 / tool_acc), system turn ON:")
for name in [n for n in runs if n.endswith("/sys")]:
    rows = runs[name][0]; sl = defaultdict(list)
    for c, r in zip(cases, rows):
        for t in c["_tags"]: sl[t].append(r)
    report["slices"][name] = {t: agg(v) for t, v in sl.items()}
    print(f" {name}: " + "  ".join(f"{t}={agg(v)['field_f1']:.2f}/{agg(v)['tool_acc']:.2f}(n{len(v)})" for t, v in sorted(sl.items())))
json.dump(report, open("ft2_report.json", "w"), indent=1)
