#!/usr/bin/env python3
"""E1a evaluation -> results.json.

Matching rule (brief E1a: "boundary match, overlap >= 50 % of the gold span"):
  * a gold span is COVERED when >= 50 % of its characters lie inside predictions of a type allowed for it;
  * a prediction is CORRECT when >= 50 % of its characters lie inside gold spans of a type allowed for it.
  Character coverage (not IoU) is used because OpenPII labels GIVENNAME and SURNAME as two spans while the detector emits
  one "Pauly Azahara" span: under IoU that would score a caught name as a miss.
Type map (prediction -> gold types it may cover):
  PERSON->PERSON, EMAIL->EMAIL, PHONE->PHONE, NIR->{NIR, NATIONAL_ID}, ID->{ID_DOC, NATIONAL_ID}, IBAN->IBAN, CARD->CARD,
  PLATE->PLATE, ADDRESS->ADDRESS, DATE->DATE, POSTCODE->POSTCODE.
Direct identifiers (DATA.md, 9 types, NATIONAL_ID/NIR counted as one): PERSON, EMAIL, PHONE, NATIONAL_ID/NIR, IBAN, CARD,
  PLATE, ID_DOC, ADDRESS. A document LEAKS when any of its direct-identifier gold spans is not covered (typed). The rate is
  over documents that contain at least one direct identifier. `leak_rate_any_type` also accepts a prediction of any type.
DATE is scored separately (not a direct identifier). Precision for the pass bar is micro precision over predictions of the
  direct-identifier types. Round trip: the page's placeholders() + applyPlaceholders(), then restore each placeholder to
  the text first assigned to it; exact-match rate of the restored text.
Usage: eval.py --data data/combined_dataset.jsonl --preds preds/regex_extended.jsonl
               [--ablation preds/regex_page.jsonl] [--out results.json]
       eval.py ... --shift 5 --out results_shift5.json      (every predicted span moved +5 characters)
"""
import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

PRED_TO_GOLD = {'PERSON': {'PERSON'}, 'EMAIL': {'EMAIL'}, 'PHONE': {'PHONE'}, 'NIR': {'NIR', 'NATIONAL_ID'},
                'ID': {'ID_DOC', 'NATIONAL_ID'}, 'IBAN': {'IBAN'}, 'CARD': {'CARD'}, 'PLATE': {'PLATE'},
                'ADDRESS': {'ADDRESS'}, 'DATE': {'DATE'}, 'POSTCODE': {'POSTCODE'}}
GOLD_TO_PRED = defaultdict(set)
for p, gs in PRED_TO_GOLD.items():
    for g in gs:
        GOLD_TO_PRED[g].add(p)
DIRECT_GOLD = ['PERSON', 'EMAIL', 'PHONE', 'NATIONAL_ID', 'NIR', 'IBAN', 'CARD', 'PLATE', 'ID_DOC', 'ADDRESS']
DIRECT_PRED = ['PERSON', 'EMAIL', 'PHONE', 'NIR', 'ID', 'IBAN', 'CARD', 'PLATE', 'ADDRESS']
SCORED_GOLD = DIRECT_GOLD + ['DATE', 'POSTCODE']
SLICES = ['fr_openpii', 'fr_synthetic', 'en_openpii']
EXPECTED = {'fr_openpii': 400, 'fr_synthetic': 100, 'en_openpii': 400}
MUST_HAVE_GOLD = {'fr_synthetic': ['PERSON', 'NIR', 'IBAN', 'PLATE', 'PHONE', 'EMAIL'],
                  'fr_openpii': ['PERSON', 'EMAIL', 'PHONE'], 'en_openpii': ['PERSON', 'EMAIL', 'PHONE']}


def die(msg):
    print('ERROR:', msg, file=sys.stderr)
    sys.exit(1)


def load(path):
    p = Path(path)
    if not p.is_file() or p.stat().st_size == 0:
        die(f'{path} is missing or empty')
    rows = [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]
    if not rows:
        die(f'{path} has no rows')
    return rows


def slice_of(r):
    if r['id'].startswith('synthetic_'):
        return 'fr_synthetic'
    return f"{r['lang']}_openpii"


def cover(span, chars):
    n = span[1] - span[0]
    return sum(1 for i in range(span[0], span[1]) if i in chars) / n if n > 0 else 0.0


# ---- the page's placeholders(), applyPlaceholders() + a restore ---------------------------------------------------
def _norm(s):
    return re.sub(r'[\s.\-/]+', '', s.lower())


