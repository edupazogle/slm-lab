/* Second Look: the offline shell. Keeps the page, the runtime script, the Word reader, the fonts and the icons, so a
   reload works with no connection. The models are not cached here: the page keeps them in IndexedDB (one copy, 57 MB).
   Every file is fetched fresh when online (a redeploy is picked up even when this file and CACHE did not change), and the
   kept copy answers when the network does not. All paths are relative to this file, so it works at / and under a sub-path.
   At the site root (the Railway site) this worker's scope is the whole origin: it answers for Second Look's own files only,
   and leaves everything else to the network, the lab's pages under lab/ first of all (it would have cached their assets,
   and answered an offline visit to one of them with this page). */
const CACHE = 'second-look-shell-v11';
const SHELL = ['./', 'index.html', 'vendor/ort.wasm.min.js', 'vendor/mammoth.browser.min.js', 'manifest.webmanifest', 'icon.svg',
  'assets/fonts/SourceSansPro-Regular.woff2', 'assets/fonts/SourceSansPro-SemiBold.woff2', 'assets/fonts/SourceSansPro-Bold.woff2', 'assets/fonts/SourceSerif4-Bold.woff2'];
const KEEP = new Set(SHELL.map((u) => new URL(u, location).pathname));
const PAGE = [new URL('./', location).pathname, new URL('index.html', location).pathname];
// this page's own folders, as paths from this file: a pattern such as /\/assets\// also matched the lab's /lab/assets/
const OWN = ['vendor/', 'assets/'].map((d) => new URL(d, location).pathname);
const LAB = new URL('lab/', location).pathname;
self.addEventListener('install', (e) => {
  // cache: 'reload', so a new version is read from the server rather than from a copy the HTTP cache still holds
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('second-look-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith(LAB)) return;
  const page = req.mode === 'navigate' && PAGE.includes(url.pathname);
  // the page and its own files only; the models and the runtime's wasm (the page keeps them itself, once), other pages and
  // anything else on the origin go to the network untouched
  if (!page && !(req.mode !== 'navigate' && (KEEP.has(url.pathname) || OWN.some((d) => url.pathname.startsWith(d))))) return;
  e.respondWith(fetch(req).then((r) => {
    // only a good answer is kept: a 404 used to replace the kept page, and a reload with no connection then showed that
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(page ? 'index.html' : req, c)).catch(() => {}); }
    return r;
  }).catch(() => (page ? caches.match('index.html').then((r) => r || caches.match('./')) : caches.match(req)).then((r) => r || Response.error())));
});
