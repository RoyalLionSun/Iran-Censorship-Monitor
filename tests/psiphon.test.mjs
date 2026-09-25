import assert from 'node:assert/strict';
import test from 'node:test';
import { getPsiphonConduit, parseConduitStats } from '../lib/psiphon.mjs';

const sample = {
  daily_inproxy_count_last30: [
    { date: '2026-09-22', client_region: 'IR', doc_count: 1304026 },
    { date: '2026-09-22', client_region: 'DE', doc_count: 500 },
    { date: '2026-09-23', client_region: 'IR', doc_count: 1017594 },
    { date: '2026-09-24', client_region: 'IR', doc_count: 882034 },
    { date: '2026-09-25', client_region: 'IR', doc_count: 562945 },
  ],
  station_regions: [{ region: 'DE', stations: 47820 }, { region: 'IR', stations: 46799 }],
  total_stations: 2173179,
  _last_updated: '2026-09-25T17:09:21Z',
};

test('Conduit statistics are read for Iran only', () => {
  const parsed = parseConduitStats(sample);
  assert.deepEqual(parsed.series.map((row) => row.connections), [1304026, 1017594, 882034, 562945]);
  assert.equal(parsed.stationsInRegion, 46799);
  assert.equal(parsed.stationsWorld, 2173179);
});

test('the day still being counted is left out of the latest figure', async () => {
  const result = await getPsiphonConduit({ fetch: async () => sample });
  assert.equal(result.status, 'observed');
  assert.deepEqual(result.latest, { date: '2026-09-24', connections: 882034 });
  assert.equal(result.series.length, 3);
  assert.equal(result.stationsInIran, 46799);
});
