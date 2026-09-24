#!/usr/bin/env python3
import json

def main():
    input_file = 'data/combined_dataset.jsonl'
    missing_spans = []
    with open(input_file, 'r', encoding='utf-8') as f_in:
        for i, line in enumerate(f_in):
            try:
                record = json.loads(line.strip())
                if 'spans' not in record:
                    missing_spans.append((i, record.get('id', 'NO_ID')))
            except Exception as e:
                print(f"Error parsing line {i}: {e}")
                missing_spans.append((i, 'PARSE_ERROR'))

    print(f"Lines missing 'spans' key: {len(missing_spans)}")
    if missing_spans:
        print("First few:", missing_spans[:5])

if __name__ == '__main__':
    main()