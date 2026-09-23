"""Needle3 experiment suite — claims triage, structured extraction, PII/anonymization feed.

Runs against the Cactus-Compute/needle3 model via the `cactus-needle` package.
Every result is printed as JSON and appended to needle3_results.jsonl.
"""
import json, time, sys
from datetime import datetime
from typing import Literal, Annotated
from pydantic import BaseModel

import needle

LOG = open("needle3_results.jsonl", "a")

def rec(name, **kw):
    d = {"experiment": name, "ts": datetime.now().isoformat(), **kw}
    LOG.write(json.dumps(d, default=str) + "\n")
    LOG.flush()
    print(json.dumps(d, indent=2, default=str))
    print("-" * 70)

# ---------------------------------------------------------------------------
# A. TOOL-CALLING — claims triage routing (the "agentic triage" use case)
# ---------------------------------------------------------------------------
@needle.tool
def log_claim(policy_number: str, claimant: str, incident_date: str,
              damage_type: str, amount: float):
    "Log a new insurance claim with its core details."
    return {"action": "log", "policy": policy_number, "claimant": claimant,
            "date": incident_date, "type": damage_type, "amount": amount}

@needle.tool
def flag_for_review(reason: str,
                    severity: Literal["low", "medium", "high"]):
    "Flag a claim for human review with a reason and severity level."
    return {"action": "flag", "reason": reason, "severity": severity}

@needle.tool
def schedule_callback(contact_number: str, when: str):
    "Schedule a callback to the claimant's phone number at a given time."
    return {"action": "callback", "phone": contact_number, "when": when}

agent = needle.Needle(
    tools=[log_claim, flag_for_review, schedule_callback],
    system="date: 2026-09-20 Sun; locale: en-GB; device: claim-intake",
)

# A1 — single clear claim
t0 = time.time()
r = agent.complete("Policy AXA-77812: Ms Elena Moreau had water damage in the "
                   "kitchen from a burst pipe on 15 September, estimated 4300 euros.")
rec("A1_single_claim", query="Policy AXA-77812 ... water damage ...",
    response=r, elapsed_s=round(time.time()-t0, 3))

# A2 — multi-action request (log + callback in one utterance)
t0 = time.time()
r = agent.complete("Log a car collision claim for Mr. Jean Dupont on 30 August, "
                   "repair cost 2150.50, and call him back tomorrow morning on "
                   "06 12 34 56 78.")
rec("A2_multi_action", query="log + callback", response=r,
    elapsed_s=round(time.time()-t0, 3))

# A3 — off-topic (should refuse with empty function_calls)
t0 = time.time()
r = agent.complete("What is the capital of France?")
rec("A3_offtopic", query="capital of France?", response=r,
    elapsed_s=round(time.time()-t0, 3))

# A4 — ambiguous / low-evidence (grounding check)
t0 = time.time()
r = agent.complete("A customer wants to make a claim about their car.")
rec("A4_ambiguous", query="vague claim", response=r,
    elapsed_s=round(time.time()-t0, 3))

# ---------------------------------------------------------------------------
# B. STRUCTURED EXTRACTION — typed claim record from messy text
# ---------------------------------------------------------------------------
class ClaimRecord(BaseModel):
    policy_number: str
    claimant_name: str
    incident_date: str
    damage_type: str
    claim_amount: float

t0 = time.time()
claim = needle.extract(
    "Claim #AXA-77812 filed by Mr. Jean Dupont for a car collision on 2026-08-30, "
    "repair cost 2150.50 EUR.", ClaimRecord)
rec("B_claim_extraction", input="claim paragraph", extracted=claim.model_dump(),
    elapsed_s=round(time.time()-t0, 3))

# ---------------------------------------------------------------------------
# C. PII EXTRACTION — anonymization feed (names/phones/emails/addresses/policy)
# ---------------------------------------------------------------------------
class PII(BaseModel):
    full_name: str
    phone: str
    email: str
    address: str
    policy_number: str
    id_number: str

t0 = time.time()
pii = needle.extract(
    "Dear support, I am Sophie Lambert, born 12/03/1980, policy AXA-9911. "
    "You can reach me at 07 45 12 88 90 or sophie.lambert@example.fr. "
    "My home is 14 rue de Rivoli, 75001 Paris. My national ID is 2 80 03 75 116 042.",
    PII, strict=False)
rec("C_pii_extraction", input="customer email text",
    extracted=pii.model_dump() if pii else None,
    elapsed_s=round(time.time()-t0, 3))

# ---------------------------------------------------------------------------
# D. MICRO-BENCHMARK — throughput + confidence distribution over a batch
# ---------------------------------------------------------------------------
bench_queries = [
    "Policy AXA-1: theft of a bicycle on 1 Sept, 800 euros.",
    "Policy AXA-2: fire damage in the garage on 5 Sept, 12000 euros.",
    "Policy AXA-3: third-party liability after a fall in the store, no amount.",
    "Policy AXA-4: flood damage to the basement on 12 Sept, 5000 euros.",
    "Policy AXA-5: windshield crack on 18 Sept, 450 euros.",
]
times, confs, n_calls = [], [], []
for q in bench_queries:
    t0 = time.time()
    r = agent.complete(q)
    times.append(time.time() - t0)
    confs.append(r.get("confidence"))
    n_calls.append(len(r.get("function_calls", [])))
rec("D_benchmark", n=len(bench_queries),
    mean_latency_s=round(sum(times)/len(times), 3),
    p50_latency_s=round(sorted(times)[len(times)//2], 3),
    max_latency_s=round(max(times), 3),
    confidences=[round(c, 3) if c is not None else None for c in confs],
    calls_per_query=n_calls)

print("DONE")
