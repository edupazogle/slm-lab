"""Claims-triage fine-tuning data, v2 — built to fix what the forensic found wrong with v1.

v1 defects (see ../../critique/): labels contained values that are NOT in the query
("collision" in a French template that never says it; reason "insufficient information"),
which needle's grounding contract can never emit; a template bug ("le le 12 septembre");
no system turn in training but one at inference; eval shared its templates with training.

v2 rules:
  1. Every string label is a VERBATIM span of the query. Dates are ISO (the engine normalises them),
     amounts are numbers.
  2. Incomplete claims are labelled [] (withhold) — the host reads `suppressed_calls` as the
     "confirm" band. Nothing ungrounded is ever asked of the model.
  3. Train and eval use DISJOINT phrasings, names and damage types (tests generalisation, not recall).
  4. Half the rows carry a system turn, half do not; eval is run both ways.
  5. Seeded and reproducible.

usage: ft2_make_data.py [n_train] [n_eval] [seed]
"""
import json, random, sys
from datetime import date, timedelta

_ARGS = sys.argv[1:] if __name__ == "__main__" else []   # importers (ft2_predict.py) pass their own argv; never parse it here
N_TRAIN = int(_ARGS[0]) if len(_ARGS) > 0 else 1200
N_EVAL = int(_ARGS[1]) if len(_ARGS) > 1 else 240
SEED = int(_ARGS[2]) if len(_ARGS) > 2 else 7
TODAY = date(2026, 9, 20)
SYSTEM = {"en": "date: 2026-09-20 Sun; locale: en-GB", "fr": "date: 2026-09-20 Sun; locale: fr-FR"}

TOOLS = [   # descriptions kept short on purpose: the schema is ~80% of every prompt, and >512 tokens doubles the padded length
    {"name": "log_claim", "description": "Log an insurance claim.",
     "parameters": {"type": "object", "properties": {
        "policy_number": {"type": "string", "description": "as written, e.g. AXA-77812"},
        "claimant": {"type": "string", "description": "name with title, as written"},
        "incident_date": {"type": "string", "description": "ISO date"},
        "damage_type": {"type": "string", "description": "as written"},
        "amount": {"type": "number", "description": "euros"}},
        "required": ["policy_number", "claimant", "incident_date", "damage_type", "amount"]}},
    {"name": "schedule_callback", "description": "Schedule a phone callback.",
     "parameters": {"type": "object", "properties": {
        "contact_number": {"type": "string", "description": "as written"},
        "when": {"type": "string"}},
        "required": ["contact_number", "when"]}},
    {"name": "flag_for_review", "description": "Flag a claim for human review, with the stated reason.",
     "parameters": {"type": "object", "properties": {
        "reason": {"type": "string", "description": "as written"},
        "severity": {"type": "string", "enum": ["low", "medium", "high"]}},
        "required": ["reason", "severity"]}},
]

MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"]
MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]

FIRST = ["Elena","Thomas","Sophie","Karim","Claire","Jean","Anne","Pierre","Laura","Hugo","Nadia","Olivier","Camille","Lucas","Inès","Mathieu",
         "Chloé","Antoine","Manon","Julien","Léa","Nicolas","Sarah","Maxime","Emma","Romain","Julie","Bastien","Amira","Yann","Fatou","Victor"]
LAST = ["Moreau","Petit","Lambert","Benali","Dubois","Dupont","Girard","Martin","Fournier","Bernard","Rousseau","Renard","Leroy","Garnier",
        "Faure","Mercier","Blanc","Guerin","Boyer","Chevalier","Francois","Legrand","Gauthier","Perrin","Robin","Masson","Diallo","Nguyen","Haddad","Costa"]
DAM = {"en": ["water damage","fire damage","a burst pipe","a rear-end collision","a cracked windshield","flood damage","vandalism","hail damage",
              "a stolen bicycle","storm damage to the roof","a broken window","a kitchen fire","theft of a laptop","a fallen tree","smoke damage",
              "a parking collision","a broken boiler","burglary","a leaking roof","glass breakage","an electrical surge","a stolen phone"],
       "fr": ["un dégât des eaux","un incendie","une fuite de canalisation","une collision arrière","un bris de glace","une inondation",
              "un acte de vandalisme","des dégâts de grêle","un vol de vélo","des dégâts de tempête sur la toiture","une vitre cassée",
              "un feu de cuisine","le vol d'un ordinateur","une chute d'arbre","des dégâts de fumée","un accrochage sur un parking",
              "une chaudière en panne","un cambriolage","une toiture qui fuit","une surtension électrique","le vol d'un téléphone","un pare-brise fissuré"]}
