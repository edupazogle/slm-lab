// The landing demo's engine. This module is only ever reached through a dynamic import(), so the
// landing page itself ships without wllama; the ~330 KB of glue and the WASM arrive when the visitor
// presses the button.
//
// What it does: load one small GGUF into this tab with wllama (llama.cpp in WebAssembly), then run ONE
// chat completion whose output is constrained by a JSON schema, so the text always parses. The note
// the visitor typed is handed to the WASM worker in this tab and to nothing else: there is no fetch,
// XHR, beacon or socket in this file that carries it.
import { Wllama, WllamaError } from '@wllama/wllama';
import { WLLAMA_COMPAT_CONFIG, WLLAMA_CONFIG_PATHS } from '../config';
import { readPartialObject } from './partial-json';

export const DEMO_MODEL = {
  url: 'https://huggingface.co/ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
  label: 'SmolLM2-360M-Instruct Q8_0',
  host: 'huggingface.co',
  bytes: 386404992,
};

export const FIELD_KEYS = ['policy_number', 'claimant_name', 'date_of_incident', 'what_was_damaged', 'amount_claimed_eur', 'phone_number'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldValues = Partial<Record<FieldKey, string>>;

// Property order is the order the grammar emits them in, which is the order the form is typed in.
// The key names do real work: the grammar makes the model write each key before its value, so a key
// like "what_was_damaged" is the instruction for that field. Compared on 2026-09-21 in headless
// Chromium with this model and the sample note: keys "claimant"/"damage" plus a written instruction
// ("damage is one short sentence") got "One short sentence" copied into the damage field, and an
// ISO-date pattern made the model invent "1499-09-20". These keys, a date copied as written and a
// two-sentence prompt got all six fields right, with a shorter prompt (144 tokens instead of 179).
const CLAIM_SCHEMA = {
  type: 'object',
  properties: {
    policy_number: { type: 'string', maxLength: 24 },
    claimant_name: { type: 'string', maxLength: 60 },
    date_of_incident: { type: 'string', maxLength: 30 },
    what_was_damaged: { type: 'string', maxLength: 140 },
    amount_claimed_eur: { type: 'number' },
    phone_number: { type: 'string', maxLength: 24 },
  },
  required: [...FIELD_KEYS],
  additionalProperties: false,
};

// Kept short on purpose: prompt processing in WebAssembly is slow, and every token here is waited for.
const SYSTEM_PROMPT = 'Copy facts from the claim note into the form. Every value must be copied from the note.';

export type FailureKind = 'no-wasm' | 'offline' | 'engine' | 'download' | 'storage' | 'memory' | 'inference' | 'unknown';

export class DemoFailure extends Error {
  kind: FailureKind;
  detail: string;
  constructor(kind: FailureKind, detail: string) {
    super(detail);
    this.kind = kind;
    this.detail = detail;
  }
}

export interface LoadInfo {
  fromCache: boolean;
  threads: number;
  multithread: boolean;
  loadMs: number;
}

export interface LoadCallbacks {
  /** called before anything is fetched, with whether the file is already in this browser's storage */
  onCacheChecked(fromCache: boolean): void;
  onBytes(loaded: number, total: number): void;
  /** the file is on the device; llama.cpp is now reading it into memory */
  onInitialising(): void;
}

export interface RunCallbacks {
  onPromptProgress(processed: number, total: number): void;
  onValues(values: FieldValues, active: FieldKey | null, tokens: number): void;
}

export interface RunResult {
  values: FieldValues;
  raw: string;
  parsed: boolean;
  finishReason: string | null;
  promptTokens: number | null;
  generatedTokens: number | null;
  /** llama.cpp's own timings for this run; null if the engine did not report them */
  decodeTokS: number | null;
  prefillTokS: number | null;
  wallMs: number;
}

let instance: Wllama | null = null;
let loaded = false;

export function canRunWasm(): boolean {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function' && typeof Worker === 'function';
  } catch {
    return false;
  }
}

function classify(err: unknown, gotBytes: boolean): DemoFailure {
  if (err instanceof DemoFailure) return err;
  const e = err as { name?: string; message?: string; type?: string } | null;
  const name = String(e?.name ?? '');
  const msg = String(e?.message ?? err ?? '');
  const hay = `${name} ${msg}`.toLowerCase();
  if (/quota|no space|storage.*full|not enough (disk|storage)/.test(hay)) return new DemoFailure('storage', msg);
  if (/out of memory|oom|memory access|cannot enlarge|allocat|alloc failed|rangeerror|array buffer|wasm memory/.test(hay))
    return new DemoFailure('memory', msg);
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !loaded) return new DemoFailure('offline', msg);
  if (
    (err instanceof WllamaError && err.type === 'download_error') ||
    /failed to fetch|networkerror|network error|load failed|http \d{3}|err_|aborted|terminated|connection/.test(hay)
  )
    return new DemoFailure('download', msg);
  if (err instanceof WllamaError && err.type === 'inference_error') return new DemoFailure('inference', msg);
  // an error while bytes were still arriving is almost always the transfer
  if (gotBytes && !loaded) return new DemoFailure('download', msg);
  return new DemoFailure('unknown', msg);
}

