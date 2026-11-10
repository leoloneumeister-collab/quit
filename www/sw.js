// Offline support: serve the app shell from cache, refresh it in the background.
const CACHE = 'mossby-v1';
const SHELL = ['./', 'index.html', 'style.css', 'game.js', 'fonts/fonts.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => {
    const fresh = fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res.clone();
    }).catch(() => hit);
    return hit || fresh;
  }));
});
