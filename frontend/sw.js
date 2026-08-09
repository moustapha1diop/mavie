// Service worker "Ma Vie" — met en cache le "squelette" de l'app (HTML/CSS/JS/icônes)
// pour un chargement instantané et une tolérance aux coupures réseau.
// Les appels à /api/* ne sont JAMAIS mis en cache : les données (documents,
// transactions, solde) doivent toujours venir du serveur, pour rester à jour
// et ne jamais afficher des informations financières périmées.

const CACHE_NAME = "ma-vie-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Jamais de cache pour l'API : les données doivent toujours être fraîches.
  if (url.pathname.startsWith("/api/")) {
    return; // laisse le navigateur faire une requête réseau normale
  }

  // Stratégie "network first, fallback cache" pour le reste (app shell).
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});
