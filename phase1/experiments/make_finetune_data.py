"""Generate a claims-triage fine-tuning dataset (JSONL) for needle3, plus held-out eval cases.

Tools mirror the earlier experiments (log_claim / flag_for_review / schedule_callback),
with field descriptions added per the needle tools-design guide. Mixed English + French
(AXA France context). Sparse/vague claims are taught to route to flag_for_review rather
than hallucinate; off-topic requests get answers: [].
"""
import json

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
        "reason": {"type": "string", "description": "why a human should review it"},
        "severity": {"type": "string", "enum": ["low", "medium", "high"]}},
        "required": ["reason", "severity"]}},
    {"name": "schedule_callback", "description": "Schedule a callback to the claimant's phone number at a given time.",
     "parameters": {"type": "object", "properties": {
        "contact_number": {"type": "string", "description": "the phone number to call"},
        "when": {"type": "string", "description": "when to call, e.g. 'tomorrow morning'"}},
        "required": ["contact_number", "when"]}},
]

def ex(query, answers, reasoning=""):
    return {"query": query, "tools": TOOLS, "answers": answers, "reasoning": reasoning}

# (query, answers, reasoning)
DATA = [
    # --- simple log_claim (EN) ---
    ("Policy AXA-77812: Ms Elena Moreau, water damage in the kitchen on 15 September, 4300 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-77812","claimant":"Ms Elena Moreau","incident_date":"2026-09-15","damage_type":"water damage","amount":4300.0}}],
     "'AXA-77812' -> policy; 'Ms Elena Moreau' -> claimant; '15 September' -> date; 'water damage' -> type; '4300 euros' -> amount"),
    ("Log claim AXA-1133 for Mr Thomas Petit, theft of a bicycle on 2 August, 750 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-1133","claimant":"Mr Thomas Petit","incident_date":"2026-08-02","damage_type":"theft","amount":750.0}}],
     "'AXA-1133' -> policy; 'Mr Thomas Petit' -> claimant; '2 August' -> date; 'theft' -> type; '750 euros' -> amount"),
    ("Policy AXA-2200, fire damage in the garage on 5 Sept, estimated 12000 euros, claimant Mrs Anne Girard.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-2200","claimant":"Mrs Anne Girard","incident_date":"2026-09-05","damage_type":"fire damage","amount":12000.0}}],
     "'AXA-2200' -> policy; 'Mrs Anne Girard' -> claimant; '5 Sept' -> date; 'fire damage' -> type; '12000 euros' -> amount"),
    ("File a claim for AXA-8841, Mr Karim Benali, windshield crack on 18 September, 450 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-8841","claimant":"Mr Karim Benali","incident_date":"2026-09-18","damage_type":"windshield crack","amount":450.0}}],
     "'AXA-8841' -> policy; 'Mr Karim Benali' -> claimant; '18 September' -> date; 'windshield crack' -> type; '450 euros' -> amount"),
    ("Claim AXA-3301 for Mrs Sophie Lambert, flood damage to the basement on 12 Sept, 5000 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-3301","claimant":"Mrs Sophie Lambert","incident_date":"2026-09-12","damage_type":"flood damage","amount":5000.0}}],
     "'AXA-3301' -> policy; 'Mrs Sophie Lambert' -> claimant; '12 Sept' -> date; 'flood damage' -> type; '5000 euros' -> amount"),
    # --- simple log_claim (FR) ---
    ("Contrat AXA-77812 : Madame Elena Moreau, dégât des eaux dans la cuisine le 15 septembre, 4300 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-77812","claimant":"Madame Elena Moreau","incident_date":"2026-09-15","damage_type":"dégât des eaux","amount":4300.0}}],
     "'AXA-77812' -> policy; 'Madame Elena Moreau' -> claimant; '15 septembre' -> date; 'dégât des eaux' -> type; '4300 euros' -> amount"),
    ("Déclarer un sinistre AXA-1133 pour Monsieur Thomas Petit, vol de vélo le 2 août, 750 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-1133","claimant":"Monsieur Thomas Petit","incident_date":"2026-08-02","damage_type":"vol","amount":750.0}}],
     "'AXA-1133' -> policy; 'Monsieur Thomas Petit' -> claimant; '2 août' -> date; 'vol' -> type; '750 euros' -> amount"),
    ("Contrat AXA-8841, Monsieur Karim Benali, fissure de pare-brise le 18 septembre, 450 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-8841","claimant":"Monsieur Karim Benali","incident_date":"2026-09-18","damage_type":"fissure de pare-brise","amount":450.0}}],
     "'AXA-8841' -> policy; 'Monsieur Karim Benali' -> claimant; '18 septembre' -> date; 'fissure de pare-brise' -> type; '450 euros' -> amount"),
    # --- multi-action (log + callback) ---
    ("Log a car collision claim AXA-5555 for Mr Jean Dupont on 30 August, repair cost 2150.50, and call him back tomorrow morning on 06 12 34 56 78.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-5555","claimant":"Mr Jean Dupont","incident_date":"2026-08-30","damage_type":"car collision","amount":2150.5}},
      {"name":"schedule_callback","arguments":{"contact_number":"06 12 34 56 78","when":"tomorrow morning"}}],
     "log car collision claim; also schedule callback"),
    ("File the theft claim AXA-9902 for Mrs Claire Dubois on 1 Sept for 1200 euros and call her back this afternoon on 01 42 55 88 99.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-9902","claimant":"Mrs Claire Dubois","incident_date":"2026-09-01","damage_type":"theft","amount":1200.0}},
      {"name":"schedule_callback","arguments":{"contact_number":"01 42 55 88 99","when":"this afternoon"}}],
     "log theft claim; also schedule callback"),
    ("Déclarer le sinistre AXA-5555 pour Monsieur Jean Dupont le 30 août, coût 2150,50, et le rappeler demain matin au 06 12 34 56 78.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-5555","claimant":"Monsieur Jean Dupont","incident_date":"2026-08-30","damage_type":"collision","amount":2150.5}},
      {"name":"schedule_callback","arguments":{"contact_number":"06 12 34 56 78","when":"demain matin"}}],
     "log claim; schedule callback"),
    # --- schedule_callback (relative time) ---
    ("Call Mrs Alvarez back the day after tomorrow at 3pm on 04 11 22 33 44.",
     [{"name":"schedule_callback","arguments":{"contact_number":"04 11 22 33 44","when":"day after tomorrow at 3pm"}}],
     "'04 11 22 33 44' -> contact; 'day after tomorrow at 3pm' -> when"),
    ("Rappeler Monsieur Bernard demain à 9h au 01 44 55 66 77.",
     [{"name":"schedule_callback","arguments":{"contact_number":"01 44 55 66 77","when":"demain à 9h"}}],
     "'01 44 55 66 77' -> contact; 'demain à 9h' -> when"),
    ("Schedule a callback to 07 88 99 00 11 next Tuesday morning.",
     [{"name":"schedule_callback","arguments":{"contact_number":"07 88 99 00 11","when":"next Tuesday morning"}}],
     "'07 88 99 00 11' -> contact; 'next Tuesday morning' -> when"),
    # --- flag_for_review ---
    ("Flag claim AXA-77812 for review because the photos look inconsistent, high severity.",
     [{"name":"flag_for_review","arguments":{"reason":"photos look inconsistent","severity":"high"}}],
     "'photos look inconsistent' -> reason; 'high' -> severity"),
    ("This AXA-3301 claim needs a human check on the flood estimate, medium severity.",
     [{"name":"flag_for_review","arguments":{"reason":"human check on the flood estimate","severity":"medium"}}],
     "'human check on the flood estimate' -> reason; 'medium' -> severity"),
    ("Marquer le dossier AXA-8841 pour révision car le montant semble trop élevé, sévérité haute.",
     [{"name":"flag_for_review","arguments":{"reason":"le montant semble trop élevé","severity":"high"}}],
     "'le montant semble trop élevé' -> reason; 'haute' -> severity"),
    # --- sparse / vague -> flag_for_review (teach NOT to hallucinate) ---
    ("A customer wants to make a claim about their car.",
     [{"name":"flag_for_review","arguments":{"reason":"insufficient information","severity":"low"}}],
     "vague request -> flag for review"),
    ("Un client veut déclarer un sinistre pour sa voiture.",
     [{"name":"flag_for_review","arguments":{"reason":"informations insuffisantes","severity":"low"}}],
     "vague -> flag"),
    ("Log a theft claim for 800 euros.",
     [{"name":"flag_for_review","arguments":{"reason":"missing policy and claimant","severity":"low"}}],
     "missing required fields -> flag"),
    ("J'ai eu un dégât des eaux hier.",
     [{"name":"flag_for_review","arguments":{"reason":"informations insuffisantes","severity":"low"}}],
     "vague -> flag"),
    # --- off-topic -> [] ---
    ("What is the capital of France?", [], "off-topic"),
    ("Play some jazz music", [], "off-topic"),
    ("Tell me a joke", [], "off-topic"),
    ("Quelle est la météo à Paris ?", [], "off-topic"),
    ("Set a reminder for 6pm", [], "off-topic"),
    ("How do I reset my password?", [], "off-topic"),
]

