#!/usr/bin/env python3
import json
import re
import sys
sys.path.insert(0, '.')
from regex_baseline import name_candidates, extract_patterns, TITLES, FIRST, NOT_NAME

def test_name_candidates():
    # Test with the problematic text
    text = "Checklist de pack sécuritaire (format court) :\n1. Marcu Felis vérifie l’expiration du 84JT00810 – valide jusqu’au 2004-04-10T00:00:00.\n2. Cachez les objets de valeur (bijoux, argent) dans le compartiment 90 du sac.\n3. Placez le chargeur de tablette dans une poche séparée et marquez-le avec un Chemin des Beaux Soleils : « Le Vivier ». \n4. Gardez le 2-62-05-60706-064-32 et le 04.82.030.216.430 dans une enveloppe invisible.\n5. Vérifiez que le 83143 de votre destination (Mortcerf) est correct.\n✔️ Prêt à décoller !"

    print("Testing name_candidates function:")
    print(f"Text: {repr(text[:100])}...")
    print()

    # Test the CAP pattern directly
    cap_pattern = re.compile(r'\b([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+(?:-[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+)?(?:\s+(?:(?:de|du|da|van|von|der|le|la|di|del|dos|O\'|Mc)\s+)?[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+(?:-[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’]+)?){0,3})\b')

    print("CAP pattern matches:")
    for m in cap_pattern.finditer(text):
        print(f"  Match: '{m.group(1)}' at {m.start(1)}-{m.end(1)}")
        words = m.group(1).split()
        print(f"    Words: {words}")

        # Test NOT_NAME filtering
        filtered_words = words[:]
        # Skip leading NOT_NAME words
        while filtered_words and filtered_words[0].lower().replace("’s", "").replace("'", "") in NOT_NAME:
            print(f"    Skipping leading NOT_NAME: {filtered_words[0]}")
            filtered_words.pop(0)

        # Skip trailing NOT_NAME words
        while filtered_words and filtered_words[-1].lower() in NOT_NAME:
            print(f"    Skipping trailing NOT_NAME: {filtered_words[-1]}")
            filtered_words.pop()

        print(f"    After NOT_NAME filter: {filtered_words}")

        if not filtered_words:
            print("    No words left after filtering")
            continue

        cand = ' '.join(filtered_words).replace("’s", "").replace("'", "")
        print(f"    Candidate: '{cand}'")

        # Check if any remaining word is in NOT_NAME
        if any(w.lower() in NOT_NAME for w in filtered_words):
            print(f"    Rejected: contains NOT_NAME word")
            continue

        # Check for title
        before = text[max(0, m.start(1) - 40):m.start(1)]
        print(f"    Before context: {repr(before[-20:])}")
        if re.search(rf'\b(?:{TITLES})\.?\s*$', before):
            print(f"    Matched title!")
        else:
            print(f"    No title match")

        # Check for first name
        if filtered_words and filtered_words[0].lower() in FIRST:
            print(f"    First name match: {filtered_words[0].lower()} in FIRST")
        else:
            print(f"    No first name match: {filtered_words[0].lower()} not in FIRST")
        print()

def test_extract_patterns():
    print("\nTesting extract_patterns:")
    with open('data/combined_dataset.jsonl', 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if i == 7:  # Line 8 (0-indexed) is the problematic one
                record = json.loads(line.strip())
                print(f"Record ID: {record['id']}")
                print(f"Text: {repr(record['text'][:100])}...")
                print(f"Gold spans: {record.get('spans', [])}")

                entities = extract_patterns(record['text'])
                print(f"Extracted entities: {entities}")
                break

if __name__ == '__main__':
    test_name_candidates()
    test_extract_patterns()