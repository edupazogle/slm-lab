// Lifted from ThalesGroup/rust-coding-dojo @ 0c6340c — academy/src/llm/localWllama.ts (Apache-2.0, Copyright 2025 ThalesGroup).
// THIS FILE HAS BEEN MODIFIED from the original (Apache-2.0 section 4(b)). Changes, 2026-09-21:
//  - the Rust-kata prompt text, the "Ferris" chat function and the hard-coded LFM2.5 model were removed; the model
//    source and load parameters are arguments;
//  - loads by URL (`loadModelFromUrl`, still `useCache: true`) instead of `loadModelFromHF`, because the HF lookup needs
//    the network on every call and this app must start offline from its cache;
//  - the load block that was copy-pasted twice for the retry is one function; the retry clears ONLY this model's cached
//    files (the original cleared every cached model) and is a separate, explicit call (`clearCacheAndRetry`) so a phone
//    never silently re-downloads hundreds of megabytes after an out-of-memory failure;
//  - the module-level singleton, the sticky rejected `loadPromise` and the polled `downloadProgress` variable are gone:
//    the caller passes an instance factory and receives progress through a callback;
//  - the WebGPU probe is stricter than `wllama.isSupportWebGPU()` (which only checks that `navigator.gpu` exists): it
//    requests an adapter and refuses software adapters (SwiftShader / fallback), and a failed GPU load falls back to CPU.
import type { LoadModelParams, Wllama } from '@wllama/wllama';

export interface DownloadProgress {
  phase: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  loaded: number;
  total: number;
  pct: number;
}

export interface ModelSourceUrls {
  url: string;
  mmprojUrl?: string;
}

export interface GpuProbe {
  /** `navigator.gpu` exists (this is all `wllama.isSupportWebGPU()` checks). */
  apiPresent: boolean;
  /** An adapter was returned by `requestAdapter()`. */
  adapterPresent: boolean;
  /** The adapter is a software rasteriser (SwiftShader, llvmpipe, "fallback adapter"), useless for inference. */
  software: boolean;
  /** True only for a real hardware adapter: the only case where offloading layers is worth trying. */
  usable: boolean;
  vendor?: string;
  architecture?: string;
  description?: string;
  note?: string;
}

type AdapterLike = {
  info?: { vendor?: string; architecture?: string; device?: string; description?: string; isFallbackAdapter?: boolean };
  isFallbackAdapter?: boolean;
};

let gpuProbePromise: Promise<GpuProbe> | null = null;

/** Probe WebGPU once per page. Never throws. */
export function probeWebGPU(): Promise<GpuProbe> {
  gpuProbePromise ??= (async (): Promise<GpuProbe> => {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<AdapterLike | null> } }).gpu;
    if (!gpu) {
      return { apiPresent: false, adapterPresent: false, software: false, usable: false, note: 'This browser has no WebGPU.' };
    }
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        return { apiPresent: true, adapterPresent: false, software: false, usable: false, note: 'WebGPU is present but no graphics adapter was offered.' };
      }
      const info = adapter.info ?? {};
      const text = `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.device ?? ''} ${info.description ?? ''}`.toLowerCase();
      const software =
        adapter.isFallbackAdapter === true ||
        info.isFallbackAdapter === true ||
        /swiftshader|llvmpipe|software|basic render/.test(text);
      return {
        apiPresent: true,
        adapterPresent: true,
        software,
        usable: !software,
        vendor: info.vendor || undefined,
        architecture: info.architecture || undefined,
        description: info.description || undefined,
        note: software ? 'The only adapter is a software renderer, so the processor is used instead.' : undefined,
      };
    } catch (e) {
      return { apiPresent: true, adapterPresent: false, software: false, usable: false, note: `WebGPU probe failed: ${String((e as Error)?.message ?? e)}` };
    }
  })();
  return gpuProbePromise;
}

/**
 * Thread-count heuristic, unchanged from the original: one thread without cross-origin isolation (no
 * SharedArrayBuffer), otherwise half the logical cores clamped to 2..8. Half, because `hardwareConcurrency` counts
 * SMT siblings: a machine reporting 8 usually has 4 physical cores, and 4 threads is what runs fastest there.
 */
export function getThreadCount() {
  if (!crossOriginIsolated) return 1
  return Math.max(2, Math.min(8, Math.floor((navigator.hardwareConcurrency || 4) / 2)))
}

