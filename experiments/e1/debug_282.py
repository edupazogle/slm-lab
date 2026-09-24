#!/usr/bin/env python3
import json
import re
import sys
sys.path.insert(0, '.')

# Copy the relevant functions from regex_baseline.py for debugging
def luhn_checksum(card_num: str) -> bool:
    """Calculate Luhn checksum for validation"""
    # Remove non-digit characters
    digits = [int(d) for d in card_num if d.isdigit()]
    if not digits:
        return False
    odd_sum = sum(digits[-1::-2])
    even_sum = sum([sum(divmod(d*2, 10)) for d in digits[-2::-2]])
    return (odd_sum + even_sum) % 10 == 0

def iban_ok(raw: str) -> bool:
    """Validate IBAN using mod-97 algorithm"""
    s = re.sub(r'[\s-]', '', raw).upper()
    if len(s) < 15 or len(s) > 34:
        return False
    r = (s[4:] + s[:4])
    r = ''.join(str(ord(c) - 55) if c.isalpha() else c for c in r)
    m = 0
    for ch in r:
        m = (m * 10 + int(ch)) % 97
    return m == 1

def luhn(d: str) -> bool:
    """Luhn algorithm for validation"""
    s = 0
    alt = False
    for i in range(len(d) - 1, -1, -1):
        n = int(d[i])
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        s += n
        alt = not alt
    return s % 10 == 0

TITLES = 'Mr|Mrs|Ms|Miss|Dr|Prof|Mister|Madam|M\\.|Mme|Mlle|Monsieur|Madame|Herr|Frau|Sr\\.?|Sra\\.?|Señor|Señora|Sig\\.?|Sig\\.ra|Signor|Signora'

FIRST = set(('adam agnes alain alexandre alice amelie ana andrea andreas angela anna anne antoine antonio arnaud astrid aurelie ben benjamin bernard bruno camille carla carlos caroline catherine cecile charles charlotte chloe christian christine claire claude clara daniel david dominique elena elisa elise ella emma emilie eric erik eva fabien felix fernando florian francesca francois frank gabriel georg george giulia giuseppe guillaume hans helene henri hugo isabel isabelle jacques jakob james jan javier jean jeanne jens jessica joao johan johannes john jonas jorge jose juan jules julia julie julien karl katharina klaus laura lea leo lena louis louise luca lucas lucia lucie luis luisa lukas marc marco margaux maria marie marina mario marion martin mateo mathieu matteo max maxime michael michel miguel nadia nathalie nicolas nina noah noemie olivier oscar pablo paolo pascal patrick paul paula pedro peter philippe pierre raphael rebecca robert romain rosa sara sarah sebastien simon sofia sophie stefan stephanie sylvie theo thomas tim tobias ulrike valentina valerie victor vincent william xavier yann yves zoe').split(' '))

NOT_NAME = set(('the a an i we you he she they my our your his her their this that these those dear hello hi regards best kind thanks thank sincerely yours please monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december lundi mardi mercredi jeudi vendredi samedi dimanche janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre rue avenue boulevard street road lane place square hotel hospital clinic garage bank insurance insurer policy claim claims office department team service services company group ltd limited sa sas gmbh ag inc llc plc axa allianz generali zurich europe france germany spain italy portugal belgium netherlands switzerland austria ireland england scotland wales uk paris lyon marseille lille nice toulouse bordeaux nantes strasbourg london manchester berlin munich hamburg madrid barcelona rome milan naples lisbon porto brussels amsterdam geneva vienna dublin crete austria emergency department police court tribunal ombudsman subject re ref note total amount date phone email tel mobile address euro euros eur sir madam madame monsieur messieurs mesdames whom concern all customer client colleagues colleague team mr mrs ms miss dr prof mister mme mlle herr frau señor signora signor signora sr sra sig').split(' '))

def sentence_around(text: str, i: int) -> str:
    """Extract sentence around position i"""
    a = max(text.rfind('.', 0, i), text.rfind('\n', 0, i), text.rfind('!', 0, i), text.rfind('?', 0, i)) + 1
    b = text.find('.', i)
    if b == -1: b = text.find('\n', i)
    if b == -1: b = text.find('!', i)
    if b == -1: b = text.find('?', i)
    if b == -1: b = len(text)
    else: b += 1
    return text[a:b].strip()[:400]