async function reset() {
  const old = instance;
  instance = null;
  loaded = false;
  if (old) {
    try {
      await old.exit();
    } catch {
      /* the worker may already be gone */
    }
  }
}

export function isLoaded(): boolean {
  return loaded;
}

export async function loadDemoModel(cb: LoadCallbacks): Promise<LoadInfo> {
  if (!canRunWasm()) throw new DemoFailure('no-wasm', 'WebAssembly or Web Workers are not available');
  if (instance && loaded) {
    return { fromCache: true, threads: instance.getNumThreads(), multithread: instance.isMultithread(), loadMs: 0 };
  }
  await reset();
  const t0 = performance.now();
  let sawPartialBytes = false;
  try {
    const wllama = new Wllama(WLLAMA_CONFIG_PATHS, { suppressNativeLog: true });
    // Safari and other browsers without JSPI need the "compat" build. Left at its default, wllama
    // fetches that build from a public CDN, which this page must never do: it is self-hosted here.
    if (WLLAMA_COMPAT_CONFIG !== 'default') wllama.setCompat(WLLAMA_COMPAT_CONFIG);
    else wllama.setCompat(null);
    instance = wllama;

    let fromCache = false;
    try {
      const models = await wllama.modelManager.getModels();
      fromCache = models.some((m) => m.url === DEMO_MODEL.url && m.size > 0);
    } catch {
      fromCache = false; // storage unavailable (private window): wllama will say so itself if it matters
    }
    cb.onCacheChecked(fromCache);
    if (!fromCache && typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new DemoFailure('offline', 'navigator.onLine is false and the model is not in storage');

    let initialising = false;
    await wllama.loadModelFromUrl(DEMO_MODEL.url, {
      n_ctx: 2048,
      n_batch: 256,
      n_gpu_layers: 0, // CPU in WebAssembly: the one path that behaves the same on every device
      progressCallback: ({ loaded: got, total }) => {
        if (got < total) sawPartialBytes = true;
        cb.onBytes(got, total || DEMO_MODEL.bytes);
        if (got >= total && total > 0 && !initialising) {
          initialising = true;
          cb.onInitialising();
        }
      },
    });
    loaded = true;
    return {
      fromCache,
      threads: wllama.getNumThreads(),
      multithread: wllama.isMultithread(),
      loadMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    const failure = classify(err, sawPartialBytes);
    await reset();
    throw failure;
  }
}

function pickValues(source: Record<string, unknown>): FieldValues {
  const out: FieldValues = {};
  for (const key of FIELD_KEYS) {
    const v = source[key];
    if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}

export async function extractClaim(note: string, cb: RunCallbacks): Promise<RunResult> {
  const wllama = instance;
  if (!wllama || !loaded) throw new DemoFailure('unknown', 'The model is not loaded');
  const t0 = performance.now();
  let raw = '';
  let tokens = 0;
  let finishReason: string | null = null;
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
  let timings: { prompt_n: number; prompt_per_second: number; predicted_n: number; predicted_per_second: number } | null = null;
  try {
    const stream = await wllama.createChatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Note:\n${note.trim()}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'claim_form', schema: CLAIM_SCHEMA, strict: true } },
      temperature: 0,
      max_tokens: 200,
      stream: true,
      timings_per_token: true,
      return_progress: true,
      cache_prompt: false, // every run reads the whole note again, so the speeds shown are for the whole job
    });
    for await (const chunk of stream) {
      if (chunk.prompt_progress) cb.onPromptProgress(chunk.prompt_progress.processed, chunk.prompt_progress.total);
      const choice = chunk.choices?.[0];
      const piece = choice?.delta?.content;
      if (piece) {
        raw += piece;
        tokens += 1;
        const partial = readPartialObject(raw);
        const active = (FIELD_KEYS as readonly string[]).includes(partial.active ?? '') ? (partial.active as FieldKey) : null;
        cb.onValues(pickValues(partial.values), active, tokens);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.timings) timings = chunk.timings;
    }
  } catch (err) {
    throw classify(err, false);
  }

  let values: FieldValues;
  let parsed = false;
  try {
    values = pickValues(JSON.parse(raw) as Record<string, unknown>);
    parsed = true;
  } catch {
    // cut off by max_tokens: keep what was written, and say so in the UI
    values = pickValues(readPartialObject(raw).values);
  }
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
  return {
    values,
    raw,
    parsed,
    finishReason,
    promptTokens: num(usage?.prompt_tokens) ?? num(timings?.prompt_n),
    generatedTokens: num(usage?.completion_tokens) ?? num(timings?.predicted_n) ?? (tokens || null),
    decodeTokS: num(timings?.predicted_per_second),
    prefillTokS: num(timings?.prompt_per_second),
    wallMs: Math.round(performance.now() - t0),
  };
}

export async function unloadDemoModel(): Promise<void> {
  await reset();
}
