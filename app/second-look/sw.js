/* Second Look: the offline shell. Keeps the page, the runtime script, the Word reader, the fonts and the icons, so a
   reload works with no connection. The models are not cached here: the page keeps them in IndexedDB (one copy, 57 MB).
   Every file is fetched fresh when online (a redeploy is picked up even when this file and CACHE did not change), and the
   kept copy answers when the network does not. All paths are relative to this file, so it works at / and under a sub-path. */
const CACHE = 'second-look-shell-v10';
const SHELL = ['./', 'index.html', 'vendor/ort.wasm.min.js', 'vendor/mammoth.browser.min.js', 'manifest.webmanifest', 'icon.svg',
  'assets/fonts/SourceSansPro-Regular.woff2', 'assets/fonts/SourceSansPro-SemiBold.woff2', 'assets/fonts/SourceSansPro-Bold.woff2', 'assets/fonts/SourceSerif4-Bold.woff2'];
const KEEP = new Set(SHELL.map((u) => new URL(u, location).pathname));
const PAGE = [new URL('./', location).pathname, new URL('index.html', location).pathname];
self.addEventListener('install', (e) => {
  // cache: 'reload', so a new version is read from the server rather than from a copy the HTTP cache still holds
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('second-look-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(models|ort)\//.test(url.pathname)) return;               // the page caches these itself, once
  const nav = req.mode === 'navigate', page = nav && PAGE.includes(url.pathname);
  e.respondWith(fetch(req).then((r) => {
    // only a good answer for the page itself or a shell file is kept: a 404, or another file opened in a tab, used to
    // replace the kept page, and a reload with no connection then showed that instead of the page
    if (r.ok && (page || (!nav && (KEEP.has(url.pathname) || /\/(vendor|assets)\//.test(url.pathname))))) {
      const c = r.clone(); caches.open(CACHE).then((x) => x.put(page ? 'index.html' : req, c)).catch(() => {});
    }
    return r;
  }).catch(() => (nav ? caches.match('index.html').then((r) => r || caches.match('./')) : caches.match(req)).then((r) => r || Response.error())));
});
