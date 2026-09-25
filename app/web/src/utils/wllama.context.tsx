// The engine provider. Started from the vendored wllama examples/main `utils/wllama.context.tsx` (MIT, ngxson/wllama
// @ 46af429), which already had the awkward parts right: model list merged with cache state, per-URL download progress,
// a fresh Wllama instance after a failed load. Changed here: loading goes through the lifted Thales loader (stricter
// WebGPU probe, GPU-to-CPU fallback, exit on failure); errors become a notice instead of alert(); downloads report bytes
// and can be cancelled; generation is measured (engine.ts) and cancellable with a real AbortSignal; the module-level
// stop flag and the per-token localStorage writes are gone.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Model, ModelManager, Wllama } from '@wllama/wllama';
import {
  DEFAULT_INFERENCE_PARAMS,
  MAX_CONTEXT,
  WLLAMA_COMPAT_CONFIG,
  WLLAMA_CONFIG_PATHS,
} from '../config';
import { DebugLogger, WllamaStorage, errorText } from './utils';
import { InferenceParams, ModelState, RuntimeInfo } from './types';
import { verifyCustomModel } from './custom-models';
import {
  DisplayedModel,
  getDisplayedModels,
  getUserAddedModels,
  updateUserAddedModels,
} from './displayed-model';
import { loadModel as loadWithFallback } from '../lib/thales/localWllama';
import { streamChat, type StreamCallbacks, type StreamOutcome, type StreamRequest } from './engine';

export interface LoadProgress {
  url: string;
  phase: 'downloading' | 'loading';
  loaded: number;
  total: number;
}

interface WllamaContextValue {
  /**
   * False on a plain-http page that is not localhost. Measured, not assumed: without a secure context the browser
   * does not expose navigator.storage, wllama finds no storage backend and `new Wllama()` throws, so nothing can be
   * downloaded or loaded at all. The UI says so instead of letting an opaque error escape.
   */
  secureContext: boolean;
  models: DisplayedModel[];
  /** Resolves true when the file is now in this browser's storage; a failure is shown as a notice and resolves false. */
  downloadModel(model: DisplayedModel): Promise<boolean>;
  cancelDownload(url: string): void;
  removeCachedModel(model: DisplayedModel): Promise<void>;
  removeAllCachedModels(): Promise<void>;
  isDownloading: boolean;
  /** bumps whenever the cache changes, so storage meters can re-read the estimate */
  storageTick: number;

  loadedModel?: DisplayedModel;
  runtime?: RuntimeInfo;
  loadProgress: LoadProgress | null;
  loadModel(model: DisplayedModel): Promise<void>;
  unloadModel(): Promise<void>;
  lastModelUrl: string | null;

  addCustomModel(url: string, mmprojUrl?: string): Promise<void>;
  removeCustomModel(model: DisplayedModel): void;

  params: InferenceParams;
  setParams(params: InferenceParams): void;

  /** Run one measured, streamed completion on the loaded model. Throws when no model is loaded. */
  generate(req: StreamRequest, cb?: StreamCallbacks): Promise<StreamOutcome>;
  stop(): void;
  isGenerating: boolean;

  notice: string | null;
  setNotice(n: string | null): void;
}

const WllamaContext = createContext<WllamaContextValue | null>(null);

const createWllamaInstance = () => {
  const instance = new Wllama(WLLAMA_CONFIG_PATHS, { logger: DebugLogger, allowOffline: true });
  // Browsers without JSPI need the "compat" build. Left at its default, wllama fetches it from a public CDN; this app
  // serves its own copy, and when that copy is missing it refuses the CDN rather than make a third-party request.
  instance.setCompat(WLLAMA_COMPAT_CONFIG !== 'default' ? WLLAMA_COMPAT_CONFIG : null);
  return instance;
};

// Created on first use, not at import: the constructor throws "No supported storage backend found" when the browser has
// no OPFS (any plain-http page that is not localhost, older Safari), and a throw at import left chat.html blank instead
// of showing the notice below. Every caller already catches.
let modelManagerInstance: ModelManager | null = null;
const getModelManager = () => (modelManagerInstance ??= new ModelManager({ logger: DebugLogger }));

