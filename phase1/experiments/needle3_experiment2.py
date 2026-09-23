"""Needle3 experiment suite 2 — clean single-turn scenarios (fresh agent each).

Focuses on: multi-action routing, relative-time resolution, hallucination/grounding.
"""
import json, time
from datetime import datetime
from typing import Literal
from pydantic import BaseModel
import needle

LOG = open("needle3_results.jsonl", "a")

def rec(name, **kw):
    d = {"experiment": name, "ts": datetime.now().isoformat(), **kw}
    LOG.write(json.dumps(d, default=str) + "\n"); LOG.flush()
    print(json.dumps(d, indent=2, default=str)); print("-"*70)

def make_agent():
    @needle.tool
    def log_claim(policy_number: str, claimant: str, incident_date: str,
                  damage_type: str, amount: float):
        "Log a new insurance claim with its core details."
        return {"action": "log", "policy": policy_number, "claimant": claimant,
                "date": incident_date, "type": damage_type, "amount": amount}

    @needle.tool
    def schedule_callback(contact_number: str, when: str):
        "Schedule a callback to the claimant's phone number at a given time."
        return {"action": "callback", "phone": contact_number, "when": when}
    return needle.Needle(tools=[log_claim, schedule_callback],
                         system="date: 2026-09-20 Sun; locale: en-GB")

# E1 — multi-action, ONE turn, fresh agent
a = make_agent()
t0 = time.time()
r = a.complete("Log a car collision claim for Mr. Jean Dupont on 30 August, "
               "repair cost 2150.50, and call him back tomorrow morning on 06 12 34 56 78.")
rec("E1_multi_action_clean", response=r, elapsed_s=round(time.time()-t0, 3))

# E2 — relative time resolution
a = make_agent()
t0 = time.time()
r = a.complete("Please call Mrs. Alvarez back the day after tomorrow at 3pm on 04 11 22 33 44.")
rec("E2_relative_time", response=r, elapsed_s=round(time.time()-t0, 3))

# E3 — sparse claim: will it hallucinate, and does grounding catch it?
a = make_agent()
t0 = time.time()
r = a.complete("A customer wants to file a claim for a stolen bicycle.")
rec("E3_sparse_claim", response=r, elapsed_s=round(time.time()-t0, 3))

# E4 — same but with a bit more info (amount only, no policy/date)
a = make_agent()
t0 = time.time()
r = a.complete("Log a theft claim for 800 euros.")
rec("E4_partial_claim", response=r, elapsed_s=round(time.time()-t0, 3))

print("DONE")