# ---- held-out eval cases (not in training) ----
EVAL = [
    ("Policy AXA-4477: Mrs Laura Fournier, water damage in the bathroom on 20 September, 2800 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-4477","claimant":"Mrs Laura Fournier","incident_date":"2026-09-20","damage_type":"water damage","amount":2800.0}}]),
    ("Contrat AXA-4477 : Madame Laura Fournier, dégât des eaux dans la salle de bain le 20 septembre, 2800 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-4477","claimant":"Madame Laura Fournier","incident_date":"2026-09-20","damage_type":"dégât des eaux","amount":2800.0}}]),
    ("Log a car collision claim AXA-0001 for Mr Pierre Martin on 12 August, cost 1800 euros, and call him back tomorrow afternoon on 06 55 44 33 22.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-0001","claimant":"Mr Pierre Martin","incident_date":"2026-08-12","damage_type":"car collision","amount":1800.0}},
      {"name":"schedule_callback","arguments":{"contact_number":"06 55 44 33 22","when":"tomorrow afternoon"}}]),
    ("Rappeler Madame Petit demain à 14h au 01 22 33 44 55.",
     [{"name":"schedule_callback","arguments":{"contact_number":"01 22 33 44 55","when":"demain à 14h"}}]),
    ("A policyholder reported water damage but gave no policy number.",
     [{"name":"flag_for_review","arguments":{"reason":"insufficient information","severity":"low"}}]),
    ("What is the tallest mountain?", []),
]

def main():
    lines = [ex(q, a, r) for (q, a, r) in DATA]
    with open("data.jsonl", "w") as f:
        for l in lines:
            f.write(json.dumps(l, ensure_ascii=False) + "\n")
    print(f"wrote data.jsonl with {len(lines)} training examples")
    eval_cases = [{"query": q, "expected": a} for (q, a) in EVAL]
    with open("eval_cases.json", "w") as f:
        json.dump(eval_cases, f, ensure_ascii=False, indent=2)
    print(f"wrote eval_cases.json with {len(eval_cases)} held-out cases")

if __name__ == "__main__":
    main()