REASONS = {"en": ["the photos look inconsistent","the amount seems too high","the estimate needs checking","the dates do not match",
                  "the invoice is missing","the claimant filed twice","the repair shop is unknown","the damage predates the policy"],
           "fr": ["les photos sont incohérentes","le montant semble trop élevé","le devis doit être vérifié","les dates ne correspondent pas",
                  "la facture est manquante","le client a déclaré deux fois","le garage est inconnu","le dommage est antérieur au contrat"]}
SEV = {"en": {"low": ["low"], "medium": ["medium"], "high": ["high"]},
       "fr": {"low": ["faible", "basse"], "medium": ["moyenne"], "high": ["haute", "élevée"]}}
OFFTOPIC = {"en": ["What is the capital of France?","Play some jazz music.","Tell me a joke.","Set a reminder for 6pm.","How do I reset my password?",
                   "What's the weather tomorrow?","Translate hello into Spanish.","Who won the match last night?","Open the calendar.","Turn on the lights."],
            "fr": ["Quelle est la météo à Paris ?","Raconte-moi une blague.","Mets de la musique.","Quelle heure est-il ?","Comment changer mon mot de passe ?",
                   "Qui a gagné le match hier ?","Traduis bonjour en anglais.","Ouvre le calendrier.","Allume la lumière.","Quelle est la capitale de l'Italie ?"]}

# ---- phrasing pools: TRAIN and EVAL are disjoint --------------------------------------------
CLAIM_TMPL = {
 "train": {"en": ["Policy {pol}: {who}, {dam} on {d}, {amt}.",
                  "Log claim {pol} for {who}, {dam} on {d}, {amt}.",
                  "File a claim under {pol}. Claimant {who}. Incident: {dam}, {d}. Estimate {amt}.",
                  "{who} reports {dam} on {d}; policy {pol}; cost {amt}.",
                  "New claim, policy {pol}, claimant {who}, {dam}, date {d}, amount {amt}.",
                  "Please register {dam} for {who} (policy {pol}) that happened on {d}, estimated at {amt}."],
           "fr": ["Contrat {pol} : {who}, {dam} {d}, {amt}.",
                  "Déclarer un sinistre {pol} pour {who}, {dam} {d}, {amt}.",
                  "Sinistre sur le contrat {pol}. Assuré : {who}. Nature : {dam}, {d}. Estimation {amt}.",
                  "{who} signale {dam} {d} ; contrat {pol} ; coût {amt}.",
                  "Nouveau sinistre, contrat {pol}, assuré {who}, {dam}, {d}, montant {amt}.",
                  "Merci d'enregistrer {dam} pour {who} (contrat {pol}) survenu {d}, estimé à {amt}."]},
 "eval":  {"en": ["Claim intake — {who} holds policy {pol}. On {d} there was {dam}. Repair quote: {amt}.",
                  "{pol} / {who} / {dam} / {d} / {amt}",
                  "Hi, this is about policy {pol}. {who} had {dam} on {d} and the quote came to {amt}.",
                  "Open a file for {who}: {dam}, occurred {d}, policy number {pol}, claimed amount {amt}."],
           "fr": ["Ouverture de dossier — {who} est titulaire du contrat {pol}. {d}, il y a eu {dam}. Devis : {amt}.",
                  "{pol} / {who} / {dam} / {d} / {amt}",
                  "Bonjour, cela concerne le contrat {pol}. {who} a subi {dam} {d} et le devis s'élève à {amt}.",
                  "Ouvrir un dossier pour {who} : {dam}, survenu {d}, numéro de contrat {pol}, montant réclamé {amt}."]}}
CALL_TMPL = {
 "train": {"en": ["call them back {when} on {tel}", "please ring {tel} {when}", "schedule a callback {when} at {tel}"],
           "fr": ["le rappeler {when} au {tel}", "merci de rappeler le {tel} {when}", "programmer un rappel {when} au {tel}"]},
 "eval":  {"en": ["phone {tel} {when}", "a callback is needed {when}, number {tel}"],
           "fr": ["téléphoner au {tel} {when}", "un rappel est nécessaire {when}, numéro {tel}"]}}
