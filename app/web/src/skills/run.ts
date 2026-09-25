// Runs a skill on the loaded model.
//
// Path 1, "grammar": the JSON Schema goes to llama.cpp as `response_format: json_schema`, which compiles it into a
// grammar, so every token the model can pick keeps the output inside the schema. This is the normal path.
// Path 2, "fallback": if the engine rejects the schema, the lifted LocalMode `generateObject` asks for JSON in the
// prompt, extracts it from whatever came back, validates it, and retries with the validation error (up to 2 times).
//
// Either way the result is validated against the same Zod schema, and the badge says the answer has the expected shape
// (every field there, of the right kind — not that the values are true) or lists exactly what failed. For a skill that
// handles personal data (`personalData`), no error line quotes the model's output: that output lists the values.
import type { ChatCompletionMessage } from '@wllama/wllama';
import type { StreamCallbacks, StreamOutcome, StreamRequest } from '../utils/engine';
import type { SkillRunRecord } from '../utils/types';
import type { Skill, SkillInput } from './types';
import { toJsonSchema, validate } from './validate';
import { extractJSON, parsePartialJSON, repairJSON, withoutRawText } from '../lib/localmode/schema';
import { generateObject } from '../lib/localmode/generate-object';
import { StructuredOutputError } from '../lib/localmode/types';
import { errorText } from '../utils/utils';

type Generate = (req: StreamRequest, cb?: StreamCallbacks) => Promise<StreamOutcome>;

export interface SkillModelTraits {
  /** the model writes a thinking block first (Qwen3 and friends): switch it off, a form needs no essay */
  thinks?: boolean;
  noThinkSwitch?: boolean;
}

export interface SkillResult {
  run: SkillRunRecord;
  /** measured numbers for the receipt (summed over attempts on the fallback path) */
  outcome: StreamOutcome | null;
}

function sumOutcomes(list: StreamOutcome[]): StreamOutcome | null {
  if (list.length === 0) return null;
  const last = list[list.length - 1];
  const sum = (k: 'tokensIn' | 'tokensOut') =>
    list.every((o) => o[k] == null) ? null : list.reduce((a, o) => a + (o[k] ?? 0), 0);
  const nets = list.map((o) => o.networkRequests);
  return {
    ...last,
    tokensIn: sum('tokensIn'),
    tokensOut: sum('tokensOut'),
    ttftMs: list[0].ttftMs,
    totalMs: list.reduce((a, o) => a + o.totalMs, 0),
    networkRequests: nets.some((n) => n == null) ? null : nets.reduce<number>((a, n) => a + (n ?? 0), 0),
    networkHosts: [...new Set(list.flatMap((o) => o.networkHosts))],
  };
}

