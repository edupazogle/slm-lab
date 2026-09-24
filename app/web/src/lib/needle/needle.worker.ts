/// <reference lib="webworker" />
// needle3 in a Web Worker: the 688 KB WebAssembly engine + the 35 MB .cact model, driven through its C API.
//
// Why it matters for phones: it is single-threaded and needs no SharedArrayBuffer, so unlike the
// multi-threaded llama.cpp build it runs at full speed without cross-origin isolation — inside an Android
// WebView, or on a phone that reached a laptop over plain http. The engine's JS glue contains no network
// code at all; the only requests are this worker fetching the engine's .wasm from this site, and the model once,
// after which it is cached.
//
// The engine owns ONE process-global conversation, so every extraction resets it first: independent
// requests must never share context (phase 1 of this project published wrong results by reusing one).

declare const self: DedicatedWorkerGlobalScope;
declare function createNeedle(arg: Record<string, unknown>): Promise<NeedleModule>;

interface NeedleModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _needle_load(p: number, n: bigint): number;
  _needle_init(sys: number, tools: number, idx: number): number;
  _needle_complete(input: number, maxNew: number, out: number, cap: number): number;
  _needle_reset(): void;
  HEAPU8: Uint8Array;
  UTF8ToString(p: number): string;
}

export type NeedleRequest =
  | { id: number; type: 'load'; engineBase: string; modelUrl: string }
  | { id: number; type: 'run'; tools: unknown[]; system?: string; input: string; maxNewTokens?: number };

export type NeedleEvent =
  | { id: number; type: 'progress'; loaded: number; total: number; fromCache: boolean }
  | { id: number; type: 'loaded'; loadMs: number; bytes: number; fromCache: boolean }
  | { id: number; type: 'result'; ms: number; prefixTokens: number; tokens: number; raw: string }
  | { id: number; type: 'error'; message: string };

const CACHE = 'slm-lab-needle-v1';
const OUT_CAP = 1 << 16;
let M: NeedleModule | null = null;
let toolsKey = '';
let prefixTokens = 0;

const post = (e: NeedleEvent) => self.postMessage(e);

function cstr(s: string): number {
  const bytes = new TextEncoder().encode(s);
  const p = M!._malloc(bytes.length + 1);
  M!.HEAPU8.set(bytes, p);
  M!.HEAPU8[p + bytes.length] = 0;
  return p;
}

async function fetchModel(id: number, url: string): Promise<{ buf: Uint8Array; fromCache: boolean }> {
  const cache = 'caches' in self ? await caches.open(CACHE).catch(() => null) : null;
  const hit = cache ? await cache.match(url) : undefined;
  const res = hit ?? (await fetch(url));
  if (!res.ok || !res.body) throw new Error(`model download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  // tee: one branch to the cache, one to memory with progress
  const toCache = !hit && cache ? res.clone() : null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ id, type: 'progress', loaded, total: total || loaded, fromCache: !!hit });
  }
  if (toCache) await cache!.put(url, toCache).catch(() => undefined); // quota errors must not fail the run
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return { buf, fromCache: !!hit };
}

self.onmessage = async (ev: MessageEvent<NeedleRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      const t0 = performance.now();
      if (!M) {
        importScripts(msg.engineBase + 'needle.js'); // classic Emscripten factory: defines createNeedle on the worker global
        // This glue ignores Module.locateFile and looks for needle.wasm next to the WORKER script (assets/), where the
        // build does not put it: measured, a 404 and "expected magic word" on every run. It does honour wasmBinary.
        const wasm = await fetch(msg.engineBase + 'needle.wasm');
        if (!wasm.ok) throw new Error(`engine download failed: HTTP ${wasm.status}`);
        M = await createNeedle({ wasmBinary: await wasm.arrayBuffer(), print: () => {}, printErr: () => {} });
        const { buf, fromCache } = await fetchModel(msg.id, msg.modelUrl);
        const p = M._malloc(buf.length);
        M.HEAPU8.set(buf, p);
        const rc = M._needle_load(p, BigInt(buf.length));
        M._free(p);
        if (rc < 0) throw new Error(`needle_load failed (${rc}): this model file does not match the engine version`);
        post({ id: msg.id, type: 'loaded', loadMs: Math.round(performance.now() - t0), bytes: buf.length, fromCache });
      } else {
        post({ id: msg.id, type: 'loaded', loadMs: 0, bytes: 0, fromCache: true });
      }
      return;
    }
    if (!M) throw new Error('needle engine is not loaded yet');
    const key = JSON.stringify([msg.system ?? '', msg.tools]);
    if (key !== toolsKey) {
      // a new schema means a new static prefix; the engine compiles its decode grammar from it
      const sys = msg.system ? cstr(msg.system) : 0;
      const tj = cstr(JSON.stringify(msg.tools));
      const rc = M._needle_init(sys, tj, 0);
      if (sys) M._free(sys);
      M._free(tj);
      if (rc < 0) throw new Error(`needle_init failed (${rc}): the schema is too long for the model's context, shorten the descriptions`);
      toolsKey = key;
      prefixTokens = rc;
    }
    M._needle_reset(); // never let one request see another's conversation
    const inp = cstr(msg.input);
    const out = M._malloc(OUT_CAP);
    const t1 = performance.now();
    const n = M._needle_complete(inp, msg.maxNewTokens ?? 384, out, OUT_CAP);
    const ms = performance.now() - t1;
    const raw = n >= 0 ? M.UTF8ToString(out) : '';
    M._free(inp);
    M._free(out);
    if (n < 0) throw new Error(`needle_complete failed (${n})`);
    post({ id: msg.id, type: 'result', ms: Math.round(ms), prefixTokens, tokens: n, raw });
  } catch (e) {
    post({ id: msg.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
