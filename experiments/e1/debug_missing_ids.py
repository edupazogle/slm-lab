#!/usr/bin/env python3
import json
import sys
sys.path.insert(0, '.')
from regex_baseline import extract_patterns

def main():
    input_file = 'data/combined_dataset.jsonl'
    output_file = 'results.jsonl'

    # Read all input records
    input_records = []
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            input_records.append(json.loads(line.strip()))

    # Read all output records
    output_records = []
    with open(output_file, 'r', encoding='utf-8') as f:
        for line in f:
            output_records.append(json.loads(line.strip()))

    # Map output by id
    output_by_id = {record['id']: record for record in output_records}

    # Check each input record
    for record in input_records:
        rec_id = record['id']
        if rec_id not in output_by_id:
            print(f"Missing ID: {rec_id}")
            text = record['text']
            try:
                entities = extract_patterns(text)
                print(f"  Extracted {len(entities)} entities: {entities}")
            except Exception as e:
                print(f"  EXCEPTION: {e}")
                import traceback
                traceback.print_exc()
            print()

if __name__ == '__main__':
    main()