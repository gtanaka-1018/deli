// 末尾のハッシュは APP_SHELL の中身から決まる。配信内容を変えたら必ず更新する。
// 値は tests/service-worker.test.js が検証し、ずれていれば正しい値を教える。
const CACHE_NAME = "okumeter-v37-47cbb979";
const APP_SHELL = [
  "/",
  "/index.html",
  "/theme.css",
  "/styles.css",
  "/x-theme.css",
  "/tax-calculator.js",
  "/backup-vault.js",
  "/payout-data.js",
  "/maintenance-data.js",
  "/maintenance.js",
  "/app.js",
  "/traffic.js",
  "/referral.js",
  "/supabase-client.js",
  "/cloud-sync.js",
  "/ranking.js",
  "/manifest.webmanifest",
  "/brand-mark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cacheKey = url.pathname === "/" ? "/index.html" : request;
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