def round_trip(text, ents):
    mp, count, ph = {}, Counter(), []
    for e in ents:
        key = e['type'] + ':' + _norm(e['text'])
        if key not in mp:
            count[e['type']] += 1
            mp[key] = f"[{e['type']}_{count[e['type']]}]"
        ph.append(mp[key])
    for k, e in enumerate(ents):                      # a surname alone reuses the full name's placeholder
        if e['type'] == 'PERSON' and ' ' not in e['text']:
            for j, f in enumerate(ents):
                if f['type'] == 'PERSON' and ' ' in f['text'] and e['text'] in re.split(r'\s+', f['text']):
                    ph[k] = ph[j]
                    break
    out, i = '', 0
    for e, p in zip(ents, ph):
        out += text[i:e['start']] + p
        i = e['end']
    out += text[i:]
    back = {}
    for e, p in zip(ents, ph):
        back.setdefault(p, text[e['start']:e['end']])
    restored = re.sub(r'\[[A-Z_]+_\d+\]', lambda m: back.get(m.group(0), m.group(0)), out)
    return restored == text, bool(re.search(r'\[[A-Z_]+_\d+\]', text))


def score(docs):
    """docs: list of (gold_row, pred_row). Returns the metric block for that set of documents."""
    gold_n, gold_cov = Counter(), Counter()
    pred_n, pred_ok = Counter(), Counter()
    fp_on = Counter()
    leak_docs = leak_any_docs = with_direct = 0
    rt_ok = rt_collide = 0
    rt_fail = []
    for g, p in docs:
        preds = [e for e in p['pred']]
        chars_by_pred = defaultdict(set)
        all_pred_chars = set()
        for e in preds:
            rng = range(e['start'], e['end'])
            chars_by_pred[e['type']].update(rng)
            all_pred_chars.update(rng)
        chars_by_gold = defaultdict(set)
        for s in g['spans']:
            chars_by_gold[s['type']].update(range(s['start'], s['end']))
        leaked = leaked_any = has_direct = False
        for s in g['spans']:
            t = s['type']
            if t not in SCORED_GOLD:
                continue
            allowed = set().union(*(chars_by_pred[pt] for pt in GOLD_TO_PRED[t]))
            ok = cover((s['start'], s['end']), allowed) >= 0.5
            gold_n[t] += 1
            gold_cov[t] += ok
            if t in DIRECT_GOLD:
                has_direct = True
                leaked |= not ok
                leaked_any |= cover((s['start'], s['end']), all_pred_chars) < 0.5
        with_direct += has_direct
        leak_docs += leaked
        leak_any_docs += leaked_any
        for e in preds:
            allowed = set().union(*(chars_by_gold[gt] for gt in PRED_TO_GOLD.get(e['type'], set())))
            ok = cover((e['start'], e['end']), allowed) >= 0.5
            pred_n[e['type']] += 1
            pred_ok[e['type']] += ok
            if not ok:
                hit = [s['type'] for s in g['spans'] if s['start'] < e['end'] and e['start'] < s['end']]
                fp_on[f"{e['type']} on {hit[0] if hit else 'no gold span'}"] += 1
        ok, collide = round_trip(g['text'], sorted(preds, key=lambda e: e['start']))
        rt_ok += ok
        if not ok:
            rt_fail.append(g['id'])
        rt_collide += collide

    def r3(x):
        return round(x, 4)
    per_gold = {t: {'gold': gold_n[t], 'covered': gold_cov[t],
                    'recall': r3(gold_cov[t] / gold_n[t]) if gold_n[t] else None} for t in SCORED_GOLD}
    nir_n = gold_n['NIR'] + gold_n['NATIONAL_ID']
    per_gold['NATIONAL_ID/NIR'] = {'gold': nir_n, 'covered': gold_cov['NIR'] + gold_cov['NATIONAL_ID'],
                                   'recall': r3((gold_cov['NIR'] + gold_cov['NATIONAL_ID']) / nir_n) if nir_n else None}
    per_pred = {t: {'pred': pred_n[t], 'correct': pred_ok[t], 'precision': r3(pred_ok[t] / pred_n[t]) if pred_n[t] else None}
                for t in sorted(pred_n)}
    dn = sum(pred_n[t] for t in DIRECT_PRED)
    dok = sum(pred_ok[t] for t in DIRECT_PRED)
    return {
        'documents': len(docs), 'documents_with_direct_identifier': with_direct,
        'leak_documents': leak_docs, 'leak_rate': r3(leak_docs / with_direct) if with_direct else None,
        'leak_rate_any_type': r3(leak_any_docs / with_direct) if with_direct else None,
        'precision_direct': r3(dok / dn) if dn else None, 'direct_predictions': dn,
        'per_gold_type': per_gold, 'per_pred_type': per_pred,
        'date': {'recall': per_gold['DATE']['recall'], 'gold': gold_n['DATE'],
                 'precision': per_pred.get('DATE', {}).get('precision'), 'pred': pred_n['DATE']},
        'false_positives_by_where_they_land': dict(fp_on.most_common()),
        'round_trip': {'documents': len(docs), 'exact': rt_ok, 'rate': r3(rt_ok / len(docs)) if docs else None,
                       'texts_already_containing_a_placeholder': rt_collide, 'failed_ids': rt_fail[:10]},
    }


