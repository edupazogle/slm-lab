// Main-thread API for the needle3 specialist engine (see needle.worker.ts).
//
// needle3 is not a chat model: it turns text into ONE schema-conforming record (or a tool call), and
// refuses with an empty list rather than guess. Its decode grammar is compiled from the schema, so the
// JSON always parses. 35 MB of weights against 386 MB for the smallest chat model in the ladder.
import type { NeedleEvent, NeedleRequest } from './needle.worker';

export const NEEDLE_MODEL_URL = 'https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact';
export const NEEDLE_MODEL_MB = 35;

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

export interface NeedleExtraction {
  /** the record, or null when the engine withheld it or nothing matched */
  fields: Record<string, unknown> | null;
  /** true when the engine produced a record but withheld it (low confidence or an ungrounded required field): show it for confirmation, do not act on it */
  withheld: boolean;
  /** calibrated on English by the vendor; treat a low score on other languages as "unknown", not "wrong" */
  confidence: number | null;
  reasoning: string;
  ms: number;
  tokens: number;
  raw: string;
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (e: NeedleEvent) => void; reject: (e: Error) => void; onProgress?: (l: number, t: number, c: boolean) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  // classic worker on purpose: the engine's Emscripten glue is a classic script loaded with importScripts
  worker = new Worker(new URL('./needle.worker.ts', import.meta.url), { type: 'classic', name: 'needle3' });
  worker.onmessage = (ev: MessageEvent<NeedleEvent>) => {
    const e = ev.data;
    const w = waiting.get(e.id);
    if (!w) return;
    if (e.type === 'progress') return w.onProgress?.(e.loaded, e.total, e.fromCache);
    waiting.delete(e.id);
    if (e.type === 'error') w.reject(new Error(e.message));
    else w.resolve(e);
  };
  worker.onerror = (ev) => {
    for (const w of waiting.values()) w.reject(new Error(ev.message || 'needle worker crashed'));
    waiting.clear();
    worker = null;
  };
  return worker;
}

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;
function call(req: Distribute<NeedleRequest>, onProgress?: (loaded: number, total: number, fromCache: boolean) => void): Promise<NeedleEvent> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ ...req, id });
  });
}

export async function loadNeedle(onProgress?: (loaded: number, total: number, fromCache: boolean) => void) {
  const engineBase = new URL('needle/', document.baseURI).href;
  const e = await call({ type: 'load', engineBase, modelUrl: NEEDLE_MODEL_URL }, onProgress);
  if (e.type !== 'loaded') throw new Error('unexpected reply from the needle worker');
  return { loadMs: e.loadMs, bytes: e.bytes, fromCache: e.fromCache };
}

/** Extract one record of `schema` from `text`. `name` and `description` are read by the model literally: keep them plain. */
export async function needleExtract(
  name: string, description: string, schema: JsonSchemaObject, text: string, system?: string
): Promise<NeedleExtraction> {
  const tools = [{ name, description, parameters: schema }];
  const e = await call({ type: 'run', tools, system, input: text });
  if (e.type !== 'result') throw new Error('unexpected reply from the needle worker');
  let doc: any = null;
  try { doc = JSON.parse(e.raw); } catch { /* the engine guarantees JSON; keep raw for the error surface */ }
  const live = doc?.function_calls?.[0]?.arguments ?? null;
  const held = doc?.suppressed_calls?.[0]?.arguments ?? null;
  return {
    fields: live ?? held, withheld: !live && !!held,
    confidence: typeof doc?.confidence === 'number' ? doc.confidence : null,
    reasoning: doc?.reasoning ?? '', ms: e.ms, tokens: e.tokens, raw: e.raw,
  };
}

export function disposeNeedle() {
  worker?.terminate();
  worker = null;
  waiting.clear();
}
