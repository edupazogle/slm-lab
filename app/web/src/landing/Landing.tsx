import { useCallback, useState } from 'react';
import { ClaimDemo, SAMPLE_NOTE, type DemoReport } from './ClaimDemo';
import { CopySheet } from './CopySheet';
import { BENCH_HREF, BizLoop, Footer, Measured, OnYourPhone, Strengths } from './sections';
import { ThemeToggle } from './ThemeToggle';
import { useRequestMeter } from './useRequestMeter';

const INITIAL: DemoReport = { modelLabel: null, pendingHost: null, modelFromCache: null, noteChars: SAMPLE_NOTE.length, stampedAt: null, liveRun: null };

export function Landing() {
  const meter = useRequestMeter();
  const [report, setReport] = useState<DemoReport>(INITIAL);
  const onReport = useCallback((r: DemoReport) => setReport(r), []);

  return (
    <>
      <a className="skip" href="#try">
        Skip to the demo
      </a>
      <header className="top-bar">
        <div className="wrap top-bar-in">
          <a className="wordmark" href="./">
            SLM Lab
          </a>
          <nav className="top-nav" aria-label="Sections">
            <a href="#try">Try it</a>
            <a href="#limits">Limits</a>
            <a href="#measured">Measured</a>
            <a href="#phone">On your phone</a>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="wrap">
        <div className="top">
          <section className="hero" aria-labelledby="hero-title">
            <h1 id="hero-title">AI that runs on this device.</h1>
            <p className="hero-lead">
              Small language models are loaded once into your browser. What you type is processed here, on this device, and
              goes nowhere.
            </p>
            <p className="actions">
              <a className="btn btn-primary" href="./chat.html">
                Open the chat
              </a>
              <a className="btn btn-secondary" href={BENCH_HREF}>
                Measure this device
              </a>
            </p>
          </section>

          <div className="top-aside">
            <div className="sheet-sticky">
              <CopySheet
                meter={meter}
                state={{
                  modelLabel: report.modelLabel,
                  pendingHost: report.pendingHost,
                  modelFromCache: report.modelFromCache,
                  noteChars: report.noteChars,
                  stampedAt: report.stampedAt,
                }}
              />
            </div>
          </div>

          <ClaimDemo onReport={onReport} />
        </div>

        <Strengths />
        <Measured liveRun={report.liveRun} />
        <BizLoop />
        <OnYourPhone />
      </main>

      <div className="wrap">
        <Footer />
      </div>
    </>
  );
}
