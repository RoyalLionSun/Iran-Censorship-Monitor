import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarQualityUrls, buildRadarUrls, getRadarConnectionQuality, radarAggregationInterval, radarEffectiveDateEnd, radarQualityWindowAligned } from '../lib/radar.mjs';

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

test('Radar URLs apply Iran and selected ASN consistently without invalid anomaly filter combination', () => {
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
  assert.equal(anomalies.searchParams.get('asn'), '58224');
  assert.equal(anomalies.searchParams.has('location'), false);
  assert.equal(bgp.searchParams.get('involvedAsn'), '58224');
  assert.equal(bgp.searchParams.has('involvedCountry'), false);
});

test('Radar country-wide anomaly and BGP queries use country scope only', () => {
  const urls = buildRadarUrls({ asn: '', since: '2026-09-01', until: '2026-09-08', now: new Date('2026-09-11T09:03:00Z') });
  const anomalies = new URL(urls.anomaliesUrl);
  const bgp = new URL(urls.bgpUrl);
  assert.equal(anomalies.searchParams.get('location'), 'IR');
  assert.equal(anomalies.searchParams.has('asn'), false);
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

const qualityWindow = { since: '2026-09-16', until: '2026-09-22' };

test('Radar quality is requested per day for the selected network and window', () => {
  const urls = buildRadarQualityUrls({ asn: 'AS58224', ...qualityWindow, now: new Date('2026-09-23T08:00:00Z') });
  for (const url of [urls.latency, urls.bandwidth]) {
    const params = new URL(url).searchParams;
    assert.equal(params.get('asn'), '58224');
    assert.equal(params.get('aggInterval'), '1d');
    assert.equal(params.get('dateStart'), '2026-09-16T00:00:00Z');
    assert.equal(params.get('dateEnd'), '2026-09-22T23:59:59Z');
  }
  assert.match(urls.latency, /metric=latency/);
  assert.match(urls.bandwidth, /metric=bandwidth/);
  assert.equal(new URL(buildRadarQualityUrls({ asn: '', ...qualityWindow, now: new Date('2026-09-23T08:00:00Z') }).latency).searchParams.get('location'), 'IR');
});

test('a Radar quality answer outside the selected window cannot speak for that window', () => {
  const requested = { dateStart: '2026-09-16T00:00:00Z', dateEnd: '2026-09-22T23:59:59Z' };
  assert.equal(radarQualityWindowAligned({ start: '2026-09-16T00:00:00Z', end: '2026-09-22T00:00:00Z' }, requested), true);
  // Cloudflare silently answers some quality queries with a 90-day window.
  assert.equal(radarQualityWindowAligned({ start: '2026-06-24T00:00:00Z', end: '2026-09-22T00:00:00Z' }, requested), false);
  assert.equal(radarQualityWindowAligned(null, requested), false);
});

test('Radar quality without a token stays token_required and invents no values', async () => {
  const previous = process.env.CLOUDFLARE_RADAR_API_TOKEN;
  delete process.env.CLOUDFLARE_RADAR_API_TOKEN;
  try {
    const result = await getRadarConnectionQuality({ asn: 'AS58224', ...qualityWindow });
    assert.equal(result.status, 'token_required');
    assert.equal(result.latency, null);
    assert.equal(result.windowAligned, false);
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_RADAR_API_TOKEN; else process.env.CLOUDFLARE_RADAR_API_TOKEN = previous;
  }
});

test('Radar quality parses daily percentiles and reports the window median', async (t) => {
  process.env.CLOUDFLARE_RADAR_API_TOKEN = 'test-token';
  const payload = (values) => ({ result: { serie_0: {
    timestamps: ['2026-09-16T00:00:00Z', '2026-09-17T00:00:00Z', '2026-09-18T00:00:00Z'],
    p25: values.map((value) => String(value - 10)), p50: values.map(String), p75: values.map((value) => String(value + 10)),
  }, meta: { dateRange: [{ startTime: '2026-09-16T00:00:00Z', endTime: '2026-09-18T00:00:00Z' }], normalization: 'ROLLING_AVERAGE' } } });
  t.mock.method(globalThis, 'fetch', async (url) => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => payload(String(url).includes('metric=latency') ? [120, 110, 130] : [5, 4, 6]),
  }));
  const result = await getRadarConnectionQuality({ asn: 'AS58224', since: '2026-09-16', until: '2026-09-18', now: new Date('2026-09-19T08:00:00Z') });
  assert.equal(result.status, 'observed');
  assert.equal(result.windowAligned, true);
  assert.equal(result.latency.median, 120);
  assert.equal(result.bandwidth.median, 5);
  assert.equal(result.latency.points.length, 3);
  assert.equal(result.latency.normalization, 'ROLLING_AVERAGE');
  delete process.env.CLOUDFLARE_RADAR_API_TOKEN;
});
