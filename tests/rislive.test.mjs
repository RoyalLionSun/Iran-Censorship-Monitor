import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRisLiveStreamRequest,
  buildRisLiveSubscription,
  decodeRisLiveJsonLines,
  normalizeCidr,
  parseRisLiveLine,
  reconnectDelayMs,
  resolveRisLivePrefixScope,
  RIS_LIVE_MAX_PREFIXES,
} from '../lib/rislive.mjs';

test('RIS Live CIDR validation accepts IPv4/IPv6 and rejects malformed scopes', () => {
  assert.equal(normalizeCidr('192.0.2.0/24'), '192.0.2.0/24');
  assert.equal(normalizeCidr('2001:db8::/32'), '2001:db8::/32');
  assert.throws(() => normalizeCidr('192.0.2.0/33'), /Invalid CIDR/);
  assert.throws(() => normalizeCidr('not-a-prefix'), /Invalid CIDR/);
});

test('RIS Live subscription is UPDATE-only, prefix-scoped and never silently truncated', () => {
  const built = buildRisLiveSubscription(['192.0.2.0/24', '192.0.2.0/24', '2001:db8::/32']);
  assert.equal(built.subscription.type, 'UPDATE');
  assert.deepEqual(built.subscription.prefix, ['192.0.2.0/24', '2001:db8::/32']);
  assert.equal(built.subscription.moreSpecific, true);
  assert.equal(built.subscription.lessSpecific, false);
  assert.equal(built.subscription.socketOptions.includeRaw, false);
  assert.throws(() => buildRisLiveSubscription(['192.0.2.0/24', '198.51.100.0/24'], { maxPrefixes: 1 }), /silently truncating/i);
  assert.throws(() => buildRisLiveSubscription([], { maxPrefixes: 1 }), /at least one scoped prefix/i);
  assert.equal(RIS_LIVE_MAX_PREFIXES, 200);
});

test('RIS Live stream request uses public JSON firehose and X-RIS-Subscribe header', () => {
  const request = buildRisLiveStreamRequest(['192.0.2.0/24']);
  assert.match(request.url, /^https:\/\/ris-live\.ripe\.net\/v1\/stream\/\?format=json/);
  const header = JSON.parse(request.headers['x-ris-subscribe']);
  assert.equal(header.type, 'UPDATE');
  assert.deepEqual(header.prefix, ['192.0.2.0/24']);
});

test('RIS Live UPDATE parser emits separate announcements and withdrawals with provenance', () => {
  const parsed = parseRisLiveLine(JSON.stringify({
    type: 'ris_message',
    data: {
      timestamp: 1788940800.5,
      peer: '192.0.2.1',
      peer_asn: '64496',
      id: '21-test-1',
      host: 'rrc21',
      type: 'UPDATE',
      path: [64496, 3356, [58224, 12880]],
      community: [[64496, 100], [3356, 200]],
      origin: 'igp',
      med: 10,
      announcements: [{ next_hop: '192.0.2.1', prefixes: ['203.0.113.0/24'] }],
      withdrawals: ['2001:db8::/32'],
    },
  }));
  assert.equal(parsed.kind, 'update');
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.events[0].eventType, 'announcement');
  assert.equal(parsed.events[0].prefix, '203.0.113.0/24');
  assert.equal(parsed.events[0].peerAsn, 'AS64496');
  assert.deepEqual(parsed.events[0].asPath, ['AS64496', 'AS3356', '{58224,12880}']);
  assert.equal(parsed.events[0].originAsn, null);
  assert.equal(parsed.events[0].evidenceRole, 'routing-control-plane');
  assert.equal(parsed.events[0].independentCensorshipVote, false);
  assert.equal(parsed.events[1].eventType, 'withdrawal');
  assert.equal(parsed.events[1].nextHop, null);
});

test('RIS Live parser surfaces ris_error instead of treating it as route data', () => {
  const parsed = parseRisLiveLine('{"type":"ris_error","data":{"message":"client too slow"}}');
  assert.equal(parsed.kind, 'error');
  assert.equal(parsed.events.length, 0);
  assert.match(parsed.error, /client too slow/);
});

test('RIS Live JSON line decoder preserves messages across arbitrary chunk boundaries', async () => {
  async function* chunks() {
    yield new TextEncoder().encode('{"type":"pong","data":null}\n{"type":"ris_');
    yield new TextEncoder().encode('message","data":{"type":"KEEPALIVE"}}\r\n');
  }
  const lines = [];
  for await (const line of decodeRisLiveJsonLines(chunks())) lines.push(line);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).type, 'pong');
  assert.equal(JSON.parse(lines[1]).type, 'ris_message');
});

test('RIS Live scope resolver uses RIPEstat announced prefixes and fails on oversized scope', async () => {
  const fetcher = async () => ({ data: { prefixes: [
    { prefix: '192.0.2.0/24', timelines: [] },
    { prefix: '2001:db8::/32', timelines: [] },
  ] } });
  const scope = await resolveRisLivePrefixScope('58224', { now: new Date('2026-09-09T12:00:00Z'), fetcher, maxPrefixes: 2 });
  assert.equal(scope.status, 'observed');
  assert.equal(scope.asn, 'AS58224');
  assert.deepEqual(scope.prefixes, ['192.0.2.0/24', '2001:db8::/32']);
  await assert.rejects(() => resolveRisLivePrefixScope('AS58224', { now: new Date('2026-09-09T12:00:00Z'), fetcher, maxPrefixes: 1 }), /Narrow the scope/i);
});

test('RIS Live reconnect backoff is bounded and deterministic', () => {
  assert.equal(reconnectDelayMs(0), 1000);
  assert.equal(reconnectDelayMs(1), 2000);
  assert.equal(reconnectDelayMs(5), 30000);
  assert.equal(reconnectDelayMs(20), 30000);
});
