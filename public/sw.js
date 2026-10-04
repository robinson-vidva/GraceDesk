// GraceDesk service worker: cache the static shell so the app is installable
// and static assets load offline. Dynamic (tenant/auth) pages are never cached.
const CACHE = 'gracedesk-v2';
const ASSETS = ['/css/app.css', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && ASSETS.includes(url.pathname)) {
    // Network first, so a new stylesheet shows straight away; the cached copy
    // is only used when the network is unavailable.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req)),
    );
  }
});
