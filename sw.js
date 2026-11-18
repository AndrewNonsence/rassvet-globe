/* Офлайн-оболочка трекера. Версии обязательных библиотек сверяются с HTML в tests/test_sw.cjs. */
const BASE = new URL(self.registration.scope);
const PREFIX = BASE.pathname === '/' ? 'rassvet-v' : 'rassvet@' + BASE.pathname + '-v';
const VERSION = PREFIX + '7';
const SHELL = VERSION + '-shell';
const STATIC = VERSION + '-static';
const CORE = [
  'vendor/deck.gl@9.4.0/dist.min.js',
  'vendor/satellite.js@6.0.2/satellite.min.js',
  'vendor/topojson-client@3.1.0/topojson-client.min.js',
];
const HASHED_DATA = /^(data-[a-z0-9-]+|geo-detail)\.[a-f0-9]{10}\.json$/;
const ICONS = new Set(['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'manifest.webmanifest', 'og.png']);

self.addEventListener('install', event => event.waitUntil((async () => {
  // Первая навигация и загрузка библиотек могли завершиться до регистрации worker.
  const cache = await caches.open(SHELL);
  const page = new Request(BASE.href, {redirect: 'error'});
  const libraries = CORE.map(path => new Request(new URL(path, BASE), {cache: 'force-cache', redirect: 'error'}));
  await cache.addAll([page, ...libraries]);
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX) && /^\d+-(shell|static)$/.test(key.slice(PREFIX.length))
        && key !== SHELL && key !== STATIC) await caches.delete(key);
  }
  await self.clients.claim();
})()));

async function cached(name, key) {
  try { return await (await caches.open(name)).match(key); }
  catch { return undefined; }
}

async function store(name, key, copy) {
  const cache = await caches.open(name);
  await cache.put(key, copy);
  const path = new URL(typeof key === 'string' ? key : key.url).pathname.slice(BASE.pathname.length);
  const family = HASHED_DATA.exec(path);
  if (family) {
    // Сохраняем и предшествующую версию для вкладок с предыдущим HTML.
    const versions = (await cache.keys()).filter(request => {
      const other = new URL(request.url).pathname.slice(BASE.pathname.length);
      return HASHED_DATA.exec(other)?.[1] === family[1];
    });
    for (const obsolete of versions.slice(0, -2)) await cache.delete(obsolete);
  }
}

async function fromNetwork(event, name, key) {
  const response = await fetch(event.request);
  if (response.status === 200 && !response.redirected) {
    event.waitUntil(store(name, key, response.clone()).catch(() => {}));
  }
  return response;
}

async function page(event) {
  try { return await fromNetwork(event, SHELL, BASE.href); }
  catch { return (await cached(SHELL, BASE.href)) || Response.error(); }
}

async function immutable(event, name) {
  return (await cached(name, event.request)) || fromNetwork(event, name, event.request);
}

async function refresh(event) {
  const hit = await cached(STATIC, event.request);
  const network = fromNetwork(event, STATIC, event.request);
  if (!hit) return network;
  event.waitUntil(network.catch(() => {}));
  return hit;
}

self.addEventListener('fetch', event => {
  const r = event.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || r.headers.has('range') || u.origin !== BASE.origin || !u.pathname.startsWith(BASE.pathname)) return;
  const path = u.pathname.slice(BASE.pathname.length);
  if (path === '' || path === 'index.html') return event.respondWith(page(event));
  if (path === 'data-health.json') return event.respondWith(fetch(r, {cache: 'no-cache'}));
  if (r.mode === 'navigate' || path.startsWith('tiles/')) return;

  if (CORE.includes(path)) return event.respondWith(immutable(event, SHELL));
  if (/^vendor\/fonts-[\d.]+\/(?:fonts\.css|files\/[\w-]+\.woff2)$/.test(path) ||
      /^globe\/[\w-]+\.[a-f0-9]{10}\.(?:webp|jpg)$/.test(path) || HASHED_DATA.test(path))
    return event.respondWith(immutable(event, STATIC));
  if (ICONS.has(path) || path === 'globe/globe.json' || path === 'clouds/latest.json' ||
      /^clouds\/clouds-\d+\.[\d-]+\.jpg$/.test(path) || /^models\/(?:[\w-]+\/)*[\w-]+\.glb$/.test(path))
    return event.respondWith(refresh(event));
});
