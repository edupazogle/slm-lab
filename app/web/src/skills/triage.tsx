// "Triage a claim": one claim note in, a decision card out. The next step is the point: it says which band the claim
// falls in — act, confirm or refuse — which is the BizLoop routing rule made concrete.
import { z } from 'zod';
import type { Skill, SkillRenderProps } from './types';
import { CopyButton, Field } from './ui';

const LINES = ['motor', 'home', 'health', 'liability', 'travel', 'other'] as const;
const URGENCY = ['low', 'medium', 'high'] as const;
const NEXT_STEP = ['log', 'ask_customer', 'human_review'] as const;

const schema = z.object({
  line: z.enum(LINES),
  urgency: z.enum(URGENCY),
  missing_information: z.array(z.string().max(80)).max(5),
  next_step: z.enum(NEXT_STEP),
});

export type Triage = z.infer<typeof schema>;

const BAND: Record<(typeof NEXT_STEP)[number], { band: string; label: string; meaning: string }> = {
  log: {
    band: 'act',
    label: 'Log the claim',
    meaning: 'complete and routine: the system may file it on its own',
  },
  ask_customer: {
    band: 'confirm',
    label: 'Ask the customer',
    meaning: 'something is missing: a person approves the question before it goes out',
  },
  human_review: {
    band: 'refuse',
    label: 'Send to a handler',
    meaning: 'the model does not decide this one; a claims handler does',
  },
};

// eslint-disable-next-line react-refresh/only-export-components -- a skill module exports its logic and its renderer together
function TriageRender({ object, streaming }: SkillRenderProps<Triage>) {
  const o = (object ?? {}) as Partial<Triage>;
  const step = o.next_step && BAND[o.next_step] ? BAND[o.next_step] : null;
  const missing = Array.isArray(o.missing_information) ? o.missing_information.filter((s) => typeof s === 'string' && s.trim()) : [];

  return (
    <div className="skill-result">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Line of business" value={o.line ?? ''} missing={!o.line} />
        <Field label="Urgency" value={o.urgency ?? ''} missing={!o.urgency} />
      </div>

      <div className="ff">
        <span className="ff-label">Missing information</span>
        {missing.length === 0 ? (
          <span className="text-sm italic text-base-content/55">{streaming ? 'reading' : 'nothing listed'}</span>
        ) : (
          <ul className="typed list-disc pl-5">
            {missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      <div className={`decision-card decision-${step?.band ?? 'none'}`}>
        <span className="ff-label">Next step</span>
        {step ? (
          <>
            <strong className="decision-step">{step.label}</strong>
            <span className="decision-band typed">{step.band}</span>
            <p className="text-sm text-base-content/80">{step.meaning}</p>
          </>
        ) : (
          <span className="text-sm italic text-base-content/55">not decided yet</span>
        )}
      </div>

      <p className="text-xs text-base-content/70">
        Bands: act — safe for the system alone; confirm — a person approves first; refuse — the model hands it to a human.
      </p>

      {!streaming && (
        <div className="skill-actions">
          <CopyButton text={JSON.stringify(object ?? {}, null, 2)} label="Copy as JSON" />
        </div>
      )}
    </div>
  );
}

export const triageSkill: Skill<Triage> = {
  id: 'triage',
  name: 'Triage a claim',
  purpose: 'Sorts a claim note by line and urgency, and says what should happen next.',
  inputLabel: 'Claim note',
  placeholder: 'Paste the claim note to triage.',
  example:
    'Customer rang: their car was rear-ended at a red light on the ring road this morning. The other driver drove off. Nobody hurt but the boot will not close and the car is at the roadside. No police report yet.',
  requiresText: true,
  temperature: 0,
  systemPrompt:
    'You triage an insurance claim note. Choose the line of business and the urgency, list what is missing to handle it, and choose the next step: log when it is complete and routine, ask_customer when information is missing, human_review when there is injury, a dispute, a sign of fraud, or an unclear amount.',
  schema: () => schema,
  buildPrompt: (text) => `Claim note:\n${text.trim()}`,
  maxTokens: () => 220,
  Render: TriageRender,
};
