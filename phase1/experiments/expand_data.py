"""Synthetic claims-triage training data for needle3 fine-tuning.

Generates grounded slot-filling examples via template + entity substitution, with
answers derived deterministically from the query (so the model is never taught to
hallucinate). Mixes English and French (AXA France context). Outputs data.jsonl
(training) and eval_cases.json (held-out, unseen entities).
"""
import json, random

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

# ---- entity pools (training) ----
EN_NAMES = ["Ms Elena Moreau","Mr Thomas Petit","Mrs Sophie Lambert","Mr Karim Benali",
            "Mrs Claire Dubois","Mr Jean Dupont","Mrs Anne Girard","Mr Pierre Martin",
            "Mrs Laura Fournier","Mr Hugo Bernard"]
FR_NAMES = ["Madame Elena Moreau","Monsieur Thomas Petit","Madame Sophie Lambert",
            "Monsieur Karim Benali","Madame Claire Dubois","Monsieur Jean Dupont",
            "Madame Anne Girard","Monsieur Pierre Martin","Madame Laura Fournier",
            "Monsieur Hugo Bernard"]
DAM_EN = ["water damage","fire damage","theft","car collision","windshield crack",
          "flood damage","vandalism","a broken pipe"]
DAM_FR = ["dégât des eaux","incendie","vol","collision","fissure de pare-brise",
          "inondation","vandalisme","fuite de canalisation"]
DATES = [("15 September 2026","2026-09-15"),("2 August 2026","2026-08-02"),
         ("30 August 2026","2026-08-30"),("5 September 2026","2026-09-05"),
         ("12 September 2026","2026-09-12"),("18 September 2026","2026-09-18"),
         ("1 September 2026","2026-09-01"),("20 August 2026","2026-08-20"),
         ("3 July 2026","2026-07-03"),("14 June 2026","2026-06-14")]
DATES_FR = [("le 15 septembre 2026","2026-09-15"),("le 2 août 2026","2026-08-02"),
            ("le 30 août 2026","2026-08-30"),("le 5 septembre 2026","2026-09-05"),
            ("le 12 septembre 2026","2026-09-12"),("le 18 septembre 2026","2026-09-18")]
AMOUNTS = [450.0, 800.0, 1200.0, 2150.5, 2800.0, 4300.0, 5000.0, 12000.0]
PHONES = ["06 12 34 56 78","07 45 12 88 90","01 42 55 88 99","04 11 22 33 44",
          "06 55 44 33 22","07 88 99 00 11","01 44 55 66 77"]
WHEN_EN = ["tomorrow morning","this afternoon","next Tuesday","tomorrow at 9am"]
WHEN_FR = ["demain matin","cet après-midi","la semaine prochaine","demain à 9h"]

# ---- eval (fresh entities, unseen) ----
EVAL = [
    ("Policy AXA-7711: Ms Nadia Rousseau, water damage in the attic on 22 September 2026, 3100 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-7711","claimant":"Ms Nadia Rousseau","incident_date":"2026-09-22","damage_type":"water damage","amount":3100.0}}]),
    ("Contrat AXA-7711 : Madame Nadia Rousseau, dégât des eaux dans les combles le 22 septembre 2026, 3100 euros.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-7711","claimant":"Madame Nadia Rousseau","incident_date":"2026-09-22","damage_type":"dégât des eaux","amount":3100.0}}]),
    ("Log a car collision claim AXA-8822 for Mr Olivier Renard on 11 August 2026, cost 1900 euros, and call him back tomorrow afternoon on 06 77 88 99 00.",
     [{"name":"log_claim","arguments":{"policy_number":"AXA-8822","claimant":"Mr Olivier Renard","incident_date":"2026-08-11","damage_type":"car collision","amount":1900.0}},
      {"name":"schedule_callback","arguments":{"contact_number":"06 77 88 99 00","when":"tomorrow afternoon"}}]),
    ("Rappeler Madame Rousseau demain à 14h au 01 99 88 77 66.",
     [{"name":"schedule_callback","arguments":{"contact_number":"01 99 88 77 66","when":"demain à 14h"}}]),
    ("A policyholder reported a leak but gave no policy number.",
     [{"name":"flag_for_review","arguments":{"reason":"insufficient information","severity":"low"}}]),
    ("What is the tallest mountain?", []),
]

def log_claim_answer(pol, name, iso, dam, amt):
    return [{"name":"log_claim","arguments":{"policy_number":pol,"claimant":name,
            "incident_date":iso,"damage_type":dam,"amount":amt}}]

