// Hosti @Home service worker. Same-origin GET: network first, cache as the offline fallback.
// Bump VERSION when files change so old copies are dropped.
const VERSION = 'hh-2';
const SHELL = ['./', 'index.html', 'css/app.css', 'src/app.js', 'src/engine.js', 'src/store.js', 'src/sample.js', 'src/barcode.js',
  'vendor/zxing-reader.js', 'vendor/share.js', 'vendor/zxing_reader.wasm', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2', 'fonts/inter-latin-700-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
