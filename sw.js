self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  // معالج fetch افتراضي لتشغيل الـ PWA بدون أخطاء
});
