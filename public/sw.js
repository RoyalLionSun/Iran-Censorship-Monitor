// Offline copy for readers whose connection drops, as it often does in Iran. Online, every
// request goes to the network and the page is always fresh; the answer is only kept as a
// reserve. When the network fails, the last answer for exactly the same request is returned,
// marked with the header x-offline-copy, and the page says from when it is.

const CACHE = 'icm-offline-v2';
const API_KEPT = new Set(['/api/overview', '/api/config', '/api/outages', '/api/circumvention', '/api/ooni/domains']);
const MAX_API_ENTRIES = 12;
const PAGE = new URL('/', self.location).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

async function trimApi(cache) {
  const keys = (await cache.keys()).filter((request) => new URL(request.url).pathname.startsWith('/api/'));
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_API_ENTRIES))) await cache.delete(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isApi = url.pathname.startsWith('/api/');
  if (isApi && !API_KEPT.has(url.pathname)) return;
  // The dashboard is one page whatever its query (the view is in the query); other pages
  // (reports, updates, tools, sources) are kept under their own address, so opening one never
  // replaces the saved dashboard.
  const key = request.mode === 'navigate' && url.pathname === '/' ? PAGE : request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(key, response.clone());
        if (isApi) trimApi(cache);
      }
      return response;
    } catch (error) {
      const saved = await cache.match(key);
      if (!saved) throw error;
      const headers = new Headers(saved.headers);
      headers.set('x-offline-copy', saved.headers.get('date') || 'unknown');
      return new Response(saved.body, { status: saved.status, statusText: saved.statusText, headers });
    }
  })());
});
