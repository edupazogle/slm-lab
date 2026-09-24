#!/usr/bin/env python3
"""
Combine OpenPII samples with synthetic French claims for E1 dataset.
"""

import json
import os

def main():
    # Load OpenPII dataset
    openpii_data = []
    with open('data/dataset.jsonl', 'r') as f:
        for line in f:
            openpii_data.append(json.loads(line.strip()))

    # Load synthetic French claims
    synthetic_data = []
    with open('data/synthetic_claims.jsonl', 'r') as f:
        for line in f:
            synthetic_data.append(json.loads(line.strip()))

    print(f"Loaded {len(openpii_data)} OpenPII samples")
    print(f"Loaded {len(synthetic_data)} synthetic French claims")

    # Combine datasets
    combined = openpii_data + synthetic_data

    # Shuffle the combined dataset
    import random
    random.seed(42)
    random.shuffle(combined)

    # Save combined dataset
    with open('data/combined_dataset.jsonl', 'w') as f:
        for item in combined:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')

    print(f"Saved {len(combined)} total samples to data/combined_dataset.jsonl")

    # Print statistics
    french_count = sum(1 for item in combined if item['lang'] == 'fr')
    english_count = sum(1 for item in combined if item['lang'] == 'en')
    print(f"Language distribution: French={french_count}, English={english_count}")

    # Count samples with spans vs without
    with_spans = sum(1 for item in combined if len(item['spans']) > 0)
    without_spans = sum(1 for item in combined if len(item['spans']) == 0)
    print(f"Samples with spans: {with_spans}")
    print(f"Samples without spans (synthetic): {without_spans}")

if __name__ == '__main__':
    main()