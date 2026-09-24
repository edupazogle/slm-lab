#!/usr/bin/env python3
"""Write a small .xlsx claims register (fictional data, shared strings and a number, deflated as Excel writes it) for the QA
round: python3 test/make_sample_xlsx.py [out.xlsx]"""
import sys, zipfile
from xml.sax.saxutils import escape
OUT = sys.argv[1] if len(sys.argv) > 1 else 'test/sample-claims.xlsx'
ROWS = [
    ['Claim', 'Policyholder', 'Email', 'Phone', 'IBAN', 'Amount'],
    ['CLM-2026-55012', 'Dear Hélène Rousseau', 'helene.rousseau@example.org', '+33 6 11 22 33 44', 'FR76 3000 6000 0112 3456 7890 189', 1250],
    ['CLM-2026-55013', 'Mr Oliver Grant', 'o.grant@example.co.uk', '+44 7700 900123', 'DE89 3704 0044 0532 0130 00', 380.5],
]
strings = []
def si(v):
    if v not in strings: strings.append(v)
    return strings.index(v)
col = lambda i: chr(65 + i)
rows = ''.join(f'<row r="{r + 1}">' + ''.join(
    (f'<c r="{col(c)}{r + 1}"><v>{v}</v></c>' if isinstance(v, (int, float)) else f'<c r="{col(c)}{r + 1}" t="s"><v>{si(v)}</v></c>')
    for c, v in enumerate(row)) + '</row>' for r, row in enumerate(ROWS))
S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'; R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
sheet = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="{S}"><sheetData>{rows}</sheetData></worksheet>'
sst = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="{S}" count="{len(strings)}" uniqueCount="{len(strings)}">' + ''.join(f'<si><t>{escape(s)}</t></si>' for s in strings) + '</sst>'
wb = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="{S}" xmlns:r="{R}"><sheets><sheet name="Claims" sheetId="1" r:id="rId1"/></sheets></workbook>'
wbrels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
         '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
         '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
         '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
         '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for n, x in (('[Content_Types].xml', types), ('_rels/.rels', rels), ('xl/workbook.xml', wb), ('xl/_rels/workbook.xml.rels', wbrels), ('xl/worksheets/sheet1.xml', sheet), ('xl/sharedStrings.xml', sst)):
        z.writestr(n, x)
print(OUT)
