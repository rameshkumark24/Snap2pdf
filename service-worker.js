// Service Worker for Snap2PDF - Enables Offline Functionality

const CACHE_NAME = "snap2pdf-cache-v2";
const FILES_TO_CACHE = [
  './',
  './index.html',
  './about.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/logo.png',
  './libs/fabric.min.js',
  './libs/jspdf.umd.min.js',
  './libs/pdf-lib.min.js',
  './libs/pdf.js',
  './libs/pdf.worker.js'
];

// Install Event: Cache all the essential files.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching app shell');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// Activate Event: Clean up old caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('Service Worker: Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Fetch Event: Serve from cache first, with a network fallback.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // If the resource is in the cache, serve it.
      // Otherwise, fetch it from the network.
      return response || fetch(event.request);
    })
  );
});
