// "Pseudonymise" (the id stays `anonymise`, so conversations saved before the rename still find it): the model LISTS
// the personal data it can see; this file — not the model — does the replacing, so the redacted text can only ever
// contain spans that really occur in the original, and the same value always becomes the same placeholder. Whatever the
// model misses stays in the text, which is why the result is called pseudonymised, not anonymised, and has to be checked
// before it is shared. The original text and the mapping back to the real values are held in this tab's memory: they
// are stripped before the conversation is written to storage (see `forStorage` and `personalData`).
import type { ReactNode } from 'react';
import { z } from 'zod';
import type { Skill, SkillRenderProps } from './types';
import type { SkillRunRecord } from '../utils/types';
import { CopyButton } from './ui';

const CHECK_FIRST =
  'Check the pseudonymised text before you share it: a model this size misses some personal data, and whatever it missed is still in plain view.';

export const ENTITY_TYPES = [
  'person',
  'phone',
  'email',
  'address',
  'policy_number',
  'national_id',
  'date_of_birth',
  'iban',
  'licence_plate',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

const schema = z.object({
  entities: z
    .array(
      z.object({
        text: z.string().min(2).max(80),
        type: z.enum(ENTITY_TYPES),
      })
    )
    .max(40),
});

export type AnonymiseResult = z.infer<typeof schema>;

const LABEL: Record<EntityType, string> = {
  person: 'PERSON',
  phone: 'PHONE',
  email: 'EMAIL',
  address: 'ADDRESS',
  policy_number: 'POLICY_NUMBER',
  national_id: 'NATIONAL_ID',
  date_of_birth: 'DATE_OF_BIRTH',
  iban: 'IBAN',
  licence_plate: 'LICENCE_PLATE',
};

export interface Replacement {
  placeholder: string;
  original: string;
  type: EntityType;
  count: number;
}

export interface Redaction {
  redacted: string;
  /** placeholder -> the real value. Memory only: never written to storage. */
  mapping: Replacement[];
  /** spans in the original, for the highlighted view */
  spans: { start: number; end: number; placeholder: string }[];
  /** values the model returned that do not occur in the text */
  notFound: { text: string; type: EntityType }[];
}

/** Replace every occurrence of every entity the model found. Longest first, so overlapping matches cannot break a span. */
// eslint-disable-next-line react-refresh/only-export-components -- a skill module exports its logic and its renderer together
export function redact(original: string, entities: { text: string; type: EntityType }[]): Redaction {
  const hay = original.toLowerCase();
  const seen = new Map<string, { text: string; type: EntityType }>();
  for (const e of entities) {
    const text = (e.text ?? '').trim();
    if (text.length < 2) continue;
    const key = `${e.type}|${text.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { text, type: e.type });
  }

  const notFound: { text: string; type: EntityType }[] = [];
  const candidates: { text: string; type: EntityType; positions: number[] }[] = [];
  for (const { text, type } of seen.values()) {
    const needle = text.toLowerCase();
    const positions: number[] = [];
    let from = 0;
    for (;;) {
      const i = hay.indexOf(needle, from);
      if (i < 0) break;
      positions.push(i);
      from = i + needle.length;
    }
    if (positions.length === 0) notFound.push({ text, type });
    else candidates.push({ text, type, positions });
  }

  // claim ranges, longest text first
  candidates.sort((a, b) => b.text.length - a.text.length);
  const taken: { start: number; end: number }[] = [];
  const overlaps = (s: number, e: number) => taken.some((t) => s < t.end && e > t.start);
  const claimed: { start: number; end: number; text: string; type: EntityType }[] = [];
  for (const c of candidates) {
    for (const start of c.positions) {
      const end = start + c.text.length;
      if (overlaps(start, end)) continue;
      taken.push({ start, end });
      claimed.push({ start, end, text: original.slice(start, end), type: c.type });
    }
  }

  // number placeholders by first appearance, per type
  claimed.sort((a, b) => a.start - b.start);
  const counters: Partial<Record<EntityType, number>> = {};
  const byValue = new Map<string, Replacement>();
  const spans: Redaction['spans'] = [];
  for (const c of claimed) {
    const key = `${c.type}|${c.text.toLowerCase()}`;
    let rep = byValue.get(key);
    if (!rep) {
      const n = (counters[c.type] = (counters[c.type] ?? 0) + 1);
      rep = { placeholder: `[${LABEL[c.type]}_${n}]`, original: c.text, type: c.type, count: 0 };
      byValue.set(key, rep);
    }
    rep.count++;
    spans.push({ start: c.start, end: c.end, placeholder: rep.placeholder });
  }

  let out = '';
  let cursor = 0;
  for (const s of spans) {
    out += original.slice(cursor, s.start) + s.placeholder;
    cursor = s.end;
  }
  out += original.slice(cursor);

  return { redacted: out, mapping: [...byValue.values()], spans, notFound };
}

/**
 * What survives a page reload: the redacted text of a finished run (null for a run that did not finish, whose "redacted"
 * text would still be the original) and how many values of each kind were replaced. Never the values.
 */
interface StoredAnonymise {
  redacted: string | null;
  counts: Partial<Record<EntityType, number>>;
}

function isStored(o: unknown): o is StoredAnonymise {
  if (!o || typeof o !== 'object' || !('redacted' in o)) return false;
  const r = (o as { redacted: unknown }).redacted;
  return typeof r === 'string' || r === null;
}

/** The well-formed entries of `entities`. An answer from the fallback path is any JSON: `entities` may not be a list. */
function entitiesOf(o: unknown): { text: string; type: EntityType }[] {
  const list = (o as { entities?: unknown } | null | undefined)?.entities;
  return (Array.isArray(list) ? list : []).filter(
    (e): e is { text: string; type: EntityType } => !!e && typeof e.text === 'string' && ENTITY_TYPES.includes(e.type)
  );
}

function AnonymiseRender({ object, streaming, input, run }: SkillRenderProps<AnonymiseResult>) {
  if (isStored(object)) {
    if (object.redacted === null) {
      return (
        <div className="skill-result">
          <p className="text-sm text-base-content/70">
            This run did not finish, so nothing of it was saved: not the text, not the values the model found. To run it
            again, paste the text into the box.
          </p>
        </div>
      );
    }
    return (
      <div className="skill-result">
        <div className="ff">
          <span className="ff-label">Pseudonymised text</span>
          <span className="typed whitespace-pre-wrap break-words">{object.redacted}</span>
        </div>
        <p className="notice notice-warn text-sm">{CHECK_FIRST}</p>
        <p className="text-sm text-base-content/70">
          The original text and the mapping between the placeholders and the real values were kept in this page's memory
          only, and went when the page closed. To rebuild the mapping, paste the text into the box and run the skill again.
        </p>
        <div className="skill-actions">
          <CopyButton text={object.redacted} label="Copy the pseudonymised text" />
        </div>
      </div>
    );
  }

  const r = redact(input, entitiesOf(object));

  return (
    <div className="skill-result">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="ff">
          <span className="ff-label">Original, with what the model found</span>
          <span className="typed whitespace-pre-wrap break-words">
            {highlight(input, r.spans)}
          </span>
        </div>
        <div className="ff">
          <span className="ff-label">Pseudonymised</span>
          <span className="typed whitespace-pre-wrap break-words">{r.redacted}</span>
        </div>
      </div>

      <p className="notice notice-warn text-sm">
        {CHECK_FIRST}{' '}
        {streaming ? 'It is still reading.' : `${r.mapping.length} value${r.mapping.length === 1 ? '' : 's'} replaced in ${r.spans.length} place${r.spans.length === 1 ? '' : 's'}.`}
      </p>

      {r.mapping.length > 0 && (
        <div className="ff">
          <span className="ff-label">Mapping — this page's memory only, not saved, not sent anywhere</span>
          <dl className="mapping-list">
            {r.mapping.map((m) => (
              <div key={m.placeholder}>
                <dt className="typed">{m.placeholder}</dt>
                <dd className="typed">{m.original}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {r.notFound.length > 0 && (
        <p className="text-sm text-base-content/70">
          Ignored, because these do not occur in the text as written: {r.notFound.map((e) => `"${e.text}"`).join(', ')}.
        </p>
      )}

      {/* a run that failed or was stopped has not replaced everything it found: nothing to copy */}
      {!streaming && run.status === 'done' && (
        <div className="skill-actions">
          <CopyButton text={r.redacted} label="Copy the pseudonymised text" />
          <span className="text-xs text-base-content/70">
            {run.path === 'grammar' ? 'The list of values was constrained to the schema.' : 'The list of values came back through the fallback path.'}
          </span>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, spans: Redaction['spans']) {
  const out: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(
      <mark key={i} className="redact-mark">
        {text.slice(s.start, s.end)}
      </mark>
    );
    cursor = s.end;
  });
  out.push(text.slice(cursor));
  return out;
}

// eslint-disable-next-line react-refresh/only-export-components -- a skill module exports its logic and its renderer together
export const anonymiseSkill: Skill<AnonymiseResult> = {
  id: 'anonymise',
  name: 'Pseudonymise',
  purpose:
    'Replaces the personal data the model finds with stable placeholders; check the result before you share it, because the model can miss some.',
  inputLabel: 'Text to pseudonymise',
  placeholder: 'Paste the text whose personal data should be replaced before it leaves the team.',
  example:
    'Marie Dubois (born 04/07/1981), 12 rue des Lilas, 69007 Lyon, called about policy AXP-4471-22. Phone 06 21 44 90 03, email marie.dubois@example.fr. Her car FR-482-QT was hit on the car park.',
  requiresText: true,
  temperature: 0,
  systemPrompt:
    "List every piece of personal data in the text: people's names, phone numbers, emails, postal addresses, policy numbers, national ID numbers, dates of birth, IBANs and licence plates. Copy each one exactly as written in the text.",
  schema: () => schema,
  buildPrompt: (text) => `Text:\n${text.trim()}`,
  maxTokens: () => 320,
  Render: AnonymiseRender,
  personalData: { title: 'Pseudonymised text' },
  // What goes to storage: for a finished run, the redacted text (which by construction holds none of the values the
  // model found) and how many values of each kind were replaced. For a run that failed, was stopped, or was still
  // running when the debounced write fired, no text at all: nothing (or not everything) had been replaced yet, so its
  // "redacted" text would be the original. The values themselves, and the raw model output that lists them, never.
  // The user turn and the error lines are handled for every `personalData` skill in skills/storage.ts.
  forStorage(run: SkillRunRecord, input: string): SkillRunRecord {
    const o = run.object as AnonymiseResult | StoredAnonymise | undefined;
    if (isStored(o)) {
      // a record saved before this rule may hold the text of a run that did not finish
      return o.redacted !== null && run.status !== 'done' ? { ...run, object: { ...o, redacted: null } } : run;
    }
    const entities = entitiesOf(o);
    const counts: Partial<Record<EntityType, number>> = {};
    for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return {
      ...run,
      object: { redacted: run.status === 'done' ? redact(input, entities).redacted : null, counts } satisfies StoredAnonymise,
      rawText: '',
      memoryOnlyDropped: true,
    };
  },
};
