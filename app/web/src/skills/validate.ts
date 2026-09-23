// Turn a Zod schema into the JSON Schema llama.cpp compiles into a grammar, and a failed parse into plain lines that say
// exactly which field failed and why.
import { z } from 'zod';

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export interface Validation<T> {
  valid: boolean;
  value?: T;
  issues: string[];
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): Validation<T> {
  const res = schema.safeParse(value);
  if (res.success) return { valid: true, value: res.data, issues: [] };
  const issues = res.error.issues.slice(0, 12).map((i) => {
    const path = i.path.length ? i.path.map((p) => (typeof p === 'number' ? `[${p}]` : String(p))).join('.').replace(/\.\[/g, '[') : 'the answer';
    return `${path}: ${i.message}`;
  });
  if (res.error.issues.length > 12) issues.push(`and ${res.error.issues.length - 12} more`);
  return { valid: false, issues };
}
