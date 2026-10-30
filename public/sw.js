/* HamBazi service worker.
 * Scope: static assets only + an offline fallback. It NEVER stores HTML pages, API responses, server actions or anything
 * personal: a page the user is shown after sign-out must never come from a cache. Bump VERSION to drop old caches. */
const VERSION = 'v1';
const STATIC = `hambazi-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/img/logo.svg'];
const CACHEABLE = /^\/(_next\/static\/|img\/|fonts\/|icons\/)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('hambazi-') && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // forms / server actions go straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {                           // pages: network only; offline -> the static fallback
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (CACHEABLE.test(url.pathname)) {                      // immutable-ish static files: cache first
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
