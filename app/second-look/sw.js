/* Second Look: the offline shell. Keeps the page, the runtime script, the Word reader, the fonts and the icons, so a
   reload works with no connection. The models are not cached here: the page keeps them in IndexedDB (one copy, 57 MB). */
const CACHE = 'second-look-shell-v8';
const SHELL = ['./', 'index.html', 'vendor/ort.wasm.min.js', 'vendor/mammoth.browser.min.js', 'manifest.webmanifest', 'icon.svg',
  'assets/fonts/SourceSansPro-Regular.woff2', 'assets/fonts/SourceSansPro-SemiBold.woff2', 'assets/fonts/SourceSansPro-Bold.woff2', 'assets/fonts/SourceSerif4-Bold.woff2'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('second-look-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(models|ort)\//.test(url.pathname)) return;               // the page caches these itself, once
  if (req.mode === 'navigate') {                                    // the page: fresh when online, the kept copy when not
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('index.html', c)); return r; })
      .catch(() => caches.match('index.html').then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && /\/(vendor|assets)\//.test(url.pathname)) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
    return r;
  })));
});
