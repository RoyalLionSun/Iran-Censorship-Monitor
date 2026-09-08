import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOoniRows, buildOoniQuery, inferDetailedMethods } from '../lib/ooni.mjs';

test('OONI method classifier distinguishes DNS/TCP/TLS/HTTP signals', () => {
  const methods = inferDetailedMethods({ dns_consistency: false, tcp_connect: false, tls_failure: true, status_code_match: false, anomaly: true });
  const codes = methods.map((method) => method.code);
  assert.ok(codes.includes('dns_consistency'));
  assert.ok(codes.includes('tcp_connect'));
  assert.ok(codes.includes('tls_handshake'));
  assert.ok(codes.includes('http_request'));
});

test('OONI aggregation keeps anomaly, confirmation and failures separate', () => {
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

test('OONI query restricts country to Iran and strips AS prefix', () => {
  const params = buildOoniQuery({ country:'IR', asn:'AS58224', since:'2026-09-01', until:'2026-09-07', target:'https://example.org/', testName:'web_connectivity' });
  assert.equal(params.get('probe_cc'), 'IR');
  assert.equal(params.get('probe_asn'), '58224');
  assert.equal(params.get('input'), 'https://example.org/');
});

test('non web-connectivity test does not send input target', () => {
  const params = buildOoniQuery({ country:'IR', asn:'AS58224', since:'2026-09-01', until:'2026-09-07', target:'https://example.org/', testName:'tor' });
  assert.equal(params.get('input'), null);
});
