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
}
interface Findings {
  updated?: string;
  machine?: string;
  inBrowser?: FindingRow[];
  limits?: string[];
}
const findings = findingsJson as Findings;

// Vite resolves these at build time. An empty object means the file is not in public/, so no link.
const apkPresent = Object.keys(import.meta.glob('/public/slm-lab.apk', { query: '?url' })).length > 0;
const noticesPresent = Object.keys(import.meta.glob('/public/THIRD_PARTY-NOTICES.txt', { query: '?url' })).length > 0;

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
  'Costing nothing per run. No provider, no per-token bill.',
];

const NOT_GOOD = [
  'Open-ended reasoning, or any problem with several steps.',
  'Facts they were never given. They answer anyway.',
  'Long documents. Prompt processing in the browser is slow, so a long input means a long wait before the first word.',
  'Languages the model was not trained well on.',
  'Anything where a wrong answer is expensive and nobody checks.',
];

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
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Num({ v, unit }: { v: number | null | undefined; unit?: string }) {
  if (v === null || v === undefined || Number.isNaN(v)) return <span className="unmeasured">not measured yet</span>;
  return (
    <span className="typed">
      {v}
      {unit ? ` ${unit}` : ''}
    </span>
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
              <td data-label="Status">{r.status ?? 'not recorded'}</td>
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
              <Num v={liveRun?.prefillTokS != null ? Number(liveRun.prefillTokS.toFixed(1)) : null} unit="tokens/s" />
            </td>
            <td data-label="Writing (decode)">
              <Num v={liveRun?.decodeTokS != null ? Number(liveRun.decodeTokS.toFixed(1)) : null} unit="tokens/s" />
            </td>
            <td data-label="Status">
              {liveRun
                ? `This device, one run of the demo above, ${liveRun.generatedTokens ?? 'an unknown number of'} tokens written. Too short to be a benchmark.`
                : 'Run the demo above and this row fills in.'}
            </td>
          </tr>
        </tbody>
      </table>

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
            <span className="typed">0.0000 EUR, model on device</span>
          </div>
          <p className="fine">
            No provider bills for the run. The work moves to the user's device: its battery, and one download of the model.
          </p>
        </article>
      </div>
    </section>
  );
}

export function OnYourPhone() {
  const [env, setEnv] = useState<{ secure: boolean; isolated: boolean; cores: number | null } | null>(null);
  useEffect(() => {
    setEnv({
      secure: window.isSecureContext === true,
      isolated: window.crossOriginIsolated === true,
      cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    });
  }, []);
  const lanLimit = (findings.limits ?? []).find((t) => /secure context/i.test(t));

  return (
    <section className="band" id="phone" aria-labelledby="phone-title">
      <h2 id="phone-title">Put it on your phone</h2>
      <div className="two-col">
        <div>
          <h3>Install it from the browser</h3>
          <ol className="steps">
            <li>Open this page in the phone's browser.</li>
            <li>
              Open the browser menu and choose Add to Home screen. In Safari on an iPhone it is under Share, then Add to Home
              Screen.
            </li>
            <li>Open SLM Lab from its icon and load a model once, on Wi-Fi. The model stays in the browser's storage.</li>
          </ol>
          <h3>Android package</h3>
          <p>
            An Android package of the same app is being built. It is not finished.
            {apkPresent ? ' The current build is here, untested on most phones: ' : ''}
            {apkPresent && <a href="./slm-lab.apk">slm-lab.apk</a>}
          </p>
        </div>
        <div>
          <h3>One honest limit</h3>
          <p>
            {lanLimit ??
              'A phone reaching the app over plain http on the local network is not a secure context, so it runs single-threaded.'}
          </p>
          <p>
            That is the case when the phone opens a laptop's address such as http://192.168.1.20:8097. Over https, or on the
            laptop itself, the browser allows several threads.
          </p>
          <div className="ff">
            <span className="ff-label">This page, on this device, right now</span>
            {env ? (
              <span className="typed env-lines">
                <span>secure context: {env.secure ? 'yes' : 'no'}</span>
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
