#!/usr/bin/env python3
"""Diff the Python port's predictions against the page's own JS run (parity_check.js). Exit 1 on any difference.
JS offsets are UTF-16 code units; they are converted to code points (Python's, and the gold spans') using the texts in
<data.jsonl>, so a document with an emoji is compared on the same index scale.
Usage: compare_parity.py <python_preds.jsonl> <js_preds.jsonl> <data.jsonl> <out.json>"""
import json
import sys
from pathlib import Path


def load(p):
    rows = [json.loads(l) for l in Path(p).read_text(encoding='utf-8').splitlines() if l.strip()]
    if not rows:
        sys.exit(f'ERROR: {p} is empty or missing')
    return {r['id']: r for r in rows}, len(rows)


py, n_py = load(sys.argv[1])
js, n_js = load(sys.argv[2])
texts, _ = load(sys.argv[3])


def u16_to_cp(text):
    """map UTF-16 offset -> code-point offset"""
    m, u = {}, 0
    for i, ch in enumerate(text):
        m[u] = i
        u += 2 if ord(ch) > 0xFFFF else 1
    m[u] = len(text)
    return m


for i, r in js.items():
    m = u16_to_cp(texts[i]['text'])
    r['pred'] = [[t, m[s], m[e]] for t, s, e in r['pred']]
    r['cands'] = [[m[s], m[e], w] for s, e, w in r['cands']]
if n_py != n_js or set(py) != set(js):
    sys.exit(f'ERROR: document sets differ ({n_py} vs {n_js})')
diff_pred, diff_cand, examples = 0, 0, []
n_pred = n_cand = 0
for i, r in py.items():
    p = [[e['type'], e['start'], e['end']] for e in r['pred']]
    c = [[e['start'], e['end'], e['why']] for e in r['cands']]
    n_pred += len(p)
    n_cand += len(c)
    if p != js[i]['pred']:
        diff_pred += 1
        if len(examples) < 5:
            examples.append({'id': i, 'python': p, 'js': js[i]['pred']})
    if c != js[i]['cands']:
        diff_cand += 1
        if len(examples) < 5:
            examples.append({'id': i, 'python_cands': c, 'js_cands': js[i]['cands']})
res = {'documents': n_py, 'python_entities': n_pred, 'python_name_candidates': n_cand,
       'documents_with_entity_diff': diff_pred, 'documents_with_candidate_diff': diff_cand, 'examples': examples}
Path(sys.argv[4]).write_text(json.dumps(res, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in res.items() if k != 'examples'}))
sys.exit(1 if diff_pred or diff_cand else 0)
