import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoFailure, FailureKind, FieldKey, FieldValues, LoadInfo, RunResult } from './demo-engine';

// A realistic note, entirely made up. The phone number sits in the 01 99 00 block that the French
// regulator reserves for fiction, so it cannot belong to anyone.
export const SAMPLE_NOTE =
  'Call from Mrs Claire Moreau this morning, policy HAB-2291-4471. On 14 September 2026 a pipe under her ' +
  'kitchen sink burst while she was at work. Water ran for about three hours: the oak floor is warped and two ' +
  'base cabinets are swollen. Her plumber quotes EUR 1,840 for the repair. She asks to be called back on ' +
  '01 99 00 12 34 after 5 pm.';

const FIELDS: { key: FieldKey; label: string; wide?: boolean; tall?: boolean }[] = [
  { key: 'policy_number', label: 'Policy number' },
  { key: 'date_of_incident', label: 'Date of incident' },
  { key: 'claimant', label: 'Claimant', wide: true },
  { key: 'damage', label: 'Damage', wide: true, tall: true },
  { key: 'amount_eur', label: 'Amount claimed (EUR)' },
  { key: 'phone', label: 'Phone' },
];

type Phase = 'idle' | 'starting' | 'checking' | 'downloading' | 'initialising' | 'reading' | 'writing' | 'done' | 'error';

export interface LiveRun {
  model: string;
  sizeMB: number;
  threads: number | null;
  prefillTokS: number | null;
  decodeTokS: number | null;
  generatedTokens: number | null;
}

export interface DemoReport {
  modelLabel: string | null;
  pendingHost: string | null;
  noteChars: number;
  stampedAt: Date | null;
  liveRun: LiveRun | null;
}

const FAILURE_TEXT: Record<FailureKind, { what: string; todo: string }> = {
  'no-wasm': {
    what: 'This browser cannot run WebAssembly, so the model has nowhere to run.',
    todo: 'Open the page in a current Chrome, Edge, Firefox or Safari. If this is a managed work browser, WebAssembly may be switched off by policy.',
  },
  offline: {
    what: 'This device is offline and the model is not in this browser yet.',
    todo: 'Connect once to download the 386 MB file. After that the demo starts from storage.',
  },
  download: {
    what: 'The download stopped before it finished.',
    todo: 'Nothing is broken. Check the connection and press the button again. The file cannot be resumed, so it starts from the beginning.',
  },
  storage: {
    what: 'The browser refused to store the 386 MB model file.',
    todo: 'Free some space, or leave private browsing, which gives pages very little storage. Then try again.',
  },
  memory: {
    what: 'The model did not fit in the memory this browser gives a tab.',
    todo: 'Close other tabs and apps and try again. On a phone with little memory it may not fit at all.',
  },
  inference: {
    what: 'The model loaded but the run failed.',
    todo: 'Shorten the note and try again.',
  },
  unknown: {
    what: 'The demo stopped with an error this page does not recognise.',
    todo: 'Reload the page and try once more. The technical message is below.',
  },
};

const mb = (bytes: number) => (bytes / 1e6).toFixed(1);

