const CACHE_VERSION = "2026-07-18-1";
const CACHE_NAME = `done-${CACHE_VERSION}`;
const APP_SHELL = [
  "/rep-bank/",
  "/rep-bank/index.html",
  "/rep-bank/style.css?v=2026-07-03-7",
  "/rep-bank/app.js?v=2026-07-18-1",
  "/rep-bank/manifest.json",
  "/rep-bank/done-logo.png",
  "/rep-bank/walnut-texture.webp",
  "/rep-bank/leather-texture.png",
  "/rep-bank/apple-touch-icon.png",
  "/rep-bank/icon-192.png",
  "/rep-bank/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.map(key => (key === CACHE_NAME ? null : caches.delete(key)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/rep-bank/index.html"));
    return;
  }

  if (["script", "style", "worker"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl ? cache.match(fallbackUrl) : undefined);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}
