// The live meter's instrument: the browser's own Resource Timing record of what this page fetched.
//
// Scope, stated so nobody over-reads it: PerformanceObserver on the page sees the document itself
// (the navigation entry) and every resource the PAGE requested: scripts, styles, fonts, images,
// fetch() calls, and the model download, which wllama fetches on the main thread. It does NOT see
// requests made from inside a Web Worker (the engine's worker fetches its own .wasm file from this
// site). A request is recorded when it finishes, not when it starts. A redirect chain is reported
// under the first host. DevTools > Network shows all of it, which is why the sheet points there.
import { useEffect, useState } from 'react';

export interface HostCount {
  host: string;
  count: number;
}

export interface RequestMeter {
  supported: boolean;
  total: number;
  own: number;
  other: number;
  otherHosts: HostCount[];
}

const EMPTY: RequestMeter = { supported: true, total: 0, own: 0, other: 0, otherHosts: [] };

export function useRequestMeter(): RequestMeter {
  const [meter, setMeter] = useState<RequestMeter>(EMPTY);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined' || typeof performance === 'undefined') {
      setMeter({ ...EMPTY, supported: false });
      return;
    }
    const counts = new Map<string, number>();
    const seen = new Set<PerformanceEntry>();
    let frame = 0;

    const publish = () => {
      frame = 0;
      let own = 0;
      let other = 0;
      const otherHosts: HostCount[] = [];
      for (const [host, count] of counts) {
        if (host === location.host) own += count;
        else {
          other += count;
          otherHosts.push({ host, count });
        }
      }
      otherHosts.sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
      setMeter({ supported: true, total: own + other, own, other, otherHosts });
    };

    const add = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        let url: URL;
        try {
          url = new URL(entry.name, location.href);
        } catch {
          continue;
        }
        // blob: and data: URLs are memory, not network
        if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
        counts.set(url.host, (counts.get(url.host) ?? 0) + 1);
      }
      if (!frame) frame = requestAnimationFrame(publish);
    };

    add(performance.getEntriesByType('navigation'));
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => add(list.getEntries()));
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      setMeter({ ...EMPTY, supported: false });
      return;
    }
    return () => {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return meter;
}
