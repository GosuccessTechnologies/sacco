/* DSMS member PWA service worker — guide §7.7.
   Precaches the offline shell; SWR for member GET APIs; never caches admin. */
const CACHE = 'dsms-member-v1';
const OFFLINE_URLS = ['/', '/login', '/dashboard', '/offline.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/webhooks')) return;

  // member API reads: stale-while-revalidate
  if (url.pathname.startsWith('/api/member/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((res) => { if (res.ok) cache.put(event.request, res.clone()); return res; })
          .catch(() => cached || Response.error());
        return cached || network;
      }),
    );
    return;
  }

  // pages: network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html').then((r) => r || Response.error())),
    );
  }
});
