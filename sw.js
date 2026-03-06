// KurirTrack Service Worker
const CACHE_NAME = 'kurirtrack-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/share.html',
    '/go.html',
    '/css/global.css',
    '/css/owner.css',
    '/css/driver.css',
    '/js/firebase-config.js',
    '/js/auth.js',
    '/js/map-utils.js',
    '/js/gps-tracker.js',
    '/js/route-engine.js',
    '/js/speed-monitor.js',
    '/manifest.json'
];

// Install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Don't cache share target requests (they have query params)
    if (event.request.url.includes('share.html?') || event.request.url.includes('go.html?')) {
        event.respondWith(fetch(event.request).catch(() => caches.match(event.request.url.split('?')[0])));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
