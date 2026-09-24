#!/usr/bin/env python3
import json
import sys
sys.path.insert(0, '.')
from regex_baseline import extract_patterns

def main():
    # Check what's happening with the actual regex_baseline.py script
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

    # Find ID 282
    target_id = '282'
    input_record = None
    for record in input_records:
        if record['id'] == target_id:
            input_record = record
            break

    if input_record is None:
        print(f"ERROR: Could not find ID {target_id} in input")
        return

    print(f"Input record for ID {target_id}:")
    print(f"  Text: {input_record['text'][:100]}...")
    print(f"  Gold spans: {input_record.get('spans', [])}")

    output_record = output_by_id.get(target_id)
    if output_record is None:
        print(f"OUTPUT RECORD MISSING for ID {target_id}")
        # Try to extract and see what happens
        try:
            entities = extract_patterns(input_record['text'])
            print(f"  Extracted entities: {entities}")
        except Exception as e:
            print(f"  EXCEPTION during extraction: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"Output record for ID {target_id}:")
        print(f"  Extracted entities: {output_record.get('pred_entities', [])}")

if __name__ == '__main__':
    main()