// In-browser benchmark: runs a GGUF through wllama inside THIS browser and reports real numbers.
// Same prompt and same method (time-to-first-token for prefill, inter-token rate for decode) as the
// native llama.cpp benchmark in slm/experiments/v2/bench_llamacpp.py, so the two are comparable.
//
//   bench.html?url=<gguf url>&threads=auto|1|N&gpu=0|99&n=96&reps=3&ctx=2048&tag=<free text>
//
// Results are rendered on the page (so a person holding a phone can read them) and POSTed to
// /api/bench on the same origin, where slm/app/serve.py appends them to bench_results.jsonl.
import { Wllama } from '@wllama/wllama';
import { WLLAMA_CONFIG_PATHS } from './config';

const q = new URLSearchParams(location.search);
const logEl = document.getElementById('log') as HTMLPreElement;
const lines: string[] = [];
const log = (s: string) => { lines.push(s); logEl.textContent = lines.join('\n'); };

const SENTENCE = 'The policyholder reported water damage in the kitchen after a pipe burst. ';
// long context (prefill) + an instruction that forces a long answer (decode runs the full max_tokens, never an early EOS)
const BODY = 'Claim notes:\n' + SENTENCE.repeat(30) + '\nWrite a detailed report of at least 300 words about this claim: causes, liability, next steps, and a checklist.';

async function gpuInfo() {
  const gpu = (navigator as any).gpu;
  if (!gpu) return { available: false };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { available: false, note: 'no adapter' };
    const i = adapter.info ?? {};
    return { available: true, vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description };
  } catch (e) { return { available: false, note: String(e) }; }
}

async function main() {
  const url = q.get('url');
  if (!url) { log('missing ?url=<gguf url>'); return; }
  const threads = q.get('threads') ?? 'auto';
  const nGpu = Number(q.get('gpu') ?? '0');
  const nPredict = Number(q.get('n') ?? '96');
  const reps = Number(q.get('reps') ?? '3');
  const nCtx = Number(q.get('ctx') ?? '2048');
  const env = {
    userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: (navigator as any).deviceMemory ?? null, crossOriginIsolated: self.crossOriginIsolated,
    isSecureContext: self.isSecureContext, webgpu: await gpuInfo(),
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
  };
  log(`isolated=${env.crossOriginIsolated} secure=${env.isSecureContext} cores=${env.hardwareConcurrency} webgpu=${env.webgpu.available}`);
  const result: any = { tag: q.get('tag') ?? '', url, file: url.split('/').pop(), params: { threads, nGpu, nPredict, reps, nCtx }, env, runs: [] };
  try {
    const wllama = new Wllama(WLLAMA_CONFIG_PATHS);
    let firstByte = 0, lastPct = -1, total = 0;
    const t0 = performance.now();
    await wllama.loadModelFromUrl(url, {
      n_ctx: nCtx, n_batch: 512, n_gpu_layers: nGpu,
      ...(threads === 'auto' ? {} : { n_threads: Number(threads) }),
      progressCallback: ({ loaded, total: t }: { loaded: number; total: number }) => {
        if (!firstByte) firstByte = performance.now(); total = t;
        const pct = Math.floor((100 * loaded) / t);
        if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; log(`download/load ${pct}%`); }
      },
    } as any);
    result.load = { totalMs: Math.round(performance.now() - t0), bytes: total, threadsUsed: wllama.getNumThreads(), multithread: wllama.isMultithread() };
    log(`loaded in ${result.load.totalMs} ms · threads=${result.load.threadsUsed} multithread=${result.load.multithread}`);

    await wllama.createChatCompletion({ messages: [{ role: 'user', content: 'Hello' }], max_tokens: 8 } as any);   // warm-up
    for (let i = 0; i < reps; i++) {
      const prompt = `[run ${i}] ` + BODY;                     // marker FIRST: defeats KV prefix reuse between reps
      const tStart = performance.now(); let tFirst = 0, n = 0, usage: any = null, timings: any = null;
      const stream: any = await wllama.createChatCompletion({ messages: [{ role: 'user', content: prompt }], max_tokens: nPredict, temperature: 0,
                                                              stream: true, timings_per_token: true, cache_prompt: false } as any);
      for await (const chunk of stream) {
        const d = chunk?.choices?.[0]?.delta;
        if (d?.content || d?.reasoning_content) { n++; if (!tFirst) tFirst = performance.now(); }
        if (chunk?.usage) usage = chunk.usage;
        if (chunk?.timings) timings = chunk.timings;
      }
      const tEnd = performance.now();
      const nPrompt = usage?.prompt_tokens ?? timings?.prompt_n ?? null;
      const run = {
        nPrompt, nGen: usage?.completion_tokens ?? n, ttftMs: Math.round(tFirst - tStart),
        // the engine's own numbers (llama.cpp timings) are authoritative...
        prefillTokS: timings ? +Number(timings.prompt_per_second).toFixed(1) : null,
        decodeTokS: timings ? +Number(timings.predicted_per_second).toFixed(1) : null,
        // ...and wall-clock from the page is the independent cross-check
        wallPrefillTokS: nPrompt ? +(nPrompt / ((tFirst - tStart) / 1000)).toFixed(1) : null,
        wallDecodeTokS: n > 1 ? +((n - 1) / ((tEnd - tFirst) / 1000)).toFixed(1) : null,
      };
      if (run.nGen < nPredict * 0.8) (run as any).warning = `short generation (${run.nGen}/${nPredict}) - decode rate unreliable`;
      result.runs.push(run); log(`run ${i}: prefill ${run.prefillTokS} (wall ${run.wallPrefillTokS}) tok/s · decode ${run.decodeTokS} (wall ${run.wallDecodeTokS}) tok/s · ttft ${run.ttftMs} ms · prompt ${nPrompt} tok`);
    }
    const mean = (k: string) => +(result.runs.reduce((a: number, r: any) => a + (r[k] ?? 0), 0) / result.runs.length).toFixed(1);
    result.summary = { prefillTokS: mean('prefillTokS'), decodeTokS: mean('decodeTokS'), wallDecodeTokS: mean('wallDecodeTokS'), ttftMs: mean('ttftMs') };
    result.ok = true;
    await wllama.exit();
  } catch (e: any) {
    result.ok = false; result.error = String(e?.message ?? e); log('ERROR ' + result.error);
  }
  log('\n' + JSON.stringify(result.summary ?? result.error, null, 1));
  try { await fetch('/api/bench', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }); log('posted to /api/bench'); }
  catch { log('(could not POST results — copy them from this page)'); }
  document.title = result.ok ? 'BENCH DONE' : 'BENCH FAILED';
}
main();
