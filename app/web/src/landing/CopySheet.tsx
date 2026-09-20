import { useEffect, useRef, useState } from 'react';
import type { RequestMeter } from './useRequestMeter';

export interface SheetState {
  /** label of the model in this tab's memory, or null */
  modelLabel: string | null;
  /** host a download is running against right now (Resource Timing only records it once it ends) */
  pendingHost: string | null;
  noteChars: number;
  /** when the first on-device run completed; null until then */
  stampedAt: Date | null;
}

function stampDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CopySheet({ meter, state }: { meter: RequestMeter; state: SheetState }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  // The stamp is the page's one orchestrated moment. It lands when the run is complete AND the
  // sheet is on screen, so a visitor on a phone (where the sheet sits above the demo) still sees it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { threshold: 0.55 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (state.stampedAt && inView) setLanded(true);
  }, [state.stampedAt, inView]);

  const n = (v: number) => v.toLocaleString('en-GB');

  return (
    <aside className="copy-sheet sheet" id="your-copy" ref={ref} aria-labelledby="your-copy-title">
      <h2 id="your-copy-title" className="sheet-title">
        Your copy
      </h2>
      <p className="sheet-sub">What this page has done since it loaded, as counted by your browser.</p>

      {meter.supported ? (
        <dl aria-live="polite">
          <dt>Requests made by this page</dt>
          <dd data-meter="total">{n(meter.total)}</dd>
          <dt className="sub">to this site</dt>
          <dd data-meter="own">{n(meter.own)}</dd>
          <dt className="sub">to other hosts</dt>
          <dd data-meter="other">{n(meter.other)}</dd>
          {meter.otherHosts.map((h) => (
            <HostRow key={h.host} host={h.host} count={n(h.count)} />
          ))}
          {state.pendingHost && (
            <>
              <dt className="sub sub2">download in progress</dt>
              <dd data-meter="pending">{state.pendingHost}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="sheet-note">This browser does not report request timing to the page. DevTools still shows every request.</p>
      )}

      {meter.other > 0 && (
        <p className="sheet-note">
          Downloads only: the model file, which Hugging Face redirects to its CDN. Nothing you typed is in those requests.
        </p>
      )}

      <hr />
      <dl>
        <dt>Model loaded</dt>
        <dd data-meter="model">{state.modelLabel ?? 'none'}</dd>
        <dt>Characters in the note</dt>
        <dd data-meter="chars">{n(state.noteChars)}</dd>
        <dt className="sub">that left this device</dt>
        <dd data-meter="sent">0</dd>
        <dt>Cost of this session</dt>
        <dd data-meter="cost">0.0000 EUR</dd>
      </dl>
      <hr />

      <div className="stamp-slot" data-filled={landed ? '1' : '0'}>
        {landed && state.stampedAt ? (
          <>
            <span className="stamp" data-land="1">
              Processed on this device
            </span>
            <span className="stamp-date typed">{stampDate(state.stampedAt)}</span>
          </>
        ) : (
          <span className="stamp-hint">{state.stampedAt ? 'Stamped' : 'Stamped when a run completes on this device'}</span>
        )}
      </div>

      <p className="sheet-note">
        Check it yourself: open DevTools, then Network, and run the demo. The note never appears in a request, because the page
        never sends it. The engine's worker also fetches its own program file from this site; DevTools lists that too.
      </p>
    </aside>
  );
}

function HostRow({ host, count }: { host: string; count: string }) {
  return (
    <>
      <dt className="sub sub2">{host}</dt>
      <dd data-meter-host={host}>{count}</dd>
    </>
  );
}
