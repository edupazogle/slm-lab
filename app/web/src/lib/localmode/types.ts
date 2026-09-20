// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — packages/core/src/generation/types.ts (MIT, Copyright (c) 2025 LocalMode).
// Changes: excerpt only (ObjectOutputMode, ObjectSchema, GenerateObjectOptions, GenerateObjectResult); the `model`
// option is replaced by an injected `generate` function so the helper drives our wllama engine instead of LocalMode's
// LanguageModel interface; `noThink` added; usage is reduced to the token counts our engine reports.

/**
 * Output mode for structured generation.
 *
 * - `'json'` — Generate a JSON object matching the schema (default)
 * - `'array'` — Generate a JSON array of objects matching the schema
 * - `'enum'` — Generate one value from a set of allowed values
 */
export type ObjectOutputMode = 'json' | 'array' | 'enum';

/**
 * Schema definition for structured output.
 * Accepts a Zod schema (via jsonSchema()) or any object with parse + jsonSchema.
 *
 * @typeParam T - The type that the schema validates to
 */
export interface ObjectSchema<T = unknown> {
  /** Validate and parse raw value against the schema */
  parse: (value: unknown) => T;

  /** JSON Schema representation (for prompt construction) */
  jsonSchema: Record<string, unknown>;

  /** Human-readable description of the schema */
  description?: string;
}

/** What one call of the injected text generator must return. */
export interface GenerateTextResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** The injected text generator: one system prompt + one user prompt in, text out. */
export type GenerateTextFn = (args: {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  abortSignal?: AbortSignal;
}) => Promise<GenerateTextResult>;

/**
 * Options for the generateObject() function.
 *
 * @typeParam T - The expected output type defined by the schema
 */
export interface GenerateObjectOptions<T> {
  /** Text generator to drive (replaces LocalMode's `model`) */
  generate: GenerateTextFn;

  /** Schema defining the expected output structure */
  schema: ObjectSchema<T>;

  /** The prompt describing what to extract/generate */
  prompt: string;

  /** Optional system prompt (appended to schema instructions) */
  systemPrompt?: string;

  /** Output mode (default: 'json') */
  mode?: ObjectOutputMode;

  /** Maximum tokens to generate (default: 1024) */
  maxTokens?: number;

  /** Temperature for sampling (default: 0 for deterministic output) */
  temperature?: number;

  /** Maximum validation+retry attempts (default: 3) */
  maxRetries?: number;

  /** Send Qwen3's `/no_think` soft switch (only for families that understand it) */
  noThink?: boolean;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Result from the generateObject() function.
 *
 * @typeParam T - The parsed object type
 */
export interface GenerateObjectResult<T> {
  /** The parsed, validated object */
  object: T;

  /** Raw text from the model (before parsing) */
  rawText: string;

  /** Usage information (includes all retry attempts) */
  usage: { inputTokens: number; outputTokens: number };

  /** Number of attempts needed (1 = first try worked) */
  attempts: number;
}

/**
 * Error in structured output generation (schema validation failures).
 * (Lifted from packages/core/src/errors/index.ts, flattened onto Error.)
 */
export class StructuredOutputError extends Error {
  /** Number of attempts made before failure */
  readonly attempts: number;
  readonly hint?: string;
  /** Raw text of the last attempt, so the UI can show exactly what the model wrote */
  readonly rawText: string;

  constructor(
    message: string,
    options?: { hint?: string; cause?: Error; attempts?: number; rawText?: string }
  ) {
    super(message);
    this.name = 'StructuredOutputError';
    this.attempts = options?.attempts ?? 0;
    this.hint = options?.hint;
    this.rawText = options?.rawText ?? '';
    if (options?.cause) (this as { cause?: unknown }).cause = options.cause;
  }
}
