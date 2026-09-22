import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { CONNECT_ATTEMPT_TIMEOUT_MS, fetchJson, inclusiveDays, normalizeAsn, prefetchJson, validateRange } from '../lib/common.mjs';

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
