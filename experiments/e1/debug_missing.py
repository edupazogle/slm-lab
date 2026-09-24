#!/usr/bin/env python3
import json
import sys
sys.path.insert(0, '.')
from regex_baseline import extract_patterns

def main():
    input_file = 'data/combined_dataset.jsonl'
    output_file = 'results_debug.jsonl'
    error_file = 'errors_debug.txt'

    with open(input_file, 'r', encoding='utf-8') as f_in, \
         open(output_file, 'w', encoding='utf-8') as f_out, \
         open(error_file, 'w', encoding='utf-8') as f_err:

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
            except Exception as e:
                f_err.write(f"Line {i}: {e}\\n")
                # Still write an empty record to keep line count?
                # But we want to see if we are missing lines due to exceptions
                # So we won't write anything for this line, causing missing line
                pass

    print(f"Processed {i+1} lines")
    print(f"Wrote {i+1 - sum(1 for _ in open(error_file))} lines to {output_file}")

if __name__ == '__main__':
    main()