def name_candidates(text: str):
    """Find person name candidates in text"""
    out = []
    # CAP pattern for capitalized words
    cap_pattern = re.compile(r'\b([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+(?:-[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+)?(?:\s+(?:(?:de|du|da|van|von|der|le|la|di|del|dos|O\'|Mc)\s+)?[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+(?:-[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+)?){0,3})\b')

    for m in cap_pattern.finditer(text):
        words = m.group(1).split()
        start = m.start(1)

        # Skip leading NOT_NAME words
        while words and words[0].lower().replace("’s", "").replace("'", "") in NOT_NAME:
            start += text[start:].index(words[0]) + len(words[0])
            start += len(text[start:]) - len(text[start:].lstrip())
            words.pop(0)

        # Skip trailing NOT_NAME words
        while words and words[-1].lower() in NOT_NAME:
            words.pop()

        if not words:
            continue

        cand = ' '.join(words).replace("’s", "").replace("'", "")

        # Skip if any remaining word is in NOT_NAME
        if any(w.lower() in NOT_NAME for w in words):
            continue

        why = None
        before = text[max(0, start - 40):start]
        after = text[start + len(cand):start + len(cand) + 3]

        # Check for title
        if re.search(rf'\b(?:{TITLES})\.?\s*$', before):
            why = 'title'
        # Check for greeting
        elif re.search(r'(?:\bDear|\bHello|\bHi|\bBonjour|\bCher|\bChère|\bHallo|\bLiebe[r]?|\bHola)\s*$', before, re.I):
            why = 'greeting'
        # Check for sign-off
        elif re.search(r'(?:regards|sincerely|faithfully|cordialement|salutations|grüßen|saludos|signed|signé)[,.]?\s*$', before, re.I):
            why = 'sign-off'
        # Check for relation
        elif re.search(r'\b(?:my|our|her|his|their)\s+(?:son|daughter|husband|wife|partner|mother|father|brother|sister|neighbour|neighbor|friend|colleague|tenant|landlord|child)\s*,?\s*$', before, re.I):
            why = 'relation'
        # Check for context
        elif re.search(r'\b(?:called|named|name is|nom est|heißt|se llama|spoke (?:to|with)|contact(?:ed)?|driver,?|witness,?|handler,?|adjuster,?)\s*$', before, re.I):
            why = 'context'
        # Check for first name
        elif words and words[0].lower() in FIRST:
            why = 'first name'
        # Skip place indicators
        elif re.search(r'\b(?:in|at|near|from|to|into|towards|via|en|à|au|aux|nach|bei|im|en|a|di|da)\s*$', before, re.I):
            continue  # a place: "skiing in Innsbruck"
        # Skip sentence starters with single word
        sent_start = re.search(r'(?:^|[.!?\n]\s*)$', before)
        if not why and sent_start and len(words) == 1:
            continue  # one capitalised word opening a sentence

        if why is not None:
            out.append({
                'type': 'PERSON',
                'start': start,
                'end': start + len(cand),
                'text': cand,
                'why': why,
                'sentence': sentence_around(text, start)
            })

    return out

