import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarOutageTrafficUrls, buildRadarQualityUrls, buildRadarUrls, getRadarConnectionQuality, getRadarOutageTraffic, getRadarSignals, radarAggregationInterval, radarEffectiveDateEnd, radarQualityWindowAligned, summarizeOutageTraffic } from '../lib/radar.mjs';

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
  const seriesFor = (url) => String(url).includes('metric=latency') ? [120, 110, 130]
    : String(url).includes('metric=dns') ? [95, 90, 100] : [5, 4, 6];
  t.mock.method(globalThis, 'fetch', async (url) => ({
    ok: true, status: 200, statusText: 'OK', json: async () => payload(seriesFor(url)),
  }));
  const result = await getRadarConnectionQuality({ asn: 'AS58224', since: '2026-09-16', until: '2026-09-18', now: new Date('2026-09-19T08:00:00Z') });
  assert.equal(result.status, 'observed');
  assert.equal(result.windowAligned, true);
  assert.equal(result.latency.median, 120);
  assert.equal(result.bandwidth.median, 5);
  assert.equal(result.latency.typicalLow, 110, 'the quartiles keep the spread visible');
  assert.equal(result.latency.typicalHigh, 130);
  assert.equal(result.dns.median, 95, 'DNS response time is fetched as a third metric');
  assert.match(new URL(result.sourceUrls.dns).search, /metric=dns/);
  assert.equal(result.latency.points.length, 3);
  assert.equal(result.latency.normalization, 'ROLLING_AVERAGE');
  delete process.env.CLOUDFLARE_RADAR_API_TOKEN;
});

function mockRadar(t, respond) {
  process.env.CLOUDFLARE_RADAR_API_TOKEN = 'test-token';
  t.after(() => { delete process.env.CLOUDFLARE_RADAR_API_TOKEN; });
  t.mock.method(globalThis, 'fetch', async (url) => {
    const body = respond(new URL(String(url)));
    return { ok: true, status: 200, statusText: 'OK', json: async () => body };
  });
}

const emptyResult = { success: true, result: {} };
const outagesPayload = (annotations) => ({ success: true, result: { annotations } });

test('a nationwide outage filed under the country applies to a selected network', async (t) => {
  const nationwide = { id: 'n1', startDate: '2026-02-28T07:00:00Z', endDate: '2026-05-26T12:00:00Z', outage: { outageType: 'NATIONWIDE', outageCause: 'GOVERNMENT_DIRECTED' } };
  const regional = { id: 'r1', startDate: '2026-03-02T00:00:00Z', outage: { outageType: 'REGIONAL' } };
  mockRadar(t, (url) => {
    if (!url.pathname.endsWith('/annotations/outages')) return emptyResult;
    // The ASN-scoped query returns nothing; Radar lists the nationwide outage without ASNs.
    return url.searchParams.get('asn') ? outagesPayload([]) : outagesPayload([nationwide, regional]);
  });
  const result = await getRadarSignals({ asn: 'AS58224', since: '2026-03-01', until: '2026-03-20' });
  assert.equal(result.outages.status, 'observed');
  assert.deepEqual(result.outages.annotations.map((item) => item.id), ['n1'], 'a regional country outage does not speak for one network');
  assert.equal(result.outages.annotations[0].appliesVia, 'country');
  assert.equal(result.assessmentEligible, true);
});

test('a selected network stays ineligible when the nationwide check fails', async (t) => {
  mockRadar(t, (url) => {
    if (!url.pathname.endsWith('/annotations/outages')) return emptyResult;
    return url.searchParams.get('asn') ? outagesPayload([]) : { success: false, errors: [{ code: 1, message: 'boom' }] };
  });
  // A different window: the shared fetch cache must not answer from the previous test.
  const result = await getRadarSignals({ asn: 'AS58224', since: '2026-04-01', until: '2026-04-20' });
  assert.equal(result.outages.country.status, 'error');
  assert.equal(result.assessmentEligible, false, 'a quiet answer without the nationwide check cannot mean no outage');
});

test('the country-wide query asks for outages only once', () => {
  assert.equal(buildRadarUrls({ since: '2026-03-01', until: '2026-03-20' }).countryOutagesUrl, null);
  const scoped = new URL(buildRadarUrls({ asn: 'AS58224', since: '2026-03-01', until: '2026-03-20' }).countryOutagesUrl);
  assert.equal(scoped.searchParams.get('location'), 'IR');
  assert.equal(scoped.searchParams.get('asn'), null);
});

