import test from 'node:test';
import assert from 'node:assert/strict';

test('country OONI figures leave out networks registered outside Iran and say so', async (t) => {
  const { getOoniTimeline, iranRegisteredAsns, resetIranAsnCache, subtractOoniRows } = await import('../lib/ooni.mjs');
  resetIranAsnCache();
  t.after(resetIranAsnCache);
  await iranRegisteredAsns({ loader: async () => ({ asns: ['AS58224', 'AS197207'] }) });
  const day = (date, measurements, ok, anomaly = 0) => ({ measurement_start_day: date, measurement_count: measurements, ok_count: ok, anomaly_count: anomaly, confirmed_count: 0, failure_count: measurements - ok - anomaly });
  t.mock.method(globalThis, 'fetch', async (url) => {
    const params = new URL(String(url)).searchParams;
    let result;
    if (params.get('axis_x') === 'probe_asn') result = [{ probe_asn: 58224, measurement_count: 10 }, { probe_asn: 142578, measurement_count: 90 }];
    else if (params.get('probe_asn') === 'AS142578') result = [day('2026-03-02', 45, 45), day('2026-03-03', 45, 45)];
    else result = [day('2026-03-02', 50, 45, 5), day('2026-03-03', 50, 50)];
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ result }) };
  });
  const timeline = await getOoniTimeline({ country: 'IR', asn: '', since: '2026-03-02', until: '2026-03-03', target: '', testName: 'tor' });
  assert.equal(timeline.totalMeasurements, 10, 'only the Iranian network remains');
  assert.equal(timeline.totalAnomalies, 5);
  assert.deepEqual(timeline.foreignExclusion, { checked: true, networks: ['AS142578'], excludedMeasurements: 90, notExcludedMeasurements: 0 });

  const rows = subtractOoniRows([day('2026-03-02', 10, 10)], [[day('2026-03-02', 10, 10)]], (item) => item.measurement_start_day);
  assert.deepEqual(rows, [], 'a day made only of foreign tests disappears');
});

test('without the Iran registry the exclusion is reported as not applied', async () => {
  const { iranRegisteredAsns, resetIranAsnCache } = await import('../lib/ooni.mjs');
  resetIranAsnCache();
  assert.equal(await iranRegisteredAsns({ loader: async () => { throw new Error('offline'); } }), null);
});
