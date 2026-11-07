const CACHE = 'cs-dust-online-v31-meshmaps';
const CORE = [
  '/', '/manifest.webmanifest', '/css/style.css', '/css/mobile.css',
  '/js/main.js', '/js/game.js', '/js/hud.js', '/js/models.js', '/js/glbguns.js',
  '/js/audio.js', '/js/soundmap.js', '/js/mapvote.js', '/js/auth.js', '/js/stats.js', '/js/report.js', '/js/voice.js', '/js/voicecodec.js', '/js/keybinds.js', '/js/lobby.js', '/js/net.js', '/js/textures.js', '/js/world.js', '/js/geo.js', '/js/props.js', '/js/pausemenu.js', '/js/lobbymenu.js',
  '/shared/constants.js', '/shared/core.js', '/shared/game.js',
  '/shared/maps.js', '/shared/dust2.js', '/shared/mapkit.js', '/shared/nav.js', '/shared/physics.js',
  '/shared/ranks.js', '/shared/weapons.js',
  '/vendor/three.module.min.js', '/vendor/three.core.min.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.startsWith('/mapmesh/')) return;   // big mesh files: left to the browser's HTTP cache
  event.respondWith(
    fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('/')))
  );
});
