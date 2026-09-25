import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { CONNECT_ATTEMPT_TIMEOUT_MS, createLastGoodStore, fetchJson, inclusiveDays, normalizeAsn, prefetchJson, validateRange } from '../lib/common.mjs';

test('ASN normalization', () => {
  assert.equal(normalizeAsn('58224'), 'AS58224');
  assert.equal(normalizeAsn('as197207'), 'AS197207');
  assert.equal(normalizeAsn('ALL'), '');
});

test('date range is inclusive', () => {
  assert.equal(inclusiveDays('2026-09-01','2026-09-07'), 7);
});

test('invalid or excessive range is rejected', () => {
  assert.throws(()=>validateRange('2026-09-08','2026-09-01'));
  assert.throws(()=>validateRange('2026-01-01','2026-09-01',120));
});

test('distant sources get a connect window longer than the 250 ms Node default', () => {
  assert.ok(CONNECT_ATTEMPT_TIMEOUT_MS >= 2_000);
  assert.ok(net.getDefaultAutoSelectFamilyAttemptTimeout() >= CONNECT_ATTEMPT_TIMEOUT_MS);
});

test('background revalidation fills the shared cache once and is not repeated while in flight', async (t) => {
  const url = 'https://example.test/slow-source.json';
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    await pending;
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ value: calls }) };
  });

  assert.equal(prefetchJson(url, { cacheTtlMs: 60_000 }), true);
  assert.equal(prefetchJson(url, { cacheTtlMs: 60_000 }), true, 'a second call must not start another request');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(await fetchJson(url, { cacheTtlMs: 60_000 }), { value: 1 }, 'the next request is served from cache');
  assert.equal(calls, 1);
});

test('a failed source falls back to its last successful answer, marked as history', () => {
  const store = createLastGoodStore({ limit: 2 });
  assert.equal(store.stale('ooni|AS58224'), null, 'without a remembered answer there is nothing to show');

  store.remember('ooni|AS58224', { ok: true, status: 'observed', totalMeasurements: 426, fetchedAt: '2026-09-23T08:00:00.000Z' });
  const stale = store.stale('ooni|AS58224', new Error('429 quota exceeded'));
  assert.equal(stale.status, 'stale', 'the fallback can never be presented as current');
  assert.equal(stale.stale, true);
  assert.equal(stale.totalMeasurements, 426);
  assert.equal(stale.staleSince, '2026-09-23T08:00:00.000Z');
  assert.match(stale.staleReason, /quota exceeded/);

  store.remember('ooni|AS44244', { ok: false, error: 'failed' });
  assert.equal(store.stale('ooni|AS44244'), null, 'a failed answer is never remembered');

  store.remember('a', { ok: true, status: 'observed' });
  store.remember('b', { ok: true, status: 'observed' });
  store.remember('c', { ok: true, status: 'observed' });
  assert.equal(store.size(), 2, 'the store stays bounded');
  assert.equal(store.stale('a'), null, 'the oldest entry is dropped first');
});

test('only a settled period with a clean answer may be kept', async () => {
  const { isCleanOverview, isSettledPeriod } = await import('../lib/common.mjs');
  const now = Date.parse('2026-09-23T12:00:00Z');
  assert.equal(isSettledPeriod('2026-09-20', now), true);
  assert.equal(isSettledPeriod('2026-09-21', now), false, 'the last two days can still change upstream');
  assert.equal(isCleanOverview([{ ok: true, status: 'observed' }, { ok: true, status: 'no_data' }, null]), true);
  assert.equal(isCleanOverview([{ ok: true, status: 'observed' }, { ok: false, status: 'error' }]), false);
  assert.equal(isCleanOverview([{ ok: true, status: 'stale' }]), false);
  assert.equal(isCleanOverview([{ ok: true, status: 'no_data', routingRetryInProgress: true }]), false);
  assert.equal(isCleanOverview([{ ok: true, status: 'partial', assessmentEligible: false }]), false, 'a Radar answer missing an event channel');
  assert.equal(isCleanOverview([{ ok: true, status: 'token_required', assessmentEligible: false }]), true, 'a missing token does not heal by retrying');
});

