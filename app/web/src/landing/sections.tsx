import { useEffect, useState } from 'react';
import findingsJson from '../data/findings.json';
import type { LiveRun } from './ClaimDemo';

// findings.json is owned by the supervisor and may be sparse or grow new fields: read it loosely,
// and show "not measured yet" for anything that is null or missing. Never fill a gap with a guess.
interface FindingRow {
  model?: string | null;
  sizeMB?: number | null;
  threads?: number | null;
  prefillTokS?: number | null;
  decodeTokS?: number | null;
  status?: string | null;
  note?: string | null;
}
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Findings {
  updated?: string;
  machine?: string;
  inBrowser?: FindingRow[];
  needle3?: { [key: string]: Json } | null;
  limits?: string[];
}
const findings = findingsJson as unknown as Findings;

// Build-time existence checks, defined in vite.config.ts and in the landing-only config. These were
// `import.meta.glob` first, which works but makes Vite emit a hashed COPY of every matched file into
// assets/ — measured: a 200 KB dummy APK shipped twice in dist, and it would ship twice again inside
// the Android shell's www. A define has no such side effect.
const apkPresent = __HAS_APK__;
const noticesPresent = __HAS_NOTICES__;

export const BENCH_HREF =
  './bench.html?' +
  new URLSearchParams({
    url: 'https://huggingface.co/ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
    threads: 'auto',
    gpu: '0',
    n: '64',
    reps: '2',
    tag: 'landing',
  }).toString();

const GOOD = [
  'Pulling typed fields out of messy text: a policy number, a date, an amount, into a fixed form.',
  'Classifying a message into a fixed set of categories.',
  'Rewriting and summarising short text.',
  'Routing a request to the right tool.',
  'Working offline, once the model is on the device.',
  'Costing nothing per run: no provider, no per-token bill. The electricity is the device\'s own.',
];

const NOT_GOOD = [
  'Open-ended reasoning, or any problem with several steps.',
  'Facts they were never given. They answer anyway.',
  'Long documents. Prompt processing in the browser is slow, so a long input means a long wait before the first word.',
  'Languages the model was not trained well on.',
  'Anything where a wrong answer is expensive and nobody checks.',
];

