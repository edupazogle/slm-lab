#!/usr/bin/env python3
"""E1a regex baseline — a faithful Python port of the personal-data detectors in slm/app/second-look/index.html.

Ported (page section "personal data: detectors"): TITLES, FIRST, NOT_NAME, MONTHS, PATTERNS (EMAIL, IBAN+mod-97, NIR,
CARD+Luhn, PHONE, DATE, PLATE, ADDRESS, POSTCODE, ID x2, AMOUNT), findPatterns(), CAP (up to 6 words), nameCandidates()
with every cue (title, greeting, sign-off, relation, context incl. "Nom:" / "Name:" labels, first name incl. the first part
of a hyphenated name), the preposition ("place") skip, the sentence-start rule, sentenceAround(),
and detect() without the model: AMOUNT dropped (amounts=false), name candidates without a cue dropped (no model), then
sorted by start / longest first and overlaps removed greedily — exactly as the page does.

JavaScript semantics reproduced on purpose (so the port behaves like the page, defects included):
  * `\\b` in a JS regex is ASCII-only, even with the u flag. B below reproduces that for the patterns that still use it.
    Since the 2026-09-24 follow-up the page's CAP and its place skip use `(?<![\\p{L}\\p{N}_])` instead, so `Édith` after a
    space is a candidate and `à` is a place cue; Python's `(?<!\\w)` is the same class (letters, numbers, underscore).
  * JS `\\s` is Unicode whitespace (incl. U+00A0, U+202F); JS `\\d` is [0-9]; JS `$` (no m flag) is end of string -> \\Z.
  * cand = words.join(' '): if the words were separated by a newline or two spaces the span end is off — kept.
Known residual differences: POSTCODE uses [^\\W\\d_] for \\p{L} (differs only on non-decimal numerals such as '²');
case-insensitive matching of U+0131/U+017F/U+212A/U+0130 differs between the engines — no document in the data contains
any of them (checked).

The only intended change from the page: `--first extended` adds first_names.EXTRA_FIRST (hand-written EN/FR/ES/DE/IT
given names) to FIRST. `--first page` is the page's list unchanged.

Usage: regex_baseline.py <input.jsonl> <output.jsonl> [--first page|extended]
       regex_baseline.py --check-page      # asserts TITLES/FIRST/NOT_NAME/MONTHS equal the page's
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from first_names import EXTRA_FIRST

PAGE = Path(__file__).resolve().parents[2] / 'app' / 'second-look' / 'index.html'

# ---- JS regex semantics ------------------------------------------------------------------------------------------
_W = 'A-Za-z0-9_'
B = rf'(?:(?<=[{_W}])(?![{_W}])|(?<![{_W}])(?=[{_W}]))'          # JS \b (ASCII word chars)
_SP = '\t\n\x0b\x0c\r    -     　﻿'
S = f'[{_SP}]'                                                    # JS \s
NS = f'[^{_SP}]'                                                  # JS \S
D = '[0-9]'                                                       # JS \d
SP = '[ \u00A0\u202F]'                                                  # the page's PLATE / POSTCODE separator: a space, never a tab or a line break
LETTER = r'[^\W\d_]'                                              # \p{L} (see docstring)

# ---- verbatim from the page --------------------------------------------------------------------------------------
TITLES = 'Mr|Mrs|Ms|Miss|Dr|Prof|Mister|Madam|M\\.|Mme|Mlle|Monsieur|Madame|Herr|Frau|Sr\\.?|Sra\\.?|Señor|Señora|Sig\\.?|Sig\\.ra|Signor|Signora'
FIRST_SRC = 'adam agnes alain alexandre alice amelie ana andrea andreas angela anna anne antoine antonio arnaud astrid aurelie ben benjamin bernard bruno camille carla carlos caroline catherine cecile charles charlotte chloe christian christine claire claude clara daniel david dominique elena elisa elise ella emma emilie eric erik eva fabien felix fernando florian francesca francois frank gabriel georg george giulia giuseppe guillaume hans helene henri hugo isabel isabelle jacques jakob james jan javier jean jeanne jens jessica joao johan johannes john jonas jorge jose juan jules julia julie julien karl katharina klaus laura lea leo lena louis louise luca lucas lucia lucie luis luisa lukas marc marco margaux maria marie marina mario marion martin mateo mathieu matteo max maxime michael michel miguel nadia nathalie nicolas nina noah noemie olivier oscar pablo paolo pascal patrick paul paula pedro peter philippe pierre raphael rebecca robert romain rosa sara sarah sebastien simon sofia sophie stefan stephanie sylvie theo thomas tim tobias ulrike valentina valerie victor vincent william xavier yann yves zoe'
NOT_NAME_SRC = 'the a an i we you he she they my our your his her their this that these those dear hello hi regards best kind thanks thank sincerely yours please monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december lundi mardi mercredi jeudi vendredi samedi dimanche janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre rue avenue boulevard street road lane place square hotel hospital clinic garage bank insurance insurer policy claim claims office department team service services company group ltd limited sa sas gmbh ag inc llc plc axa allianz generali zurich europe france germany spain italy portugal belgium netherlands switzerland austria ireland england scotland wales uk paris lyon marseille lille nice toulouse bordeaux nantes strasbourg london manchester berlin munich hamburg madrid barcelona rome milan naples lisbon porto brussels amsterdam geneva vienna dublin crete austria emergency department police court tribunal ombudsman subject re ref note total amount date phone email tel mobile address euro euros eur sir madam madame monsieur messieurs mesdames whom concern all customer client colleagues colleague team mr mrs ms miss dr prof mister mme mlle herr frau señor señora signor signora sr sra sig'
MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|Januar|Februar|März|Juni|Juli|Oktober|Dezember|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre'

PAGE_FIRST = set(FIRST_SRC.split(' '))
NOT_NAME = set(NOT_NAME_SRC.split(' '))


def luhn(d):
    s, alt = 0, False
    for ch in reversed(d):
        n = int(ch)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        s += n
        alt = not alt
    return s % 10 == 0


def iban_ok(raw):
    s = re.sub(S + '+', '', raw).upper()
    if len(s) < 15 or len(s) > 34:
        return False
    r = re.sub('[A-Z]', lambda m: str(ord(m.group(0)) - 55), s[4:] + s[:4])
    m = 0
    for ch in r:
        m = (m * 10 + int(ch)) % 97
    return m == 1


def _card_ok(v):
    d = re.sub('[^0-9]', '', v)
    return luhn(d) and len(d) >= 13


I = re.IGNORECASE
PATTERNS = [
    ('EMAIL', re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', I), None, 0),
    ('IBAN', re.compile(rf'{B}[A-Z]{{2}}{D}{{2}}(?:[ ]?[A-Z0-9]{{4}}){{2,7}}(?:[ ]?[A-Z0-9]{{1,4}})?{B}'), iban_ok, 0),
    ('NIR', re.compile(rf'{B}[12][ ]?{D}{{2}}[ ]?(?:0[1-9]|1[0-2])[ ]?(?:{D}{{2}}|2A|2B)[ ]?{D}{{3}}[ ]?{D}{{3}}(?:[ ]?{D}{{2}})?{B}'), None, 0),
    ('CARD', re.compile(rf'{B}(?:{D}[ -]?){{13,19}}{B}'), _card_ok, 0),
    ('PHONE', re.compile(rf'(?:(?:\+|00){D}{{1,3}}[ .-]?(?:\(0\)[ .-]?)?{D}{{1,4}}(?:[ .-]?{D}{{2,4}}){{2,4}})|{B}0[1-9](?:[ .-]?{D}{{2}}){{4}}{B}|{B}07{D}{{3}}[ ]?{D}{{6}}{B}'), None, 0),
    ('DATE', re.compile(rf'{B}(?:{D}{{1,2}}[/.-]{D}{{1,2}}[/.-](?:19|20){D}{{2}}|(?:19|20){D}{{2}}-{D}{{2}}-{D}{{2}}|{D}{{1,2}}(?:st|nd|rd|th|er)?{S}+(?:{MONTHS})\.?{S}+(?:19|20){D}{{2}}|(?:{MONTHS})\.?{S}+{D}{{1,2}}(?:st|nd|rd|th)?,?{S}+(?:19|20){D}{{2}}){B}', I), None, 0),
    ('PLATE', re.compile(rf'{B}(?:[A-Z]{{2}}-{D}{{3}}-[A-Z]{{2}}|[A-Z]{{2}}{D}{{2}}{SP}?[A-Z]{{3}}|{D}{{4}}{SP}?[BCDFGHJKLMNPRSTVWXYZ]{{3}}|[A-ZÄÖÜ]{{1,3}}-[A-Z]{{1,2}}{SP}?{D}{{1,4}}[EH]?){B}'), None, 0),
    ('ADDRESS', re.compile(rf'{B}{D}{{1,4}}(?:{S}?(?:bis|ter))?,?{S}+(?:rue|avenue|av\.|boulevard|bd\.?|chemin|allée|allee|place|impasse|quai|route|street|st\.|road|rd\.|lane|drive|close|way|straße|strasse|str\.|weg|calle|avenida|via|viale|piazza){B}[^\n,.;]{{2,40}}', I), None, 0),
    ('POSTCODE', re.compile(rf"{B}(?:{D}{{5}}|[A-Z]{{1,2}}{D}[A-Z0-9]?{SP}{D}[A-Z]{{2}}){SP}+[A-ZÉÈÀ](?:{LETTER}|['-])+(?:[ -][A-ZÉÈÀ](?:{LETTER}|['-])+)?"), None, 0),
    ('ID', re.compile(rf'{B}(?:policy|police|contract|contrat|claim|sinistre|dossier|reference|référence|ref\.?|case|file|n°|no\.)(?:{S}+(?:number|numéro|no\.?|n°|#|is|reference|ref\.?))*{S}*[:#]?{S}*((?=[A-Z0-9/-]*{D})[A-Z0-9][A-Z0-9/-]{{3,}}[A-Z0-9])', I), None, 1),
    ('ID', re.compile(rf'{B}(?=[A-Z-]*{D})[A-Z]{{2,5}}(?:-[A-Z0-9]{{1,8}}){{1,4}}{B}'), None, 0),
    ('AMOUNT', re.compile(rf'(?:€|EUR|£|\$){S}?{D}{{1,3}}(?:[ ,. ]{D}{{3}})*(?:[.,]{D}{{1,2}})?|{B}{D}{{1,3}}(?:[ ,. ]{D}{{3}})*(?:[.,]{D}{{1,2}})?{S}?(?:€|euros?|EUR|£|pounds|\$)', I), None, 0),
]


def find_patterns(text):
    out = []
    for typ, rx, check, group in PATTERNS:
        for m in rx.finditer(text):
            s, v = m.start(), m.group(0)
            if group:
                v = m.group(group)
                if v is None:
                    continue
                s = m.start() + m.group(0).rfind(v)
            if not v or (check and not check(v)):
                continue
            out.append({'type': typ, 'start': s, 'end': s + len(v), 'text': v, 'why': 'pattern'})
    return out


_UP, _LO = 'A-ZÀ-ÖØ-Þ', "a-zà-öø-ÿ'’"
_WORD = f'[{_UP}][{_LO}]+(?:-[{_UP}][{_LO}]+)?'
CAP = re.compile(rf"(?<!\w)({_WORD}(?:{S}+(?:(?:de|du|da|van|von|der|le|la|di|del|dos|O'|Mc){S}+)?{_WORD}){{0,5}})")
RE_TITLE = re.compile(rf'(?:(?<!\w)(?:{TITLES}))\.?{S}*\Z')
RE_GREET = re.compile(rf'(?<!\w)(?:Dear|Hello|Hi|Bonjour|Cher|Chère|Hallo|Liebe[r]?|Hola){S}*\Z', I)
RE_SIGN = re.compile(rf'(?:regards|sincerely|faithfully|cordialement|salutations|grüßen|saludos|signed|signé)[,.]?{S}*\Z', I)
RE_REL = re.compile(rf'{B}(?:my|our|her|his|their){S}+(?:son|daughter|husband|wife|partner|mother|father|brother|sister|neighbour|neighbor|friend|colleague|tenant|landlord|child){S}*,?{S}*\Z', I)
RE_CTX = re.compile(rf'{B}(?:called|named|name is|nom est|heißt|se llama|spoke (?:to|with)|contact(?:ed)?|driver,?|witness,?|handler,?|adjuster,?|(?:nom|name|nombre|pr[ée]nom){S}*:){S}*\Z', I)
RE_PLACE = re.compile(rf'(?<!\w)(?:in|at|near|from|to|into|towards|via|en|à|au|aux|nach|bei|im|en|a|di|da){S}*\Z', I)
RE_SENT = re.compile(rf'(?:^|[.!?\n]{S}*)\Z')
RE_POSS = re.compile("[’']s$")


def _fold(w):
    return ''.join(c for c in unicodedata.normalize('NFD', w.lower()) if unicodedata.category(c) != 'Mn')


def _search_ns(s):
    m = re.search(NS, s)
    return m.start() if m else -1


def sentence_around(text, i):
    a = max(text.rfind('.', 0, i), text.rfind('\n', 0, i), text.rfind('!', 0, i), text.rfind('?', 0, i)) + 1
    m = re.search(r'[.!?\n]', text[i:])
    b = len(text) if not m else i + m.start() + 1
    return text[a:b].strip()[:400]


def name_candidates(text, first):
    """All CAP candidates the page would consider, each with its cue (`why`, None when no cue fired)."""
    out = []
    for m in CAP.finditer(text):
        words = re.split(S + '+', m.group(1))
        start = m.start()
        while words and RE_POSS.sub('', words[0].lower()) in NOT_NAME:
            start += text[start:].find(words[0]) + len(words[0])
            start += _search_ns(text[start:])
            words.pop(0)
        while words and words[-1].lower() in NOT_NAME:
            words.pop()
        if not words:
            continue
        cand = RE_POSS.sub('', ' '.join(words))
        if any(w.lower() in NOT_NAME for w in words):
            continue
        before = text[max(0, start - 40):start]
        why = None
        if RE_TITLE.search(before):
            why = 'title'
        elif RE_GREET.search(before):
            why = 'greeting'
        elif RE_SIGN.search(before):
            why = 'sign-off'
        elif RE_REL.search(before):
            why = 'relation'
        elif RE_CTX.search(before):
            why = 'context'
        elif _fold(words[0]).split('-')[0] in first:      # "Jean-Pierre" checks "jean"
            why = 'first name'
        if not why and RE_PLACE.search(before):
            continue
        if not why and RE_SENT.search(before) and len(words) == 1:
            continue
        out.append({'type': 'PERSON', 'start': start, 'end': start + len(cand), 'text': cand, 'why': why,
                    'sentence': sentence_around(text, start)})
    return out


def detect(text, first):
    """The page's detect(text) with amounts=false and no model: returns (kept entities, all name candidates)."""
    ents = [e for e in find_patterns(text) if e['type'] != 'AMOUNT']
    cands = name_candidates(text, first)
    ents += [c for c in cands if c['why']]
    ents.sort(key=lambda e: (e['start'], -(e['end'] - e['start'])))
    kept, last = [], -1
    for e in ents:
        if e['start'] >= last:
            kept.append(e)
            last = e['end']
    return kept, cands