test('last good answers survive a restart when the store has a path', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'last-good-'));
  const path = join(dir, 'sources.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, JSON.stringify([['OONI|x', { value: { ok: true, status: 'observed', n: 1 }, at: '2026-09-24T08:00:00Z' }]]));
  const restarted = createLastGoodStore({ path });
  const stale = restarted.stale('OONI|x', new Error('quota exceeded'));
  assert.equal(stale.status, 'stale');
  assert.equal(stale.n, 1);
  assert.equal(stale.staleSince, '2026-09-24T08:00:00Z');
  assert.equal(restarted.remember('OONI|y', { ok: true, status: 'stale' }).status, 'stale', 'a stale answer is never remembered as good');
  assert.equal(restarted.stale('OONI|y'), null);
  await readFile(path, 'utf8');
});

test('JSON answers are compressed when the browser offers it and stay readable', async () => {
  const { brotliDecompressSync, gunzipSync } = await import('node:zlib');
  const { jsonResponse, pickEncoding } = await import('../lib/common.mjs');
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip;q=1.0'), 'gzip');
  assert.equal(pickEncoding(''), null);
  const payload = { ok: true, rows: Array.from({ length: 500 }, (_, index) => ({ domain: `site-${index}.example`, measurements: index })) };
  const respond = (acceptEncoding) => {
    const out = {};
    jsonResponse({ req: { headers: { 'accept-encoding': acceptEncoding } }, writeHead: (status, headers) => Object.assign(out, { status, headers }), end: (body) => { out.body = body; } }, 200, payload);
    return out;
  };
  const br = respond('br, gzip');
  assert.equal(br.headers['content-encoding'], 'br');
  assert.ok(br.body.length < JSON.stringify(payload).length / 4);
  assert.deepEqual(JSON.parse(brotliDecompressSync(br.body)), payload);
  assert.deepEqual(JSON.parse(gunzipSync(respond('gzip').body)), payload);
  const plain = respond('');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(plain.body), payload);
});

test('the cache of upstream answers stays bounded on a long-running server', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const { fetchJson, fetchCacheSize, FETCH_CACHE_LIMIT } = await import('../lib/common.mjs');
  const before = fetchCacheSize();
  const extra = FETCH_CACHE_LIMIT - before + 25;
  for (let index = 0; index < extra; index += 1) await fetchJson(`http://127.0.0.1:${port}/item?${index}`, { cacheTtlMs: 60_000 });
  server.close();
  assert.ok(fetchCacheSize() <= FETCH_CACHE_LIMIT, `cache holds ${fetchCacheSize()} entries, limit ${FETCH_CACHE_LIMIT}`);
});

test('stored answers: quotas per source, and the nearest period for the same network', async () => {
  const { createLastGoodStore } = await import('../lib/common.mjs');
  const store = createLastGoodStore({ limit: 800 });
  const answer = { ok: true, status: 'observed', fetchedAt: '2026-09-25T10:00:00Z' };
  // IODA keeps only ten periods; OONI answers are not pushed out by it.
  store.remember('OONI domains|AS58224|2026-09-17|2026-09-23|web_connectivity|', answer);
  for (let day = 1; day <= 15; day += 1) store.remember(`IODA|ALL|2026-08-${String(day).padStart(2, '0')}|2026-08-${String(day + 6).padStart(2, '0')}|web_connectivity|`, answer);
  assert.equal(store.size(), 11);
  assert.ok(store.stale('OONI domains|AS58224|2026-09-17|2026-09-23|web_connectivity|', 'x'));
  // The exact period is missing: the nearest one of the same network stands in, marked.
  const nearest = store.staleNearest('OONI domains|AS58224|2026-09-18|2026-09-24|web_connectivity|', 'rate limit');
  assert.deepEqual(nearest.stalePeriod, { since: '2026-09-17', until: '2026-09-23' });
  assert.equal(nearest.status, 'stale');
  assert.equal(store.staleNearest('OONI domains|AS44244|2026-09-18|2026-09-24|web_connectivity|', 'x'), null, 'never another network');
  assert.equal(store.staleNearest('OONI domains|AS58224|2026-12-18|2026-12-24|web_connectivity|', 'x'), null, 'never months away');
});
