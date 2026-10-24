// Service worker: makes the app installable and usable offline.
// Bump VERSION whenever app files change so phones pick up the new version.
const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL = [
  "/",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

// Read-only API data the farmer should still see without a network.
const OFFLINE_API = ["/api/knowledge", "/api/events"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(SHELL_CACHE)).addAll(SHELL);
      // Best effort: have the calendar data ready even if the next visit is offline.
      await (await caches.open(DATA_CACHE)).addAll(OFFLINE_API).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(fallbackUrl ?? request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Always try for the latest page; fall back to the cached app when offline.
    event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
  } else if (OFFLINE_API.includes(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
  } else if (!url.pathname.startsWith("/api/")) {
    // Static files: network first so updates land quickly, cache when offline.
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});
