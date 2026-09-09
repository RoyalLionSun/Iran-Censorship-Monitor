import test from 'node:test';
import assert from 'node:assert/strict';
import { bgpWindowAvailability, boundedBgpWindow, buildRipeStatUrls, parseBgpUpdates, parseRoutingStatus } from '../lib/ripestat.mjs';

test('RIPEstat URLs are scoped to the selected ASN and dates', () => {
  const urls = buildRipeStatUrls({ asn: 'AS58224', since: '2026-09-01', until: '2026-09-08' });
  assert.match(urls.routingStatus, /resource=AS58224/);
  assert.match(urls.announcedPrefixes, /starttime=/);
  assert.match(urls.bgpUpdates, /endtime=/);
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
