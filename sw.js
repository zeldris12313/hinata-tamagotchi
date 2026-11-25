const ASSET_CACHE = 'hinata-assets-v1';
const HTML_CACHE = 'hinata-html-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== ASSET_CACHE && k !== HTML_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. Assets (images): Permanent Cache-First by exact URL (incl. ?v=).
  //    Unchanged images NEVER reload; bumped ?v= fetches fresh & cleans old version of same file.
  if (url.pathname.includes('/assets/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          // Remove any older ?v= version of the same image pathname to keep storage tidy
          const keys = await cache.keys();
          for (const k of keys) {
            try {
              const ku = new URL(k.url);
              if (ku.pathname === url.pathname && k.url !== req.url) {
                await cache.delete(k);
              }
            } catch (_) {}
          }
          cache.put(req, fresh.clone());
        }
        return fresh;
      })
    );
    return;
  }

  // 2. HTML / navigation: Network-First so index.html updates apply immediately
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((fresh) => {
          if (fresh && fresh.ok) {
            const copy = fresh.clone();
            caches.open(HTML_CACHE).then((c) => c.put(req, copy));
          }
          return fresh;
        })
        .catch(() => caches.match(req))
    );
  }
});
