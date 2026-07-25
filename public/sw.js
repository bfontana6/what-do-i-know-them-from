/**
 * Service Worker — App Shell Cache
 *
 * Strategy: Cache-first for static assets; network-first for navigation and API.
 * On install: pre-cache the app shell so the app loads offline from home screen.
 * On activate: clean up stale caches from previous SW versions.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `app-shell-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// App shell resources to pre-cache on install
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Take control immediately rather than waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([STATIC_CACHE, IMAGE_CACHE]);

  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !currentCaches.has(key))
          .map((key) => caches.delete(key))
      );
    }).then(() => {
      // Claim all open clients so the new SW takes effect without a reload
      return self.clients.claim();
    })
  );
});

// ── Fetch: route-based caching strategy ──────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests and browser extensions
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // API routes and external APIs → network only, no caching
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('themoviedb.org')
  ) {
    return;
  }

  // Images (TMDB, icons) → cache-first with long-lived image cache
  if (
    request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;

          return fetch(request).then((response) => {
            // Only cache same-origin or TMDB images
            if (
              response.ok &&
              (url.origin === self.location.origin ||
                url.hostname.includes('image.tmdb.org'))
            ) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        });
      })
    );
    return;
  }

  // Static assets (_next/static) → cache-first, they are content-addressed
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;

          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Navigation (HTML pages) → stale-while-revalidate
  // Return cached shell immediately, update cache in background
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match('/').then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached || new Response('Offline', { status: 503 }));

          // Return cached immediately if available, else wait for network
          return cached || networkFetch;
        });
      })
    );
    return;
  }
});