def build():
    random.seed(42)
    examples = []

    def add(query, answers, reasoning=""):
        examples.append({"query": query, "tools": TOOLS, "answers": answers, "reasoning": reasoning})

    # log_claim EN (templated)
    en_tmpl = [
        "Policy {pol}: {name}, {dam} on {date}, {amt} euros.",
        "Log claim {pol} for {name}, {dam} on {date}, {amt} euros.",
        "File a claim for {pol}, {name}, {dam} on {date}, {amt} euros.",
        "Claim {pol} from {name}, {dam} on {date}, {amt} euros.",
    ]
    fr_tmpl = [
        "Contrat {pol} : {name}, {dam} le {date}, {amt} euros.",
        "Déclarer un sinistre {pol} pour {name}, {dam} le {date}, {amt} euros.",
        "Sinistre {pol}, {name}, {dam} le {date}, {amt} euros.",
    ]
    for i in range(42):
        t = en_tmpl[i % len(en_tmpl)]
        name = EN_NAMES[i % len(EN_NAMES)]
        pol = f"AXA-{1000+i*13 % 9000 + 1000}"
        disp, iso = DATES[i % len(DATES)]
        dam = DAM_EN[i % len(DAM_EN)]
        amt = AMOUNTS[i % len(AMOUNTS)]
        add(t.format(pol=pol, name=name, dam=dam, date=disp, amt=amt),
            log_claim_answer(pol, name, iso, dam, amt))
    for i in range(42):
        t = fr_tmpl[i % len(fr_tmpl)]
        name = FR_NAMES[i % len(FR_NAMES)]
        pol = f"AXA-{1000+i*17 % 9000 + 1000}"
        disp, iso = DATES_FR[i % len(DATES_FR)]
        dam = DAM_FR[i % len(DAM_FR)]
        amt = AMOUNTS[i % len(AMOUNTS)]
        add(t.format(pol=pol, name=name, dam=dam, date=disp, amt=amt),
            log_claim_answer(pol, name, iso, dam, amt))

    # multi-action EN + FR
    for i in range(16):
        name = EN_NAMES[i % len(EN_NAMES)]
        pol = f"AXA-{3000+i*23 % 9000 + 1000}"
        disp, iso = DATES[i % len(DATES)]
        dam = "car collision"; amt = AMOUNTS[i % len(AMOUNTS)]
        phone = PHONES[i % len(PHONES)]; when = WHEN_EN[i % len(WHEN_EN)]
        add(f"Log a car collision claim {pol} for {name} on {disp}, repair cost {amt}, and call them back {when} on {phone}.",
            log_claim_answer(pol, name, iso, dam, amt) + [{"name":"schedule_callback","arguments":{"contact_number":phone,"when":when}}])
    for i in range(16):
        name = FR_NAMES[i % len(FR_NAMES)]
        pol = f"AXA-{4000+i*19 % 9000 + 1000}"
        disp, iso = DATES_FR[i % len(DATES_FR)]
        dam = "collision"; amt = AMOUNTS[i % len(AMOUNTS)]
        phone = PHONES[i % len(PHONES)]; when = WHEN_FR[i % len(WHEN_FR)]
        add(f"Déclarer un sinistre {pol} pour {name} le {disp}, coût {amt}, et le rappeler {when} au {phone}.",
            log_claim_answer(pol, name, iso, dam, amt) + [{"name":"schedule_callback","arguments":{"contact_number":phone,"when":when}}])

    # schedule_callback only
    for i in range(16):
        phone = PHONES[i % len(PHONES)]; when = WHEN_EN[i % len(WHEN_EN)]
        add(f"Call {EN_NAMES[i % len(EN_NAMES)]} back {when} on {phone}.",
            [{"name":"schedule_callback","arguments":{"contact_number":phone,"when":when}}])
    for i in range(16):
        phone = PHONES[i % len(PHONES)]; when = WHEN_FR[i % len(WHEN_FR)]
        add(f"Rappeler {FR_NAMES[i % len(FR_NAMES)]} {when} au {phone}.",
            [{"name":"schedule_callback","arguments":{"contact_number":phone,"when":when}}])

    # flag_for_review
    reasons = ["photos look inconsistent","amount seems too high","estimate needs checking",
               "possible fraud indicators","missing documentation"]
    reasons_fr = ["photos incohérentes","montant trop élevé","estimation à vérifier",
                  "indices de fraude possibles","documents manquants"]
    for i in range(10):
        add(f"Flag claim AXA-{i+5000} for review because {reasons[i % len(reasons)]}, high severity.",
            [{"name":"flag_for_review","arguments":{"reason":reasons[i % len(reasons)],"severity":"high"}}])
    for i in range(10):
        add(f"Marquer le dossier AXA-{i+5000} pour révision car {reasons_fr[i % len(reasons_fr)]}, sévérité moyenne.",
            [{"name":"flag_for_review","arguments":{"reason":reasons_fr[i % len(reasons_fr)],"severity":"medium"}}])

    # sparse -> flag (do not hallucinate)
    sparse = ["A customer wants to make a claim about their car.",
              "Un client veut déclarer un sinistre pour sa voiture.",
              "Log a theft claim for 800 euros.",
              "J'ai eu un dégât des eaux hier.",
              "Someone called about a fire in their kitchen."]
    for q in sparse:
        add(q, [{"name":"flag_for_review","arguments":{"reason":"insufficient information","severity":"low"}}])

    # off-topic -> []
    offtopic = ["What is the capital of France?","Play some jazz music","Tell me a joke",
                "Quelle est la météo à Paris ?","Set a reminder for 6pm","How do I reset my password?"]
    for q in offtopic:
        add(q, [])

    random.shuffle(examples)
    with open("data.jsonl","w") as f:
        for e in examples:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    with open("eval_cases.json","w") as f:
        json.dump(EVAL, f, ensure_ascii=False, indent=2)
    print(f"wrote data.jsonl with {len(examples)} training examples; eval_cases.json with {len(EVAL)} cases")

if __name__ == "__main__":
    build()
