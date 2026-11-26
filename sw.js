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

self.addEventListener('push', (event) => {
  let data = { title: '日向翔陽 🏐', body: '哥哥，我有新訊息畀你！', icon: './assets/chibiSchool.png', url: './' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (_) {
    try { data.body = event.data.text(); } catch (__) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './assets/chibiSchool.png',
      badge: './icon.png',
      tag: data.tag || 'hinata-msg',
      renotify: true,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/assets/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
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
