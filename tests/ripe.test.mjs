import test from 'node:test';
import assert from 'node:assert/strict';
import { readProbePages } from '../lib/ripe.mjs';

test('RIPE probe pagination follows next links and preserves declared count', async () => {
  const pages = new Map([
    ['https://example.test/p1', { count: 3, next: 'https://example.test/p2', results: [{ id: 1 }, { id: 2 }] }],
    ['https://example.test/p2', { count: 3, next: null, results: [{ id: 3 }] }],
  ]);
  const seen = [];
  const result = await readProbePages('https://example.test/p1', async (url) => {
    seen.push(url);
    return pages.get(url);
  });
  assert.deepEqual(seen, ['https://example.test/p1', 'https://example.test/p2']);
  assert.equal(result.declaredCount, 3);
  assert.equal(result.rows.length, 3);
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, false);
});

test('RIPE probe pagination reports safety-cap truncation', async () => {
  const result = await readProbePages('https://example.test/p1', async (url) => ({
    count: 2000,
    next: url.replace(/p(\d+)/, (_, n) => `p${Number(n) + 1}`),
    results: [{ id: 1 }],
  }), 2);
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.rows.length, 2);
  assert.match(result.nextUrl, /p3$/);
});
