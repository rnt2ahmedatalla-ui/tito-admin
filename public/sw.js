/* tito admin — إشعارات الأدمن فقط (من غير أي كاش علشان مفيش حاجة تبوظ) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const scope = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || 'tito', {
      body: data.body || '',
      icon: new URL('tito-icon-192.png', scope).href,
      badge: new URL('tito-badge-96.png', scope).href,
      dir: data.dir || 'auto',
      lang: data.lang || undefined,
      tag: data.tag || undefined,
      vibrate: [160, 80, 160],
      data: { url: data.url || '#/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '#/', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(target).catch(() => undefined); return c.focus(); }
      }
      return self.clients.openWindow(target);
    }),
  );
});
