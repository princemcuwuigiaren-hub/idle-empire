// Idle Empire service worker.
// App shell (html, manifest, icons): network-first, so every deploy is picked up
// on the next online load with no version bump. Cache is only the offline fallback.
// Version-pinned vendor files (Firebase, fonts): cache-first, they never go stale.
// Everything else (Firestore, Gemini, auth helper paths): straight to the network.
// Bump SHELL_CACHE only when PRECACHE changes.
const SHELL_CACHE = 'idle-empire-shell-v15';
const SHELL = ['./idle-empire.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-192-maskable.png', './icon-512-maskable.png'];
const VENDOR = [
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&display=swap'
];
const VENDOR_HOSTS = ['www.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(cache =>
    // One file failing must not sink the whole install.
    Promise.all([...SHELL, ...VENDOR].map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
    ))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase auth helper paths (redirect sign-in) must reach the network untouched.
  if (url.origin === self.location.origin && url.pathname.startsWith('/__/')) return;

  // Vendor: cache-first.
  if (VENDOR_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // App shell: network-first, cache fallback offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./idle-empire.html') : Response.error()))
      )
    );
  }
  // Anything else: not handled, goes to the network.
});
