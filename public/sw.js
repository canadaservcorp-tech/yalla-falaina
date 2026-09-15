/* Installable-app service worker. Deliberately conservative: only the static shell is cached and
   always network-first, so a deploy is picked up on the next load. API responses are never cached
   (they carry auth-scoped data such as contact details and chat). */
const CACHE = 'yalla-nsafer-shell-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('/')))
  );
});

// ---------- web push (lib/webPush.js sends these; routes/push.js manages the subscription) ----------
// The payload is plain JSON ({ title, body, url }) -- see lib/jobAlerts.js,
// the only sender today. A malformed/empty payload (should never happen from
// our own server, but a push service delivering a stale or truncated message
// is not impossible) falls back to a generic notification rather than
// throwing and silently showing nothing.
self.addEventListener('push', e => {
  let data = { title: 'Yalla Nsafer', body: 'You have a new update.', url: '/' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (err) { /* keep the fallback */ }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

// Focuses an already-open tab on this origin instead of always opening a new
// one -- a seeker who already has the app open should land back in it, not
// end up with a second tab.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data && e.notification.data.url ? e.notification.data.url : '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsList => {
      for (const c of clientsList) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
