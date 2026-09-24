import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeOoniMeasurement, ooniOutcome, openStore } from '../lib/store.mjs';

const m = (uid, { asn = 58224, test = 'web_connectivity', input = 'https://www.instagram.com/', time = '2026-09-20T10:00:00Z', anomaly = false, confirmed = false, failure = false, blocking = null, report = 'r1' } = {}) => ({
  measurement_uid: uid, measurement_start_time: time, probe_asn: asn, test_name: test, input,
  anomaly, confirmed, failure, report_id: report, scores: blocking ? { analysis: { blocking_type: blocking } } : {},
});

test('outcomes are exclusive in the order OONI counts them', () => {
  assert.equal(ooniOutcome({ confirmed: true, failure: true, anomaly: true }), 'confirmed');
  assert.equal(ooniOutcome({ failure: true, anomaly: true }), 'failure');
  assert.equal(ooniOutcome({ anomaly: true }), 'anomaly');
  assert.equal(ooniOutcome({}), 'ok');
});

test('a measurement is reduced to the stored fields; one without identity or time is skipped', () => {
  const row = normalizeOoniMeasurement(m('u1', { input: 'https://WWW.Instagram.com./x', confirmed: true, blocking: 'dns' }));
  assert.deepEqual({ asn: row.asn, host: row.host, day: row.day, outcome: row.outcome, blocking: row.blocking_type },
    { asn: 'AS58224', host: 'www.instagram.com', day: '2026-09-20', outcome: 'confirmed', blocking: 'dns' });
  assert.equal(normalizeOoniMeasurement({ ...m('u2'), measurement_uid: '' }), null);
  assert.equal(normalizeOoniMeasurement({ ...m('u3'), measurement_start_time: 'never' }), null);
});

test('the same measurement from the API and from raw files is stored once, with both routes', () => {
  const store = openStore();
  assert.equal(store.addOoniMeasurements([m('u1'), m('u2')], 'api'), 2);
  assert.equal(store.addOoniMeasurements([m('u1'), m('u3')], 's3'), 1);
  const routes = store.db.prepare('SELECT uid, routes FROM ooni_measurement ORDER BY uid').all().map((row) => [row.uid, row.routes]);
  assert.deepEqual(routes, [['u1', 'api,s3'], ['u2', 'api'], ['u3', 's3']]);
  store.close();
});

test('domain counts match the OONI aggregation shape and leave out networks registered abroad', () => {
  const store = openStore();
  store.addOoniMeasurements([
    m('a', { confirmed: true, blocking: 'dns' }),
    m('b', { anomaly: true, blocking: 'tcp_ip', time: '2026-09-21T10:00:00Z' }),
    m('c', { time: '2026-09-21T11:00:00Z' }),
    m('d', { asn: 142578, time: '2026-09-21T12:00:00Z' }),
    m('e', { input: 'https://example.org/', failure: true }),
    m('f', { time: '2026-09-25T10:00:00Z' }),
  ], 'api');
  const iran = new Set(['AS58224']);
  const { domains, excluded } = store.domainCounts({ since: '2026-09-20', until: '2026-09-23', iranAsns: iran });
  const instagram = domains.find((row) => row.domain === 'www.instagram.com');
  assert.deepEqual({ ...instagram }, { domain: 'www.instagram.com', measurements: 3, confirmed: 1, anomalous: 1, failures: 0, ok: 1,
    observedDays: 2, lastObserved: '2026-09-21', anomalyRate: 33.3, evidence: 'confirmed' });
  assert.deepEqual(excluded, [{ asn: 'AS142578', measurements: 1 }]);
  const network = store.domainCounts({ asn: 'AS142578', since: '2026-09-20', until: '2026-09-23' });
  assert.equal(network.domains[0].measurements, 1, 'a selected network is its own scope');
  assert.deepEqual(store.mechanisms({ host: 'www.instagram.com', since: '2026-09-20', until: '2026-09-23', iranAsns: iran }).map((row) => [row.type, row.n]),
    [['dns', 1], ['tcp_ip', 1]]);
  store.close();
});

test('app tests per day and host by network are served from the store', () => {
  const store = openStore();
  store.addOoniMeasurements([
    m('w1', { test: 'whatsapp', input: null, anomaly: true }),
    m('w2', { test: 'whatsapp', input: null }),
    m('x1', { asn: 44244, confirmed: true }),
  ], 'api');
  assert.deepEqual(store.testDays({ test: 'whatsapp', since: '2026-09-20', until: '2026-09-20', iranAsns: new Set(['AS58224']) })
    .map((row) => ({ ...row })), [{ date: '2026-09-20', measurements: 2, confirmed: 0, anomalies: 1, failures: 0 }]);
  const byNetwork = store.hostNetworkCounts({ hosts: ['www.instagram.com'], since: '2026-09-20', until: '2026-09-20', iranAsns: new Set(['AS44244']) });
  assert.deepEqual(byNetwork.map((row) => [row.asn, row.confirmed]), [['AS44244', 1]]);
  store.close();
});

test('independent measurements stay their own family; runs report per-path health', () => {
  const store = openStore();
  assert.equal(store.addActiveMeasurements([
    { id: 'atlas-1', source: 'ripe-atlas', probeId: '123', asn: 58224, host: 'www.instagram.com', kind: 'dns', outcome: 'blocked', detail: '10.10.34.35', ts: '2026-09-20T10:00:00Z' },
    { id: 'atlas-1', source: 'ripe-atlas', probeId: '123', asn: 58224, host: 'www.instagram.com', kind: 'dns', outcome: 'blocked', detail: '10.10.34.35', ts: '2026-09-20T10:00:00Z' },
  ]), 1);
  assert.equal(store.activeResults({ host: 'WWW.instagram.com', since: '2026-09-20', until: '2026-09-20' })[0].outcome, 'blocked');
  const run = store.startRun('ooni-api');
  store.finishRun(run, { rows: 5, newest: '2026-09-20T10:00:00Z' });
  const failed = store.startRun('ooni-s3');
  store.finishRun(failed, { error: 'timeout' });
  const health = store.health();
  assert.equal(health['ooni-api'].newest, '2026-09-20T10:00:00Z');
  assert.equal(health['ooni-s3'].lastError, 'timeout');
  assert.equal(health['ooni-s3'].lastSuccess, null);
  store.close();
});

test('the store persists on disk and prunes old days', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'store-')), 'monitor.db');
  const first = openStore(path);
  first.addOoniMeasurements([m('old', { time: '2025-01-01T00:00:00Z' }), m('new')], 'api');
  first.close();
  const second = openStore(path);
  assert.equal(second.newestOoni(), '2026-09-20T10:00:00.000Z');
  assert.equal(second.prune('2026-01-01'), 1);
  assert.equal(second.db.prepare('SELECT count(*) AS n FROM ooni_measurement').get().n, 1);
  second.close();
});