def check_page():
    html = PAGE.read_text(encoding='utf-8')
    def js_set(name):
        m = re.search(rf"const {name} = new Set\(\('([^']*)'\)\.split\(' '\)\);", html)
        return set(m.group(1).split(' '))
    assert js_set('FIRST') == PAGE_FIRST, 'FIRST differs from the page'
    assert js_set('NOT_NAME') == NOT_NAME, 'NOT_NAME differs from the page'
    assert f"const TITLES = '{TITLES.replace(chr(92), chr(92) * 2)}';" in html, 'TITLES differs from the page'
    assert f"const MONTHS = '{MONTHS}';" in html, 'MONTHS differs from the page'
    print(f'page constants match: FIRST {len(PAGE_FIRST)}, NOT_NAME {len(NOT_NAME)}, TITLES, MONTHS')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp', nargs='?')
    ap.add_argument('out', nargs='?')
    ap.add_argument('--first', choices=['page', 'extended'], default='extended')
    ap.add_argument('--check-page', action='store_true')
    a = ap.parse_args()
    if a.check_page:
        check_page()
        return
    if not a.inp or not a.out:
        ap.error('input and output paths are required')
    first = PAGE_FIRST | EXTRA_FIRST if a.first == 'extended' else set(PAGE_FIRST)
    rows = [json.loads(l) for l in Path(a.inp).read_text(encoding='utf-8').splitlines() if l.strip()]
    if not rows:
        sys.exit(f'ERROR: {a.inp} is empty')
    with open(a.out, 'w', encoding='utf-8') as f:
        for r in rows:
            kept, cands = detect(r['text'], first)
            f.write(json.dumps({'id': r['id'], 'lang': r['lang'], 'pred': kept,
                                'cands': [{k: c[k] for k in ('start', 'end', 'text', 'why')} for c in cands]},
                               ensure_ascii=False) + '\n')
    n_out = sum(1 for _ in open(a.out, encoding='utf-8'))
    assert n_out == len(rows), f'wrote {n_out} rows for {len(rows)} inputs'
    print(f'first-name list: {a.first} ({len(first)} names); scored {len(rows)} documents -> {a.out}')


if __name__ == '__main__':
    main()
