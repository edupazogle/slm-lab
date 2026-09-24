#!/usr/bin/env python3
"""Write a small .docx claim letter (fictional data) for the QA round: python3 test/make_sample_docx.py [out.docx]"""
import sys, zipfile
from xml.sax.saxutils import escape
OUT = sys.argv[1] if len(sys.argv) > 1 else 'test/sample-claim.docx'
LINES = [
    'Dear Sir or Madam,',
    'I am writing about claim number CLM-2026-77120 under policy AX-FR-5530018. On 3 September 2026 my car, registration GH-921-TR, was hit by a van near 33000 Bordeaux. The other driver, Claire Fontaine, admitted fault.',
    'Please pay €1,940.00 to my account FR76 3000 6000 0112 3456 7890 189. You can reach me on +33 6 98 76 54 32 or at paul.girard@example.com. I live at 5 rue Pasteur, 33000 Bordeaux.',
    'Kind regards,',
    'Paul Girard',
]
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}"><w:body>' + ''.join(
    f'<w:p><w:r><w:t xml:space="preserve">{escape(l)}</w:t></w:r></w:p>' for l in LINES) + '</w:body></w:document>'
types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
         '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
         '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', types); z.writestr('_rels/.rels', rels); z.writestr('word/document.xml', doc)
print(OUT)
