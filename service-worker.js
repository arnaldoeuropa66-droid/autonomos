// Service Worker · Autónomo sin drama
// v11 · Corregido para PWA instalada

const CACHE_VERSION = 'v11';
const CACHE_STATIC = `autonomo-static-${CACHE_VERSION}`;
const CACHE_WEBLLM = `autonomo-webllm-${CACHE_VERSION}`;
const CACHE_FONTS = `autonomo-fonts-${CACHE_VERSION}`;

const STATIC_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// Instalación: precachear recursos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(STATIC_URLS).catch(() => {
        return Promise.resolve();
      });
    })
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

  if (request.method !== 'GET') return;

  if (url.hostname === 'api.groq.com') return;

  if (url.hostname === 'esm.run') return;

  // ==========================================
  // CLAVE: peticiones de navegación (abrir la PWA)
  // Van siempre a red primero, con fallback a caché
  // ==========================================
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(cache => {
              cache.put('./index.html', clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match('./index.html').then(cached => {
            return cached || caches.match('./');
          });
        })
    );
    return;
  }

  // ==========================================
  // Resto de recursos: cache-first con revalidación
  // ==========================================

  // Fuentes
  if (url.origin === location.origin && url.pathname.includes('/fonts/')) {
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
