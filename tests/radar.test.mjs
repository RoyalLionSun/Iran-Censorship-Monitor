import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarUrls, radarAggregationInterval } from '../lib/radar.mjs';

test('Radar aggregation interval follows monitoring range', () => {
  assert.equal(radarAggregationInterval('2026-09-07', '2026-09-08'), '15m');
  assert.equal(radarAggregationInterval('2026-09-01', '2026-09-08'), '1h');
  assert.equal(radarAggregationInterval('2026-08-01', '2026-09-08'), '1d');
  assert.equal(radarAggregationInterval('2026-05-12', '2026-09-08'), '1w');
});

test('Radar URLs apply Iran and selected ASN consistently', () => {
  const urls = buildRadarUrls({ asn: 'AS58224', since: '2026-09-01', until: '2026-09-08' });
  const traffic = new URL(urls.trafficUrl);
  const outages = new URL(urls.outagesUrl);
  const anomalies = new URL(urls.anomaliesUrl);
  const bgp = new URL(urls.bgpUrl);

  assert.equal(traffic.searchParams.get('location'), 'IR');
  assert.equal(traffic.searchParams.get('asn'), '58224');
  assert.equal(traffic.searchParams.get('aggInterval'), '1h');
  assert.equal(outages.searchParams.get('location'), 'IR');
  assert.equal(outages.searchParams.get('asn'), '58224');
  assert.equal(anomalies.searchParams.get('location'), 'IR');
  assert.equal(anomalies.searchParams.get('asn'), '58224');
  assert.equal(bgp.searchParams.get('involvedAsn'), '58224');
  assert.equal(bgp.searchParams.has('involvedCountry'), false);
});

test('Radar country-wide BGP query uses involvedCountry', () => {
  const urls = buildRadarUrls({ asn: '', since: '2026-09-01', until: '2026-09-08' });
  const bgp = new URL(urls.bgpUrl);
  assert.equal(bgp.searchParams.get('involvedCountry'), 'IR');
  assert.equal(bgp.searchParams.has('involvedAsn'), false);
});

test('Radar URL construction never contains the API token', () => {
  process.env.CLOUDFLARE_RADAR_API_TOKEN = 'sensitive-test-token';
  const urls = buildRadarUrls({ asn: 'AS58224', since: '2026-09-01', until: '2026-09-08' });
  for (const value of Object.values(urls)) {
    if (typeof value === 'string') assert.equal(value.includes('sensitive-test-token'), false);
  }
  delete process.env.CLOUDFLARE_RADAR_API_TOKEN;
});

test('Radar protocol summary URLs are Iran and ASN scoped', () => {
  const urls = buildRadarUrls({ asn:'AS58224', since:'2026-09-01', until:'2026-09-08' });
  for (const dimension of ['HTTP_PROTOCOL','HTTP_VERSION','IP_VERSION','TLS_VERSION']) {
    const url = new URL(urls.summaryUrls[dimension]);
    assert.equal(url.searchParams.get('location'), 'IR');
    assert.equal(url.searchParams.get('asn'), '58224');
    assert.match(url.pathname, new RegExp(`/summary/${dimension}$`));
  }
});
