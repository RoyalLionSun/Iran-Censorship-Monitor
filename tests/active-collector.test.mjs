import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atlasPath, buildAtlasRequest, classifyDns, collectActivePath, collectorPlan, globalpingPath, isBlockAddress,
  parseAtlasResults, parseDnsAbuf, parseGlobalpingResults, pickAtlasProbes,
} from '../lib/active-collector.mjs';
import { openStore } from '../lib/store.mjs';

// A DNS response for www.instagram.com with a CNAME (compressed name) and one A record.
function dnsResponse(address, rcode = 0) {
  const name = Buffer.from([3, ...Buffer.from('www'), 9, ...Buffer.from('instagram'), 3, ...Buffer.from('com'), 0]);
  const header = Buffer.from([0x12, 0x34, 0x81, 0x80 | rcode, 0, 1, 0, address ? 2 : 0, 0, 0, 0, 0]);
  const question = Buffer.concat([name, Buffer.from([0, 1, 0, 1])]);
  if (!address) return Buffer.concat([header, question]).toString('base64');
  const cnameData = Buffer.from([1, ...Buffer.from('z'), 0xc0, 12]);
  const cname = Buffer.concat([Buffer.from([0xc0, 12, 0, 5, 0, 1, 0, 0, 0, 60, 0, cnameData.length]), cnameData]);
  const a = Buffer.concat([Buffer.from([0xc0, 12, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4]), Buffer.from(address.split('.').map(Number))]);
  return Buffer.concat([header, question, cname, a]).toString('base64');
}

const iran = new Set(['AS58224', 'AS197207']);

test('paths are off until switched on, and each names what it still needs', () => {
  const off = collectorPlan({});
  assert.equal(off['ooni-api'].enabled, false);
  assert.deepEqual(off['ooni-s3'].missing, ['MONITOR_COLLECTOR=1', 'OONI_S3_ENABLED=1'], 'raw files are heavy and never on by default');
  assert.equal(collectorPlan({ MONITOR_COLLECTOR: '1' })['ooni-s3'].enabled, false);
  assert.deepEqual(off['ripe-atlas'].missing, ['MONITOR_COLLECTOR=1', 'ACTIVE_MEASUREMENTS_ENABLED=true', 'RIPE_ATLAS_API_KEY']);
  const on = collectorPlan({ MONITOR_COLLECTOR: '1', ACTIVE_MEASUREMENTS_ENABLED: 'true' });
  assert.equal(on['ooni-api'].enabled, true);
  assert.equal(on.globalping.enabled, true);
  assert.deepEqual(on['ripe-atlas'].missing, ['RIPE_ATLAS_API_KEY'], 'no key, no Atlas');
  const paused = collectorPlan({ MONITOR_COLLECTOR: '1', MONITOR_COLLECTOR_PAUSE: 'ooni-api' });
  assert.deepEqual([paused['ooni-api'].enabled, paused['ooni-api'].paused, paused['ripe-atlas'].paused], [false, true, undefined], 'one path paused, the others unaffected');
});

test('the block address and private answers count as DNS blocking; an empty answer is a failure, not a block', () => {
  assert.equal(isBlockAddress('10.10.34.35'), true);
  assert.equal(isBlockAddress('192.168.1.1'), true);
  assert.equal(isBlockAddress('157.240.1.174'), false);
  assert.deepEqual(classifyDns({ addresses: ['10.10.34.36'] }), { outcome: 'blocked', detail: '10.10.34.36' });
  assert.deepEqual(classifyDns({ addresses: ['157.240.1.174'] }), { outcome: 'ok', detail: '157.240.1.174' });
  assert.deepEqual(classifyDns({ rcode: 3 }), { outcome: 'failure', detail: 'NXDOMAIN' });
});

test('the DNS wire format is read past compressed names', () => {
  assert.deepEqual(parseDnsAbuf(dnsResponse('10.10.34.35')), { rcode: 0, addresses: ['10.10.34.35'] });
  assert.deepEqual(parseDnsAbuf(dnsResponse(null, 3)), { rcode: 3, addresses: [] });
  assert.equal(parseDnsAbuf('AAA='), null);
});

test('Atlas probes come only from Iranian-registered networks, spread over networks', () => {
  const probes = [
    { id: 1, asn_v4: 58224 }, { id: 2, asn_v4: 58224 }, { id: 3, asn_v4: 58224 },
    { id: 4, asn_v4: 197207 }, { id: 5, asn_v4: 9009 }, { id: 6, asn_v4: null },
  ];
  assert.deepEqual(pickAtlasProbes(probes, iran, 3), { 1: 'AS58224', 4: 'AS197207', 2: 'AS58224' });
  const request = buildAtlasRequest(['www.instagram.com'], [1, 4]);
  assert.deepEqual(request.definitions.map((row) => row.type), ['dns', 'sslcert']);
  assert.equal(request.definitions[1].hostname, 'www.instagram.com', 'the TLS test sends the service name, as a browser would');
  assert.equal(request.is_oneoff, true);
});

