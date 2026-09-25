// Models: what this device can run, what is already downloaded, and what each model is good for. The ladder is
// grouped by the device a model realistically fits, because "1.9 GB" means nothing to most people and "Phone" does.
import { useEffect, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { Button } from '../lib/localmode/button';
import { StorageMeter } from '../lib/localmode/storage-meter';
import { useCapabilities } from '../lib/localmode/use-environment';
import { probeWebGPU, type GpuProbe } from '../lib/thales/localWllama';
import { LAB_MODE, LICENCES_CHECKED_ON, MAX_GGUF_SIZE, TIERS, isOpenLicence } from '../config';
import { useWllama } from '../utils/wllama.context';
import { useNav } from '../utils/nav.context';
import { ModelState, Screen } from '../utils/types';
import type { DisplayedModel } from '../utils/displayed-model';
import { formatBytes, formatRate } from '../utils/format';
import { errorText } from '../utils/utils';
import findings from '../data/findings.json';

export default function ModelScreen() {
  const {
    models,
    downloadModel,
    cancelDownload,
    removeCachedModel,
    removeAllCachedModels,
    loadModel,
    unloadModel,
    removeCustomModel,
    loadedModel,
    loadProgress,
    isDownloading,
    storageTick,
    secureContext,
  } = useWllama();
  const busy = !!loadProgress || isDownloading || !secureContext;

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Models</h1>
        <p className="screen-lede">
          A model is a file this browser downloads once and then keeps. Bigger files answer better and run slower; the
          groups below say which size fits which device. Models this size are good at short, well-defined jobs — the
          four skills, rewriting, summarising a page of text. They are weak at open reasoning, at facts, and at
          multi-step tool use, where even the best open models under 4B fail most of the time.
        </p>

        {!secureContext && (
          <p className="notice notice-error mb-4">
            This page is not a secure context, so the browser hides the storage the engine needs: no model can be
            downloaded or loaded here. Open the app over https, or forward the port (adb reverse) and open it at
            http://localhost. Measured, not assumed — the engine throws "no supported storage backend" on a plain-http
            page.
          </p>
        )}

        <CapabilityPanel storageTick={storageTick} />

        <MeasuredElsewhere />

        {TIERS.map((tier) => {
          // openly licensed models first, then by size: the first model in a group is the one most people may use.
          const tierModels = models
            .filter((m) => !m.isUserAdded && m.tier === tier.id)
            .sort(
              (a, b) => Number(isOpenLicence(b.info)) - Number(isOpenLicence(a.info)) || a.size - b.size
            );
          if (tierModels.length === 0) return null;
          return (
            <section key={tier.id} className="tier">
              <h2 className="tier-title">{tier.title}</h2>
              <p className="tier-blurb">{tier.blurb}</p>
              <ul className="model-list">
                {tierModels.map((m) => (
                  <li key={m.url}>
                    <ModelCard
                      model={m}
                      busy={busy}
                      onDownload={() => void downloadModel(m)}
                      onCancel={() => cancelDownload(m.url)}
                      onLoad={() => void loadModel(m)}
                      onUnload={() => void unloadModel()}
                      onDelete={() => void removeCachedModel(m)}
                      onForget={() => removeCustomModel(m)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <CustomModels busy={busy} />

        <section className="tier">
          <h2 className="tier-title">Storage</h2>
          <StorageMeter refreshKey={storageTick} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || !!loadedModel} onClick={() => void removeAllCachedModels()}>
              <Trash2 className="size-4" aria-hidden="true" /> Delete every downloaded model
            </Button>
            <span className="text-xs text-base-content/70">
              {loadedModel ? 'Unload the model first.' : 'The files can be downloaded again at any time.'}
            </span>
          </div>
        </section>

        <p className="screen-foot">
          Licences were read from the Hugging Face model cards on {LICENCES_CHECKED_ON}. A licence is the model
          maker's, not this app's: read it before any commercial use.
        </p>
      </div>
    </div>
  );
}

/** Android System WebView never reports cross-origin isolation, whatever the headers say. Worth telling apart. */
function isAndroidWebView(): boolean {
  const ua = navigator.userAgent;
  return (
    /Android/.test(ua) &&
    (/;\s*wv\)/.test(ua) || typeof (window as { Capacitor?: unknown }).Capacitor !== 'undefined')
  );
}

function CapabilityPanel({ storageTick }: { storageTick: number }) {
  const { capabilities } = useCapabilities();
  const [gpu, setGpu] = useState<GpuProbe | null>(null);
  useEffect(() => {
    let alive = true;
    void probeWebGPU().then((p) => alive && setGpu(p));
    return () => {
      alive = false;
    };
  }, []);
  void storageTick;

  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  const cores = capabilities?.hardware.cores ?? navigator.hardwareConcurrency ?? 0;
  const memory = capabilities?.hardware.memory;
  const isolationNote = isolated
    ? 'The page may use several processor threads, which is what makes the model answer at a usable speed.'
    : isAndroidWebView()
      ? 'This is the Android app\'s web view, which cannot turn cross-origin isolation on whatever the headers say — a limitation of Android System WebView, open since 2023. Nothing is misconfigured: the model runs here on one thread, and there is no WebGPU either.'
      : !window.isSecureContext
        ? 'This page is not a secure context — plain http over a network — so the browser withholds shared memory and the model runs on one thread. Serve it over https, or reach it through localhost (adb reverse) to get threads.'
        : 'This page was served without the COOP and COEP headers, so the browser withholds shared memory and the model runs on one thread, several times slower.';

  return (
    <section className="tier">
      <h2 className="tier-title">This device</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="ff">
          <span className="ff-label">Cross-origin isolation</span>
          <span className="typed">{isolated ? 'on' : 'off'}</span>
          <span className="text-xs text-base-content/70">{isolationNote}</span>
        </div>
        <div className="ff">
          <span className="ff-label">Threads</span>
          <span className="typed">{isolated ? `up to ${Math.max(2, Math.min(8, Math.floor((cores || 4) / 2)))} of ${cores || 'unknown'} logical cores` : `1 of ${cores || 'unknown'} logical cores`}</span>
          <span className="text-xs text-base-content/70">Half the logical cores, because they usually count two per physical core.</span>
        </div>
        <div className="ff">
          <span className="ff-label">Graphics adapter (WebGPU)</span>
          <span className="typed">
            {!gpu
              ? 'checking'
              : !gpu.apiPresent
                ? 'no WebGPU in this browser'
                : !gpu.adapterPresent
                  ? 'no adapter offered'
                  : gpu.software
                    ? 'software renderer only'
                    : `hardware adapter${gpu.vendor ? ` · ${gpu.vendor}` : ''}`}
          </span>
          <span className="text-xs text-base-content/70">
            {gpu?.usable
              ? 'Layers can be moved onto the graphics card when "Use the GPU" is on in Settings.'
              : (gpu?.note ?? 'The model runs on the processor.')}
          </span>
        </div>
        <div className="ff">
          <span className="ff-label">Memory the browser admits to</span>
          <span className="typed">{memory ? `${memory} GB or more` : 'not reported'}</span>
          <span className="text-xs text-base-content/70">
            Browsers round this down and cap it at 8 GB, so treat it as a floor, not a measurement.
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Numbers measured by this project on its own machine, read from src/data/findings.json. They are not a promise about
 * the visitor's device — the receipt under every answer is the number that applies here.
 */
function MeasuredElsewhere() {
  const runs = (findings.inBrowser ?? []) as {
    model: string;
    threads: number | null;
    prefillTokS: number | null;
    decodeTokS: number | null;
    status?: string;
    note?: string;
  }[];
  if (runs.length === 0) return null;
  return (
    <section className="tier">
      <h2 className="tier-title">Measured on the project's own machine</h2>
      <p className="tier-blurb">
        {findings.machine}. Your device will differ; every answer here carries its own measured receipt.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {runs.map((r) => (
          <div key={r.model} className="ff">
            <span className="ff-label">{r.model}</span>
            <span className="typed">
              {formatRate(r.decodeTokS)} writing · {formatRate(r.prefillTokS)} reading
              {r.threads ? ` · ${r.threads} threads` : ''}
            </span>
            {(r.status || r.note) && (
              <span className="text-xs text-base-content/70">{[r.status, r.note].filter(Boolean).join(' — ')}</span>
            )}
          </div>
        ))}
      </div>
      <ul className="limits-list">
        {(findings.limits ?? []).map((l: string) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

function ModelCard({
  model,
  busy,
  onDownload,
  onCancel,
  onLoad,
  onUnload,
  onDelete,
  onForget,
}: {
  model: DisplayedModel;
  busy: boolean;
  onDownload(): void;
  onCancel(): void;
  onLoad(): void;
  onUnload(): void;
  onDelete(): void;
  onForget(): void;
}) {
  const { navigate } = useNav();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const info = model.info;
  const pct = model.downloadPercent;
  const downloading = model.state === ModelState.DOWNLOADING;
  const loading = model.state === ModelState.LOADING;
  const loaded = model.state === ModelState.LOADED;
  const cached = model.state === ModelState.READY || loaded;

  return (
    <article className={`model-card${loaded ? ' is-loaded' : ''}`}>
      <div className="model-card-head">
        <div>
          <h3 className="model-name">{model.name}</h3>
          <p className="model-sub typed">
            {info?.maker ? `${info.maker} · ` : ''}
            {formatBytes(model.size)}
            {model.size > MAX_GGUF_SIZE ? ' · larger than 2 GB: it may not load in a browser tab' : ''}
          </p>
        </div>
        <span className={`model-state${cached ? ' is-cached' : ''}`}>
          {loaded ? 'in this tab' : downloading ? 'downloading' : loading ? 'starting' : cached ? 'on this device' : 'not downloaded'}
        </span>
      </div>

      {info?.note && <p className="model-note">{info.note}</p>}

      <dl className="model-facts">
        <div>
          <dt>Languages</dt>
          <dd className="typed">{info ? (info.languages ? info.languages.join(', ') : 'none listed on the card') : 'unknown'}</dd>
        </div>
        <div>
          <dt>Licence</dt>
          <dd className="typed">
            {info?.licence.id ?? 'not stated'}
            {info?.licence.from ? ` (${info.licence.from})` : ''}
          </dd>
        </div>
        <div>
          <dt>File</dt>
          <dd className="typed model-file">{model.fileName}</dd>
        </div>
      </dl>
      {info?.licence.note && <p className="model-licence-note">{info.licence.note}</p>}
      {info?.labOnly && !LAB_MODE && (
        <p className="model-licence-note">
          Kept only for engine tests and normally hidden. It is listed because its file is already on this device.
        </p>
      )}

      {downloading && (
        <div className="download">
          <progress className="download-bar" value={Math.max(0, pct) * 100} max={100} />
          <span className="typed download-text">
            {formatBytes(Math.max(0, model.downloadLoaded))} of {formatBytes(model.downloadTotal || model.size)}
            {pct >= 0 ? ` · ${Math.round(pct * 100)}%` : ''}
          </span>
        </div>
      )}

      <div className="model-actions">
        {!cached && !downloading && !loading && (
          <Button type="button" size="sm" disabled={busy} onClick={onDownload}>
            Download {formatBytes(model.size)}
          </Button>
        )}
        {downloading && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            <X className="size-4" aria-hidden="true" /> Cancel
          </Button>
        )}
        {model.state === ModelState.READY && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={onLoad}>
              Load into this tab
            </Button>
            {confirmDelete ? (
              <>
                <span className="text-sm">Delete the downloaded file?</span>
                <Button type="button" size="sm" variant="destructive" onClick={() => { setConfirmDelete(false); onDelete(); }}>
                  Delete
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)} aria-label={`Delete ${model.name} from this device`}>
                <Trash2 className="size-4" aria-hidden="true" /> Delete
              </Button>
            )}
          </>
        )}
        {loaded && (
          <>
            <Button type="button" size="sm" onClick={() => navigate(Screen.CHAT)}>
              <Check className="size-4" aria-hidden="true" /> Start chatting
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onUnload}>
              Unload
            </Button>
          </>
        )}
        {model.isUserAdded && !cached && !downloading && (
          <Button type="button" size="sm" variant="ghost" onClick={onForget}>
            Remove from the list
          </Button>
        )}
      </div>
    </article>
  );
}

function CustomModels({ busy }: { busy: boolean }) {
  const { models, addCustomModel, downloadModel, cancelDownload, removeCachedModel, loadModel, unloadModel, removeCustomModel } =
    useWllama();
  const [url, setUrl] = useState('');
  const [mmproj, setMmproj] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const custom = models.filter((m) => m.isUserAdded);

  return (
    <section className="tier">
      <h2 className="tier-title">Your own model</h2>
      <p className="tier-blurb">
        Any GGUF file on Hugging Face, pasted as its download link. Files over 2 GB usually fail in a browser tab;
        split models (…-00001-of-00004.gguf) work — paste the first part.
      </p>
      <form
        className="custom-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setChecking(true);
          try {
            await addCustomModel(url, mmproj || undefined);
            setUrl('');
            setMmproj('');
          } catch (err) {
            setError(errorText(err));
          } finally {
            setChecking(false);
          }
        }}
      >
        <label className="ff">
          <span className="ff-label">Link to the .gguf file</span>
          <input
            className="typed field-input"
            type="url"
            inputMode="url"
            placeholder="https://huggingface.co/owner/repo/resolve/main/model-q4_k_m.gguf"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="ff">
          <span className="ff-label">Vision projector, if the model has one (optional)</span>
          <input
            className="typed field-input"
            type="url"
            inputMode="url"
            placeholder="https://huggingface.co/owner/repo/resolve/main/mmproj.gguf"
            value={mmproj}
            onChange={(e) => setMmproj(e.target.value)}
          />
        </label>
        <Button type="submit" size="sm" disabled={checking || url.length < 12}>
          {checking ? 'Checking the file…' : 'Add to the list'}
        </Button>
        {error && <p className="notice notice-error">{error}</p>}
      </form>

      {custom.length > 0 && (
        <ul className="model-list mt-3">
          {custom.map((m) => (
            <li key={m.url}>
              <ModelCard
                model={m}
                busy={busy}
                onDownload={() => void downloadModel(m)}
                onCancel={() => cancelDownload(m.url)}
                onLoad={() => void loadModel(m)}
                onUnload={() => void unloadModel()}
                onDelete={() => void removeCachedModel(m)}
                onForget={() => removeCustomModel(m)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
