/* Served at /second-look/sw.js on the hosted site, where Second Look used to live before it moved to the site root.
   A browser that visited /second-look/ still has the old worker registered for that path, and it checks this URL for an
   update: this version replaces it, unregisters itself and reloads its tabs, which then follow the 301 to the root. It
   touches no cache (the root page's own worker manages those). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(self.registration.unregister()
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then((tabs) => Promise.all(tabs.map((t) => t.navigate(t.url).catch(() => null)))));
});
