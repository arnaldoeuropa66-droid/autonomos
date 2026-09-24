// Service Worker · Autónomo sin drama
// Estrategia: cache-first para recursos propios y WebLLM,
// network-first con fallback a caché para el resto de terceros

const CACHE_VERSION = 'v2';
const CACHE_STATIC = `autonomo-static-${CACHE_VERSION}`;
const CACHE_WEBLLM = `autonomo-webllm-${CACHE_VERSION}`;
const CACHE_FONTS = `autonomo-fonts-${CACHE_VERSION}`;

// Recursos propios del sitio
const STATIC_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// Recursos externos que merece la pena cachear
const EXTERNAL_URLS = [
  'https://esm.run/@mlc-ai/web-llm'
];

// Instalación: precachear recursos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_URLS)),
      caches.open(CACHE_WEBLLM).then(cache => {
        // Cachear WebLLM de forma opcional (si falla, no bloquea la instalación)
        return cache.add(EXTERNAL_URLS[0]).catch(() => null);
      })
    ])
  );
  self.skipWaiting();
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => {
          return k.startsWith('autonomo-') &&
                 k !== CACHE_STATIC &&
                 k !== CACHE_WEBLLM &&
                 k !== CACHE_FONTS;
        }).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: estrategia por tipo de recurso
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorar peticiones que no sean GET
  if (request.method !== 'GET') return;

  // Ignorar peticiones a la API de Groq (siempre online)
  if (url.hostname === 'api.groq.com') return;

  // WebLLM: cache-first (importante, pesa mucho)
  if (url.hostname === 'esm.run' && url.pathname.includes('web-llm')) {
    event.respondWith(
      caches.open(CACHE_WEBLLM).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Fuentes de Google: cache-first con expiración larga
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Recursos propios del sitio: cache-first con revalidación
  if (url.origin === location.origin) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Resto de recursos externos: network-first con fallback a caché
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Mensajes desde la página (para futuras funcionalidades)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
