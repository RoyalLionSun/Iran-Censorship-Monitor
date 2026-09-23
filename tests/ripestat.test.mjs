import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTING_STATUS_RETRY_TIMEOUT_MS, bgpWindowAvailability, boundedBgpWindow, buildRipeStatUrls, getRipeStatSignals, parseBgpUpdates, parseRoutingStatus, routingLookupTimestamp, routingTimeAlignment } from '../lib/ripestat.mjs';

test('RIPEstat URLs are scoped to the selected ASN and dates', () => {
  const urls = buildRipeStatUrls({ asn: 'AS58224', since: '2026-09-01', until: '2026-09-08', now: new Date('2026-09-12T12:00:00Z') });
  assert.match(urls.routingStatus, /resource=AS58224/);
  assert.match(urls.routingStatus, /timestamp=2026-09-08T23%3A59%3A59Z/);
  assert.match(urls.announcedPrefixes, /starttime=/);
  assert.match(urls.bgpUpdates, /endtime=/);
});

test('RIPEstat routing lookup uses the selected historical window and the latest snapshot for the current day', () => {
  assert.equal(routingLookupTimestamp('2026-09-08', new Date('2026-09-12T12:00:00Z')), '2026-09-08T23:59:59Z');
  assert.equal(routingLookupTimestamp('2026-09-12', new Date('2026-09-12T12:00:00Z')), null);
});

test('current-window RIPEstat routing URL is stable and carries no per-request timestamp', () => {
  const first = buildRipeStatUrls({ asn: 'AS58224', since: '2026-09-06', until: '2026-09-12', now: new Date('2026-09-12T12:00:00Z') });
  const later = buildRipeStatUrls({ asn: 'AS58224', since: '2026-09-06', until: '2026-09-12', now: new Date('2026-09-12T12:07:31.123Z') });
  assert.equal(first.routingTimestamp, null);
  assert.doesNotMatch(first.routingStatus, /timestamp=/);
  assert.equal(first.routingStatus, later.routingStatus);
});

test('RIPEstat routing alignment reads zone-less query_time as UTC in any local time zone', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Tehran';
  try {
    assert.equal(routingTimeAlignment({ queryTime: '2026-09-10T16:00:00', routingTimestamp: '2026-09-10T23:59:59Z' }), 'aligned');
    assert.equal(routingTimeAlignment({ queryTime: '2026-09-10T08:00:00', routingTimestamp: '2026-09-10T23:59:59Z' }), 'unknown');
    assert.equal(routingTimeAlignment({ queryTime: '2026-09-22T08:00:00', routingTimestamp: null, now: new Date('2026-09-22T16:21:00Z') }), 'latest');
    assert.equal(routingTimeAlignment({ queryTime: '2026-09-21T08:00:00', routingTimestamp: null, now: new Date('2026-09-22T16:21:00Z') }), 'unknown');
    assert.equal(routingTimeAlignment({ queryTime: null, routingTimestamp: null }), 'unknown');
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('RIPEstat routing status extracts visibility and neighbours', () => {
  const parsed = parseRoutingStatus({ data: { visibility: { v4: { ris_peers_seeing: 80, total_ris_peers: 100 } }, observed_neighbours: [{ asn: 12880, power: 0.4 }] } });
  assert.equal(parsed.visibility.percent, 80);
  assert.equal(parsed.observedNeighbours[0].asn, 'AS12880');
});

test('BGP update parser preserves announcements, withdrawals and AS paths', () => {
  const events = parseBgpUpdates({ data: { updates: [
    { timestamp: '2026-09-08T10:00:00Z', type: 'A', prefix: '1.2.3.0/24', attrs: { path: [3491, 12880, 58224] }, rrc: 'rrc00', peer_asn: 3491 },
    { timestamp: '2026-09-08T10:01:00Z', type: 'W', prefix: '1.2.3.0/24', rrc: 'rrc00' },
  ] } });
  assert.equal(events[0].type, 'announcement');
  assert.deepEqual(events[0].asPath, ['3491', '12880', '58224']);
  assert.equal(events[1].type, 'withdrawal');
});

test('RIPEstat BGP history before January 2024 is not misreported as zero events', () => {
  assert.equal(bgpWindowAvailability('2022-09-01', '2022-09-30').available, false);
});

test('BGP drilldown is bounded to at most 48 hours', () => {
  const result = boundedBgpWindow('2026-08-01', '2026-09-08');
  assert.equal(result.available, true);
  assert.equal(result.cappedTo48Hours, true);
  assert.equal(result.since, '2026-09-07');
});

test('a routing lookup that exceeds the request timeout is revalidated in the background', async (t) => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = String(url);
    requested.push(target);
    if (target.includes('routing-status')) throw new Error('This operation was aborted');
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ data: { prefixes: [{ prefix: '2.144.0.0/13', timelines: [] }] } }) };
  });

  const result = await getRipeStatSignals({ asn: 'AS64513', since: '2026-09-04', until: '2026-09-10' });
  assert.equal(result.routing, null);
  assert.equal(result.routingRetryInProgress, true, 'the slow lookup must be retried in the background');
  assert.equal(result.timeAlignment, 'not-applicable');
  assert.match(result.partialErrors.routingStatus, /aborted/);
  assert.equal(result.announcedPrefixes.length, 1, 'the fast part of the response is still delivered');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requested.filter((url) => url.includes('routing-status')).length, 2, 'exactly one background retry');
  assert.ok(ROUTING_STATUS_RETRY_TIMEOUT_MS > 12_000);
});

test('a historical routing lookup is sent in whole seconds, which RIPEstat honours', async () => {
  const { buildRipeStatUrls, routingLookupTimestamp } = await import('../lib/ripestat.mjs');
  const timestamp = routingLookupTimestamp('2026-03-20', new Date('2026-09-23T00:00:00Z'));
  assert.equal(timestamp, '2026-03-20T23:59:59Z', 'with milliseconds RIPEstat answers with today instead');
  const urls = buildRipeStatUrls({ asn: 'AS58224', since: '2026-03-01', until: '2026-03-20', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(new URL(urls.routingStatus).searchParams.get('timestamp'), '2026-03-20T23:59:59Z');
});