def extract_patterns_debug(text: str):
    """Extract PII patterns from text using regex patterns from second-look"""

    patterns = [
        # EMAIL
        (r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', 'EMAIL', re.IGNORECASE, None),

        # IBAN - needs special validation
        (r'\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b', 'IBAN', 0, iban_ok),

        # CARD - needs Luhn validation
        (r'\b(?:\d[ -]?){13,19}\b', 'CARD', 0, luhn_checksum),

        # NIR (French social security number)
        (r'\b[12][ ]?\d{2}[ ]?(?:0[1-9]|1[0-2])[ ]?(?:\d{2}|2[AB])[ ]?\d{3}[ ]?\d{3}(?:[ ]?\d{2})?\b', 'NIR', 0, None),

        # PHONE (FR and international)
        (r'(?:(?:\+|00)\d{1,3}[ .-]?(?:\(0\)[ .-]?)?\d{1,4}(?:[ .-]?\d{2,4}){2,4})|\b0[1-9](?:[ .-]?\d{2}){4}\b|\b07\d{3}[ ]?\d{6}\b', 'PHONE', 0, None),

        # DATE - now enabled
        (r'\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}|(?:19|20)\d{2}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th|er)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\.?\s+(?:19|20)\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2})\b', 'DATE', re.IGNORECASE, None),

        # PLATE (SIV and older formats) - I,O,U excluded for SIV
        (r'\b(?:[A-HJ-NP-TV-Z]{2}-\d{3}-[A-HJ-NP-TV-Z]{2}|[A-Z]{2}\d{2}\s?[A-Z]{3}|\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}|[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}\s?\d{1,4}[EH]?)\b', 'PLATE', 0, None),

        # ADDRESS
        (r'\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd\.?|chemin|allée|allee|place|impasse|quai|route|street|st\.|road|rd\.|lane|drive|close|way|straße|strasse|str\.|weg|calle|avenida|via|viale|piazza)\b[^\n,.;]{2,40}', 'ADDRESS', re.IGNORECASE, None),

        # POSTCODE+city
        (r'\b(?:\d{5}|[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})\s+[A-ZÉÈÀ][\w\'-]+(?:[ -][A-ZÉÈÀ][\w\'-]+)?', 'POSTCODE', re.UNICODE | re.IGNORECASE, None),

        # ID (policy/reference numbers) - two patterns
        (r'\b(?:policy|police|contract|contrat|claim|sinistre|dossier|reference|référence|ref\.?|case|file|n°|no\.)(?:\s+(?:number|numéro|no\.?|n°|#|is|reference|ref\.?))*\s*[:#]?\s*((?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{3,}[A-Z0-9])', 'ID', re.IGNORECASE, 1),
        (r'\b(?=[A-Z-]*\d)[A-Z]{2,5}(?:-[A-Z0-9]{1,8}){1,4}\b', 'ID', 0, None),

        # AMOUNT
        (r'(?:€|EUR|£|\$)\s?\d{1,3}(?:[ ,. ]\d{3})*(?:[.,]\d{1,2})?|\b\d{1,3}(:=?[ ,. ]\d{3})*(?:[.,]\d{1,2})?\s?(?:€|euros?|EUR|£|pounds|\$)', 'AMOUNT', re.IGNORECASE, None),
    ]

    # Compile patterns
    compiled_patterns = []
    for pattern, label, flags, validator_group in patterns:
        compiled_patterns.append((
            re.compile(pattern, flags),
            label,
            validator_group
        ))

    # Extract matches
    entities = []

    print(f"DEBUG: Processing text: {text[:100]}...")

    for pattern, label, validator_group in compiled_patterns:
        matches = list(pattern.finditer(text))
        if matches:
            print(f"DEBUG: Pattern '{pattern.pattern}' found {len(matches)} matches")
        for match in matches:
            # Get the matched text
            if validator_group is not None and isinstance(validator_group, int):
                # Extract specific group
                try:
                    matched_text = match.group(validator_group)
                    # Adjust start/end positions for the group
                    start_pos = match.start(validator_group)
                    end_pos = match.end(validator_group)
                except IndexError:
                    # Fallback to full match if group doesn't exist
                    matched_text = match.group(0)
                    start_pos = match.start()
                    end_pos = match.end()
            else:
                matched_text = match.group(0)
                start_pos = match.start()
                end_pos = match.end()

            # Apply validator if provided
            validator = None
            if label == 'IBAN':
                validator = iban_ok
            elif label == 'CARD':
                validator = luhn_checksum

            if validator:
                print(f"DEBUG: Validating {label} '{matched_text}' (cleaned: '{matched_text.replace(' ', '')}')")
                if not validator(matched_text.replace(' ', '')):
                    print(f"DEBUG: Validation failed for {label} '{matched_text}'")
                    continue
                else:
                    print(f"DEBUG: Validation passed for {label} '{matched_text}'")

            entities.append({
                'type': label,
                'text': matched_text,
                'start': start_pos,
                'end': end_pos
            })
            print(f"DEBUG: Added entity: {label} '{matched_text}' at {start_pos}-{end_pos}")

    # Add PERSON candidates from name detection
    print("DEBUG: Running name_candidates...")
    name_ents = name_candidates(text)
    print(f"DEBUG: name_candidates found {len(name_ents)} entities")
    entities.extend(name_ents)

    # Sort by start position
    entities.sort(key=lambda x: x['start'])

    return entities

def main():
    # Get the record with ID 282
    with open('data/combined_dataset.jsonl', 'r', encoding='utf-8') as f:
        for line in f:
            record = json.loads(line.strip())
            if record['id'] == '282':
                print(f"Found record ID 282:")
                print(f"Text: {record['text']}")
                print(f"Gold spans: {record['spans']}")
                print()

                # Test extract_patterns with debug
                entities = extract_patterns_debug(record['text'])
                print(f"\nFinal extracted entities: {entities}")
                print(f"Number of entities: {len(entities)}")
                break

if __name__ == '__main__':
    main()