test('Atlas results become rows; a probe that was not picked is ignored', () => {
  const dns = parseAtlasResults([
    { prb_id: 1, timestamp: 1790000000, resultset: [{ result: { abuf: dnsResponse('10.10.34.35') } }] },
    { prb_id: 4, timestamp: 1790000000, result: { abuf: dnsResponse('157.240.1.174') } },
    { prb_id: 4, timestamp: 1790000100, error: { timeout: 5000 } },
    { prb_id: 99, timestamp: 1790000000, result: { abuf: dnsResponse('10.10.34.35') } },
  ], { kind: 'dns', host: 'www.instagram.com', probeAsns: { 1: 'AS58224', 4: 'AS197207' }, measurementId: 7 });
  assert.deepEqual(dns.map((row) => [row.asn, row.outcome, row.detail]),
    [['AS58224', 'blocked', '10.10.34.35'], ['AS197207', 'ok', '157.240.1.174'], ['AS197207', 'failure', 'timeout']]);
  const tls = parseAtlasResults([
    { prb_id: 1, timestamp: 1790000000, cert: ['-----BEGIN CERTIFICATE-----'] },
    { prb_id: 4, timestamp: 1790000000, err: 'connect: Connection reset by peer' },
  ], { kind: 'tls', host: 'www.instagram.com', probeAsns: { 1: 'AS58224', 4: 'AS197207' }, measurementId: 8 });
  assert.deepEqual(tls.map((row) => row.outcome), ['ok', 'failure']);
});

test('Globalping results from probes on foreign networks are dropped', () => {
  const measurement = {
    id: 'gp1', status: 'finished', createdAt: '2026-09-24T10:00:00.000Z',
    results: [
      { probe: { asn: 58224, city: 'Tehran' }, result: { status: 'finished', answers: [{ type: 'A', value: '10.10.34.34' }] } },
      { probe: { asn: 9009, city: 'Tehran' }, result: { status: 'finished', answers: [{ type: 'A', value: '157.240.1.174' }] } },
    ],
  };
  const rows = parseGlobalpingResults(measurement, { kind: 'dns', host: 'www.instagram.com', iranAsns: iran });
  assert.deepEqual(rows.map((row) => [row.asn, row.outcome, row.ts]), [['AS58224', 'blocked', '2026-09-24T10:00:00Z']]);
  const http = parseGlobalpingResults({ id: 'gp2', status: 'finished', results: [
    { probe: { asn: 58224 }, result: { status: 'finished', statusCode: 200, resolvedAddress: '157.240.1.174' } },
    { probe: { asn: 197207 }, result: { status: 'failed', rawOutput: 'connect ETIMEDOUT' } },
  ] }, { kind: 'http', host: 'www.instagram.com', iranAsns: iran });
  assert.deepEqual(http.map((row) => [row.outcome, row.detail]), [['ok', 'HTTP 200'], ['failure', 'connect ETIMEDOUT']]);
});

test('an active run starts measurements, reads them on the next run, and survives a failing result', async () => {
  const store = openStore();
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push([options.method ?? 'GET', url]);
    if (url.includes('/probes/')) return { results: [{ id: 1, asn_v4: 58224 }, { id: 5, asn_v4: 9009 }] };
    if (options.method === 'POST') return { measurements: [101, 102] };
    if (url.includes('/101/')) return [{ prb_id: 1, timestamp: 1790000000, result: { abuf: dnsResponse('10.10.34.35') } }];
    throw new Error('Atlas 502');
  };
  const path = atlasPath({ http, key: 'k', hosts: ['www.instagram.com'] });
  const first = await collectActivePath(store, 'ripe-atlas', path, { now: new Date('2026-09-24T10:00:00Z'), iranAsns: iran });
  assert.deepEqual({ ok: first.ok, created: first.created, pending: first.pending }, { ok: true, created: 2, pending: 2 });
  const post = calls.find(([method]) => method === 'POST');
  assert.ok(post, 'measurements were created');

  const second = await collectActivePath(store, 'ripe-atlas', path, { now: new Date('2026-09-24T11:00:00Z'), iranAsns: iran });
  assert.equal(second.added, 1);
  assert.equal(second.created, 0, 'no new round before six hours');
  assert.equal(second.pending, 1, 'the failed result request is kept for the next run');
  assert.match(second.error, /Atlas 502/);
  assert.equal(store.activeResults({ host: 'www.instagram.com', since: '2026-09-21', until: '2026-09-24' })[0].outcome, 'blocked');
  assert.equal(store.health()['ripe-atlas'].newest, '2026-09-21T14:13:20.000Z');
  store.close();
});

test('without the Iran network list no probe can be verified, so nothing is started', async () => {
  const store = openStore();
  let created = false;
  const result = await collectActivePath(store, 'globalping', { create: async () => { created = true; return []; }, collect: async () => ({ rows: [], done: true }) }, { iranAsns: new Set() });
  assert.equal(result.ok, false);
  assert.equal(created, false);
  store.close();
});

test('Globalping measurements are started per host and method and read when finished', async () => {
  const store = openStore();
  const bodies = [];
  const http = async (url, options = {}) => {
    if (options.method === 'POST') { bodies.push(options.body); return { id: `m${bodies.length}` }; }
    return { id: url.split('/').pop(), status: 'finished', createdAt: '2026-09-24T10:00:00Z', results: [{ probe: { asn: 58224 }, result: { status: 'finished', statusCode: 200, answers: [{ type: 'A', value: '157.240.1.174' }] } }] };
  };
  const path = globalpingPath({ http, hosts: ['www.instagram.com'] });
  await collectActivePath(store, 'globalping', path, { now: new Date('2026-09-24T10:00:00Z'), iranAsns: iran });
  assert.deepEqual(bodies.map((body) => [body.type, body.target, body.locations[0].country]), [['dns', 'www.instagram.com', 'IR'], ['http', 'www.instagram.com', 'IR']]);
  const next = await collectActivePath(store, 'globalping', path, { now: new Date('2026-09-24T10:10:00Z'), iranAsns: iran });
  assert.deepEqual({ added: next.added, pending: next.pending }, { added: 2, pending: 0 });
  store.close();
});
