// Counts the network requests this page makes between two moments, using the browser's own Resource Timing feed
// (PerformanceObserver, entry type 'resource'). The receipt under every answer shows the count for the span
// send -> done; for an on-device answer the expected value is 0.
//
// What it can and cannot see, stated plainly because the number is a privacy claim:
//  - it sees every fetch/XHR/img/script/font request made by this page's main thread;
//  - blob: and data: URLs are local reads, not network, so they are excluded;
//  - requests made from inside a Web Worker land on the worker's own timeline and are NOT seen here. The engine's
//    worker does no networking while generating (the model is read from local storage), and the independent check is
//    the browser's own Network panel, which the UI points to.
// If the browser has no PerformanceObserver for resources, `count` is null and the receipt says so instead of "0".

export interface NetworkReading {
  count: number | null;
  hosts: string[];
}

export interface NetworkMeter {
  stop(): NetworkReading;
}

export function startNetworkMeter(): NetworkMeter {
  const names: string[] = [];
  const t0 = performance.now();
  let observer: PerformanceObserver | null = null;
  const take = (list: PerformanceEntryList) => {
    for (const e of list) if (e.startTime >= t0) names.push(e.name);
  };
  try {
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('resource')
    ) {
      observer = new PerformanceObserver((list) => take(list.getEntries()));
      observer.observe({ type: 'resource', buffered: false });
    }
  } catch {
    observer = null;
  }

  return {
    stop(): NetworkReading {
      if (!observer) return { count: null, hosts: [] };
      take(observer.takeRecords());
      observer.disconnect();
      const hosts = new Set<string>();
      let count = 0;
      for (const name of names) {
        try {
          const u = new URL(name, location.href);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
          count++;
          hosts.add(u.host);
        } catch {
          count++;
        }
      }
      return { count, hosts: [...hosts] };
    },
  };
}
