import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES,
  BGPSTREAM_ROUTEVIEWS_PROJECT,
  buildRouteViewsBgpReaderArgs,
  buildRouteViewsBrokerUrl,
  parseRouteViewsBgpReaderLine,
  parseRouteViewsBrokerPayload,
  resolveRouteViewsPrefixScope,
} from '../lib/bgpstream.mjs';

test('Route Views BGPReader command is hard-coded to routeviews-stream and prefix-scoped', () => {
  const built = buildRouteViewsBgpReaderArgs(['192.0.2.0/24', '192.0.2.0/24', '2001:db8::/32']);
  assert.deepEqual(built.args.slice(0, 5), ['-p', 'routeviews-stream', '-t', 'updates', '-e']);
  assert.deepEqual(built.prefixes, ['192.0.2.0/24', '2001:db8::/32']);
  assert.deepEqual(built.args.slice(5), ['-k', '192.0.2.0/24', '-k', '2001:db8::/32']);
  assert.equal(BGPSTREAM_ROUTEVIEWS_PROJECT, 'routeviews-stream');
  assert.equal(BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES, 200);
  assert.throws(() => buildRouteViewsBgpReaderArgs([]), /at least one scoped prefix/i);
  assert.throws(() => buildRouteViewsBgpReaderArgs(['192.0.2.0/24', '198.51.100.0/24'], { maxPrefixes: 1 }), /silently truncating/i);
});

test('Route Views BGPReader parser normalizes announcements with explicit provenance', () => {
  const parsed = parseRouteViewsBgpReaderLine('U|A|1602281859.663705|routeviews-stream|is-ah-bmp1|saopaulo2|200.160.6.203|52873|187.16.220.216|114.5.9.0/24|187.16.220.216|6447 52873 12956 6453 4761|4761|52873:100 6453:200|||');
  assert.equal(parsed.kind, 'update');
  assert.equal(parsed.events.length, 1);
  const event = parsed.events[0];
  assert.equal(event.eventType, 'announcement');
  assert.equal(event.source, 'Route Views BMP via CAIDA BGPStream');
  assert.equal(event.provider, 'Route Views');
  assert.equal(event.accessFramework, 'CAIDA BGPStream');
  assert.equal(event.routingSourceFamily, 'routeviews');
  assert.equal(event.independentCensorshipVote, false);
  assert.equal(event.collector, 'is-ah-bmp1');
  assert.equal(event.router, 'saopaulo2');
  assert.equal(event.peerAsn, 'AS52873');
  assert.equal(event.prefix, '114.5.9.0/24');
  assert.deepEqual(event.asPath, ['AS6447', 'AS52873', 'AS12956', 'AS6453', 'AS4761']);
  assert.equal(event.originAsn, 'AS4761');
  assert.deepEqual(event.communities, ['52873:100', '6453:200']);
});

test('Route Views BGPReader parser preserves withdrawals without fabricated path data', () => {
  const parsed = parseRouteViewsBgpReaderLine('U|W|1602281860.000001|routeviews-stream|is-ah-bmp1|saopaulo2|200.160.6.203|52873|187.16.220.216|203.0.113.0/24|||||||');
  const event = parsed.events[0];
  assert.equal(event.eventType, 'withdrawal');
  assert.equal(event.prefix, '203.0.113.0/24');
  assert.equal(event.nextHop, null);
  assert.deepEqual(event.asPath, []);
  assert.equal(event.originAsn, null);
  assert.deepEqual(event.communities, []);
});

test('Route Views parser refuses to mix RIPE or archive projects into the independent collector', () => {
  assert.throws(() => parseRouteViewsBgpReaderLine('U|A|1602281859|ris-live|rrc00||||64496|192.0.2.1|203.0.113.0/24|192.0.2.1|64496 58224|58224||||'), /refusing to mix/i);
  assert.throws(() => parseRouteViewsBgpReaderLine('U|A|1602281859|routeviews|route-views2||||64496|192.0.2.1|203.0.113.0/24|192.0.2.1|64496 58224|58224||||'), /refusing to mix/i);
});

test('CAIDA broker request is bounded to current Route Views update stream resources', () => {
  const url = new URL(buildRouteViewsBrokerUrl({ now: new Date('2026-09-09T12:00:00Z'), windowSeconds: 600 }));
  assert.equal(url.origin, 'https://broker.bgpstream.caida.org');
  assert.equal(url.pathname, '/v2/data');
  assert.deepEqual(url.searchParams.getAll('projects[]'), ['routeviews-stream']);
  assert.deepEqual(url.searchParams.getAll('resourceTypes[]'), ['stream']);
  assert.deepEqual(url.searchParams.getAll('types[]'), ['updates']);
  assert.deepEqual(url.searchParams.getAll('intervals[]'), ['1788954600,1788955200']);
  assert.throws(() => buildRouteViewsBrokerUrl({ windowSeconds: 10 }), /between 60 and 3600/);
});

test('CAIDA broker parser keeps only Route Views stream resources', () => {
  const parsed = parseRouteViewsBrokerPayload({ error: null, data: { resources: [
    { project: 'routeviews-stream', collector: 'is-ah-bmp1', router: 'amsix', type: 'updates', format: 'bmp', transport: 'http', url: 'https://example.invalid/routeviews' },
    { project: 'ris-live', collector: 'rrc00', url: 'https://example.invalid/ris' },
  ] } });
  assert.equal(parsed.status, 'observed');
  assert.equal(parsed.resourceCount, 1);
  assert.equal(parsed.resources[0].project, 'routeviews-stream');
  assert.equal(parseRouteViewsBrokerPayload({ error: null, data: { resources: [] } }).status, 'no_data');
  assert.throws(() => parseRouteViewsBrokerPayload({ error: 'bad query' }), /bad query/);
});

test('Route Views scope resolver reuses the same RIPEstat announced-prefix safety scope', async () => {
  const fetcher = async () => ({ data: { prefixes: [
    { prefix: '192.0.2.0/24', timelines: [] },
    { prefix: '2001:db8::/32', timelines: [] },
  ] } });
  const scope = await resolveRouteViewsPrefixScope('58224', { now: new Date('2026-09-09T12:00:00Z'), fetcher, maxPrefixes: 2 });
  assert.equal(scope.status, 'observed');
  assert.equal(scope.asn, 'AS58224');
  assert.equal(scope.scopeSource, 'RIPEstat announced-prefixes');
  assert.deepEqual(scope.prefixes, ['192.0.2.0/24', '2001:db8::/32']);
});
