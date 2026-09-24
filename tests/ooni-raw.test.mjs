import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { collectOoniS3, judgeRawMeasurement, parseRawListing, rawHourPrefix, rawToStoreItem, streamRawFile } from '../lib/ooni-raw.mjs';
import { openStore } from '../lib/store.mjs';

const wc = (input, testKeys, extra = {}) => ({
  measurement_start_time: '2026-09-23 18:00:05', probe_asn: 'AS58224', probe_cc: 'IR', test_name: 'web_connectivity',
  input, report_id: `20260923T180005Z_webconnectivity_IR_58224_n4_${input.length}`, test_keys: testKeys, ...extra,
});

test('the hour prefix and listing follow the bucket layout; companion archives and other tests are skipped', () => {
  assert.equal(rawHourPrefix(Date.parse('2026-09-23T18:30:00Z')), 'raw/20260923/18/IR/');
  const xml = `<ListBucketResult><IsTruncated>false</IsTruncated>
    <Contents><Key>raw/20260923/18/IR/webconnectivity/2026092318_IR_webconnectivity.n1.0.jsonl.gz</Key><Size>9000</Size></Contents>
    <Contents><Key>raw/20260923/18/IR/webconnectivity/2026092318_IR_webconnectivity.n1.0.tar.gz</Key><Size>9500</Size></Contents>
    <Contents><Key>raw/20260923/18/IR/dnscheck/2026092318_IR_dnscheck.n1.0.jsonl.gz</Key><Size>30</Size></Contents>
    <Contents><Key>raw/20260923/18/IR/facebookmessenger/2026092318_IR_facebookmessenger.n1.0.jsonl.gz</Key><Size>40</Size></Contents>
  </ListBucketResult>`;
  const { files, truncated } = parseRawListing(xml);
  assert.equal(truncated, false);
  assert.deepEqual(files.map((file) => [file.test, file.size]), [['web_connectivity', 9000], ['facebook_messenger', 40]]);
});

test('Web Connectivity verdicts: Iran block page is confirmed, blocking is an anomaly, no control is a failure', () => {
  assert.deepEqual(judgeRawMeasurement(wc('https://www.vice.com/', { blocking: 'dns', accessible: false, queries: [{ answers: [{ ipv4: '10.10.34.35' }] }] })),
    { confirmed: true, blocking_type: 'dns' });
  const page = Buffer.from('<html><iframe src="http://10.10.34.34?type=Invalid Site"></iframe></html>').toString('base64');
  assert.deepEqual(judgeRawMeasurement(wc('http://www.well.com/', { blocking: 'http-diff', requests: [{ response: { body: { format: 'base64', data: page } } }] })),
    { confirmed: true, blocking_type: 'blockpage' });
  assert.deepEqual(judgeRawMeasurement(wc('https://t.me/', { blocking: 'tcp_ip', accessible: false })), { anomaly: true, blocking_type: 'tcp' });
  assert.deepEqual(judgeRawMeasurement(wc('https://www.linkedin.com/', { blocking: false, accessible: true })), {});
  assert.deepEqual(judgeRawMeasurement(wc('https://lookaside.facebook.com/robots.txt', { blocking: null, accessible: null })), { failure: true });
});

test('app test verdicts follow the probe-reported status fields', () => {
  const app = (test_name, test_keys) => judgeRawMeasurement({ test_name, test_keys });
  assert.deepEqual(app('whatsapp', { registration_server_status: 'blocked', whatsapp_endpoints_status: 'ok', whatsapp_web_status: 'ok' }), { anomaly: true });
  assert.deepEqual(app('whatsapp', { registration_server_status: 'ok', whatsapp_endpoints_status: 'ok', whatsapp_web_status: 'ok' }), {});
  assert.deepEqual(app('telegram', { telegram_tcp_blocking: false, telegram_http_blocking: false, telegram_web_status: 'blocked' }), { anomaly: true });
  assert.deepEqual(app('signal', { signal_backend_status: 'blocked' }), { anomaly: true });
  assert.deepEqual(app('facebook_messenger', { facebook_tcp_blocking: false, facebook_dns_blocking: true }), { anomaly: true });
  assert.deepEqual(app('psiphon', { failure: 'unknown_failure: clientlib: tunnel establishment timeout' }), { anomaly: true });
  assert.deepEqual(app('tor', { dir_port_accessible: 10, dir_port_total: 10, or_port_dirauth_accessible: 10, or_port_dirauth_total: 10 }), {});
  assert.deepEqual(app('tor', { dir_port_accessible: 0, dir_port_total: 10, or_port_dirauth_accessible: 0, or_port_dirauth_total: 10 }), { anomaly: true });
  assert.deepEqual(app('signal', { failure: 'interrupted' }), { failure: true });
  assert.equal(app('dnscheck', {}), null);
});

test('a raw measurement enters the store with its UTC time and derived verdict', () => {
  const item = rawToStoreItem(wc('https://www.vice.com/', { blocking: 'dns', queries: [{ answers: [{ ipv4: '10.10.34.36' }] }] }));
  const store = openStore();
  assert.equal(store.addOoniMeasurements([item], 's3'), 1);
  const row = store.db.prepare('SELECT ts, host, outcome, blocking_type, routes FROM ooni_measurement').get();
  assert.deepEqual({ ...row }, { ts: '2026-09-23T18:00:05.000Z', host: 'www.vice.com', outcome: 'confirmed', blocking_type: 'dns', routes: 's3' });
  store.close();
});

