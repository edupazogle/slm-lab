// "Synthetic claims": invented claims for testing a form, a rule or a demo. Everything it produces is fictional, and
// the table says so — this is test data, never a source of fact.
import { z } from 'zod';
import type { Skill, SkillInput, SkillRenderProps } from './types';
import { CopyButton, SkillTable } from './ui';

const LINES = ['motor', 'home', 'health', 'liability', 'travel'] as const;

const claim = z.object({
  claim_id: z.string().regex(/^CLM-[0-9]{5}$/, 'an id like CLM-00042'),
  line: z.enum(LINES),
  incident_date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'a date written as YYYY-MM-DD'),
  claimant: z.string().max(40),
  city: z.string().max(30),
  description: z.string().max(140),
  amount_eur: z.number(),
});

export type SyntheticClaim = z.infer<typeof claim>;
export type SyntheticClaims = SyntheticClaim[];

const countOf = (input?: SkillInput) => {
  const n = Number(input?.count ?? 4);
  return Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : 4;
};

function SyntheticRender({ object, streaming, skillInput }: SkillRenderProps<SyntheticClaims>) {
  const rows = (Array.isArray(object) ? object : []).filter((r) => r && typeof r === 'object');
  const wanted = countOf(skillInput);
  return (
    <div className="skill-result">
      <p className="fictional-label">Fictional data — invented by the model for testing, not real claims</p>
      {rows.length === 0 ? (
        <p className="text-sm italic text-base-content/55">{streaming ? 'writing the first claim' : 'nothing came back'}</p>
      ) : (
        <SkillTable head={['Claim', 'Line', 'Date', 'Claimant', 'City', 'What happened', 'Amount']}>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="typed">{r.claim_id ?? ''}</td>
              <td>{r.line ?? ''}</td>
              <td className="typed">{r.incident_date ?? ''}</td>
              <td>{r.claimant ?? ''}</td>
              <td>{r.city ?? ''}</td>
              <td className="cell-wide">{r.description ?? ''}</td>
              <td className="typed text-right">
                {typeof r.amount_eur === 'number' ? r.amount_eur.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : ''}
              </td>
            </tr>
          ))}
        </SkillTable>
      )}
      {!streaming && (
        <div className="skill-actions">
          <CopyButton text={JSON.stringify(object ?? [], null, 2)} label="Copy as JSON" />
          <span className="text-xs text-base-content/70">
            {rows.length} of {wanted} asked for.
          </span>
        </div>
      )}
    </div>
  );
}

export const syntheticSkill: Skill<SyntheticClaims> = {
  id: 'synthetic-claims',
  name: 'Synthetic claims',
  purpose: 'Invents a small table of fictional claims to test a form, a rule or a demo.',
  inputLabel: 'Theme (optional)',
  placeholder: 'For example: winter storm damage in Brittany, amounts under 5 000 euros.',
  example: 'motor claims in Lyon, a mix of small and large amounts',
  requiresText: false,
  options: [{ key: 'count', label: 'How many', type: 'number', min: 1, max: 8, default: 4 }],
  temperature: 0.8,
  systemPrompt:
    'You write fictional insurance claims to test software. Invent the names, places, dates and amounts. Never use a real person. Vary the lines of business and the amounts.',
  schema: (input) => {
    const n = countOf(input);
    return z.array(claim).min(n).max(n) as unknown as z.ZodType<SyntheticClaims>;
  },
  buildPrompt: (text, input) => {
    const n = countOf(input);
    const theme = text.trim();
    return `Write ${n} fictional claims.${theme ? ` Theme: ${theme}.` : ''}`;
  },
  maxTokens: (input) => 90 * countOf(input) + 60,
  Render: SyntheticRender,
};