FLAG_TMPL = {
 "train": {"en": ["Flag claim {pol} for review because {why}, {sev} severity.", "Please have a human review {pol}: {why}. Severity {sev}."],
           "fr": ["Marquer le dossier {pol} pour révision car {why}, sévérité {sev}.", "Faire réviser {pol} par un humain : {why}. Sévérité {sev}."]},
 "eval":  {"en": ["{pol} needs a second pair of eyes — {why}; treat as {sev} severity."],
           "fr": ["{pol} doit être revu — {why} ; sévérité {sev}."]}}
INCOMPLETE = {
 "train": {"en": ["A customer wants to make a claim about their car.", "Someone called about {dam}.", "Log a claim for {amt}.",
                  "{who} had {dam} last week.", "There was {dam}, please log it."],
           "fr": ["Un client veut déclarer un sinistre pour sa voiture.", "Quelqu'un a appelé pour {dam}.", "Enregistrer un sinistre de {amt}.",
                  "{who} a subi {dam} la semaine dernière.", "Il y a eu {dam}, merci de l'enregistrer."]},
 "eval":  {"en": ["Policyholder reports {dam} but gave no policy number.", "We got a call about a claim, no details yet.", "Open a claim for {who}."],
           "fr": ["L'assuré signale {dam} mais n'a pas donné de numéro de contrat.", "Nous avons reçu un appel pour un sinistre, sans détails.", "Ouvrir un sinistre pour {who}."]}}
WHEN = {"en": [("tomorrow morning", 1), ("tomorrow at 9am", 1), ("tomorrow afternoon", 1), ("the day after tomorrow at 3pm", 2), ("tomorrow at 14:00", 1)],
        "fr": [("demain matin", 1), ("demain à 9h", 1), ("demain après-midi", 1), ("après-demain à 15h", 2), ("demain à 14h", 1)]}


def fmt_date(d, lang, rng):
    if lang == "en":
        return rng.choice([f"{d.day} {MONTHS_EN[d.month-1]} {d.year}", f"{MONTHS_EN[d.month-1]} {d.day}, {d.year}", d.isoformat(), f"{d.day:02d}/{d.month:02d}/{d.year}"])
    return rng.choice([f"le {d.day} {MONTHS_FR[d.month-1]} {d.year}", f"le {d.day:02d}/{d.month:02d}/{d.year}"])

def fmt_amount(a, lang, rng):
    whole = float(a).is_integer()
    if lang == "en":
        return rng.choice([f"{a:g} euros", f"EUR {a:g}", f"{a:g} EUR"]), "plain"
    if not whole:
        return f"{str(a).replace('.', ',')} euros", "fr_decimal_comma"
    if a >= 1000 and rng.random() < 0.25:
        s = f"{int(a):,}".replace(",", " ")
        return f"{s} €", "fr_thousand_space"
    return rng.choice([f"{a:g} euros", f"{a:g} €"]), "plain"

def phone(rng):
    p = [rng.choice(["06", "07", "01", "04"])] + [f"{rng.randrange(100):02d}" for _ in range(4)]
    return rng.choice([" ".join(p), "".join(p), "+33 " + p[0][1] + " " + " ".join(p[1:])])

def person(lang, rng, names):
    f, l = rng.choice(names[0]), rng.choice(names[1])
    t = rng.choice(["Mr", "Mrs", "Ms"]) if lang == "en" else rng.choice(["Monsieur", "Madame"])
    return f"{t} {f} {l}"

def policy(rng):
    return rng.choice([f"AXA-{rng.randrange(10000, 99999)}", f"POL-2026-{rng.randrange(100, 999)}", f"FR{rng.randrange(1000000, 9999999)}"])

