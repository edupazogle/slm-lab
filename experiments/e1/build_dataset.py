#!/usr/bin/env python3
"""
Build dataset for E1 anonymisation baseline.
Samples 400 French + 400 English rows from OpenPII 1.5M dataset.
"""

import json
import random
from datasets import load_dataset

def main():
    # Set seeds for reproducibility
    random.seed(42)

    # Load the OpenPII dataset in streaming mode to avoid downloading everything
    print("Loading OpenPII 1.5M dataset in streaming mode...")
    dataset = load_dataset("ai4privacy/pii-masking-openpii-1.5m", split="train", streaming=True)

    # Filter for French and English
    french_data = []
    english_data = []

    print("Filtering French and English examples...")
    for i, row in enumerate(dataset):
        if row['language'] == 'fr':
            french_data.append(row)
        elif row['language'] == 'en':
            english_data.append(row)

        # Stop when we have enough of each
        if len(french_data) >= 400 and len(english_data) >= 400:
            break

        # Progress indicator
        if i % 10000 == 0 and i > 0:
            print(f"Processed {i} examples: {len(french_data)} FR, {len(english_data)} EN")

    print(f"Found {len(french_data)} French rows and {len(english_data)} English rows")

    # If we didn't get enough, warn but continue with what we have
    if len(french_data) < 400:
        print(f"Warning: Only found {len(french_data)} French rows, needed 400")
    if len(english_data) < 400:
        print(f"Warning: Only found {len(english_data)} English rows, needed 400")

    # Sample exactly 400 from each (or all we have if less)
    french_sample = random.sample(french_data, min(400, len(french_data)))
    english_sample = random.sample(english_data, min(400, len(english_data)))

    print(f"Selected {len(french_sample)} French and {len(english_sample)} English rows")

    # Combine and shuffle
    combined = french_sample + english_sample
    random.shuffle(combined)

    # Convert to required format: {id, lang, text, spans:[{start,end,type}]}
    formatted_data = []
    for i, row in enumerate(combined):
        # Map OpenPII entity types to our types - FIXED: Use actual OpenPII labels
        entity_mapping = {
            'EMAIL': 'EMAIL',
            'GIVENNAME': 'PERSON',
            'SURNAME': 'PERSON',
            'TELEPHONENUM': 'PHONE',
            'DATE': 'DATE',
            'STREET': 'ADDRESS',
            'BUILDINGNUM': 'ADDRESS',
            'ZIPCODE': 'POSTCODE',
            'CITY': 'CITY',
            'SOCIALNUM': 'NATIONAL_ID',
            'TAXNUM': 'TAX_ID',
            'IDCARDNUM': 'ID_DOC',
            'PASSPORTNUM': 'ID_DOC',
            'DRIVERLICENSENUM': 'ID_DOC',
            'CREDITCARDNUMBER': 'CARD',
            'TITLE': 'TITLE',  # Keep but out of scoring
            'AGE': 'AGE',      # Keep but out of scoring
            'GENDER': 'GENDER', # Keep but out of scoring
            'SEX': 'SEX'       # Keep but out of scoring
        }

        spans = []
        for privacy_mask in row['privacy_mask']:
            entity_type = privacy_mask['label']
            if entity_type in entity_mapping:
                # Only include types that are in scoring (not TITLE, AGE, GENDER, SEX)
                if entity_mapping[entity_type] not in ['TITLE', 'AGE', 'GENDER', 'SEX']:
                    spans.append({
                        'start': privacy_mask['start'],
                        'end': privacy_mask['end'],
                        'type': entity_mapping[entity_type]
                    })

        formatted_data.append({
            'id': str(i),
            'lang': row['language'],
            'text': row['source_text'],
            'spans': spans
        })

    # Save to data directory
    import os
    os.makedirs('data', exist_ok=True)

    with open('data/dataset.jsonl', 'w') as f:
        for item in formatted_data:
            f.write(json.dumps(item) + '\n')

    print(f"Saved {len(formatted_data)} rows to data/dataset.jsonl")

    # Print statistics
    french_count = sum(1 for item in formatted_data if item['lang'] == 'fr')
    english_count = sum(1 for item in formatted_data if item['lang'] == 'en')
    print(f"Language distribution: French={french_count}, English={english_count}")

    # Count entity types
    entity_counts = {}
    for item in formatted_data:
        for span in item['spans']:
            entity_type = span['type']
            entity_counts[entity_type] = entity_counts.get(entity_type, 0) + 1

    print("Entity type counts:")
    for entity_type, count in sorted(entity_counts.items()):
        print(f"  {entity_type}: {count}")

if __name__ == '__main__':
    main()