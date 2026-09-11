import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOoniAggregationRows, aggregateOoniRows, buildOoniAggregationQuery, buildOoniQuery, inferDetailedMethods } from '../lib/ooni.mjs';

test('OONI method classifier distinguishes DNS/TCP/TLS/HTTP signals', () => {
  const methods = inferDetailedMethods({ dns_consistency: false, tcp_connect: false, tls_failure: true, status_code_match: false, anomaly: true });
  const codes = methods.map((method) => method.code);
  assert.ok(codes.includes('dns_consistency'));
  assert.ok(codes.includes('tcp_connect'));
  assert.ok(codes.includes('tls_handshake'));
  assert.ok(codes.includes('http_request'));
});

test('OONI raw-row aggregation keeps anomaly, confirmation and failures separate', () => {
  const rows = aggregateOoniRows([
    { measurement_start_time: '2026-09-01T10:00:00Z', anomaly: true, confirmed: false, failure: false },
    { measurement_start_time: '2026-09-01T11:00:00Z', anomaly: false, confirmed: true, failure: true },
    { measurement_start_time: '2026-09-02T11:00:00Z', anomaly: false, confirmed: false, failure: false },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].measurements, 2);
  assert.equal(rows[0].anomalies, 2);
  assert.equal(rows[0].confirmed, 1);
  assert.equal(rows[0].failures, 1);
  assert.equal(rows[0].anomalyRate, 100);
});

test('OONI aggregation API rows produce complete daily counts without list-endpoint truncation', () => {
  const rows = aggregateOoniAggregationRows([
    { measurement_start_day: '2026-09-10', measurement_count: 2400, ok_count: 1200, anomaly_count: 900, confirmed_count: 300, failure_count: 25 },
    { measurement_start_day: '2026-09-11', measurement_count: 800, ok_count: 700, anomaly_count: 75, confirmed_count: 25, failure_count: 4 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].measurements, 2400);
  assert.equal(rows[0].anomalies, 1200);
  assert.equal(rows[0].confirmed, 300);
  assert.equal(rows[0].failures, 25);
  assert.equal(rows[0].anomalyRate, 50);
  assert.deepEqual(rows[0].methods, []);
});

test('OONI aggregation clamps anomalous plus confirmed counts to measurement count', () => {
  const [row] = aggregateOoniAggregationRows([
    { measurement_start_day: '2026-09-10', measurement_count: 10, anomaly_count: 9, confirmed_count: 4, failure_count: 0 },
  ]);
  assert.equal(row.anomalies, 10);
  assert.equal(row.anomalyRate, 100);
});

test('OONI list query restricts country to Iran and strips AS prefix', () => {
  const params = buildOoniQuery({ country:'IR', asn:'AS58224', since:'2026-09-01', until:'2026-09-07', target:'https://example.org/', testName:'web_connectivity' });
  assert.equal(params.get('probe_cc'), 'IR');
  assert.equal(params.get('probe_asn'), '58224');
  assert.equal(params.get('input'), 'https://example.org/');
});

test('OONI aggregation query uses daily aggregate axis and canonical AS prefix', () => {
  const params = buildOoniAggregationQuery({ country:'IR', asn:'AS58224', since:'2026-09-01', until:'2026-09-07', target:'https://example.org/', testName:'web_connectivity' });
  assert.equal(params.get('probe_cc'), 'IR');
  assert.equal(params.get('probe_asn'), 'AS58224');
  assert.equal(params.get('axis_x'), 'measurement_start_day');
  assert.equal(params.get('time_grain'), 'day');
  assert.equal(params.get('format'), 'JSON');
  assert.equal(params.get('input'), 'https://example.org/');
});

test('non web-connectivity queries do not send input target', () => {
  const listParams = buildOoniQuery({ country:'IR', asn:'AS58224', since:'2026-09-01', until:'2026-09-07', target:'https://example.org/', testName:'tor' });
  const aggregateParams = buildOoniAggregationQuery({ country:'IR', asn:'AS58224', since:'2026-09-01', until:'2026-09-07', target:'https://example.org/', testName:'tor' });
  assert.equal(listParams.get('input'), null);
  assert.equal(aggregateParams.get('input'), null);
});