def make(split, n, rng):
    names = (FIRST[:24], LAST[:22]) if split == "train" else (FIRST[24:], LAST[22:])
    rows = []
    mix = [("claim", .42), ("multi", .16), ("callback", .12), ("flag", .10), ("incomplete", .11), ("offtopic", .09)]
    for i in range(n):
        lang = "en" if rng.random() < 0.5 else "fr"
        kind = rng.choices([m[0] for m in mix], [m[1] for m in mix])[0]
        dams = DAM[lang][:16] if split == "train" else DAM[lang][16:]
        who, pol, dam = person(lang, rng, names), policy(rng), rng.choice(dams)
        d = TODAY - timedelta(days=rng.randrange(1, 120))
        a = rng.choice([450, 800, 1200, 2150.5, 2800, 4300, 5000, 12000, 640.75, 990, 15250, 3100])
        amt, amt_tag = fmt_amount(a, lang, rng)
        tags, answers, reasoning = [lang, kind], [], ""
        claim = {"name": "log_claim", "arguments": {"policy_number": pol, "claimant": who, "incident_date": d.isoformat(), "damage_type": dam, "amount": float(a)}}
        if kind in ("claim", "multi"):
            q = rng.choice(CLAIM_TMPL[split][lang]).format(pol=pol, who=who, dam=dam, d=fmt_date(d, lang, rng), amt=amt)
            answers = [claim]; tags.append("amount:" + amt_tag)
            reasoning = f"'{pol}' -> policy_number; '{who}' -> claimant; '{dam}' -> damage_type; '{amt}' -> amount"
            if kind == "multi":
                tel = phone(rng); w, off = rng.choice(WHEN[lang])
                q = q.rstrip(".") + (", and " if lang == "en" else ", et ") + rng.choice(CALL_TMPL[split][lang]).format(when=w, tel=tel) + "."
                answers.append({"name": "schedule_callback", "arguments": {"contact_number": tel, "when": w}, "_when_date": (TODAY + timedelta(days=off)).isoformat()})
                reasoning += f"; '{tel}' -> contact_number; '{w}' -> when"
        elif kind == "callback":
            tel = phone(rng); w, off = rng.choice(WHEN[lang])
            lead = {"en": f"About {who}: ", "fr": f"Concernant {who} : "}[lang]
            q = lead + rng.choice(CALL_TMPL[split][lang]).format(when=w, tel=tel) + "."
            answers = [{"name": "schedule_callback", "arguments": {"contact_number": tel, "when": w}, "_when_date": (TODAY + timedelta(days=off)).isoformat()}]
            reasoning = f"'{tel}' -> contact_number; '{w}' -> when"
        elif kind == "flag":
            why = rng.choice(REASONS[lang]); sev = rng.choice(["low", "medium", "high"]); sev_word = rng.choice(SEV[lang][sev])
            q = rng.choice(FLAG_TMPL[split][lang]).format(pol=pol, why=why, sev=sev_word)
            answers = [{"name": "flag_for_review", "arguments": {"reason": why, "severity": sev}}]
            reasoning = f"'{why}' -> reason; '{sev_word}' -> severity {sev}"
        elif kind == "incomplete":
            q = rng.choice(INCOMPLETE[split][lang]).format(dam=dam, who=who, amt=amt)
            reasoning = "required claim fields are missing from the request; no call"
        else:
            pool = OFFTOPIC[lang][:6] if split == "train" else OFFTOPIC[lang][6:]   # disjoint, like everything else
            q = rng.choice(pool); reasoning = "no declared tool covers this request"
        row = {"query": q, "tools": TOOLS, "answers": answers, "reasoning": reasoning, "_tags": tags, "_lang": lang}
        if rng.random() < 0.5:
            row["system"] = SYSTEM[lang]
        rows.append(row)
    return rows

def check_grounded(rows):
    """The contract v1 broke: every string label must be a verbatim span of the query."""
    bad = 0
    for r in rows:
        for a in r["answers"]:
            for k, v in a["arguments"].items():
                if isinstance(v, str) and k not in ("incident_date", "severity") and v not in r["query"]:
                    bad += 1; print("UNGROUNDED:", k, repr(v), "|", r["query"])
    return bad

def strip(rows, keep_private):
    out = []
    for r in rows:
        r2 = {k: v for k, v in r.items() if keep_private or not k.startswith("_")}
        r2["answers"] = [{k: v for k, v in a.items() if keep_private or not k.startswith("_")} for a in r["answers"]]
        out.append(r2)
    return out

if __name__ == "__main__":
    rng = random.Random(SEED)
    train, ev = make("train", N_TRAIN, rng), make("eval", N_EVAL, rng)
    assert check_grounded(train) == 0 and check_grounded(ev) == 0, "ungrounded labels"
    overlap = {r["query"] for r in train} & {r["query"] for r in ev}
    assert not overlap, f"train/eval leakage: {len(overlap)}"
    with open("ft2_train.jsonl", "w") as f:
        for r in strip(train, False): f.write(json.dumps(r, ensure_ascii=False) + "\n")
    json.dump(strip(ev, True), open("ft2_eval.json", "w"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("train", len(train), dict(Counter(r["_tags"][1] for r in train)), "| with system turn:", sum("system" in r for r in train))
    print("eval ", len(ev), dict(Counter(r["_tags"][1] for r in ev)), "| langs:", dict(Counter(r["_lang"] for r in ev)))
    print("grounding check: 0 ungrounded labels; train/eval query overlap: 0; seed", SEED)
