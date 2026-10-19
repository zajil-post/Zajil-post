const CACHE_NAME = 'zajil-pwa-v5';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/sw.js',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Let third-party assets and live API requests use the browser's normal network path.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network-first for same-origin assets; use the app shell only for failed navigations.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    })
  );
});


self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "تم تحديث أسعار الصرف في زاجل" };
  }
  const title = String(payload.title || "تحديث أسعار الصرف | زاجل").slice(0, 120);
  const options = {
    body: String(payload.body || "تم تحديث أسعار الصرف في منصة زاجل").slice(0, 240),
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: String(payload.tag || "zajil-rate-update").slice(0, 80),
    renotify: false,
    data: { url: typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