export function ClaimDemo({ onReport }: { onReport: (r: DemoReport) => void }) {
  const [note, setNote] = useState(SAMPLE_NOTE);
  const [phase, setPhase] = useState<Phase>('idle');
  const [bytes, setBytes] = useState<{ loaded: number; total: number } | null>(null);
  const [fromCache, setFromCache] = useState<boolean | null>(null);
  const [promptProgress, setPromptProgress] = useState<{ processed: number; total: number } | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [active, setActive] = useState<FieldKey | null>(null);
  const [tokens, setTokens] = useState(0);
  const [loadInfo, setLoadInfo] = useState<LoadInfo | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [failure, setFailure] = useState<{ kind: FailureKind; detail: string; at: string } | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [stampedAt, setStampedAt] = useState<Date | null>(null);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const engineRef = useRef<typeof import('./demo-engine') | null>(null);
  const loadInfoRef = useRef<LoadInfo | null>(null);

  const busy = phase !== 'idle' && phase !== 'done' && phase !== 'error';
  const pendingHost = phase === 'downloading' && fromCache === false ? 'huggingface.co' : null;

  useEffect(() => {
    onReport({ modelLabel, pendingHost, noteChars: note.length, stampedAt, liveRun });
  }, [onReport, modelLabel, pendingHost, note.length, stampedAt, liveRun]);

  // free the worker and its memory when the tab goes away
  useEffect(() => {
    const bye = () => void engineRef.current?.unloadDemoModel();
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  const run = useCallback(async () => {
    if (busy) return;
    setFailure(null);
    setResult(null);
    setValues({});
    setActive(null);
    setTokens(0);
    setPromptProgress(null);
    setPhase('starting');
    let stage = 'loading the engine';
    try {
      // the dynamic import keeps wllama out of the landing page's own bundle
      const engine = engineRef.current ?? (await import('./demo-engine'));
      engineRef.current = engine;

      if (!engine.isLoaded()) {
        stage = 'loading the model';
        setPhase('checking');
        const info = await engine.loadDemoModel({
          onCacheChecked: (cached) => {
            setFromCache(cached);
            setPhase('downloading');
          },
          onBytes: (loaded, total) => setBytes({ loaded, total }),
          onInitialising: () => setPhase('initialising'),
        });
        loadInfoRef.current = info;
        setLoadInfo(info);
        setModelLabel(engine.DEMO_MODEL.label);
      }

      stage = 'running the model';
      setPhase('reading');
      const res = await engine.extractClaim(note, {
        onPromptProgress: (processed, total) => setPromptProgress({ processed, total }),
        onValues: (v, a, t) => {
          setPhase('writing');
          setValues(v);
          setActive(a);
          setTokens(t);
        },
      });
      setValues(res.values);
      setActive(null);
      setResult(res);
      setPhase('done');
      setStampedAt((prev) => prev ?? new Date());
      setLiveRun({
        model: engine.DEMO_MODEL.label,
        sizeMB: Math.round(engine.DEMO_MODEL.bytes / 1e6),
        threads: loadInfoRef.current?.threads ?? null,
        prefillTokS: res.prefillTokS,
        decodeTokS: res.decodeTokS,
        generatedTokens: res.generatedTokens,
      });
    } catch (err) {
      const f = err as Partial<DemoFailure>;
      const kind: FailureKind = f && typeof f.kind === 'string' ? (f.kind as FailureKind) : 'unknown';
      setFailure({ kind, detail: String(f?.detail ?? (err as Error)?.message ?? err), at: stage });
      setActive(null);
      setPhase('error');
      if (!engineRef.current?.isLoaded()) setModelLabel(null);
    }
  }, [busy, note]);

  const unload = useCallback(async () => {
    await engineRef.current?.unloadDemoModel();
    loadInfoRef.current = null;
    setModelLabel(null);
    setLoadInfo(null);
    setPhase('idle');
    setBytes(null);
  }, []);

  const pct = bytes && bytes.total > 0 ? Math.min(100, Math.floor((100 * bytes.loaded) / bytes.total)) : 0;
  const loadedBefore = modelLabel !== null;
  const buttonLabel = busy
    ? 'Working on this device'
    : loadedBefore
      ? 'Fill in the form again'
      : phase === 'error'
        ? 'Try again: load the 386 MB model and fill in the form'
        : 'Load a 386 MB model and fill in the form';

  return (
    <section className="demo" id="try" aria-labelledby="try-title">
      <h2 id="try-title">Try it here</h2>
      <p className="lead">
        A claims handler's note goes in on the left. A model with 360 million parameters reads it inside this tab and fills in
        the form on the right. The note is fictional. Change it if you want to test the model.
      </p>

      <div className="demo-grid">
        <div className="demo-note">
          <label className="ff note-field">
            <span className="ff-label">Claim note, as it was taken on the phone</span>
            <textarea
              className="typed"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={10}
              spellCheck={false}
              disabled={busy}
              maxLength={4000}
            />
          </label>

          <button type="button" className="btn btn-primary demo-go" onClick={run} disabled={busy || note.trim().length === 0}>
            {buttonLabel}
          </button>

          <div className="demo-status" aria-live="polite">
            {phase === 'idle' && !loadedBefore && (
              <p>
                386 MB from huggingface.co, downloaded once and kept in this browser's storage. After the first time it starts
                from there. Use Wi-Fi.
              </p>
            )}
            {phase === 'starting' && <p>Fetching the engine from this site.</p>}
            {phase === 'checking' && <p>Looking for the model in this browser's storage.</p>}
            {(phase === 'downloading' || phase === 'initialising') && (
              <>
                <div
                  className="bar"
                  role="progressbar"
                  aria-label="Model download"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p>
                  {fromCache ? (
                    <>Already in this browser's storage. Nothing to download.</>
                  ) : (
                    <>
                      Downloading <b className="typed">{bytes ? mb(bytes.loaded) : '0.0'}</b> of{' '}
                      <b className="typed">{bytes ? mb(bytes.total) : '386.4'} MB</b>, <b className="typed">{pct}%</b>. Cached after
                      this first time.
                    </>
                  )}{' '}
                  {phase === 'initialising' && <>Reading the file into memory.</>}
                </p>
              </>
            )}
            {phase === 'reading' && (
              <p>
                The model is reading the note
                {promptProgress ? (
                  <>
                    : <b className="typed">{promptProgress.processed}</b> of <b className="typed">{promptProgress.total}</b> tokens
                  </>
                ) : null}
                . This is the slow part in a browser.
              </p>
            )}
            {phase === 'writing' && (
              <p>
                Writing the form: <b className="typed">{tokens}</b> tokens so far.
              </p>
            )}
          </div>
        </div>

        <div className="claim-form" aria-label="Claim form filled in by the model">
          <div className="claim-form-head">
            <span>Claim form</span>
            <span className="claim-form-by">{phase === 'done' ? 'filled in on this device' : 'empty'}</span>
          </div>
          <div className="claim-fields" aria-live="polite" aria-busy={busy}>
            {FIELDS.map((f) => (
              <div
                key={f.key}
                className={`ff claim-field${f.wide ? ' wide' : ''}${f.tall ? ' tall' : ''}`}
                data-field={f.key}
                data-active={active === f.key ? '1' : '0'}
              >
                <span className="ff-label">{f.label}</span>
                <span className="typed claim-value">
                  {values[f.key] ?? ''}
                  {active === f.key && <span className="caret" aria-hidden="true" />}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {failure && (
        <div className="failure" role="alert">
          <p className="failure-what">{FAILURE_TEXT[failure.kind].what}</p>
          <p>{FAILURE_TEXT[failure.kind].todo}</p>
          <p className="failure-detail">
            While {failure.at}: <span className="typed">{failure.detail.slice(0, 240)}</span>
          </p>
        </div>
      )}

      {result && phase === 'done' && (
        <div className="run-report">
          <div className="receipt" data-run="done">
            <div>
              <span>Tokens generated</span>
              <b data-run="tokens">{result.generatedTokens ?? 'not reported'}</b>
            </div>
            <div>
              <span>Writing speed</span>
              <b data-run="decode">{result.decodeTokS !== null ? `${result.decodeTokS.toFixed(1)} tokens/s` : 'not reported'}</b>
            </div>
            <div>
              <span>Reading speed</span>
              <b data-run="prefill">{result.prefillTokS !== null ? `${result.prefillTokS.toFixed(1)} tokens/s` : 'not reported'}</b>
            </div>
            <div>
              <span>Note length</span>
              <b>{result.promptTokens !== null ? `${result.promptTokens} tokens` : 'not reported'}</b>
            </div>
            <div>
              <span>Threads</span>
              <b data-run="threads">{loadInfo ? loadInfo.threads : 'not reported'}</b>
            </div>
            <div>
              <span>Whole run</span>
              <b>{(result.wallMs / 1000).toFixed(1)} s</b>
            </div>
            <div>
              <span>Cost</span>
              <b>0.0000 EUR</b>
            </div>
          </div>
          <p className="run-note">
            Small models make mistakes: compare the form with the note. Speeds are the engine's own timings for this one run,
            not a benchmark.
            {!result.parsed && ' The answer was cut off at 200 tokens, so the form shows what was written up to that point.'}
            {loadInfo && !loadInfo.multithread && ' This page is not cross-origin isolated here, so the model ran on one thread.'}
          </p>
          <p className="run-note">
            <a href="#your-copy">See your copy</a>, now stamped.{' '}
            <button type="button" className="linkish" onClick={unload}>
              Unload the model
            </button>{' '}
            to give the memory back.
          </p>
        </div>
      )}
    </section>
  );
}
