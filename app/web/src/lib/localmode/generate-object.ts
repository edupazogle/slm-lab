// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — packages/core/src/generation/generate-object.ts (MIT, Copyright (c) 2025 LocalMode).
// Changes: drives an injected `generate` function (our wllama engine) instead of LocalMode's generateText/LanguageModel;
// `/no_think` is opt-in (`noThink`) instead of always appended; StructuredOutputError is imported statically from ./types
// and carries the last raw text; usage reduced to token counts. The retry-with-self-correction loop is unchanged.
// In this app it is the FALLBACK path: Skills first ask the engine for grammar-constrained decoding (response_format
// json_schema) and only come here when the model or build rejects that.
/**
 * Structured Object Generation Function
 *
 * Generate typed, validated JSON objects from language models.
 * Builds on top of generateText() with schema-aware prompting,
 * JSON extraction, validation, and retry with self-correction.
 *
 * @packageDocumentation
 */

import type { GenerateObjectOptions, GenerateObjectResult } from './types';
import { StructuredOutputError } from './types';
import { buildStructuredPrompt, extractJSON } from './schema';

/**
 * Generate a typed, validated JSON object using a language model.
 *
 * Instructs the model to output JSON matching the provided schema,
 * then extracts, parses, and validates the result. On validation failure,
 * retries with self-correction feedback (up to maxRetries attempts).
 *
 * @param options - Generation options including model, schema, and prompt
 * @returns Promise with the parsed object, raw text, usage, and metadata
 *
 * @example Basic usage
 * ```ts
 * import { generateObject, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const { object } = await generateObject({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   schema: jsonSchema(z.object({
 *     name: z.string(),
 *     email: z.string(),
 *   })),
 *   prompt: 'Extract contact info from: "Hi, I\'m Sarah at sarah@acme.co"',
 * });
 *
 * console.log(object.name);  // "Sarah"
 * console.log(object.email); // "sarah@acme.co"
 * ```
 *
 * @example With array mode
 * ```ts
 * const { object } = await generateObject({
 *   model,
 *   schema: jsonSchema(z.array(z.object({ item: z.string(), qty: z.number() }))),
 *   prompt: 'Generate a shopping list for a BBQ party',
 *   mode: 'array',
 * });
 * ```
 *
 * @example With cancellation
 * ```ts
 * const controller = new AbortController();
 * const promise = generateObject({ model, schema, prompt, abortSignal: controller.signal });
 * controller.abort();
 * ```
 *
 * @throws {StructuredOutputError} If all retry attempts fail validation
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link streamObject} for streaming partial objects
 * @see {@link jsonSchema} for converting Zod schemas
 */
export async function generateObject<T>(
  options: GenerateObjectOptions<T>
): Promise<GenerateObjectResult<T>> {
  const {
    generate,
    schema,
    prompt,
    systemPrompt,
    mode = 'json',
    maxTokens = 1024,
    temperature = 0,
    maxRetries = 3,
    noThink = false,
    abortSignal,
  } = options;

  abortSignal?.throwIfAborted();

  const structuredSystemPrompt = buildStructuredPrompt(schema, mode, systemPrompt, noThink);

  let lastError: Error | null = null;
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let lastRawText = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    // On retry, append validation error for self-correction
    const retryHint =
      lastError && attempt > 1
        ? `\n\nYour previous response failed validation: ${lastError.message}\nPlease fix the JSON and try again.`
        : '';

    const result = await generate({
      // `/no_think` is appended to the USER prompt in addition to the system
      // prompt (buildStructuredPrompt): Qwen3's thinking soft switch is
      // detected in USER messages by its chat template — engines with a baked
      // template (e.g. LiteRT .litertlm builds) ignore the system-prompt
      // copy, and unsuppressed thinking overruns the token budget mid-<think>
      // so no JSON is ever emitted. Verified against LiteRT qwen3-0.6B:
      // system-prompt-only → always thinks; user-prompt switch → clean JSON.
      prompt: (noThink ? `${prompt}\n/no_think` : prompt) + retryHint,
      systemPrompt: structuredSystemPrompt,
      maxTokens,
      temperature,
      abortSignal,
    });

    // Accumulate usage across attempts
    totalUsage.inputTokens += result.inputTokens;
    totalUsage.outputTokens += result.outputTokens;
    lastRawText = result.text;

    try {
      const raw = extractJSON(result.text);
      const parsed = schema.parse(raw);

      return {
        object: parsed,
        rawText: result.text,
        usage: totalUsage,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort
      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw new StructuredOutputError(
          `Failed to generate valid object after ${maxRetries} attempts`,
          {
            hint: `Last validation error: ${lastError.message}. Raw output: "${lastRawText.slice(0, 200)}"`,
            cause: lastError,
            attempts: maxRetries,
            rawText: lastRawText,
          }
        );
      }
    }
  }

  // Should not reach here
  throw new StructuredOutputError('generateObject failed unexpectedly', {
    cause: lastError ?? undefined,
  });
}
