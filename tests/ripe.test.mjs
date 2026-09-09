import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRipePingStatsUrl,
  parseRipePingStats,
  readPingStatsPages,
  readProbePages,
  RIPE_ATLAS_PROBE_TIMEOUT_MS,
  RIPE_ATLAS_STATS_CONCURRENCY,
  RIPE_ATLAS_STATS_TIMEOUT_MS,
} from '../lib/ripe.mjs';

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

test('RIPE ping-stats URL uses exactly one probe and daily aggregation', () => {
  const url = new URL(buildRipePingStatsUrl({
    probeId: 10,
    since: '2026-09-01',
    until: '2026-09-07',
  }));
  assert.equal(url.pathname, '/api/v2/measurements/1001/ping-stats/');
  assert.equal(url.searchParams.get('probe_ids'), '10');
  assert.equal(url.searchParams.get('resolution'), 'day');
  assert.equal(url.searchParams.get('start'), '2026-09-01T00:00:00Z');
  assert.equal(url.searchParams.get('stop'), '2026-09-07T23:59:59Z');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.throws(() => buildRipePingStatsUrl({ probeId: '', since: '2026-09-01', until: '2026-09-07' }), /one valid RIPE Atlas probe/i);
});

test('RIPE ping-stats parser derives packet loss and weighted daily RTT without inventing raw results', () => {
  const parsed = parseRipePingStats([
    {
      probe_id: 101,
      data: [
        [Date.parse('2026-09-01T00:00:00Z') / 1000, 30, 27, 20, 30, 40],
        [Date.parse('2026-09-02T00:00:00Z') / 1000, 30, 30, 20, 25, 35],
      ],
    },
    {
      probe_id: 102,
      data: [
        [Date.parse('2026-09-01T00:00:00Z') / 1000, 30, 15, 50, 60, 70],
      ],
    },
  ], { since: '2026-09-01', until: '2026-09-02' });

  assert.equal(parsed.series.length, 2);
  assert.equal(parsed.series[0].samples, 60);
  assert.equal(parsed.series[0].receivedPackets, 42);
  assert.equal(parsed.series[0].packetLossPercent, 30);
  assert.equal(parsed.series[0].probes, 2);
  assert.equal(parsed.series[0].rttMs, 40.7);
  assert.equal(parsed.overall.samples, 90);
  assert.equal(parsed.overall.observedProbes, 2);
  assert.equal(parsed.overall.packetLossPercent, 20);
});

test('RIPE ping-stats parser accepts ISO timestamps returned by API variants', () => {
  const parsed = parseRipePingStats([
    { probe_id: 101, data: [['2026-09-01T00:00:00Z', 10, 9, 10, 20, 30]] },
  ], { since: '2026-09-01', until: '2026-09-01' });
  assert.equal(parsed.series.length, 1);
  assert.equal(parsed.series[0].packetLossPercent, 10);
});

test('RIPE ping-stats pagination is bounded and exposes truncation', async () => {
  const pages = new Map([
    ['https://example.test/s1', { next: 'https://example.test/s2', results: [{ probe_id: 1, data: [] }] }],
    ['https://example.test/s2', { next: 'https://example.test/s3', results: [{ probe_id: 1, data: [] }] }],
  ]);
  const result = await readPingStatsPages('https://example.test/s1', async (url) => pages.get(url), 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.nextUrl, 'https://example.test/s3');
});

test('RIPE Atlas per-probe live transport is bounded and concurrency limited', () => {
  assert.equal(RIPE_ATLAS_PROBE_TIMEOUT_MS, 20_000);
  assert.equal(RIPE_ATLAS_STATS_TIMEOUT_MS, 15_000);
  assert.equal(RIPE_ATLAS_STATS_CONCURRENCY, 6);
  assert.ok(RIPE_ATLAS_STATS_CONCURRENCY <= 6);
});
