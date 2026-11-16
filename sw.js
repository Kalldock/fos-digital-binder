/* FOS Digital Binder – Offline-Speicher (Version 5.3) */
const CACHE = 'fos-binder-5.3-cb8e17be44';
const FILES = [
"./",
"css/app.css",
"css/hyrule.css",
"css/lcars.css",
"css/poketch.css",
"css/switch.css",
"css/wii.css",
"fonts/antonio-OFL.txt",
"fonts/antonio-wght.ttf",
"fonts/fos-lcd-pixel.ttf",
"fonts/nunito-OFL.txt",
"fonts/nunito-wght.ttf",
"fonts/outfit-OFL.txt",
"fonts/outfit-wght.ttf",
"fonts/wild-breath-LIZENZ.txt",
"fonts/wild-breath.ttf",
"icons/apple-touch-icon.png",
"icons/icon-180.png",
"icons/icon-192.png",
"icons/icon-512.png",
"img/stone-light.png",
"img/stone.png",
"index.html",
"js/app.js",
"js/calc-engine.js",
"js/calculator.js",
"js/core.js",
"js/editor.js",
"js/expr.js",
"js/formulas.js",
"js/hyrule.js",
"js/icons.js",
"js/lcars.js",
"js/mathink.js",
"js/poketch.js",
"js/render.js",
"js/sheet-engine.js",
"js/switch.js",
"js/toolbox.js",
"js/tools.js",
"js/web.js",
"js/wii.js",
"lib/pdf.min.js",
"lib/pdf.worker.min.js",
"lib/pdfjs-LICENSE.txt",
"manifest.webmanifest"
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('fos-binder-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).catch(() => caches.match('./'))));
});