test('outage traffic is split into two overlapping daily requests beyond the Radar limit', () => {
  const short = buildRadarOutageTrafficUrls({ start: '2026-01-08T16:30:00Z', end: '2026-02-01T00:00:00Z', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(short.urls.length, 1);
  assert.equal(new URL(short.urls[0]).searchParams.get('dateStart'), '2026-01-01T00:00:00.000Z', 'a week before the start day');
  const long = buildRadarOutageTrafficUrls({ start: '2026-02-28T07:00:00Z', end: '2026-05-26T12:00:00Z', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(long.urls.length, 2);
  const [first, second] = long.urls.map((url) => new URL(url).searchParams);
  assert.ok(Date.parse(second.get('dateStart')) < Date.parse(first.get('dateEnd')), 'the two requests overlap');
  for (const params of [first, second]) {
    assert.ok(Date.parse(params.get('dateEnd')) - Date.parse(params.get('dateStart')) <= 90 * 86_400_000);
  }
});

test('outage depth compares whole outage days with the week before', () => {
  const day = (offset) => Date.parse('2026-03-01T00:00:00Z') + offset * 86_400_000;
  const points = new Map([
    ...[-7, -6, -5, -4, -3, -2, -1].map((offset) => [day(offset), 0.8]),
    [day(0), 0.4], // start day mixes both states and is excluded
    [day(1), 0.004], [day(2), 0.008], [day(3), 0.016],
    [day(4), 0.6], // end day is excluded
    [day(5), 0.76], [day(6), 0.8],
  ]);
  const result = summarizeOutageTraffic(points, { start: '2026-03-01T07:00:00Z', end: '2026-03-05T12:00:00Z' });
  assert.equal(result.status, 'observed');
  assert.equal(result.outageDays, 3);
  assert.equal(result.lowestPercent, 0.5);
  assert.equal(result.typicalPercent, 1);
  assert.equal(result.afterPercent, 97.5);
});

test('outage depth refuses to invent a baseline', () => {
  const result = summarizeOutageTraffic(new Map([[Date.parse('2026-03-02T00:00:00Z'), 0.01]]), { start: '2026-03-01T07:00:00Z' });
  assert.equal(result.status, 'no_data');
  assert.equal(result.reason, 'no-baseline');
});

test('two daily responses scaled to their own maximum are joined on a shared day', async (t) => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const series = (from, count, scale) => {
    const timestamps = [];
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const ms = from + index * 86_400_000;
      timestamps.push(new Date(ms).toISOString());
      const raw = ms < start + 8 * 86_400_000 ? 100 : ms < start + 95 * 86_400_000 ? 1 : 100;
      values.push(String(raw * scale));
    }
    return { success: true, result: { serie_0: { timestamps, values } } };
  };
  mockRadar(t, (url) => {
    const from = Date.parse(url.searchParams.get('dateStart'));
    const days = Math.round((Date.parse(url.searchParams.get('dateEnd')) - from) / 86_400_000);
    // Each response is normalized differently; only the shape is shared.
    return series(from, days, from === start ? 0.01 : 0.002);
  });
  const result = await getRadarOutageTraffic({ start: '2026-01-08T12:00:00Z', end: '2026-04-05T12:00:00Z', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(result.status, 'observed');
  assert.equal(result.typicalPercent, 1, 'the outage stays at 1% across both responses');
  assert.equal(result.afterPercent, 100);
});

test('Radar quality days without any sampled traffic are not zero latency', async (t) => {
  mockRadar(t, () => ({ result: { serie_0: {
    timestamps: ['2026-03-02T00:00:00Z', '2026-03-03T00:00:00Z', '2026-03-04T00:00:00Z'],
    p25: ['50', '0', '0'], p50: ['100', '0', '0'], p75: ['120', '0', '0'],
  }, meta: { dateRange: [{ startTime: '2026-03-02T00:00:00Z', endTime: '2026-03-04T00:00:00Z' }] } } }));
  const result = await getRadarConnectionQuality({ asn: 'AS58224', since: '2026-03-02', until: '2026-03-04', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(result.latency.median, 100);
  assert.equal(result.latency.measuredDays, 1);
});

test('outage traffic for a selected network is scoped to that network', () => {
  const { urls } = buildRadarOutageTrafficUrls({ start: '2026-01-08T16:30:00Z', end: '2026-02-01T00:00:00Z', asn: 'AS197207', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(new URL(urls[0]).searchParams.get('asn'), '197207');
  assert.equal(new URL(urls[0]).searchParams.get('location'), 'IR');
});
