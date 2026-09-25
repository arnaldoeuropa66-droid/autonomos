// Service Worker · Autónomo sin drama
// Estrategia: cache-first para archivos locales, network-first para APIs externas

const CACHE_NAME = 'autonomo-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Instalación: cachea los archivos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activación: limpia cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: estrategia según el tipo de recurso
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Las APIs externas (Groq, WebLLM, Google Fonts) van siempre a la red
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Recursos propios: cache-first con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachea respuestas nuevas
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});