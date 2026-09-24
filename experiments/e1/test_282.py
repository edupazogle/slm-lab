#!/usr/bin/env python3
import json
import re
import sys
sys.path.insert(0, '.')
from regex_baseline import extract_patterns

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

                # Test extract_patterns with exception handling
                try:
                    entities = extract_patterns(record['text'])
                    print(f"Extracted entities: {entities}")
                    print(f"Number of entities: {len(entities)}")
                except Exception as e:
                    print(f"EXCEPTION in extract_patterns: {e}")
                    import traceback
                    traceback.print_exc()
                break

if __name__ == '__main__':
    main()