/** Renders `backticked` spans from findings.json in the typed face. The words are not changed. */
function Ticks({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="typed">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Strengths() {
  const limits = findings.limits ?? [];
  return (
    <section className="band" id="limits" aria-labelledby="limits-title">
      <h2 id="limits-title">What small models are good at, and what they are not</h2>
      <p className="lead">
        A model under 2 billion parameters is a narrow tool. Give it a narrow job whose result someone can check.
      </p>
      <div className="two-col">
        <div className="checklist">
          <h3>Good at</h3>
          <ul>
            {GOOD.map((t) => (
              <li key={t}>
                <span className="tick" data-on="1" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="checklist">
          <h3>Not good at</h3>
          <ul>
            {NOT_GOOD.map((t) => (
              <li key={t}>
                <span className="tick" data-on="0" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {limits.length > 0 && (
        <div className="lab-limits">
          <h3>Limits the lab has written down</h3>
          <ul>
            {limits.map((t) => (
              <li key={t}>
                <Ticks text={t} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Num({ v, unit, digits }: { v: number | null | undefined; unit?: string; digits?: number }) {
  if (v === null || v === undefined || Number.isNaN(v)) return <span className="unmeasured">not measured yet</span>;
  return (
    <span className="typed">
      {digits === undefined ? v : v.toFixed(digits)}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}

// ---- needle3 -------------------------------------------------------------------------------
// findings.needle3 and its evalV2 are written by the supervisor, and the shape changes as the
// evaluation grows: on 2026-09-21 evalV2 went from null to scalars + a record of conditions + two
// delta blocks, each nested one level deeper than the first version. So this renders the tree rather
// than a known shape: scalars become fields, a record whose values are all records becomes a table,
// and anything else becomes a labelled sub-block. Unknown keys are printed under their own name, and
// a null or missing value reads "not measured yet" — never a guess.
const KEY_LABELS: Record<string, string> = {
  paramsM: 'Parameters',
  fileMB: 'File',
  engine: 'Engine',
  evalV2: 'Evaluation v2',
  what: 'What was measured',
  conditions: 'Conditions',
  fieldF1: 'Field F1',
  ci95: '95% interval',
  toolAcc: 'Tool accuracy',
  falseCallRate: 'False calls',
  medianMs: 'Median time',
  fieldF1Delta: 'Field F1 change',
  toolAccDelta: 'Tool accuracy change',
  fineTuningAlone: 'Fine-tuning alone',
  quantisationAlone: 'Quantisation alone',
};
const KEY_UNITS: Record<string, string> = { paramsM: 'million', fileMB: 'MB', medianMs: 'ms' };
const label = (k: string) => {
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  // A key with a space in it is already written for a reader ("tuned 4-bit (LoRA, 1200 rows)"), so
  // only its first letter is touched. Splitting it as camelCase turned LoRA into "lo ra".
  const spaced = k.includes(' ')
    ? k.trim()
    : k.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
/** "Conditions" -> "Condition": the column header names one row, the heading names the group. */
const singular = (text: string) => (text.length > 3 && text.endsWith('s') && !text.endsWith('ss') ? text.slice(0, -1) : text);
const isRecord = (v: Json | undefined): v is { [key: string]: Json } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const allRecords = (v: { [key: string]: Json }) => {
  const vals = Object.values(v);
  return vals.length > 0 && vals.every((x) => isRecord(x));
};

function fmtJson(v: Json | undefined, key?: string): string {
  if (v === null || v === undefined) return 'not measured yet';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') {
    const text = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
    return key && KEY_UNITS[key] ? `${text} ${KEY_UNITS[key]}` : text;
  }
  if (typeof v === 'string') return v;
  if (Array.isArray(v))
    return v.length === 2 && v.every((x) => typeof x === 'number')
      ? `${fmtJson(v[0])} to ${fmtJson(v[1])}`
      : v.map((x) => fmtJson(x)).join(', ');
  return Object.entries(v)
    .map(([k, x]) => `${label(k)} ${fmtJson(x, k)}`)
    .join('; ');
}

function Field({ k, v }: { k: string; v: Json | undefined }) {
  const missing = v === null || v === undefined;
  return (
    <div className="ff">
      <span className="ff-label">{label(k)}</span>
      <span className={missing ? 'unmeasured' : 'typed'}>{fmtJson(v, k)}</span>
    </div>
  );
}

/** A record whose values are all records: one row each, one column per key any of them carries. */
function RecordTable({ rows, rowHeader }: { rows: [string, { [key: string]: Json }][]; rowHeader: string }) {
  const cols = [...new Set(rows.flatMap(([, r]) => Object.keys(r)))];
  return (
    <div className="table-scroll">
      <table className="findings">
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {cols.map((c) => (
              <th key={c} scope="col">
                {label(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, r]) => (
            <tr key={name}>
              <th scope="row" data-label={rowHeader}>
                {label(name)}
              </th>
              {cols.map((c) => (
                <td key={c} data-label={label(c)}>
                  {r[c] === undefined || r[c] === null ? (
                    <span className="unmeasured">not measured yet</span>
                  ) : (
                    <span className="typed">{fmtJson(r[c], c)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders one node of the findings tree, whatever it turns out to be. */
function Node({ k, v, depth = 0 }: { k: string; v: Json | undefined; depth?: number }) {
  if (!isRecord(v)) return <Field k={k} v={v} />;
  if (allRecords(v)) {
    return (
      <div className="eval-block">
        {depth > 0 && <h4>{label(k)}</h4>}
        <RecordTable rows={Object.entries(v) as [string, { [key: string]: Json }][]} rowHeader={singular(label(k))} />
      </div>
    );
  }
  const entries = Object.entries(v);
  const scalars = entries.filter(([, x]) => !isRecord(x));
  const nested = entries.filter(([, x]) => isRecord(x));
  return (
    <div className="eval-block">
      {depth > 0 && <h4>{label(k)}</h4>}
      {scalars.length > 0 && (
        <div className="spec-grid">
          {scalars.map(([ck, cv]) => (
            <Field key={ck} k={ck} v={cv} />
          ))}
        </div>
      )}
      {nested.map(([ck, cv]) => (
        <Node key={ck} k={ck} v={cv} depth={depth + 1} />
      ))}
    </div>
  );
}

function EvalV2({ data }: { data: Json | undefined }) {
  if (data === null || data === undefined || (isRecord(data) && Object.keys(data).length === 0))
    return (
      <div className="ff eval-empty">
        <span className="ff-label">{label('evalV2')}</span>
        <span className="unmeasured">not measured yet</span>
      </div>
    );
  return (
    <div className="eval">
      <h4>{label('evalV2')}</h4>
      <Node k="evalV2" v={data} />
    </div>
  );
}

function Needle3() {
  const n = findings.needle3;
  if (!isRecord(n)) return null;
  const specs = Object.entries(n).filter(([k]) => k !== 'evalV2');
  return (
    <div className="needle">
      <h3>needle3, the other model in the lab</h3>
      <p className="lead">
        Not a chat model and not part of the demo above: needle3 extracts fields and calls tools, on its own engine rather than
        wllama. Its second evaluation scores how accurately it fills fields against an untuned control.
      </p>
      <div className="spec-grid">
        {specs.map(([k, v]) => (
          <Field key={k} k={k} v={v} />
        ))}
      </div>
      <EvalV2 data={n.evalV2} />
    </div>
  );
}

export function Measured({ liveRun }: { liveRun: LiveRun | null }) {
  const rows = findings.inBrowser ?? [];
  return (
    <section className="band" id="measured" aria-labelledby="measured-title">
      <h2 id="measured-title">Measured, not promised</h2>
      <p className="lead">
        Every speed on this page was measured by the lab on the machine named below, or in your own browser a moment ago. Where
        there is no measurement, the table says so.
      </p>

      <div className="ff machine">
        <span className="ff-label">Lab machine{findings.updated ? `, as of ${findings.updated}` : ''}</span>
        <span className="typed">{findings.machine ?? 'not recorded'}</span>
      </div>

      <table className="findings">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Size</th>
            <th scope="col">Threads</th>
            <th scope="col">Reading (prefill)</th>
            <th scope="col">Writing (decode)</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.model ?? 'row'}-${i}`}>
              <td data-label="Model">
                <span className="typed">{r.model ?? 'not recorded'}</span>
              </td>
              <td data-label="Size">
                <Num v={r.sizeMB} unit="MB" />
              </td>
              <td data-label="Threads">
                <Num v={r.threads} />
              </td>
              <td data-label="Reading (prefill)">
                <Num v={r.prefillTokS} unit="tokens/s" />
              </td>
              <td data-label="Writing (decode)">
                <Num v={r.decodeTokS} unit="tokens/s" />
              </td>
              <td data-label="Status">
                {r.status ?? 'not recorded'}
                {r.note ? <span className="row-note">{r.note}</span> : null}
              </td>
            </tr>
          ))}
          <tr className="live-row" data-live={liveRun ? '1' : '0'}>
            <td data-label="Model">
              <span className="typed">{liveRun ? liveRun.model : 'This device'}</span>
            </td>
            <td data-label="Size">{liveRun ? <Num v={liveRun.sizeMB} unit="MB" /> : <span className="unmeasured">not measured yet</span>}</td>
            <td data-label="Threads">
              <Num v={liveRun?.threads} />
            </td>
            <td data-label="Reading (prefill)">
              <Num v={liveRun?.prefillTokS} unit="tokens/s" digits={1} />
            </td>
            <td data-label="Writing (decode)">
              <Num v={liveRun?.decodeTokS} unit="tokens/s" digits={1} />
            </td>
            <td data-label="Status">
              {liveRun
                ? `This device, one run of the demo above, ${liveRun.generatedTokens ?? 'an unknown number of'} tokens written. Too short to be a benchmark.`
                : 'Run the demo above and this row fills in.'}
            </td>
          </tr>
        </tbody>
      </table>

      <Needle3 />

      <p className="after-table">
        <a className="btn btn-secondary" href={BENCH_HREF}>
          Measure this device
        </a>
        <span className="after-table-note">
          Runs the same 386 MB model twice, 64 tokens each, and shows the engine's own timings. If this browser does not have the model yet, it downloads it first.
        </span>
      </p>
    </section>
  );
}

export function BizLoop() {
  return (
    <section className="band" id="bizloop" aria-labelledby="bizloop-title">
      <h2 id="bizloop-title">Where it fits in BizLoop</h2>
      <p className="status-line">
        <span className="status-label">Status of this track</span>
        <span className="status-box">
          <span className="tick" data-on="1" aria-hidden="true" /> Experiment
        </span>
        <span className="status-box">
          <span className="tick" data-on="0" aria-hidden="true" /> Production
        </span>
      </p>
      <p className="lead">
        This is an experiment track. The BizLoop × Copilot experience PRD requires experiments to be labelled and never mixed
        with production claims. None of the three scenes below is built into BizLoop today.
      </p>

      <div className="scenes">
        <article className="scene">
          <h3>"Where does my data go?"</h3>
          <p>
            The PRD makes this a trust scene that must be answered in two lines, and asks the project manager to say which model
            ran and where. For a run on the device the whole answer is:
          </p>
          <div className="ff">
            <span className="ff-label">Answer</span>
            <span className="typed">Nowhere. It ran on your device, in this browser tab, on a 360M model. No server saw the text.</span>
          </div>
        </article>

        <article className="scene">
          <h3>An anonymisation gate before a partner tool</h3>
          <p>
            The PRD asks that partner answers name their source and note their residency. When a partner tool is hosted outside
            the EU, a small model on the device can take names, policy numbers and phone numbers out before the question leaves,
            and show exactly what will be sent.
          </p>
          <div className="ff">
            <span className="ff-label">Typed on the device</span>
            <span className="typed">Mrs Claire Moreau, policy HAB-2291-4471, asks about water damage cover.</span>
          </div>
          <div className="ff">
            <span className="ff-label">Sent to the partner tool</span>
            <span className="typed">[claimant], policy [policy number], asks about water damage cover.</span>
          </div>
          <p className="fine">Written by hand to show the idea. It is not model output, and the gate is not built.</p>
        </article>

        <article className="scene">
          <h3>A cost line that reads zero</h3>
          <p>
            The PRD requires a cost line on every skill run, with model costs charged and never hidden. For a run on the device
            the line is short:
          </p>
          <div className="ff">
            <span className="ff-label">Cost of this run</span>
            <span className="typed">0.0000 EUR — nothing billed; your device's electricity is not counted</span>
          </div>
          <p className="fine">
            No provider bills for the run. The work moves to the user's device instead: its processor, its battery and one
            download of the model. That is a real cost, and it is not zero — it is just not on the invoice.
          </p>
        </article>
      </div>
    </section>
  );
}

export function OnYourPhone() {
  const [env, setEnv] = useState<{ secure: boolean; isolated: boolean; storage: boolean; cores: number | null } | null>(null);
  useEffect(() => {
    setEnv({
      secure: window.isSecureContext === true,
      isolated: window.crossOriginIsolated === true,
      // the engine keeps the model in OPFS, which a browser only exposes to a secure context
      storage: typeof navigator.storage?.getDirectory === 'function',
      cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    });
  }, []);
  // The limits are the lab's, written in findings.json. Nothing about the phone is claimed here:
  // the earlier hand-written line ("over plain http it runs single-threaded") was measured to be
  // wrong on 2026-09-21 — the engine finds no storage backend and the app does not start at all.
  const phoneLimits = (findings.limits ?? []).filter((t) => /secure context|webview|phone/i.test(t));

  return (
    <section className="band" id="phone" aria-labelledby="phone-title">
      <h2 id="phone-title">Put it on your phone</h2>
      <div className="two-col">
        <div>
          <h3>Install it from the browser</h3>
          <ol className="steps">
            <li>
              <span>
                Open this page on the phone over HTTPS, or over a tunnel, or with <span className="typed">adb reverse</span> so
                the address really is http://localhost.
              </span>
            </li>
            <li>
              <span>
                Open the browser menu and choose Add to Home screen. In Safari on an iPhone it is under Share, then Add to Home
                Screen.
              </span>
            </li>
            <li>
              <span>Open SLM Lab from its icon and load a model once, on Wi-Fi. The model stays in the browser's storage.</span>
            </li>
          </ol>
          <h3>Android package</h3>
          <p>
            An Android package of the same app is being built. It is not finished.
            {apkPresent ? ' The current build is here, untested on most phones: ' : ''}
            {apkPresent && <a href="./slm-lab.apk">slm-lab.apk</a>}
          </p>
        </div>
        <div>
          <h3>What the lab has measured about phones</h3>
          {phoneLimits.length > 0 ? (
            <ul className="lab-limits-list">
              {phoneLimits.map((t) => (
                <li key={t}>
                  <Ticks text={t} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="unmeasured">Nothing measured about phones yet.</p>
          )}
          <div className="ff">
            <span className="ff-label">This page, on this device, right now</span>
            {env ? (
              <span className="typed env-lines">
                <span>secure context: {env.secure ? 'yes' : 'no'}</span>
                <span>storage the engine needs: {env.storage ? 'available' : 'not available, so the model cannot load'}</span>
                <span>cross-origin isolated: {env.isolated ? 'yes' : 'no'}</span>
                <span>logical cores reported: {env.cores ?? 'not reported'}</span>
                <span>threads available to a model: {env.isolated ? 'several' : 'one'}</span>
              </span>
            ) : (
              <span className="typed">checking</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <p>
        Built on <a href="https://github.com/ngxson/wllama" rel="noreferrer">wllama</a> and{' '}
        <a href="https://github.com/ggml-org/llama.cpp" rel="noreferrer">llama.cpp</a>, both MIT licensed.
        {noticesPresent && (
          <>
            {' '}
            <a href="./THIRD_PARTY-NOTICES.txt">Third-party notices</a>.
          </>
        )}
      </p>
      <p>An experiment of the BizLoop SLM Lab.</p>
    </footer>
  );
}
