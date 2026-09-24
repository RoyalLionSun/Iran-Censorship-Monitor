import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blockedSince, getServiceHistory, monthlyStatus } from '../lib/history.mjs';

const day = (date, measurements, confirmed, anomalous, ok) => ({ measurement_start_day: date, measurement_count: measurements, confirmed_count: confirmed, anomaly_count: anomalous, ok_count: ok });

test('months follow the majority rule over the three networks; thin months stay open', () => {
  const months = monthlyStatus([
    [day('2022-01-03', 20, 15, 2, 3), day('2022-02-01', 4, 4, 0, 0), day('2022-03-01', 30, 1, 2, 27)],
    [day('2022-01-04', 10, 8, 1, 1), day('2022-03-02', 20, 0, 12, 8)],
  ]);
  assert.deepEqual(months.map((month) => [month.month, month.status]), [['2022-01', 'blocked'], ['2022-02', 'thin'], ['2022-03', 'partial']]);
});

test('"blocked since" is the unbroken stretch up to the latest measured month; thin months do not break it', () => {
  const m = (month, status) => ({ month, status });
  assert.deepEqual(blockedSince([m('2022-01', 'reachable'), m('2022-02', 'blocked'), m('2022-03', 'thin'), m('2022-04', 'blocked')]), { month: '2022-02', fromStart: false });
  assert.deepEqual(blockedSince([m('2022-01', 'blocked'), m('2022-02', 'blocked')]), { month: '2022-01', fromStart: true });
  assert.equal(blockedSince([m('2022-01', 'blocked'), m('2022-02', 'reachable')]), null, 'reachable now: no "blocked since"');
  const gap = [m('2022-01', 'blocked'), ...['02', '03', '04', '05'].map((month) => m(`2022-${month}`, 'thin')), m('2022-06', 'blocked')];
  assert.deepEqual(blockedSince(gap), { month: '2022-06', fromStart: false }, 'four months without tests end the stretch');
});

test('history is stored; a later run only asks OONI again for the months from the last stored one', async () => {
  const storeDir = await mkdtemp(join(tmpdir(), 'history-'));
  const asked = [];
  const fetch = async ({ asn, domain, since, until }) => {
    asked.push(`${asn}/${domain}/${since}`);
    return { result: [day('2022-01-10', 20, 18, 1, 1), day(until.slice(0, 7) + '-02', 20, 18, 1, 1)].filter((row) => row.measurement_start_day >= since) };
  };
  const first = await getServiceHistory({ now: Date.parse('2026-09-24T10:00:00Z'), storeDir, fetch });
  assert.equal(first.services.length, 6);
  assert.equal(asked.length, 18);
  assert.ok(asked.every((entry) => entry.endsWith('/2022-01-01')));
  const instagram = first.services.find((service) => service.id === 'instagram');
  assert.equal(instagram.months.length, 57, 'January 2022 to September 2026');
  assert.deepEqual(instagram.since, { month: '2026-09', fromStart: false }, 'years without tests are no continuity');
  asked.length = 0;
  await getServiceHistory({ now: Date.parse('2026-09-24T12:00:00Z'), storeDir, fetch });
  assert.equal(asked.length, 0, 'within a day nothing is asked again');
  await getServiceHistory({ now: Date.parse('2026-09-26T10:00:00Z'), storeDir, fetch });
  assert.ok(asked.length === 18 && asked.every((entry) => entry.endsWith('/2026-09-01')), 'only the latest month is asked again');
});

test('months mostly covered by a nationwide shutdown are neutral and do not break "blocked since"', async () => {
  const { markOutageMonths } = await import('../lib/history.mjs');
  const m = (month, status) => ({ month, status });
  const months = markOutageMonths([m('2026-01', 'blocked'), m('2026-02', 'blocked'), m('2026-03', 'reachable'), m('2026-04', 'reachable'), m('2026-05', 'partial'), m('2026-06', 'blocked')],
    [{ start: '2026-02-28T07:00:00Z', end: '2026-05-26T12:00:00Z' }]);
  assert.deepEqual(months.map((month) => month.status), ['blocked', 'blocked', 'outage', 'outage', 'outage', 'blocked']);
  assert.equal(months[2].statusMeasured, 'reachable', 'what the few tests showed is kept');
  assert.deepEqual(blockedSince(months), { month: '2026-01', fromStart: false });
});
