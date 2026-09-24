#!/usr/bin/env python3
import json
import sys
sys.path.insert(0, '.')
from regex_baseline import extract_patterns

def main():
    # Add debug prints to extract_patterns by monkey patching
    original_extract_patterns = extract_patterns

    def debug_extract_patterns(text):
        print(f"DEBUG: Processing text of length {len(text)}")
        entities = original_extract_patterns(text)
        print(f"DEBUG: Extracted {len(entities)} entities")
        for i, ent in enumerate(entities):
            print(f"  {i}: {ent['type']} '{ent['text']}' at {ent['start']}-{ent['end']}")
        return entities

    # Replace the function
    import regex_baseline
    regex_baseline.extract_patterns = debug_extract_patterns

    # Now run the main logic but with debug
    input_file = 'data/combined_dataset.jsonl'
    output_file = 'results_debug.jsonl'

    with open(input_file, 'r', encoding='utf-8') as f_in, \
         open(output_file, 'w', encoding='utf-8') as f_out:

        for i, line in enumerate(f_in):
            try:
                record = json.loads(line.strip())
                text = record['text']
                entities = extract_patterns(text)
                out_record = {
                    'id': record['id'],
                    'lang': record['lang'],
                    'text': text,
                    'gold_spans': record['gold_spans'],
                    'pred_entities': entities
                }
                f_out.write(json.dumps(out_record) + '\n')
                if i < 3:  # Show first 3 records
                    print(f"\nRecord {i} (ID: {record['id']}):")
                    print(f"  Gold spans: {record.get('gold_spans', [])}")
                    print(f"  Pred entities: {entities}")
            except Exception as e:
                print(f"ERROR processing line {i}: {e}")
                import traceback
                traceback.print_exc()

    print(f"\nProcessed {i+1} lines")

if __name__ == '__main__':
    main()