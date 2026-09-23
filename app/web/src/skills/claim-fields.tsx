// "Pull claim fields": a claim note in, a filled form out. Every value is either copied from the note or null, and a
// null renders as "not in the text" — a small model inventing a policy number is the failure this schema prevents.
import { z } from 'zod';
import type { Skill, SkillRenderProps } from './types';
import { CopyButton, Field } from './ui';

const schema = z.object({
  policy_number: z.string().max(24).nullable(),
  claimant: z.string().max(60).nullable(),
  incident_date: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'a date written as YYYY-MM-DD')
    .nullable(),
  damage_type: z.string().max(60).nullable(),
  amount_eur: z.number().nullable(),
  phone: z.string().max(24).nullable(),
});

export type ClaimFields = z.infer<typeof schema>;

function ClaimFieldsRender({ object, streaming }: SkillRenderProps<ClaimFields>) {
  const o = (object ?? {}) as Partial<ClaimFields>;
  const fmtAmount = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? `${v.toLocaleString('en-GB', { maximumFractionDigits: 2 })} EUR` : null;
  const rows: { label: string; value: unknown }[] = [
    { label: 'Policy number', value: o.policy_number },
    { label: 'Claimant', value: o.claimant },
    { label: 'Date of incident', value: o.incident_date },
    { label: 'Damage', value: o.damage_type },
    { label: 'Amount', value: fmtAmount(o.amount_eur) },
    { label: 'Phone', value: o.phone },
  ];
  const filled = rows.filter((r) => r.value != null && r.value !== '');
  return (
    <div className="skill-result">
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <Field
            key={r.label}
            label={r.label}
            value={typeof r.value === 'string' || typeof r.value === 'number' ? String(r.value) : ''}
            missing={r.value == null || r.value === ''}
          />
        ))}
      </div>
      {!streaming && (
        <div className="skill-actions">
          <CopyButton text={JSON.stringify(object ?? {}, null, 2)} label="Copy as JSON" />
          <span className="text-xs text-base-content/70">
            {filled.length} of {rows.length} fields found in the note. Check each one against the note before it is used.
          </span>
        </div>
      )}
    </div>
  );
}

export const claimFieldsSkill: Skill<ClaimFields> = {
  id: 'claim-fields',
  name: 'Pull claim fields',
  purpose: 'Turns a free-text claim note into the six fields a claim file needs.',
  inputLabel: 'Claim note',
  placeholder: 'Paste the note the customer or the adviser wrote.',
  example:
    'Call from Marie Dubois on 14 March 2026, policy AXP-4471-22. Water came through the kitchen ceiling on 12/03/2026 after the flat above burst a pipe. She estimates 2 400 euros of damage. Reach her on 06 21 44 90 03.',
  requiresText: true,
  temperature: 0,
  systemPrompt:
    'You fill an insurance claim form from a note. Copy each value exactly as the note writes it. Use null when the note does not give it. incident_date is YYYY-MM-DD. amount_eur is a number.',
  schema: () => schema,
  buildPrompt: (text) => `Note:\n${text.trim()}`,
  maxTokens: () => 220,
  Render: ClaimFieldsRender,
};
