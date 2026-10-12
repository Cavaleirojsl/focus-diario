/* FOCUS — service worker (modo offline).
   Estratégia: rede primeiro (você sempre recebe a versão nova quando está online)
   e cache como reserva quando estiver sem internet. */
const CACHE = "focus-v1";
const CORE = ["./", "index.html", "css/style.css", "js/app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
const CHART_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled([
        ...CORE.map((url) => cache.add(url)),
        fetch(CHART_URL, { mode: "no-cors" }).then((response) => cache.put(CHART_URL, response))
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.href === CHART_URL) {
    event.respondWith(
      caches.match(CHART_URL).then((hit) => hit || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(CHART_URL, copy));
        return response;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("index.html")))
  );
});
