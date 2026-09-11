import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarUrls, radarAggregationInterval, radarEffectiveDateEnd } from '../lib/radar.mjs';

test('Radar aggregation interval follows monitoring range', () => {
  assert.equal(radarAggregationInterval('2026-09-07', '2026-09-08'), '15m');
  assert.equal(radarAggregationInterval('2026-09-01', '2026-09-08'), '1h');
  assert.equal(radarAggregationInterval('2026-08-01', '2026-09-08'), '1d');
  assert.equal(radarAggregationInterval('2026-05-12', '2026-09-08'), '1w');
});

test('Radar historical end date remains the end of the selected UTC day', () => {
  const now = new Date('2026-09-11T09:03:00Z');
  assert.equal(radarEffectiveDateEnd('2026-09-08', now), '2026-09-08T23:59:59Z');
  const urls = buildRadarUrls({ asn:'AS58224', since:'2026-09-01', until:'2026-09-08', now });
  assert.equal(urls.effectiveDateEnd, '2026-09-08T23:59:59Z');
  assert.equal(urls.dateEndCapped, false);
});

test('Radar current-day end is capped safely before now for every endpoint', () => {
  const now = new Date('2026-09-11T09:03:00Z');
  const urls = buildRadarUrls({ asn:'AS58224', since:'2026-09-05', until:'2026-09-11', now });
  assert.equal(urls.effectiveDateEnd, '2026-09-11T09:02:00.000Z');
  assert.equal(urls.dateEndCapped, true);
  const endpointUrls = [urls.trafficUrl, urls.outagesUrl, urls.anomaliesUrl, urls.bgpUrl, ...Object.values(urls.summaryUrls)];
  for (const value of endpointUrls) {
    assert.equal(new URL(value).searchParams.get('dateEnd'), '2026-09-11T09:02:00.000Z');
  }
});

test('Radar rejects a selected end day that has not started in UTC', () => {
  const now = new Date('2026-09-11T09:03:00Z');
  assert.throws(
    () => buildRadarUrls({ asn:'AS58224', since:'2026-09-05', until:'2026-09-12', now }),
    /must be before the current UTC time/i,
  );
});

test('Radar URLs apply Iran and selected ASN consistently', () => {
  const urls = buildRadarUrls({ asn: 'AS58224', since: '2026-09-01', until: '2026-09-08', now: new Date('2026-09-11T09:03:00Z') });
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
  const urls = buildRadarUrls({ asn: '', since: '2026-09-01', until: '2026-09-08', now: new Date('2026-09-11T09:03:00Z') });
  const bgp = new URL(urls.bgpUrl);
  assert.equal(bgp.searchParams.get('involvedCountry'), 'IR');
  assert.equal(bgp.searchParams.has('involvedAsn'), false);
});

test('Radar URL construction never contains the API token', () => {
  process.env.CLOUDFLARE_RADAR_API_TOKEN = 'sensitive-test-token';
  const urls = buildRadarUrls({ asn: 'AS58224', since: '2026-09-01', until: '2026-09-08', now: new Date('2026-09-11T09:03:00Z') });
  for (const value of Object.values(urls)) {
    if (typeof value === 'string') assert.equal(value.includes('sensitive-test-token'), false);
  }
  delete process.env.CLOUDFLARE_RADAR_API_TOKEN;
});

test('Radar protocol summary URLs are Iran and ASN scoped', () => {
  const urls = buildRadarUrls({ asn:'AS58224', since:'2026-09-01', until:'2026-09-08', now: new Date('2026-09-11T09:03:00Z') });
  for (const dimension of ['HTTP_PROTOCOL','HTTP_VERSION','IP_VERSION','TLS_VERSION']) {
    const url = new URL(urls.summaryUrls[dimension]);
    assert.equal(url.searchParams.get('location'), 'IR');
    assert.equal(url.searchParams.get('asn'), '58224');
    assert.match(url.pathname, new RegExp(`/summary/${dimension}$`));
  }
});
