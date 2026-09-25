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
          <nav className="top-nav" aria-label="Sections and pages">
            <a href="#try">Try it</a>
            <a href="#limits">Limits</a>
            <a href="#measured">Measured</a>
            <a href="#phone">On your phone</a>
            <a href="second-look/">Second Look</a>
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
            {/* served beside this page at /second-look/. Following the link is a navigation, not a request this page
                makes, so the "Your copy" counter does not count it */}
            <p className="hero-other">
              <a href="second-look/">Second Look</a> is the lab's other page. Two smaller models, also running in the
              browser, route a claim message and flag it, and each decision comes with a probability.
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
