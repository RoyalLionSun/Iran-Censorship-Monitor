import test from 'node:test';
import assert from 'node:assert/strict';
import { OONI_VANTAGE_SAMPLE_SIZE, aggregateOoniAggregationRows, aggregateOoniDomains, aggregateOoniRows, buildOoniAggregationQuery, buildOoniDomainMeasurementsQuery, buildOoniDomainQuery, buildOoniQuery, buildOoniVantageQuery, inferDetailedMethods, parseOoniDomainMeasurements, summarizeOoniVantage } from '../lib/ooni.mjs';

const domainInput = { country:'IR', asn:'AS44244', since:'2026-09-01', until:'2026-09-02', testName:'web_connectivity', target:'' };

test('on-demand URL drilldown is Iran/ASN/domain scoped and page-bounded', () => {
  const params = buildOoniDomainMeasurementsQuery(domainInput, 'example.org', 25);
  assert.equal(params.get('probe_cc'), 'IR');
  assert.equal(params.get('probe_asn'), '44244');
  assert.equal(params.get('test_name'), 'web_connectivity');
  assert.equal(params.get('domain'), 'example.org');
  assert.equal(params.get('offset'), '25');
  assert.equal(params.get('limit'), '25');
  assert.equal(params.get('order'), 'desc');
  assert.equal(params.get('until'), '2026-09-02T23:59:59Z');
  assert.throws(() => buildOoniDomainMeasurementsQuery(domainInput, 'example.org', 100), /offset/);
  assert.throws(() => buildOoniDomainMeasurementsQuery(domainInput, 'example.org', 1), /offset/);
  assert.throws(() => buildOoniDomainMeasurementsQuery(domainInput, 'https://example.org'), /domain/);
  assert.throws(() => buildOoniDomainMeasurementsQuery({ ...domainInput, testName:'tor' }, 'example.org'), /Web Connectivity/);
});

test('exact target URL narrows drilldown and rejects another domain', () => {
  const input = { ...domainInput, target:'https://example.org/a' };
  const params = buildOoniDomainMeasurementsQuery(input, 'example.org');
  assert.equal(params.get('input'), input.target);
  assert.equal(params.get('domain'), null);
  assert.equal(buildOoniDomainMeasurementsQuery({ ...input, target:'https://www.example.org/a' }, 'example.org').get('input'), 'https://www.example.org/a');
  assert.throws(() => buildOoniDomainMeasurementsQuery(input, 'example.net'), /does not match/);
  assert.throws(() => buildOoniDomainMeasurementsQuery({ ...input, target:'https://notexample.org/a' }, 'example.org'), /does not match/);
});

test('domain details preserve exact tested URL, source-native outcome and UID evidence', () => {
  const rows = [
    { probe_cc:'IR', probe_asn:'AS44244', test_name:'web_connectivity', input:'https://example.org/path', measurement_start_time:'2026-09-02T12:00:00Z', measurement_uid:'20260902T120000Z_123', confirmed:true, anomaly:false, failure:false },
    { probe_cc:'IR', probe_asn:'AS44244', test_name:'web_connectivity', input:'http://example.org/other', report_id:'20260901T120000Z_web_connectivity_IR_44244_n0_abcd', measurement_url:'https://api.ooni.io/api/v1/raw_measurement?report_id=20260901T120000Z_web_connectivity_IR_44244_n0_abcd&input=http%3A%2F%2Fexample.org%2Fother', measurement_start_time:'2026-09-01T12:00:00Z', confirmed:false, anomaly:true, failure:false },
  ];
  const options = { domain:'example.org', input:domainInput, offset:0, sourceUrl:'https://api.ooni.io/api/v1/measurements?domain=example.org' };
  const parsed = parseOoniDomainMeasurements({ results:rows, metadata:{next_url:'https://api.ooni.io/next'} }, options);
  assert.deepEqual(parsed.rows.map((row) => row.outcome), ['confirmed','anomaly']);
  assert.equal(parsed.rows[0].url, 'https://example.org/path');
  assert.equal(parsed.rows[0].explorerUrl, 'https://explorer.ooni.org/measurement/20260902T120000Z_123');
  assert.equal(parsed.rows[1].uid, null);
  assert.match(parsed.rows[1].rawUrl, /^https:\/\/api\.ooni\.io\/api\/v1\/raw_measurement\?/);
  assert.equal(parsed.hasMore, true);
  assert.equal(parsed.limitReached, false);
  const capped = parseOoniDomainMeasurements({ results:rows, metadata:{next_url:'https://api.ooni.io/next'} }, { ...options, offset:75 });
  assert.equal(capped.hasMore, false);
  assert.equal(capped.limitReached, true);
});