def pass_bar(block):
    g = block['per_gold_type']
    checks = {'leak_rate<=0.01': block['leak_rate'] is not None and block['leak_rate'] <= 0.01,
              'precision_direct>=0.80': block['precision_direct'] is not None and block['precision_direct'] >= 0.80}
    for t in ['NATIONAL_ID/NIR', 'IBAN', 'PHONE', 'EMAIL', 'PLATE']:
        r = g[t]['recall']
        checks[f'{t}_recall>=0.98'] = 'not measurable (0 gold)' if r is None else r >= 0.98
    checks['PERSON_recall>=0.95'] = g['PERSON']['recall'] is not None and g['PERSON']['recall'] >= 0.95
    checks['round_trip==1.0'] = block['round_trip']['rate'] == 1.0
    checks['met'] = all(v is True for k, v in checks.items() if v != 'not measurable (0 gold)')
    return checks


def evaluate(gold_rows, pred_rows, shift=0):
    if len(gold_rows) != len(pred_rows):
        die(f'{len(gold_rows)} gold documents but {len(pred_rows)} prediction rows')
    gold = {r['id']: r for r in gold_rows}
    pred = {r['id']: r for r in pred_rows}
    if len(gold) != len(gold_rows) or len(pred) != len(pred_rows):
        die('duplicate document ids')
    if set(gold) != set(pred):
        die(f'id sets differ: {len(set(gold) - set(pred))} documents without a prediction row')
    if shift:
        pred = {i: {**r, 'pred': [{**e, 'start': e['start'] + shift, 'end': e['end'] + shift} for e in r['pred']]}
                for i, r in pred.items()}
    by_slice = defaultdict(list)
    for i, g in gold.items():
        by_slice[slice_of(g)].append((g, pred[i]))
    for s, n in EXPECTED.items():
        if len(by_slice[s]) != n:
            die(f'slice {s}: {len(by_slice[s])} documents, expected {n}')
        have = Counter(sp['type'] for g, _ in by_slice[s] for sp in g['spans'])
        missing = [t for t in MUST_HAVE_GOLD[s] if have[t] == 0]
        if missing:
            die(f'slice {s} has no gold spans of {missing}')
    out = {'slices': {s: score(by_slice[s]) for s in SLICES}}
    out['languages'] = {'fr': score(by_slice['fr_openpii'] + by_slice['fr_synthetic']), 'en': score(by_slice['en_openpii'])}
    out['all'] = score([d for s in SLICES for d in by_slice[s]])
    out['documents_scored'] = sum(len(by_slice[s]) for s in SLICES)
    return out, by_slice


def person_misses(by_slice):
    diag, worst = Counter(), []
    rank = {'fr_synthetic': 0, 'fr_openpii': 1, 'en_openpii': 2}
    for s in SLICES:
        for g, p in by_slice[s]:
            person_chars = set()
            for e in p['pred']:
                if e['type'] == 'PERSON':
                    person_chars.update(range(e['start'], e['end']))
            any_chars = set()
            for e in p['pred']:
                any_chars.update(range(e['start'], e['end']))
            best = None
            for sp in g['spans']:
                if sp['type'] != 'PERSON':
                    continue
                span = (sp['start'], sp['end'])
                if cover(span, person_chars) >= 0.5:
                    continue
                txt = g['text'][span[0]:span[1]]
                cue_c = [c for c in p['cands'] if c['why'] and c['start'] < span[1] and span[0] < c['end']]
                nocue = [c for c in p['cands'] if not c['why'] and c['start'] < span[1] and span[0] < c['end']]
                if cue_c:
                    why = 'candidate with a cue, lost to an overlapping entity or <50% covered'
                elif nocue:
                    why = 'candidate without a cue (the page would ask the model; no model here)'
                elif not txt[:1].isupper():
                    why = 'not capitalised'
                elif not txt[:1].isascii():
                    why = 'starts with an accented capital (JS ASCII \\b: CAP cannot start there)'
                else:
                    why = 'capitalised but no candidate (NOT_NAME word, place or sentence-start skip, or CAP shape)'
                diag[why] += 1
                exposed = cover(span, any_chars) == 0
                item = {'slice': s, 'id': g['id'], 'text': txt, 'diagnosis': why, 'fully_exposed': exposed,
                        'context': g['text'][max(0, span[0] - 50):span[1] + 50].replace('\n', ' ')}
                if best is None or (exposed, len(txt)) > (best['fully_exposed'], len(best['text'])):
                    best = item
            if best:
                worst.append(best)
    # the 10 worst: fully exposed (no prediction of any type touches the name) first, longest first, taken round-robin
    # over the three slices so one template (the synthetic "Nom: ..." line) does not fill the list
    per = {s: sorted([w for w in worst if w['slice'] == s], key=lambda x: (not x['fully_exposed'], -len(x['text'])))
           for s in SLICES}
    picked, k = [], 0
    while len(picked) < 10 and any(len(v) > k for v in per.values()):
        for s in sorted(SLICES, key=lambda s: rank[s]):
            if len(per[s]) > k and len(picked) < 10:
                picked.append(per[s][k])
        k += 1
    return dict(diag.most_common()), picked


