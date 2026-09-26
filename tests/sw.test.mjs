import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Runs public/sw.js against an in-memory cache and a switchable network.
async function loadWorker() {
  const listeners = {};
  const store = new Map();
  const cache = {
    put: async (request, response) => { store.set(typeof request === 'string' ? request : request.url, response); },
    match: async (request) => store.get(typeof request === 'string' ? new URL(request, 'https://monitor.example').href : request.url)?.clone(),
    keys: async () => [...store.keys()].map((url) => new Request(url)),
    delete: async (request) => store.delete(request.url),
  };
  const network = { online: true, calls: 0 };
  const scope = {
    location: new URL('https://monitor.example/sw.js'),
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener: (type, handler) => { listeners[type] = handler; },
  };
  const globals = {
    self: scope,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (request) => {
      network.calls += 1;
      if (!network.online) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ ok: true, fetchedAt: '2026-09-24T10:00:00Z' }), { headers: { 'content-type': 'application/json', date: 'Thu, 24 Sep 2026 10:00:00 GMT' } });
    },
  };
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  new Function(...Object.keys(globals), source)(...Object.values(globals));
  const dispatch = async (url, { mode = 'cors', method = 'GET' } = {}) => {
    let responded = null;
    const request = new Request(url, { method });
    Object.defineProperty(request, 'mode', { value: mode });
    listeners.fetch({ request, respondWith: (promise) => { responded = promise; } });
    return responded ? await responded : null;
  };
  return { dispatch, network, store };
}

test('online, answers come from the network and are kept; offline, the same request gets the kept copy, marked', async () => {
  const { dispatch, network } = await loadWorker();
  const url = 'https://monitor.example/api/overview?asn=AS58224&since=2026-09-17&until=2026-09-23';
  const fresh = await dispatch(url);
  assert.equal(fresh.headers.get('x-offline-copy'), null);
  network.online = false;
  const offline = await dispatch(url);
  assert.equal(offline.headers.get('x-offline-copy'), 'Thu, 24 Sep 2026 10:00:00 GMT');
  assert.equal((await offline.json()).fetchedAt, '2026-09-24T10:00:00Z');
  await assert.rejects(dispatch('https://monitor.example/api/overview?asn=AS44244&since=2026-09-17&until=2026-09-23'), /Failed to fetch/,
    'another network or period is never answered with a different copy');
});

test('the page is kept once for any query; other API routes and other sites are not touched', async () => {
  const { dispatch, network } = await loadWorker();
  await dispatch('https://monitor.example/?asn=AS58224&lang=fa', { mode: 'navigate' });
  network.online = false;
  const page = await dispatch('https://monitor.example/?asn=ALL', { mode: 'navigate' });
  assert.ok(page.headers.get('x-offline-copy'));
  assert.equal(await dispatch('https://monitor.example/api/globalping/probes'), null, 'uncached routes pass through');
  assert.equal(await dispatch('https://stat.ripe.net/data/x'), null, 'other origins pass through');
  assert.equal(await dispatch('https://monitor.example/api/overview', { method: 'POST' }), null);
});

test('opening a report or the tools page never replaces the saved dashboard', async () => {
  const { dispatch, store } = await loadWorker();
  await dispatch('https://monitor.example/?lang=fa', { mode: 'navigate' });
  await dispatch('https://monitor.example/reports?lang=fa', { mode: 'navigate' });
  await dispatch('https://monitor.example/tools', { mode: 'navigate' });
  assert.deepEqual([...store.keys()].sort(), ['https://monitor.example/', 'https://monitor.example/reports?lang=fa', 'https://monitor.example/tools']);
});
