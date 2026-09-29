/**
 * Alikati Beauty Home — service worker.
 *
 * Deliberately conservative for an e-commerce site: shop prices, stock and order status must
 * never be served stale, so only genuinely static assets are cached aggressively. Pages use
 * network-first with a cached fallback, and anything carrying personal or live data
 * (/api, /admin, /checkout, /cart, /account, /order) is never cached at all.
 *
 * Bump CACHE_VERSION to invalidate every cache on the next visit.
 */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `abh-static-${CACHE_VERSION}`;
const PAGE_CACHE = `abh-pages-${CACHE_VERSION}`;

const PRECACHE = ['/', '/shop', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Requests that must always hit the network — never read from, or write to, a cache. */
const NEVER_CACHE = [
  '/api/',
  '/admin',
  '/login',
  '/cart',
  '/checkout',
  '/account',
  '/order/',
  '/track-order',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // A failed precache entry must not abort the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Build-time assets are content-hashed in Next.js, so they are safe to cache forever. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpe?g|webp|svg|gif|ico|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Supabase, supplier image CDNs, WhatsApp) is left entirely to the browser.
  if (url.origin !== self.location.origin) return;

  if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;

  // Immutable build output and media: cache first, they never change.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Page navigations: network first (fresh prices and stock), cached copy if offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          const home = await caches.match('/');
          if (home) return home;

          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Offline — Alikati Beauty Home</title>' +
              '<body style="font-family:system-ui;padding:2rem;text-align:center;background:#FDFBF8;color:#2A1B15">' +
              '<h1 style="font-size:1.25rem">You are offline</h1>' +
              '<p style="color:#6B5A52">Please reconnect to browse products and prices.</p>' +
              '</body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
          );
        })
    );
  }
});

/** Allows the page to trigger an immediate update after a deploy. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
