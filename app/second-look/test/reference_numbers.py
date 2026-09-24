import sys, json; sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__))); from eval_models import *
C = json.load(open(sys.argv[1] + "/cases.json"))
C[26]["line"] = None   # "where my claim stands" names no line of business
H = {"legal": "The writer mentions a lawyer, a solicitor or a court.",
     "vuln": "The writer mentions a death, a serious illness, a disability, old age or money problems."}
out = {}
for k, h in H.items():
    s = [p_yes(c["t"], [h]) for c in C]; y = [c[k] for c in C]
    out[k] = {"auc": round(auc(s, y), 3), "pos_mean": round(float(np.mean([a for a, t in zip(s, y) if t])), 3),
              "neg_mean": round(float(np.mean([a for a, t in zip(s, y) if not t])), 3), "n_pos": sum(y), "n": len(y)}
PROTO = {
 "motor": ["car accident", "my car was damaged", "a collision on the road", "windscreen or vehicle repair"],
 "home": ["damage to my house", "water leak, storm or fire at home", "burglary at home", "broken household items"],
 "travel": ["cancelled flight or holiday", "lost luggage abroad", "medical emergency on a trip abroad", "stolen passport while travelling"],
 "health": ["hospital treatment costs", "reimbursement of medical care", "prescription and doctor bills", "health insurance cover"],
 "liability": ["someone was injured on my premises", "I damaged someone else's property", "a third party claims compensation from me", "my dog or my employee caused harm to someone"]}
lines = list(PROTO); P = {k: embed(v).mean(0) for k, v in PROTO.items()}; P = {k: v/np.linalg.norm(v) for k, v in P.items()}
R = [c for c in C if c["line"]]; E = embed([c["t"] for c in R])
top = []
for c, e in zip(R, E):
    sims = np.array([float(e @ P[k]) for k in lines]); z = np.exp((sims - sims.max()) / 0.04); p = z / z.sum()
    top.append((lines[int(p.argmax())], float(p.max()), c["line"]))
out["route"] = {"acc": round(sum(a == t for a, _, t in top) / len(top), 3), "n": len(top),
                "at_0.6": {"share_auto": round(sum(p >= 0.6 for _, p, _ in top) / len(top), 3),
                           "acc_auto": round(sum(a == t for a, p, t in top if p >= 0.6) / max(1, sum(p >= 0.6 for _, p, _ in top)), 3)}}
print(json.dumps(out, indent=1))
