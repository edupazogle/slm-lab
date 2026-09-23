// The receipt under every answer. It answers "which model did this, where did it run, what did it cost" with measured
// numbers only: nothing here is estimated, and a number the engine did not report reads "not measured".
//
// Two of these fields are claims about privacy and money, so they are labelled for exactly what they measure:
//  - the request count is what THIS PAGE's main thread did (PerformanceObserver 'resource'). The engine runs in a Web
//    Worker, whose own fetches land on the worker's timeline and are invisible here, so the number is never shown as
//    bare proof; the note says what it covers and points at DevTools → Network, which sees everything.
//  - the cost is what is billed for this answer, which is nothing. It is not a claim that the run was free: the
//    electricity the device burned is not counted.
import type { GenerationStats } from '../utils/types';
import { formatCount, formatDuration, formatRate } from '../utils/format';

export function Receipt({ stats, stamp }: { stats: GenerationStats; stamp?: boolean }) {
  const net = stats.networkRequests;
  const notes: string[] = [];
  if (stats.stopped) notes.push('You stopped this answer, so the totals cover what was written.');
  if (stats.finishReason === 'length') notes.push('The answer stopped at the token limit set in Settings.');
  if (stats.droppedTurns)
    notes.push(
      `${stats.droppedTurns} older turn${stats.droppedTurns === 1 ? ' was' : 's were'} left out so the prompt fitted the context window.`
    );
  notes.push(
    net == null
      ? 'This browser does not report resource timings, so requests from this page could not be counted.'
      : net > 0
        ? `Requests from this page during this answer: ${stats.networkHosts.join(', ') || 'same origin'}.`
        : "Counted on this page's main thread only. The engine's worker keeps its own timeline, which a page cannot read; it reads the model from local storage, not from the network. DevTools → Network shows every request from both."
  );
  notes.push("Nothing is billed for this answer. Your device's electricity is not counted.");

  return (
    <div className="receipt-wrap">
      <div className="receipt">
        <div>
          <span>Model</span>
          <b>{stats.modelName}</b>
        </div>
        <div>
          <span>Ran on</span>
          <b>{stats.ranOn}</b>
        </div>
        <div>
          <span>Tokens in</span>
          <b>{formatCount(stats.tokensIn)}</b>
        </div>
        <div>
          <span>Tokens out</span>
          <b>{formatCount(stats.tokensOut)}</b>
        </div>
        <div>
          <span>Speed{stats.speedSource === 'wall-clock' ? ', page clock' : ''}</span>
          <b>{formatRate(stats.decodeTokS)}</b>
        </div>
        <div>
          <span>First token</span>
          <b>{formatDuration(stats.ttftMs)}</b>
        </div>
        <div>
          <span>Network requests, this page</span>
          <b>{net == null ? 'not counted' : formatCount(net)}</b>
        </div>
        <div>
          <span>Cost billed</span>
          <b>0.0000 EUR</b>
        </div>
      </div>
      {stamp && (
        <p className="stamp-row">
          <span className="stamp" data-land="1">
            Stayed on this device
          </span>
        </p>
      )}
      <p className="receipt-note">{notes.join(' ')}</p>
    </div>
  );
}