test('domain detail rejects upstream scope drift and missing flags fail to unknown', () => {
  const base = { probe_cc:'IR', probe_asn:'AS44244', test_name:'web_connectivity', input:'https://example.org/path', measurement_start_time:'2026-09-02T12:00:00Z', confirmed:false, anomaly:false, failure:false };
  const options = { domain:'example.org', input:domainInput, sourceUrl:'https://api.ooni.io/api/v1/measurements' };
  const parse = (row) => parseOoniDomainMeasurements({ results:[row], metadata:{next_url:null} }, options);
  assert.equal(parse({ ...base, confirmed:null }).rows[0].outcome, 'unknown');
  assert.equal(parse(base).rows[0].outcome, 'ok');
  assert.equal(parse({ ...base, report_id:'a', measurement_url:'https://evil.example/api/v1/raw_measurement?report_id=a&input=https%3A%2F%2Fexample.org%2Fpath' }).rows[0].rawUrl, null);
  assert.equal(parse({ ...base, report_id:'a', measurement_url:'https://user:pass@api.ooni.io/api/v1/raw_measurement?report_id=a&input=https%3A%2F%2Fexample.org%2Fpath' }).rows[0].rawUrl, null);
  for (const row of [
    { ...base, probe_cc:'US' }, { ...base, probe_asn:'AS58224' }, { ...base, input:'https://example.net/' },
    { ...base, test_name:'tor' }, { ...base, measurement_start_time:'2026-09-03T00:00:00Z' }, { ...base, input:'ftp://example.org/path' }, { ...base, measurement_start_time:'not-a-timestamp' },
  ]) assert.throws(() => parse(row), /scope|dates|Invalid OONI tested URL/);
  assert.throws(() => parseOoniDomainMeasurements({ results:[base,base], metadata:{next_url:null} }, options), /Duplicate/);
  assert.throws(() => parseOoniDomainMeasurements({ results:[base] }, options), /response/);
});

test('OONI domain aggregation is scoped to Iran, selected ASN and Web Connectivity', () => {
  const params = buildOoniDomainQuery({ country: 'IR', asn: 'AS44244', since: '2026-09-01', until: '2026-09-02', testName: 'web_connectivity' });
  assert.equal(params.get('axis_x'), 'domain');
  assert.equal(params.get('axis_y'), 'measurement_start_day');
  assert.equal(params.get('time_grain'), 'day');
  assert.equal(params.get('probe_cc'), 'IR');
  assert.equal(params.get('probe_asn'), 'AS44244');
  assert.equal(params.get('test_name'), 'web_connectivity');
  assert.equal(params.get('since'), '2026-09-01');
  assert.equal(params.get('until'), '2026-09-03');
  assert.throws(() => buildOoniDomainQuery({ country: 'IR', since: '2026-09-01', until: '2026-09-02', testName: 'tor' }), /Web Connectivity/);
});

test('OONI domain counts preserve source-native confirmed and anomaly outcomes separately', () => {
  const rows = aggregateOoniDomains([
    { domain: 'example.org', measurement_start_day: '2026-09-01', measurement_count: 10, confirmed_count: 3, anomaly_count: 2, ok_count: 5, failure_count: 0 },
    { domain: 'example.org', measurement_start_day: '2026-09-02', measurement_count: 10, confirmed_count: 2, anomaly_count: 1, ok_count: 7, failure_count: 0 },
    { domain: 'example.net', measurement_start_day: '2026-09-01', measurement_count: 12, confirmed_count: 0, anomaly_count: 9, ok_count: 2, failure_count: 1 },
    { domain: 'example.com', measurement_start_day: '2026-09-01', measurement_count: 3, confirmed_count: 0, anomaly_count: 0, ok_count: 3, failure_count: 0 },
  ]);
  assert.deepEqual(rows.map((row) => row.evidence), ['confirmed', 'anomaly', 'no_blocking_signal']);
  assert.equal(rows[0].confirmed, 5);
  assert.equal(rows[0].anomalous, 3);
  assert.equal(rows[0].lastObserved, '2026-09-02');
  assert.equal(rows[1].anomalyRate, 75);
  assert.equal(rows.reduce((sum, row) => sum + row.measurements, 0), 35);
});

test('OONI domain aggregation normalizes host case without pooling distinct hosts', () => {
  const rows = aggregateOoniDomains([
    { domain: 'Example.ORG', measurement_start_day: '2026-09-01', measurement_count: 1, confirmed_count: 1, anomaly_count: 0, ok_count: 0, failure_count: 0 },
    { domain: 'www.example.org', measurement_start_day: '2026-09-01', measurement_count: 1, confirmed_count: 0, anomaly_count: 1, ok_count: 0, failure_count: 0 },
  ]);
  assert.deepEqual(rows.map((row) => row.domain).sort(), ['example.org', 'www.example.org']);
});

