/* Pierrot owner PWA service worker.
 *
 * Privacy rules:
 *   - No /api/* response is ever written to the Cache API.
 *   - No authenticated HTML under /admin/pierrot is cached.
 *   - Only the public offline shell, public manifest/icons and hashed
 *     same-origin build assets are cached.
 *
 * The worker is registered with scope /admin/pierrot. It never replaces the
 * public site's manifest or service worker behaviour.
 */

const VERSION = 'pierrot-owner-v1';
const OFFLINE_URL = '/pierrot-offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/admin/pierrot/manifest.webmanifest',
  '/admin/pierrot-icon/192',
  '/admin/pierrot-icon/512',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isPrivateApi(url) {
  return url.pathname.startsWith('/api/');
}

function isCacheableStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/admin/pierrot-icon/') ||
    url.pathname === '/admin/pierrot/manifest.webmanifest' ||
    url.pathname === OFFLINE_URL
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Hard privacy boundary: authenticated API and every other API response is
  // network-only. It is never stored in Cache Storage.
  if (isPrivateApi(url)) return;

  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/admin/pierrot')) {
      event.respondWith(
        fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached || Response.error()))
      );
    }
    return;
  }

  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PIERROT_CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }
});
