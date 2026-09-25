#!/usr/bin/env python3
"""
Generate synthetic French claim emails for E1 dataset.
Each claim includes:
- NIR with correct 2-digit key
- IBAN FR76 with valid mod-97 check
- SIV plate (AB-123-CD format)
- SIREN with valid Luhn check
- Date of birth
- Two named persons
- Garage name
"""

import json
import random
from faker import Faker
from faker.providers import ssn, company, automotive, phone_number, person, date_time

# Seeds both `random` and Faker's shared generator, so two runs write the same file (added 2026-09-25).
# The committed data/synthetic_claims.jsonl PREDATES this seed: it was drawn unseeded before the E1a run (first committed
# on 2026-09-24, c685528) and was corrected in place on 2026-09-25 (the 8 NIRs with an unpadded birth year: year padded,
# key recomputed with generate_nir()'s formula, later spans +1; see DATA.md). Running this script now therefore writes a
# different (reproducible) set of 100 claims, not the committed one, and it overwrites data/synthetic_claims.jsonl
# relative to the working directory, so run it elsewhere unless you mean to replace the E1a data.
SEED = 42

def luhn_checksum(card_num):
    """Calculate Luhn checksum"""
    def digits_of(n):
        return [int(d) for d in str(n)]
    digits = digits_of(card_num)
    odd_sum = sum(digits[-1::-2])
    even_sum = sum([sum(digits_of(d*2)) for d in digits[-2::-2]])
    return (odd_sum + even_sum) % 10 == 0

def generate_siren():
    """Generate a valid SIREN (9 digits) with Luhn check"""
    while True:
        # Generate first 8 digits randomly
        base = ''.join([str(random.randint(0, 9)) for _ in range(8)])
        # Calculate check digit
        total = 0
        for i, digit in enumerate(base):
            n = int(digit)
            if i % 2 == 0:  # Even position (0-indexed from left)
                n *= 2
                if n > 9:
                    n = n // 10 + n % 10
            total += n
        check = (10 - (total % 10)) % 10
        siren = base + str(check)
        if luhn_checksum(siren):
            return siren

def generate_nir():
    """Generate a valid NIR (French social security number)"""
    # Gender: 1 = male, 2 = female
    gender = random.choice([1, 2])

    # Year of birth (00-99), two digits: an unpadded year made a 14-character NIR
    year = f"{random.randint(0, 99):02d}"

    # Month of birth (01-12)
    month = f"{random.randint(1, 12):02d}"

    # Department of birth (01-95, plus 2A, 2B for Corsica)
    dept_choices = [f"{i:02d}" for i in range(1, 96)] + ['2A', '2B']
    dept = random.choice(dept_choices)

    # Commune number (3 digits)
    commune = f"{random.randint(0, 999):03d}"

    # Serial number (3 digits)
    serial = f"{random.randint(0, 999):03d}"

    # Construct the first 13 digits
    nir_base = f"{gender}{year}{month}{dept}{commune}{serial}"

    # Calculate the key: 97 - (NIR mod 97)
    # Handle Corsica substitution: 2A=19, 2B=18
    dept_num = dept
    if dept == '2A':
        dept_num = '19'
    elif dept == '2B':
        dept_num = '18'

    # For calculation, we need numeric departments
    if dept.isdigit():
        calc_base = f"{gender}{year}{month}{dept}{commune}{serial}"
    else:
        calc_base = f"{gender}{year}{month}{dept_num}{commune}{serial}"

    # Calculate key
    key = 97 - (int(calc_base) % 97)
    key_str = f"{key:02d}"

    return f"{gender} {year} {month} {dept} {commune} {serial} {key_str}"

def generate_iban_fr():
    """Generate a valid French IBAN (FR76...)"""
    fake = Faker('fr_FR')
    # Generate IBAN and then modify to ensure it starts with FR76
    while True:
        iban = fake.iban()
        if iban.startswith('FR76'):
            # Format with spaces for readability: FR76 XXXX XXXX XXXX XXXX XXXX XX XXX
            return f"{iban[:4]} {iban[4:8]} {iban[8:12]} {iban[12:16]} {iban[16:20]} {iban[20:24]} {iban[24:]}"

def generate_siv_plate():
    """Generate a valid SIV plate (AB-123-CD format, I/O/U excluded)"""
    letters = 'ABCDEFGHJKLMNPQRSTVWXYZ'  # Excluding I, O, U
    first_two = ''.join([random.choice(letters) for _ in range(2)])
    numbers = f"{random.randint(100, 999):03d}"
    last_two = ''.join([random.choice(letters) for _ in range(2)])
    return f"{first_two}-{numbers}-{last_two}"

def generate_date_of_birth():
    """Generate a random date of birth"""
    fake = Faker('fr_FR')
    return fake.date_of_birth(minimum_age=18, maximum_age=80).strftime('%d/%m/%Y')