export function getModelInfo(wllama: Wllama | null, gpuLayers: number) {
  return {
    threads: wllama?.isModelLoaded() ? wllama.getNumThreads() : getThreadCount(),
    multithread: wllama?.isModelLoaded() ? wllama.isMultithread() : false,
    webgpu: wllama?.isSupportWebGPU() ?? false,
    gpuLayers,
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
  }
}

export interface LoadRequest {
  /** Makes a fresh Wllama. A Wllama that failed a load cannot be reused ("Module is already initialized"). */
  createInstance: () => Wllama;
  source: ModelSourceUrls;
  /** n_ctx, n_batch, n_threads (omit or <1 for the heuristic), and the GPU wish. */
  params: Pick<LoadModelParams, 'n_ctx' | 'n_batch'> & { n_threads?: number; useGpu: boolean };
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
}

export interface LoadResult {
  wllama: Wllama;
  gpuLayers: number;
  /** Set when a GPU load was tried first and failed; the model then loaded on the processor. */
  gpuFallbackReason?: string;
}

async function loadOnce(req: LoadRequest, gpuLayers: number): Promise<Wllama> {
  const wllama = req.createInstance();
  const threads = req.params.n_threads && req.params.n_threads > 0 ? req.params.n_threads : getThreadCount();
  req.onProgress?.({ phase: 'downloading', loaded: 0, total: 0, pct: 0 });
  try {
    await wllama.loadModelFromUrl(
      req.source.mmprojUrl ? { url: req.source.url, mmprojUrl: req.source.mmprojUrl } : req.source.url,
      {
        n_ctx: req.params.n_ctx,
        n_batch: req.params.n_batch,
        n_threads: threads,
        n_gpu_layers: gpuLayers,
        useCache: true,
        signal: req.signal,
        progressCallback: (opts) => {
          const done = opts.total > 0 && opts.loaded >= opts.total;
          req.onProgress?.({
            phase: done ? 'loading' : 'downloading',
            loaded: opts.loaded,
            total: opts.total,
            pct: Math.round((opts.loaded / (opts.total || 1)) * 100),
          });
        },
      },
    );
  } catch (err) {
    // free the worker and its heap before anyone retries
    try { await wllama.exit(); } catch { /* ignore */ }
    throw err;
  }
  return wllama;
}

/**
 * Load from the cache, downloading first when needed. When the GPU was wished for and the probe says it is usable, all
 * layers are offloaded (99); if that load fails the model is loaded again on the processor instead of failing.
 */
export async function loadModel(req: LoadRequest): Promise<LoadResult> {
  const gpu = req.params.useGpu ? await probeWebGPU() : null;
  const gpuLayers = gpu?.usable ? 99 : 0;
  try {
    const wllama = await loadOnce(req, gpuLayers);
    req.onProgress?.({ phase: 'ready', loaded: 1, total: 1, pct: 100 });
    return { wllama, gpuLayers };
  } catch (err) {
    if (gpuLayers > 0 && !req.signal?.aborted) {
      console.warn('[engine] GPU load failed, loading on the processor instead', err);
      try {
        const wllama = await loadOnce(req, 0);
        req.onProgress?.({ phase: 'ready', loaded: 1, total: 1, pct: 100 });
        return { wllama, gpuLayers: 0, gpuFallbackReason: String((err as Error)?.message ?? err) };
      } catch (err2) {
        req.onProgress?.({ phase: 'error', loaded: 0, total: 0, pct: 0 });
        throw err2;
      }
    }
    req.onProgress?.({ phase: 'error', loaded: 0, total: 0, pct: 0 });
    throw err;
  }
}

/**
 * The original's recovery path: if the first attempt failed, clear the cache and try once more with a fresh download.
 * A corrupt cached file otherwise blocks the chat until the user clears site data.
 */
export async function clearCacheAndRetry(req: LoadRequest): Promise<LoadResult> {
  const probe = req.createInstance();
  try {
    const cached = await probe.modelManager.getModels({ includeInvalid: true });
    for (const m of cached) {
      if (m.url === req.source.url) await m.remove();
    }
  } catch { /* ignore */ }
  try { await probe.exit(); } catch { /* ignore */ }
  return loadModel(req);
}
