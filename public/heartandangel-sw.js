/*
 * Heart & Angel PWA service worker.
 *
 * Scope: /heartandangel only. It never controls /temple, /vigil, /tribute,
 * /admin/pierrot or the rest of merkurov.love.
 *
 * Privacy rules:
 *   - Never cache /api/* or checkout/payment responses.
 *   - Never cache HTML navigations; they are network-first, with a branded
 *     offline page as the only fallback.
 *   - Only cache hashed build assets, local PWA files and public Heart & Angel
 *     artwork that is requested through Next.js image optimisation.
 *   - Never delete Pierrot's caches (pierrot-*); only own caches are removed.
 */

const CACHE_VERSION = 'heartandangel-v1';
const CACHE_PREFIX = 'heartandangel-';
const OFFLINE_URL = '/heartandangel/offline.html';
const IMAGE_ORIGIN = 'https://txvkqcitalfbjytmnawq.supabase.co';

const CORE_ASSETS = [
  OFFLINE_URL,
  '/heartandangel/manifest.webmanifest',
  '/heartandangel/icons/icon-192.png',
  '/heartandangel/icons/icon-512.png',
  '/heartandangel/icons/maskable-512.png',
  '/heartandangel/icons/apple-touch-icon.png',
];

// Public artwork only. Nothing user-specific, paid or private is allowed here.
const REMOTE_IMAGE_PREFIXES = [
  '/storage/v1/object/public/heartandangel/',
  '/storage/v1/object/public/media/',
  '/storage/v1/object/public/artifacts/Postcard/',
];

function isHeartAndAngelPath(pathname) {
  return pathname === '/heartandangel' || pathname.startsWith('/heartandangel/');
}

function isLocalCacheFirst(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/heartandangel/icons/') ||
    pathname.startsWith('/heartandangel/splash/') ||
    pathname === '/heartandangel/manifest.webmanifest' ||
    pathname === OFFLINE_URL
  );
}

/**
 * Only cache images that Next.js optimises from an approved public source.
 * This keeps `/_next/image` from becoming a cache for arbitrary or personal
 * images rendered anywhere inside the Heart & Angel scope.
 */
function isAllowedOptimizedImage(url) {
  if (url.pathname !== '/_next/image') return false;

  const raw = url.searchParams.get('url');
  if (!raw) return false;

  try {
    const source = new URL(raw, self.location.origin);

    if (source.origin === self.location.origin) {
      return source.pathname.startsWith('/heartandangel/');
    }

    if (source.origin !== IMAGE_ORIGIN) return false;

    return REMOTE_IMAGE_PREFIXES.some((prefix) =>
      source.pathname.startsWith(prefix)
    );
  } catch {
    return false;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return Response.error();
  }
}

async function navigationNetworkFirst(request) {
  try {
    // Bypass the HTTP cache: navigation is genuinely network-first, and the
    // cache never stores HTML. Without `no-store` the browser could serve a
    // stale document while offline instead of the branded fallback.
    return await fetch(request, { cache: 'no-store' });
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    const offline = await cache.match(OFFLINE_URL);

    return offline || Response.error();
  }
}

let coreRefresh = null;

/**
 * Re-cache the small offline shell if it disappeared.
 *
 * The pre-existing Pierrot worker clears every cache that is not its own when
 * it activates. We are not allowed to change Pierrot, so Heart & Angel
 * self-heals on the next online navigation instead of silently losing its
 * offline fallback.
 */
async function ensureCoreAssets() {
  const cache = await caches.open(CACHE_VERSION);

  if (await cache.match(OFFLINE_URL)) return;

  if (!coreRefresh) {
    coreRefresh = Promise.all(
      CORE_ASSETS.map((url) => cache.add(url).catch(() => undefined))
    ).finally(() => {
      coreRefresh = null;
    });
  }

  return coreRefresh;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // A missing optional asset must not block the whole installation.
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Payment, API, auth and user responses are always network-only.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation is network-first. HTML is never stored in the cache.
  if (request.mode === 'navigate') {
    if (!isHeartAndAngelPath(url.pathname)) return;

    event.respondWith(navigationNetworkFirst(request));
    event.waitUntil(ensureCoreAssets());
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (isAllowedOptimizedImage(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isLocalCacheFirst(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