export async function runSkill<T>(
  generate: Generate,
  skill: Skill<T>,
  text: string,
  skillInput: SkillInput | undefined,
  traits: SkillModelTraits,
  onUpdate: (run: SkillRunRecord) => void
): Promise<SkillResult> {
  const schema = skill.schema(skillInput);
  const jsonSchema = toJsonSchema(schema);
  const issueLine = (line: string) => (skill.personalData ? withoutRawText(line) : line);
  const run: SkillRunRecord = {
    skillId: skill.id,
    status: 'running',
    rawText: '',
    path: 'grammar',
    attempts: 1,
    valid: null,
    issues: [],
  };
  onUpdate({ ...run });

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: skill.systemPrompt },
    { role: 'user', content: skill.buildPrompt(text, skillInput) },
  ];
  const chatTemplateKwargs = traits.thinks ? { enable_thinking: false } : undefined;

  // ---- path 1: grammar-constrained decoding ----
  let outcome: StreamOutcome | null = null;
  try {
    outcome = await generate(
      {
        messages,
        maxTokens: skill.maxTokens(skillInput),
        temperature: skill.temperature,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: skill.id.replace(/[^a-z0-9_]/gi, '_'), schema: jsonSchema, strict: true },
        },
        chatTemplateKwargs,
      },
      {
        onText(answer) {
          run.rawText = answer;
          const partial = parsePartialJSON(answer);
          if (partial !== undefined) run.object = partial;
          onUpdate({ ...run });
        },
      }
    );
  } catch (e) {
    run.grammarError = errorText(e);
  }

  if (outcome) {
    run.rawText = outcome.raw;
    if (outcome.stopped) {
      run.status = 'failed';
      run.valid = false;
      run.issues = ['Stopped before the answer was complete.'];
      onUpdate({ ...run });
      return { run, outcome };
    }
    let parsed: unknown;
    let parseError: string | null = null;
    try {
      parsed = extractJSON(outcome.raw);
    } catch (e) {
      parseError = errorText(e);
      const repaired = repairJSON(outcome.raw);
      if (repaired) {
        try {
          parsed = JSON.parse(repaired);
        } catch {
          /* stays unparsed */
        }
      }
    }
    if (parsed === undefined) {
      run.status = 'failed';
      run.valid = false;
      run.object = parsePartialJSON(outcome.raw);
      run.issues = [
        outcome.finishReason === 'length'
          ? `The answer reached the token limit (${outcome.tokensOut ?? '?'} tokens) before the JSON was complete.`
          : `The output is not valid JSON: ${issueLine(parseError ?? '')}`,
      ];
      onUpdate({ ...run });
      return { run, outcome };
    }
    const v = validate(schema, parsed);
    run.object = v.valid ? v.value : parsed;
    run.valid = v.valid;
    run.issues = parseError ? ['The JSON needed a repair before it parsed.', ...v.issues] : v.issues;
    run.status = 'done';
    onUpdate({ ...run });
    return { run, outcome };
  }

  // ---- path 2: prompt, extract, repair, retry (lifted LocalMode generateObject) ----
  run.path = 'fallback';
  run.object = undefined;
  run.rawText = '';
  onUpdate({ ...run });
  const outcomes: StreamOutcome[] = [];
  try {
    const res = await generateObject<T>({
      schema: { parse: (v: unknown) => schema.parse(v), jsonSchema },
      prompt: skill.buildPrompt(text, skillInput),
      systemPrompt: skill.systemPrompt,
      maxTokens: skill.maxTokens(skillInput) + 64,
      temperature: skill.temperature,
      maxRetries: 2,
      noThink: !!traits.noThinkSwitch,
      generate: async (args) => {
        run.attempts = outcomes.length + 1;
        const o = await generate(
          {
            messages: [
              { role: 'system', content: args.systemPrompt },
              { role: 'user', content: args.prompt },
            ],
            maxTokens: args.maxTokens,
            temperature: args.temperature,
            chatTemplateKwargs,
          },
          {
            onText(answer) {
              run.rawText = answer;
              onUpdate({ ...run });
            },
          }
        );
        outcomes.push(o);
        if (o.stopped) throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
        return { text: o.raw, inputTokens: o.tokensIn ?? 0, outputTokens: o.tokensOut ?? 0 };
      },
    });
    run.object = res.object;
    run.rawText = res.rawText;
    run.attempts = res.attempts;
    run.valid = true;
    run.issues = [];
    run.status = 'done';
  } catch (e) {
    run.status = 'failed';
    run.valid = false;
    if ((e as { name?: string }).name === 'AbortError') {
      run.issues = ['Stopped before the answer was complete.'];
    } else if (e instanceof StructuredOutputError) {
      run.rawText = e.rawText;
      const cause = (e as { cause?: unknown }).cause;
      run.issues = [`No valid answer after ${e.attempts} attempts.`, ...(cause ? [issueLine(errorText(cause)).slice(0, 400)] : [])];
      try {
        const v = validate(schema, extractJSON(e.rawText));
        run.object = extractJSON(e.rawText);
        run.issues = [`No valid answer after ${e.attempts} attempts.`, ...v.issues];
      } catch {
        /* nothing parseable */
      }
    } else {
      run.issues = [errorText(e)];
    }
  }
  onUpdate({ ...run });
  return { run, outcome: sumOutcomes(outcomes) };
}