test('a compressed file is streamed line by line in batches; broken lines are skipped', async () => {
  const lines = [
    JSON.stringify(wc('https://a.example/', { blocking: false, accessible: true })),
    '{broken',
    JSON.stringify({ test_name: 'dnscheck', test_keys: {} }),
    JSON.stringify(wc('https://b.example/', { blocking: 'dns' })),
  ].join('\n');
  const body = gzipSync(Buffer.from(lines));
  const fetcher = async () => new Response(body);
  const batches = [];
  const read = await streamRawFile('raw/x.jsonl.gz', (batch) => batches.push(batch), fetcher);
  assert.equal(read, 2);
  assert.deepEqual(batches.flat().map((item) => [item.input, item.anomaly]), [['https://a.example/', false], ['https://b.example/', true]]);
});

test('the S3 path reads settled hours into coverage, skips files it read, and stops at its byte budget', async () => {
  const store = openStore();
  const files = (hour) => [{ key: `${rawHourPrefix(hour)}webconnectivity/f.jsonl.gz`, size: 100, test: 'web_connectivity' }];
  const streamed = [];
  const stream = async (key, onBatch) => {
    streamed.push(key);
    onBatch([rawToStoreItem(wc(`https://${key.slice(4, 15).replaceAll('/', '')}.example/`, { blocking: false }, { measurement_start_time: `${key.slice(4, 8)}-${key.slice(8, 10)}-${key.slice(10, 12)} ${key.slice(13, 15)}:10:00` }))]);
    return 1;
  };
  const first = await collectOoniS3(store, { now: new Date('2026-09-23T18:30:00Z'), list: async (hour) => files(hour), stream, catchUpHours: 4 });
  assert.equal(first.ok, true);
  assert.equal(streamed.length, 4, 'hours 14 to 17 have ended and were read');
  assert.equal(store.getMeta('ooni-s3:coveredSince'), '2026-09-23T14:00:00Z');
  assert.equal(store.getMeta('ooni-s3:coveredUntil'), '2026-09-23T17:00:00Z', 'hour 17 is read but not settled');

  streamed.length = 0;
  const second = await collectOoniS3(store, { now: new Date('2026-09-23T19:30:00Z'), list: async (hour) => files(hour), stream });
  assert.deepEqual(streamed, ['raw/20260923/18/IR/webconnectivity/f.jsonl.gz'], 'files already read are skipped');
  assert.equal(second.added, 1);
  assert.equal(store.getMeta('ooni-s3:coveredUntil'), '2026-09-23T18:00:00Z');
  assert.equal(store.getMeta('ooni-s3:coveredSince'), '2026-09-23T14:00:00Z', 'coverage stays continuous');

  const budget = await collectOoniS3(openStore(), { now: new Date('2026-09-23T18:30:00Z'), list: async (hour) => files(hour), stream, catchUpHours: 4, maxBytes: 150 });
  assert.deepEqual({ complete: budget.complete, bytes: budget.bytes }, { complete: false, bytes: 100 });
  store.close();
});

test('a failed listing keeps what was read and records the error', async () => {
  const store = openStore();
  const result = await collectOoniS3(store, { now: new Date('2026-09-23T18:30:00Z'), list: async () => { throw new Error('OONI raw listing 503'); }, stream: async () => 0 });
  assert.equal(result.ok, false);
  assert.equal(store.health()['ooni-s3'].lastError, 'OONI raw listing 503');
  assert.equal(store.getMeta('ooni-s3:coveredUntil'), null);
  store.close();
});

test('a backfill reads newest first and extends coverage back only when it joins it', async () => {
  const { backfillOoniS3 } = await import('../lib/ooni-raw.mjs');
  const store = openStore();
  store.setMeta('ooni-s3:coveredSince', '2026-09-23T14:00:00Z');
  store.setMeta('ooni-s3:coveredUntil', '2026-09-23T17:00:00Z');
  const hours = [];
  const list = async (hour) => { hours.push(new Date(hour).toISOString().slice(11, 13)); if (hours.length === 4) throw new Error('503'); return []; };
  const result = await backfillOoniS3(store, { from: Date.parse('2026-09-23T08:00:00Z'), to: Date.parse('2026-09-23T14:00:00Z'), list, stream: async () => 0 });
  assert.deepEqual(hours, ['13', '12', '11', '10']);
  assert.equal(result.ok, false);
  assert.equal(store.getMeta('ooni-s3:coveredSince'), '2026-09-23T11:00:00Z', 'covered back to the last hour read without a gap');

  const gap = openStore();
  gap.setMeta('ooni-s3:coveredSince', '2026-09-23T14:00:00Z');
  gap.setMeta('ooni-s3:coveredUntil', '2026-09-23T17:00:00Z');
  await backfillOoniS3(gap, { from: Date.parse('2026-09-23T08:00:00Z'), to: Date.parse('2026-09-23T10:00:00Z'), list: async () => [], stream: async () => 0 });
  assert.equal(gap.getMeta('ooni-s3:coveredSince'), '2026-09-23T14:00:00Z', 'a stretch with a gap is stored but not counted as covered');
  store.close();
  gap.close();
});