def nir_misses(by_slice):
    """Why gold NIR spans (synthetic) are missed: malformed gold (not 15 characters of NIR), masked as another type,
    or uncovered."""
    out = Counter()
    for g, p in by_slice['fr_synthetic']:
        for sp in g['spans']:
            if sp['type'] != 'NIR':
                continue
            span = (sp['start'], sp['end'])
            nir = set(i for e in p['pred'] if e['type'] == 'NIR' for i in range(e['start'], e['end']))
            if cover(span, nir) >= 0.5:
                out['caught as NIR'] += 1
                continue
            v = re.sub(r'\s', '', g['text'][span[0]:span[1]])
            other = [e['type'] for e in p['pred'] if e['start'] < span[1] and span[0] < e['end']]
            key = 'gold malformed (%d chars, year not zero-padded)' % len(v) if len(v) != 15 else 'well-formed'
            out[f"{key}; {'masked as ' + other[0] if other else 'uncovered'}"] += 1
    return dict(out.most_common())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data/combined_dataset.jsonl')
    ap.add_argument('--preds', default='preds/regex_extended.jsonl')
    ap.add_argument('--ablation', help='a second prediction file (the page\'s own first-name list) scored beside')
    ap.add_argument('--shift', type=int, default=0)
    ap.add_argument('--out', default='results.json')
    a = ap.parse_args()
    gold_rows, pred_rows = load(a.data), load(a.preds)
    res, by_slice = evaluate(gold_rows, pred_rows, a.shift)
    res = {'command': 'python ' + ' '.join(sys.argv), 'data': a.data, 'preds': a.preds, 'shift': a.shift,
           'load_at_eval (uptime)': subprocess.run(['uptime'], capture_output=True, text=True).stdout.strip(), **res}
    res['pass_bar'] = {l: pass_bar(res['languages'][l]) for l in ('fr', 'en')}
    res['kill_rule'] = {'rule': 'if the regex baseline alone meets the leak-rate bar (<=1 % per language), the model half of E1 ends',
                        'fr_leak_rate': res['languages']['fr']['leak_rate'], 'en_leak_rate': res['languages']['en']['leak_rate'],
                        'triggered': all(res['languages'][l]['leak_rate'] <= 0.01 for l in ('fr', 'en'))}
    res['person_miss_diagnosis'], res['worst_person_misses'] = person_misses(by_slice)
    res['nir_miss_diagnosis_fr_synthetic'] = nir_misses(by_slice)
    if a.ablation:
        ab, _ = evaluate(gold_rows, load(a.ablation))
        res['ablation_page_first_list'] = {'preds': a.ablation, **{
            l: {'leak_rate': ab['languages'][l]['leak_rate'], 'precision_direct': ab['languages'][l]['precision_direct'],
                'person_recall': ab['languages'][l]['per_gold_type']['PERSON']['recall'],
                'person_precision': ab['languages'][l]['per_pred_type'].get('PERSON', {}).get('precision')}
            for l in ('fr', 'en')}}
    if not a.shift:
        sh, _ = evaluate(gold_rows, pred_rows, 5)
        res['fail_proof_shift_plus5'] = {l: {'leak_rate': sh['languages'][l]['leak_rate'],
                                             'person_recall': sh['languages'][l]['per_gold_type']['PERSON']['recall'],
                                             'email_recall': sh['languages'][l]['per_gold_type']['EMAIL']['recall'],
                                             'precision_direct': sh['languages'][l]['precision_direct']} for l in ('fr', 'en')}
    Path(a.out).write_text(json.dumps(res, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    fr, en = res['languages']['fr'], res['languages']['en']
    print(f"scored {res['documents_scored']} documents (fr {fr['documents']}, en {en['documents']}) -> {a.out}")
    for l, b in (('fr', fr), ('en', en)):
        print(f"{l}: leak {b['leak_rate']} (any type {b['leak_rate_any_type']}), precision {b['precision_direct']}, "
              f"PERSON R {b['per_gold_type']['PERSON']['recall']}, DATE R {b['date']['recall']}, "
              f"round trip {b['round_trip']['rate']}, pass bar met: {res['pass_bar'][l]['met']}")
    if 'fail_proof_shift_plus5' in res:
        print('shift +5:', json.dumps(res['fail_proof_shift_plus5']))


if __name__ == '__main__':
    main()
