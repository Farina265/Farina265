const CACHE = 'bakery-v63';
const HTML_FILE = '/index.html';

const REQUIRED_ASSETS = [
  '/',
  HTML_FILE,
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

const OPTIONAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
];

const HOSTS = new Set([
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
]);

async function cacheAssets() {
  const cache = await caches.open(CACHE);
  // Required local shell files must all be present; otherwise installation
  // fails and the previous working service worker remains active.
  await cache.addAll(REQUIRED_ASSETS);
  await Promise.all(OPTIONAL_ASSETS.map(async asset => {
    try {
      await cache.add(asset);
    } catch (error) {
      // One optional CDN asset must not prevent the service worker installing.
      console.warn('[SW] Cache failed:', asset, error);
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const allowed = url.origin === self.location.origin || HOSTS.has(url.hostname);
  if (!allowed) return; // Firebase API/Auth requests stay live and are never cached.

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const network = fetch(request).then(response => {
        if (response && response.ok) {
          cache.put(HTML_FILE, response.clone()).catch(() => {});
        }
        return response;
      });

      event.waitUntil(network.catch(() => {}));

      try {
        return await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 3000))
        ]);
      } catch (_) {
        const cached = await caches.match(HTML_FILE) || await caches.match('/');
        if (cached) return cached;
        return new Response(
          '<!doctype html><html><head><meta charset="utf-8"><title>Offline</title>' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<style>body{font-family:sans-serif;text-align:center;padding:40px;background:#f2f6f9;color:#14213d}h1{color:#0e8577}</style>' +
          '</head><body><h1>Offline</h1><p>Internet connection check karein aur page refresh karein.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          caches.open(CACHE)
            .then(cache => cache.put(request, response.clone()))
            .catch(() => {});
        }
        return response;
      });
    })
  );
});

