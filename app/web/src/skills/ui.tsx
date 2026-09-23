// Small pieces the skill renderers share: a form field (label inside the tinted box, value in the typed face), a
// "copy" button and a plain table. Identity: a claim form, not a dashboard.
import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '../lib/localmode/button';
import { copyText } from '../utils/utils';

export function Field({ label, value, missing }: { label: string; value: ReactNode; missing?: boolean }) {
  return (
    <div className="ff">
      <span className="ff-label">{label}</span>
      <span className={missing ? 'text-sm italic text-base-content/55' : 'typed break-words'}>
        {missing ? 'not in the text' : value}
      </span>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied' }: { text: string; label?: string; copiedLabel?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        const ok = await copyText(text);
        setDone(ok);
        if (ok) setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {done ? copiedLabel : label}
    </Button>
  );
}

export function SkillTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="skill-table-wrap">
      <table className="skill-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