const SECURE = typeof window !== 'undefined' && window.isSecureContext;
const INSECURE_MESSAGE =
  'This page is not a secure context, so the browser hides the storage the engine needs and no model can be downloaded or loaded. Open the app over https, or forward the port (adb reverse) and open it at http://localhost.';

/** A plain sentence for the most common load failures; the raw message goes to the Log screen. */
function explainLoadError(e: unknown): string {
  const msg = errorText(e);
  const hay = msg.toLowerCase();
  if (/out of memory|oom|cannot enlarge|alloc|memory access|rangeerror/.test(hay))
    return `The model did not fit in this tab's memory. Close other tabs, lower the context size in Settings, or pick a smaller model. (${msg})`;
  if (/quota|no space/.test(hay))
    return `The browser ran out of storage for the model file. Delete a downloaded model and try again. (${msg})`;
  if (/failed to fetch|network|http \d{3}/.test(hay))
    return `The model file could not be fetched. Check the connection and try again. (${msg})`;
  return `The model did not load: ${msg}`;
}

export const WllamaProvider = ({ children }: { children: ReactNode }) => {
  const [cachedModels, setCachedModels] = useState<Model[]>([]);
  const [downloads, setDownloads] = useState<Record<string, { loaded: number; total: number }>>({});
  const downloadCtrls = useRef<Record<string, AbortController>>({});
  const [storageTick, setStorageTick] = useState(0);
  const [loadedModel, setLoadedModel] = useState<DisplayedModel>();
  const [runtime, setRuntime] = useState<RuntimeInfo>();
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [isGenerating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [customTick, setCustomTick] = useState(0);
  const [lastModelUrl, setLastModelUrl] = useState<string | null>(() =>
    WllamaStorage.load<string | null>('last_model', null)
  );
  const [params, setParamsState] = useState<InferenceParams>(() => {
    const stored = WllamaStorage.load<Partial<InferenceParams>>('params', {});
    const merged = { ...DEFAULT_INFERENCE_PARAMS, ...stored };
    merged.nContext = Math.min(MAX_CONTEXT, Math.max(256, merged.nContext));
    return merged;
  });

  const wllamaRef = useRef<Wllama | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);

  const refreshCachedModels = useCallback(async () => {
    if (!SECURE) {
      setCachedModels([]);
      return;
    }
    try {
      setCachedModels(await getModelManager().getModels());
    } catch (e) {
      DebugLogger.warn('cannot list cached models', e);
      setCachedModels([]);
    }
    setStorageTick((t) => t + 1);
  }, []);

  useEffect(() => {
    void refreshCachedModels();
  }, [refreshCachedModels]);

  const models = useMemo(() => {
    void customTick;
    const list = getDisplayedModels(cachedModels);
    return list.map((model) => {
      const d = downloads[model.url];
      let m = model;
      if (d) m = m.clone({ state: ModelState.DOWNLOADING, downloadLoaded: d.loaded, downloadTotal: d.total });
      if (loadProgress?.url === model.url) {
        m = m.clone({
          state: loadProgress.phase === 'downloading' ? ModelState.DOWNLOADING : ModelState.LOADING,
          downloadLoaded: loadProgress.phase === 'downloading' ? loadProgress.loaded : -1,
          downloadTotal: loadProgress.total,
        });
      }
      if (loadedModel?.url === model.url) m = m.clone({ state: ModelState.LOADED });
      return m;
    });
  }, [cachedModels, downloads, loadProgress, loadedModel, customTick]);

  const isDownloading = Object.keys(downloads).length > 0;

  const downloadModel = useCallback(
    async (model: DisplayedModel): Promise<boolean> => {
      if (!SECURE) {
        setNotice(INSECURE_MESSAGE);
        return false;
      }
      if (downloads[model.url]) return false;
      const ctrl = new AbortController();
      downloadCtrls.current[model.url] = ctrl;
      setDownloads((p) => ({ ...p, [model.url]: { loaded: 0, total: model.size } }));
      // Ask the browser not to evict the model under storage pressure. It may say no; the storage panel shows which.
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* not available */
      }
      let lastPaint = 0;
      let ok = false;
      try {
        await getModelManager().downloadModel(
          { url: model.url, mmprojUrl: model.mmprojUrl },
          {
            signal: ctrl.signal,
            progressCallback({ loaded, total }) {
              const now = performance.now();
              if (now - lastPaint < 200 && loaded < total) return;
              lastPaint = now;
              setDownloads((p) => (p[model.url] ? { ...p, [model.url]: { loaded, total } } : p));
            },
          }
        );
        ok = !ctrl.signal.aborted;
      } catch (e) {
        if (!ctrl.signal.aborted)
          setNotice(
            `The download of ${model.name} failed: ${errorText(e)}. A download cannot pick up where it stopped — the next attempt starts again from the beginning.`
          );
      } finally {
        delete downloadCtrls.current[model.url];
        setDownloads((p) => {
          const n = { ...p };
          delete n[model.url];
          return n;
        });
        await refreshCachedModels();
      }
      return ok;
    },
    [downloads, refreshCachedModels]
  );

  const cancelDownload = useCallback((url: string) => {
    downloadCtrls.current[url]?.abort();
  }, []);

  const removeCachedModel = useCallback(
    async (model: DisplayedModel) => {
      if (loadedModel?.url === model.url) return;
      try {
        await model.cachedModel?.remove();
      } catch (e) {
        setNotice(`Could not delete ${model.name}: ${errorText(e)}`);
      }
      await refreshCachedModels();
    },
    [loadedModel, refreshCachedModels]
  );

  const removeAllCachedModels = useCallback(async () => {
    if (loadedModel || isDownloading) return;
    try {
      await getModelManager().clear();
    } catch (e) {
      setNotice(`Could not clear the model storage: ${errorText(e)}`);
    }
    await refreshCachedModels();
  }, [loadedModel, isDownloading, refreshCachedModels]);

  const unloadModel = useCallback(async () => {
    abortRef.current?.abort();
    const w = wllamaRef.current;
    wllamaRef.current = null;
    setLoadedModel(undefined);
    setRuntime(undefined);
    if (w) {
      try {
        await w.exit();
      } catch {
        /* the worker may already be gone */
      }
    }
  }, []);

  const loadModel = useCallback(
    async (model: DisplayedModel) => {
      if (!SECURE) {
        setNotice(INSECURE_MESSAGE);
        return;
      }
      // A ref, not the loadProgress state: loadProgress is only set after the unload below has been awaited, so a second
      // click in that window passed the check and started a second Wllama whose worker, model included, nobody exited.
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (wllamaRef.current) await unloadModel();
      setNotice(null);
      setLoadProgress({ url: model.url, phase: 'loading', loaded: 0, total: model.size });
      // llama.cpp prints "offloaded N/M layers to GPU" while loading: the only first-hand word on where the layers went.
      const offloadLines: string[] = [];
      const unsubscribe = DebugLogger.subscribe(() => {
        const line = DebugLogger.content[DebugLogger.content.length - 1] ?? '';
        const m = line.match(/offloaded \d+\/\d+ layers to GPU/);
        if (m) offloadLines.push(m[0]);
      });
      const t0 = performance.now();
      try {
        const res = await loadWithFallback({
          createInstance: createWllamaInstance,
          source: { url: model.url, mmprojUrl: model.mmprojUrl },
          params: {
            n_ctx: Math.min(MAX_CONTEXT, params.nContext),
            n_batch: params.nBatch,
            n_threads: params.nThreads > 0 ? params.nThreads : undefined,
            useGpu: params.useGpu,
          },
          onProgress: (p) => {
            if (p.phase === 'downloading' || p.phase === 'loading') {
              setLoadProgress({ url: model.url, phase: p.phase, loaded: p.loaded, total: p.total || model.size });
            }
          },
        });
        const w = res.wllama;
        wllamaRef.current = w;
        const offload = offloadLines.pop() ?? null;
        let nCtx = params.nContext;
        try {
          nCtx = w.getLoadedContextInfo().n_ctx;
        } catch {
          /* keep the requested value */
        }
        setRuntime({
          isMultithread: w.isMultithread(),
          threads: w.getNumThreads(),
          gpuLayers: res.gpuLayers,
          gpuOffloadLog: offload,
          gpuFallbackReason: res.gpuFallbackReason,
          hasChatTemplate: !!w.getChatTemplate(),
          supportsImage: w.supportInputModality('image'),
          supportsAudio: w.supportInputModality('audio'),
          nCtx,
          loadMs: performance.now() - t0,
        });
        setLoadedModel(model.clone({ state: ModelState.LOADED }));
        WllamaStorage.save('last_model', model.url);
        setLastModelUrl(model.url);
      } catch (e) {
        DebugLogger.error('load failed', e);
        wllamaRef.current = null;
        setNotice(explainLoadError(e));
      } finally {
        unsubscribe();
        loadingRef.current = false;
        setLoadProgress(null);
        await refreshCachedModels();
      }
    },
    [params, refreshCachedModels, unloadModel]
  );

  const addCustomModel = useCallback(
    async (url: string, mmprojUrl?: string) => {
      const custom = await verifyCustomModel(url, mmprojUrl);
      if (models.some((m) => m.url === custom.url)) {
        throw new Error('That model is already in the list.');
      }
      const userAddedModels = getUserAddedModels(cachedModels);
      updateUserAddedModels([
        ...userAddedModels,
        new DisplayedModel(custom.url, custom.size, true, undefined, custom.mmprojUrl),
      ]);
      setCustomTick((t) => t + 1);
    },
    [models, cachedModels]
  );

  const removeCustomModel = useCallback(
    (model: DisplayedModel) => {
      if (!model.isUserAdded) return;
      const userAddedModels = getUserAddedModels(cachedModels);
      updateUserAddedModels(userAddedModels.filter((m) => m.url !== model.url));
      setCustomTick((t) => t + 1);
    },
    [cachedModels]
  );

  const setParams = useCallback((val: InferenceParams) => {
    const clean = { ...val, nContext: Math.min(MAX_CONTEXT, Math.max(256, Math.round(val.nContext || 0))) };
    WllamaStorage.save('params', clean);
    setParamsState(clean);
  }, []);

  const generate = useCallback(async (req: StreamRequest, cb?: StreamCallbacks) => {
    const w = wllamaRef.current;
    if (!w) throw new Error('No model is loaded.');
    if (abortRef.current) throw new Error('The model is already answering. Stop it first.');
    const ctrl = new AbortController();
    const onOuterAbort = () => ctrl.abort();
    req.signal?.addEventListener('abort', onOuterAbort);
    abortRef.current = ctrl;
    setGenerating(true);
    try {
      return await streamChat(w, { ...req, signal: ctrl.signal }, cb);
    } finally {
      req.signal?.removeEventListener('abort', onOuterAbort);
      abortRef.current = null;
      setGenerating(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const value: WllamaContextValue = {
    secureContext: SECURE,
    models,
    downloadModel,
    cancelDownload,
    removeCachedModel,
    removeAllCachedModels,
    isDownloading,
    storageTick,
    loadedModel,
    runtime,
    loadProgress,
    loadModel,
    unloadModel,
    lastModelUrl,
    addCustomModel,
    removeCustomModel,
    params,
    setParams,
    generate,
    stop,
    isGenerating,
    notice,
    setNotice,
  };

  return <WllamaContext.Provider value={value}>{children}</WllamaContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider; a hot edit here reloads the page
export const useWllama = () => {
  const ctx = useContext(WllamaContext);
  if (!ctx) throw new Error('useWllama must be used inside WllamaProvider');
  return ctx;
};
