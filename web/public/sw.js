// Pager service worker.
//
// The primary goal is installability — Chrome/Edge only surface the "Install
// app" prompt when a page has a manifest AND a service worker with a real
// fetch handler. Beyond that we keep this deliberately small: static shell
// assets get network-first caching so the app opens fast on subsequent
// launches, but every request still goes to the network first so admins
// never see stale data. There's no precache list to maintain.

const CACHE = "pager-shell-v1";

self.addEventListener("install", (event) => {
  // Activate this SW immediately on install so newer versions don't have to
  // wait for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any old cache buckets from previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Never touch the tracker endpoints or the admin API — we always want live
  // data straight from the network, and caching /pub/collect would be broken
  // (it's a POST with side effects).
  const url = new URL(req.url);
  if (url.pathname.startsWith("/pub/") || url.pathname.startsWith("/int/api/")) {
    return; // fall through to the default network handling
  }

  // Only cache same-origin GETs. Cross-origin (Google Fonts CDN etc.)
  // handles its own caching via HTTP headers.
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        // Store a copy for offline use next time. Clone because bodies stream once.
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        // Offline — try to serve from cache if we've seen this before.
        const cached = await caches.match(req);
        if (cached) return cached;
        throw new Error("offline and not cached");
      }
    })(),
  );
});
