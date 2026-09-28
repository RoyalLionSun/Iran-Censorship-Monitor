import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../lib/store.mjs';
import { storeCircumvention, storeCovers, storeDomains, storeNetworks, storeSample, storeTimeline } from '../lib/store-payloads.mjs';
import { aggregateOoniDomains } from '../lib/ooni.mjs';
import { summarizeServiceBrands } from '../public/service-findings.js';

const m = (uid, day, extra = {}) => ({ measurement_uid: uid, measurement_start_time: `${day}T10:00:00Z`, probe_asn: 58224, test_name: 'web_connectivity',
  input: 'https://www.instagram.com/', anomaly: false, confirmed: false, failure: false, report_id: `r-${uid}`, ...extra });

function filled() {
  const store = openStore();
  store.addOoniMeasurements([
    m('a', '2026-09-20', { confirmed: true, scores: { analysis: { blocking_type: 'dns' } } }),
    m('b', '2026-09-20', { anomaly: true, scores: { analysis: { blocking_type: 'dns' } } }),
    m('c', '2026-09-21'),
    m('d', '2026-09-21', { probe_asn: 142578 }),
    m('w', '2026-09-21', { test_name: 'whatsapp', input: null, anomaly: true }),
  ], 'api');
  return store;
}

test('the store answers exactly what the OONI domain aggregation would for the same measurements', () => {
  const store = filled();
  const input = { asn: '', since: '2026-09-20', until: '2026-09-21', testName: 'web_connectivity', target: '' };
  const fromStore = storeDomains(store, input, new Set(['AS58224']));
  // The same Iranian measurements as OONI's domain × day aggregation would return them.
  const live = aggregateOoniDomains([
    { domain: 'www.instagram.com', measurement_start_day: '2026-09-20', measurement_count: 2, anomaly_count: 1, confirmed_count: 1, failure_count: 0, ok_count: 0 },
    { domain: 'www.instagram.com', measurement_start_day: '2026-09-21', measurement_count: 1, anomaly_count: 0, confirmed_count: 0, failure_count: 0, ok_count: 1 },
  ]);
  const pick = (row) => ({ domain: row.domain, measurements: row.measurements, anomalous: row.anomalous, confirmed: row.confirmed, failures: row.failures, ok: row.ok, observedDays: row.observedDays, lastObserved: row.lastObserved, evidence: row.evidence });
  assert.deepEqual(fromStore.domains.map(pick), live.map(pick));
  assert.equal(fromStore.via, 'store');
  assert.deepEqual(fromStore.foreignExclusion.networks, ['AS142578']);
  const brands = summarizeServiceBrands(fromStore, storeCircumvention(store, input, new Set(['AS58224'])), input);
  assert.equal(brands.items.find((item) => item.id === 'instagram').status, 'blocked');
  assert.equal(brands.items.find((item) => item.id === 'whatsapp').app.status, 'anomaly');
  store.close();
});

test('timeline, networks and the complete sample come from the store', () => {
  const store = filled();
  const input = { asn: 'AS58224', since: '2026-09-20', until: '2026-09-21', testName: 'web_connectivity', target: '' };
  const timeline = storeTimeline(store, input, null);
  assert.equal(timeline.totalMeasurements, 3);
  assert.equal(timeline.totalAnomalies, 2);
  const networks = storeNetworks(store, { ...input, asn: '' }, 'www.instagram.com', new Set(['AS58224']));
  assert.equal(networks.measured, 1);
  // 1 confirmed, 1 anomaly, 1 ok: most tests failed, but confirmed blocks do not outnumber the
  // successes, so the network shows problems rather than a block (majority rule).
  assert.equal(networks.blocked, 0);
  assert.equal(networks.restricted, 1);
  assert.equal(networks.networks[0].status, 'restricted');
  const sample = storeSample(store, input, 'www.instagram.com', null);
  assert.deepEqual({ runs: sample.runs, sampled: sample.sampled, affected: sample.affected, bounded: sample.bounded, dominant: sample.dominantMechanism },
    { runs: 3, sampled: 3, affected: 2, bounded: false, dominant: { code: 'dns', count: 2 } });
  store.close();
});

test('the store speaks for a period only when a path covers all of it, minus the arrival lag', () => {
  const store = openStore();
  const now = Date.parse('2026-09-24T12:00:00Z');
  assert.equal(storeCovers(store, { since: '2026-09-18', until: '2026-09-24' }, now), false);
  store.setMeta('ooni-api:coveredSince', '2026-09-18T00:00:00Z');
  store.setMeta('ooni-api:coveredUntil', '2026-09-24T10:30:00Z');
  assert.equal(storeCovers(store, { since: '2026-09-18', until: '2026-09-24' }, now), true, 'up to two hours before now is enough');
  assert.equal(storeCovers(store, { since: '2026-09-17', until: '2026-09-24' }, now), false, 'a day before coverage began is not covered');
  store.close();
});