def generate_person_name():
    """Generate a French person name"""
    fake = Faker('fr_FR')
    return fake.name()

def generate_garage_name():
    """Generate a garage name"""
    fake = Faker('fr_FR')
    prefixes = ['Garage', 'Atelier', 'Centre Auto', 'Service']
    suffixes = ['du Nord', 'du Sud', 'de l\'Est', 'de l\'Ouest', 'Plus', 'Service', 'Auto']
    return f"{random.choice(prefixes)} {fake.last_name()} {random.choice(suffixes)}"

def generate_claim_email_with_spans():
    """Generate a complete French claim email with accurate spans"""
    fake = Faker('fr_FR')

    # Generate components
    nir = generate_nir()
    iban = generate_iban_fr()
    plate = generate_siv_plate()
    siren = generate_siren()
    dob = generate_date_of_birth()
    person1 = generate_person_name()
    person2 = generate_person_name()
    garage = generate_garage_name()
    email = fake.email()
    phone = fake.phone_number()

    # Create email content by assembling pieces and tracking positions
    # We'll use template 1 for simplicity but could randomize
    template = """Bonjour,

Je vous contacte concernant mon sinistre survenu le {{dob}}.

Mes coordonnées:
- NIR: {{nir}}
- Nom: {{person1}}
- Téléphone: {{phone}}
- Email: {{email}}

Détails du véhicule:
- Immatriculation: {{plate}}
- Garage: {{garage}} (SIREN: {{siren}})

IBAN pour remboursement: {{iban}}

Cordialement,
{{person1}}"""

    # Replace placeholders and track positions
    text = template
    spans = []

    # Helper function to replace placeholder and record span
    def replace_and_record(text, placeholder, value, span_type):
        start_pos = text.find(placeholder)
        if start_pos == -1:
            raise ValueError(f"Placeholder {placeholder} not found in template")
        # Validate that what we found is indeed the placeholder
        expected_placeholder = placeholder
        actual_placeholder = text[start_pos:start_pos+len(expected_placeholder)]
        assert actual_placeholder == expected_placeholder, f"Expected placeholder {expected_placeholder}, found {actual_placeholder}"
        end_pos = start_pos + len(value)  # The value's end position after replacement
        spans.append({
            'start': start_pos,
            'end': end_pos,
            'type': span_type
        })
        return text.replace(placeholder, value, 1)

    # Apply replacements in order
    text = replace_and_record(text, '{{dob}}', dob, 'DATE')
    text = replace_and_record(text, '{{nir}}', nir, 'NIR')
    text = replace_and_record(text, '{{person1}}', person1, 'PERSON')  # First person1
    text = replace_and_record(text, '{{phone}}', phone, 'PHONE')
    text = replace_and_record(text, '{{email}}', email, 'EMAIL')
    text = replace_and_record(text, '{{plate}}', plate, 'PLATE')
    text = replace_and_record(text, '{{garage}}', garage, 'ORG')
    text = replace_and_record(text, '{{siren}}', siren, 'SIREN')
    text = replace_and_record(text, '{{iban}}', iban, 'IBAN')
    text = replace_and_record(text, '{{person1}}', person1, 'PERSON')  # Second person1 (signature)

    # Assert we have at least 9 spans per email
    assert len(spans) >= 9, f"Expected at least 9 spans, got {len(spans)}"

    return {
        'text': text,
        'spans': spans
    }

def main():
    """Generate 100 synthetic French claim emails"""
    random.seed(SEED)
    Faker.seed(SEED)   # every Faker('fr_FR') made below draws from this shared, seeded generator

    # Initialize Faker
    fake = Faker('fr_FR')

    # Add providers
    fake.add_provider(ssn)
    fake.add_provider(company)
    fake.add_provider(automotive)
    fake.add_provider(phone_number)
    fake.add_provider(person)
    fake.add_provider(date_time)

    claims = []
    for i in range(100):
        claim_data = generate_claim_email_with_spans()

        claim = {
            'id': f'synthetic_{i:03d}',
            'lang': 'fr',
            'text': claim_data['text'],
            'spans': claim_data['spans']
        }
        claims.append(claim)

    # Save to data directory
    import os
    os.makedirs('data', exist_ok=True)

    with open('data/synthetic_claims.jsonl', 'w') as f:
        for claim in claims:
            f.write(json.dumps(claim, ensure_ascii=False) + '\n')

    print(f"Generated {len(claims)} synthetic French claim emails")
    print("Saved to data/synthetic_claims.jsonl")

    # Show first claim as example
    if claims:
        print("\nExample claim:")
        print("=" * 50)
        print(claims[0]['text'])
        print("=" * 50)
        print("Spans:")
        for span in claims[0]['spans']:
            print(f"  {span}")

if __name__ == '__main__':
    main()