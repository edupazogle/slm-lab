#!/usr/bin/env python3
import json

def main():
    input_file = 'data/combined_dataset.jsonl'
    output_file = 'results.jsonl'

    input_ids = set()
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            record = json.loads(line.strip())
            input_ids.add(record['id'])

    output_ids = set()
    with open(output_file, 'r', encoding='utf-8') as f:
        for line in f:
            record = json.loads(line.strip())
            output_ids.add(record['id'])

    missing = input_ids - output_ids
    print(f"Total input: {len(input_ids)}")
    print(f"Total output: {len(output_ids)}")
    print(f"Missing: {len(missing)}")
    if missing:
        print("Missing IDs (first 10):", sorted(list(missing))[:10])
        # Also check if there are any duplicates in output
        from collections import Counter
        with open(output_file, 'r', encoding='utf-8') as f:
            output_lines = [json.loads(line.strip())['id'] for line in f]
        dup = [k for k, v in Counter(output_lines).items() if v > 1]
        if dup:
            print(f"Duplicate IDs in output: {dup}")
        else:
            print("No duplicate IDs in output")

if __name__ == '__main__':
    main()