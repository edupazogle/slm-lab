#!/usr/bin/env python3
import json

def main():
    input_file = 'data/combined_dataset.jsonl'

    with open(input_file, 'r', encoding='utf-8') as f_in:
        for i, line in enumerate(f_in):
            print(f"Line {i}: {line[:50]}...")
            try:
                record = json.loads(line.strip())
                print(f"  Keys: {list(record.keys())}")
                print(f"  Has gold_spans: {'gold_spans' in record}")
                if 'gold_spans' in record:
                    print(f"  gold_spans type: {type(record['gold_spans'])}")
                    print(f"  gold_spans value: {record['gold_spans']}")
                break  # Just check first line
            except Exception as e:
                print(f"  ERROR: {e}")
                print(f"  ERROR type: {type(e)}")
                break

if __name__ == '__main__':
    main()