test('OONI domain parser fails closed on malformed, repeated or inconsistent aggregates', () => {
  const row = { domain: 'example.org', measurement_start_day: '2026-09-01', measurement_count: 2, confirmed_count: 1, anomaly_count: 0, ok_count: 1, failure_count: 0 };
  assert.throws(() => aggregateOoniDomains([row, row]), /Repeated/);
  assert.throws(() => aggregateOoniDomains([{ ...row, measurement_count: 3 }]), /Inconsistent/);
  assert.throws(() => aggregateOoniDomains([{ ...row, confirmed_count: -1 }]), /Invalid/);
  assert.throws(() => aggregateOoniDomains({ result: [row] }), /Invalid/);
});

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
  assert.equal(params.get('until'), '2026-09-08');
});

test('OONI uses the selected end day inclusively, including a single-day query', () => {
  const q = { country:'IR', asn:'AS44244', since:'2026-09-01', until:'2026-09-01', testName:'web_connectivity' };
  for (const build of [buildOoniQuery, buildOoniAggregationQuery, buildOoniDomainQuery]) {
    const params = build(q);
    assert.equal(params.get('since'), '2026-09-01');
    assert.equal(params.get('until'), '2026-09-02');
  }
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

const vantageInput = { country: 'IR', asn: 'AS58224', since: '2026-09-16', until: '2026-09-22', testName: 'web_connectivity', target: '' };

test('coverage sampling asks OONI for one domain inside the selected scope', () => {
  const params = buildOoniVantageQuery(vantageInput, 'WWW.Instagram.com.');
  assert.equal(params.get('domain'), 'www.instagram.com');
  assert.equal(params.get('probe_asn'), '58224');
  assert.equal(params.get('probe_cc'), 'IR');
  assert.equal(params.get('until'), '2026-09-22T23:59:59Z');
  assert.equal(Number(params.get('limit')), OONI_VANTAGE_SAMPLE_SIZE);
  assert.equal(params.get('input'), null, 'the sample covers the service, not one exact URL');
});

test('coverage sampling counts independent measurement runs and days, never probes', () => {
  const results = [
    { probe_cc: 'IR', probe_asn: 'AS58224', test_name: 'web_connectivity', input: 'https://www.instagram.com/', report_id: 'r1', measurement_start_time: '2026-09-22T10:00:00Z' },
    { probe_cc: 'IR', probe_asn: 'AS58224', test_name: 'web_connectivity', input: 'https://www.instagram.com/x', report_id: 'r1', measurement_start_time: '2026-09-22T10:05:00Z' },
    { probe_cc: 'IR', probe_asn: 'AS58224', test_name: 'web_connectivity', input: 'https://www.instagram.com/', report_id: 'r2', measurement_start_time: '2026-09-21T09:00:00Z' },
  ];
  const summary = summarizeOoniVantage({ results }, { domain: 'www.instagram.com', input: vantageInput });
  assert.equal(summary.runs, 2);
  assert.equal(summary.observedDays, 2);
  assert.equal(summary.sampled, 3);
  assert.equal(summary.bounded, false, 'a short sample is a complete count');
  assert.equal(summarizeOoniVantage({ results: Array.from({ length: OONI_VANTAGE_SAMPLE_SIZE }, (_, index) => ({
    ...results[0], report_id: `r${index}`,
  })) }, { domain: 'www.instagram.com', input: vantageInput }).bounded, true, 'a full sample is only a floor');
});

test('coverage sampling rejects records from another network or domain', () => {
  for (const bad of [
    { probe_cc: 'IR', probe_asn: 'AS44244', test_name: 'web_connectivity', input: 'https://www.instagram.com/', report_id: 'r1', measurement_start_time: '2026-09-22T10:00:00Z' },
    { probe_cc: 'IR', probe_asn: 'AS58224', test_name: 'web_connectivity', input: 'https://www.facebook.com/', report_id: 'r1', measurement_start_time: '2026-09-22T10:00:00Z' },
    { probe_cc: 'DE', probe_asn: 'AS58224', test_name: 'web_connectivity', input: 'https://www.instagram.com/', report_id: 'r1', measurement_start_time: '2026-09-22T10:00:00Z' },
  ]) {
    assert.throws(() => summarizeOoniVantage({ results: [bad] }, { domain: 'www.instagram.com', input: vantageInput }), /scope mismatch/);
  }
});

test('domain aggregation reports how many days a domain was measured on', () => {
  const rows = aggregateOoniDomains([
    { domain: 'www.instagram.com', measurement_start_day: '2026-09-20', measurement_count: 4, anomaly_count: 1, confirmed_count: 1, failure_count: 0, ok_count: 2 },
    { domain: 'www.instagram.com', measurement_start_day: '2026-09-21', measurement_count: 2, anomaly_count: 0, confirmed_count: 2, failure_count: 0, ok_count: 0 },
  ]);
  assert.equal(rows[0].observedDays, 2);
  assert.equal(rows[0].measurements, 6);
});
