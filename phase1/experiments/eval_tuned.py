"""Evaluate base needle3 vs fine-tuned adapter on held-out claims-triage cases.

Fresh agent per case (avoids cross-case conversation bleed). Base agents are
constructed before any tuned agent (the engine cannot unload tuned weights).
"""
import json, needle

TOOLS = [
    {"name": "log_claim", "description": "Log a new insurance claim with its core details.",
     "parameters": {"type": "object", "properties": {
        "policy_number": {"type": "string", "description": "the policy number, e.g. AXA-77812"},
        "claimant": {"type": "string", "description": "the claimant's full name"},
        "incident_date": {"type": "string", "description": "the incident date, ISO date"},
        "damage_type": {"type": "string", "description": "the damage or claim type"},
        "amount": {"type": "number", "description": "the claimed amount in euros"}},
        "required": ["policy_number", "claimant", "incident_date", "damage_type", "amount"]}},
    {"name": "flag_for_review", "description": "Flag a claim for human review with a reason and severity.",
     "parameters": {"type": "object", "properties": {
        "reason": {"type": "string"}, "severity": {"type": "string", "enum": ["low","medium","high"]}},
        "required": ["reason", "severity"]}},
    {"name": "schedule_callback", "description": "Schedule a callback to the claimant's phone number at a given time.",
     "parameters": {"type": "object", "properties": {
        "contact_number": {"type": "string"}, "when": {"type": "string"}},
        "required": ["contact_number", "when"]}},
]

def norm_val(v):
    if isinstance(v, str):
        return v.lower().strip()
    if isinstance(v, float):
        return round(v, 2)
    return v

def field_score(call, exp):
    a, e = call.get("arguments", {}), exp.get("arguments", {})
    if set(a.keys()) != set(e.keys()):
        return 0.0
    hit = sum(1 for k in e if norm_val(a.get(k)) == norm_val(e.get(k)))
    return hit / len(e)

def score(calls, expected):
    if not calls and not expected:
        return 1.0
    if not calls or not expected:
        return 0.0
    if [c["name"] for c in calls] != [e["name"] for e in expected]:
        return 0.0
    return sum(field_score(c, e) for c, e in zip(calls, expected)) / len(expected)

def run_one(weights, q):
    a = needle.Needle(tools=TOOLS, system="date: 2026-09-20 Sun; locale: en-GB", weights=weights)
    r = a.complete(q)
    return r.get("function_calls", [])

def main():
    cases = json.load(open("eval_cases.json"))
    base = [run_one(None, q) for q, _ in cases]
    tuned = [run_one("tuned.cact", q) for q, _ in cases]

    def s(cs):
        return "; ".join(f"{x['name']}({x.get('arguments')})" for x in cs) or "[]"

    print(f"{'#':<2} {'base':<44} {'tuned':<44} {'expected'}")
    btot = ttot = 0.0
    for i, c in enumerate(cases):
        q, expected = c[0], c[1]
        bs, ts = score(base[i], expected), score(tuned[i], expected)
        btot += bs; ttot += ts
        print(f"{i:<2} {s(base[i])[:43]:<44} {s(tuned[i])[:43]:<44} {s(expected)[:60]}")
    n = len(cases)
    print(f"\nbase  avg {btot/n:.2f}   tuned avg {ttot/n:.2f}")

if __name__ == "__main__":
    main()
