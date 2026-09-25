# QA round — Second Look

Run 2026-09-25 on the v9 page with `test/qa_browser.js` (Playwright 1.56.1, headless Chromium 141, Linux, WebAssembly
single-threaded, no GPU) and the real models, by `.github/workflows/checks.yml` on pull request #3 (run 36119973624,
commit 5f46d6d), against two deployments of the same `index.html`:

- **the production image**, built from the repo's `Dockerfile` exactly as Railway builds it, with Second Look at the site
  root `/` and the web app under `/lab/`, behind `app/serve.py --public` (COOP/COEP, CSP meta, security headers);
- **the GitHub Pages layout**, `build_pages.py` → `dist/` served under a sub-path (`/slm-lab/`).

**Result: 76 of 76 checks pass on both.** The full table, one row per check with what was seen, is printed by every run
of the workflow (production-image job, step "The QA report as Markdown"); `test/qa_report_md.py qa/report.json` renders
it from a local run.

## What the round covers since v8 (39 → 76 checks)

- **Tour**: opt-in from the hero button, the highlighted button takes a real mouse click, focus returns when it closes.
- **Privacy lock**: the CSP's `connect-src 'self'`, "Test the lock" refused, refused requests not counted; receipts, the
  hero figure and the meter read the live request counter (0 → 1 after a real request).
- **The crash fix**: 8 decisions fired at once all answer, each receipt counts its own call, 0 page errors.
- **Pseudonymise**: the "check before sharing" wording with the measured leak rate (0.7515, E1a v4); a UK letter
  ("27 Harrow Road", "W2 5DY", "3rd of May 1961", "14 Park Lane", "M1 1AE", "May 3rd, 1958") fully replaced; a failed
  run says so and frees its button.
- **Volume view**, recorded and live; the calibration test re-runs; the hero button works after "Turn off"; the model
  bar's switches are hit-testable at 1280 px; the phone layout (390 px) has no shortcut hint and no horizontal scroll.
- **Offline**: a reload with the server shut and the browser offline (page, scripts and fonts from the service worker,
  models from IndexedDB); the worker leaves `lab/` alone (fetched online, never cached, fails offline).

## Each decision widget, each example (production image)

| Widget | Example | Answer | As labelled | p / score | ms | ms in the model | Tokens in | tok/s |
|---|---|---|---|---|---|---|---|---|
| route | Rear-end collision | Motor | yes | 0.922 | 21 | 20.4 | 30 | 1,473 |
| route | Leak through the ceiling | Home | yes | 0.945 | 17 | 16.7 | 24 | 1,439 |
| route | Skiing accident abroad | Health | no | 0.773 | 17 | 16.8 | 24 | 1,426 |
| route | Dog bite | Liability | yes | 0.999 | 16 | 16.1 | 23 | 1,429 |
| legal | Deadline and solicitor | Yes | yes | 0.795 | 14 | 13.6 | 40 | 2,935 |
| legal | Polite status question | No | yes | 0.009 | 12 | 12.3 | 36 | 2,929 |
| legal | Ombudsman threat | Yes | yes | 0.855 | 15 | 14.8 | 44 | 2,967 |
| vuln | Bereavement | Yes | yes | 0.421 | 15 | 15.1 | 45 | 2,978 |
| vuln | Elderly, no heating | Yes | yes | 0.206 | 15 | 14.6 | 43 | 2,937 |
| vuln | Windscreen chip | No | yes | 0.022 | 15 | 15.3 | 45 | 2,943 |
| urgency | Roof open to the rain | 3.3 / 5 | – | 3.31 | 43 | 42.8 | 132 | 3,083 |
| urgency | Stolen passport abroad | 3.4 / 5 | – | 3.41 | 45 | 44.2 | 137 | 3,100 |
| urgency | Sofa stain | 3.0 / 5 | – | 3.04 | 39 | 38.5 | 117 | 3,042 |
| guard | Promises payment | Yes | yes | 0.659 | 15 | 14.8 | 30 | 2,028 |
| guard | Asks for photos | No | yes | 0.009 | 10 | 9.5 | 27 | 2,839 |
| guard | Promises an amount | Yes | yes | 0.794 | 9 | 8.9 | 25 | 2,803 |
| custom | Rental car | Yes | yes | 0.9 | 11 | 11.1 | 32 | 2,880 |
| custom | Work laptop | Yes | yes | 0.543 | 10 | 9.9 | 28 | 2,834 |
| custom | Two passengers | Yes | yes | 0.945 | 11 | 11 | 32 | 2,920 |

15 of 16 labelled examples answered as labelled. The one disagreement is the routing example "Skiing accident abroad",
which the embedding model sends to Health (the hospital and the bill) rather than Travel: one of the six misrouted
messages behind the page's own 79 % routing figure, a model limit, not a page fault.

## Timings and the meter (production image)

| | |
|---|---|
| Models downloaded and started (local server) | 1.8 s |
| Second visit, models from IndexedDB | 1.4 s |
| Reload with no connection (page from the service worker, models from IndexedDB) | 1.1 s to ready |
| The 89-decision test | 1.4 s · 3,193 tokens · median 14.7 ms each |
| Legal flag | AUC 0.98, true cases average p 0.63, others 0.01 |
| Vulnerable flag | AUC 0.98, true cases average p 0.38, others 0.06 |
| Routing | 79 % right; 76 % straight through at p ≥ 0.60, 86 % of those right |
| Meter at the end of the run | 250 calls · 9,416 tokens · 4.12 s · 0 requests since ready |
| xtremedistil-l6-h256 | 172 calls · 7,445 tokens · median 14.0 ms · 2,892 tok/s |
| all-MiniLM-L6-v2 | 78 calls · 1,971 tokens · median 16.8 ms · 1,296 tok/s |

## Run it

```bash
cd app/second-look && ./build.sh && python3 build_pages.py     # build.sh checks every file against models.lock
python3 -m http.server 8792 --bind 127.0.0.1 --directory dist &
npm install --no-save playwright@1.56.1 && npx playwright install chromium
node test/qa_browser.js --url http://127.0.0.1:8792/ --out qa/report.json --shots qa
python3 test/qa_report_md.py qa/report.json
```

A runner without CDN access adds `--no-net` (the page loads its scripts from `vendor/`, which `build.sh` fills). Exit
code 0 means every check passed.
