import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getShutdownAnatomy, onsetEvents, organisationName, parseIodaHourly, parseRadarHourly, parseRoutingSeries, parseTopAses, restorationEvents, survivingNetworks,
} from '../lib/anatomy.mjs';

const HOUR = 3_600_000;
const at = (iso) => Date.parse(iso);
// An hourly series from `from`, `hours` long, with the value a function of the hour's time.
const series = (from, hours, value) => new Map(Array.from({ length: hours }, (_, index) => {
  const time = at(from) + index * HOUR;
  return [time, value(time)];
}));

test('the start of a shutdown is dated by layer: IPv6 routes first, then traffic and reachability', () => {
  const start = '2026-01-08T16:30:00Z';
  const cut = (iso, before, after) => (time) => (time >= at(iso) ? after : before);
  const routing = {
    v6: series('2026-01-07T04:00:00Z', 60, cut('2026-01-08T12:00:00Z', 433, 33)),
    v4: series('2026-01-07T04:00:00Z', 60, cut('2026-01-08T18:00:00Z', 8198, 6878)),
  };
  // Traffic follows the day; the same hour a day earlier is the reference.
  const daily = (time) => 0.5 + 0.4 * Math.sin((time / HOUR) * (Math.PI / 12));
  const traffic = series('2026-01-07T04:00:00Z', 60, (time) => (time >= at('2026-01-08T18:00:00Z') ? daily(time) * 0.001 : time >= at('2026-01-08T17:00:00Z') ? daily(time) * 0.2 : daily(time)));
  const reach = series('2026-01-07T04:00:00Z', 60, cut('2026-01-08T17:00:00Z', 12173, 423));
  const { events, base } = onsetEvents({ start, routing, traffic, reach });
  const kinds = events.map((event) => event.kind);
  // Within the same hour, routing comes first, then traffic and reachability.
  assert.deepEqual(kinds, ['routes-v6', 'routes-v4', 'traffic-half', 'reach', 'traffic-deep']);
  const v6 = events[0];
  // Routing is sampled: the withdrawal happened between the last sample before and the first after.
  assert.equal(v6.from, '2026-01-08T11:00:00Z');
  assert.equal(v6.to, '2026-01-08T12:00:00Z');
  assert.equal(v6.before, 433);
  assert.equal(v6.after, 33);
  assert.equal(events.find((event) => event.kind === 'reach').percent, 3.5);
  assert.equal(base.reach, 12173);
});

test('routes that stayed are reported for IPv4 only; IPv6 that was already gone is no finding', () => {
  const routing = {
    v6: series('2025-06-17T00:00:00Z', 60, () => 29),
    v4: series('2025-06-17T00:00:00Z', 60, () => 8119),
  };
  const { events } = onsetEvents({ start: '2025-06-18T12:50:00Z', routing, traffic: null, reach: null });
  assert.deepEqual(events.map((event) => event.kind), ['routes-v4-kept']);
  assert.equal(events[0].percent, 100);
});

test('the end of a shutdown: reachability against the normal level, traffic doubling, routes that never came back', () => {
  const end = '2026-02-01T00:00:00Z';
  const base = { v6: 433, v4: 8198, reach: 12173 };
  const routing = {
    v6: series('2026-01-31T00:00:00Z', 60, () => 31),
    v4: series('2026-01-31T00:00:00Z', 60, () => 8150),
  };
  const traffic = series('2026-01-31T00:00:00Z', 60, (time) => (time >= at('2026-01-31T18:00:00Z') ? 0.6 : 0.18));
  const reach = series('2026-01-31T00:00:00Z', 60, (time) => (time >= at('2026-01-31T12:00:00Z') ? 11900 : 900));
  const events = restorationEvents({ end, base, routing, traffic, reach });
  const byKind = Object.fromEntries(events.map((event) => [event.kind, event]));
  assert.equal(byKind['reach-back'].from, '2026-01-31T12:00:00Z');
  assert.equal(byKind['traffic-back'].from, '2026-01-31T18:00:00Z');
  assert.equal(byKind['routes-v6-missing'].after, 31);
  assert.equal(byKind['routes-v6-missing'].before, 433);
  assert.equal(byKind['reach-day-after'].percent, 97.8);
  // IPv4 was never cut at the end, so there is nothing to report for it.
  assert.equal(events.some((event) => event.kind.startsWith('routes-v4')), false);
});

test('surviving networks: registered abroad left out, private registrants never named, shares against the week before', () => {
  const iranAsns = new Set(['AS49666', 'AS12880', 'AS210705', 'AS197207']);
  const during = [
    { asn: 'AS49666', name: 'Telecommunication Infrastructure Company', share: 35.4 },
    { asn: 'AS213995', name: 'Some Person Abroad', share: 5 },
    { asn: 'AS12880', name: 'Iran Information Technology Company PJSC', share: 9.7 },
    { asn: 'AS210705', name: 'Firstname Lastname', share: 4.5 },
    { asn: 'AS197207', name: 'Mobile Communication Company of Iran PLC', share: 3.3 },
  ];
  const before = [
    { asn: 'AS197207', name: 'Mobile Communication Company of Iran PLC', share: 33.1 },
    { asn: 'AS12880', name: 'Iran Information Technology Company PJSC', share: 0.2 },
    { asn: 'AS9999', name: 'Smallest listed', share: 0.03 },
  ];
  const catalog = [{ asn: 'AS49666', name: 'TIC / Zirsakht Gateway' }, { asn: 'AS210705', name: 'Registered to a private person', privateRegistrant: true }];
  const result = survivingNetworks({ before, during, iranAsns, catalog });
  assert.equal(result.foreignLeftOut, 1);
  assert.deepEqual(result.networks.map((row) => row.asn), ['AS49666', 'AS12880', 'AS210705', 'AS197207']);
  assert.equal(result.networks[0].name, 'TIC / Zirsakht Gateway');
  assert.equal(result.networks[0].before, null);
  assert.equal(result.networks[0].beforeBelow, 0.03);
  assert.equal(result.networks[2].name, null);
  assert.equal(result.networks[3].before, 33.1);
  assert.equal(organisationName('AS1', 'Aria Shatel PJSC'), 'Aria Shatel PJSC');
  assert.equal(organisationName('AS2', 'Ivan Petrov'), null);
});

test('the three sources are parsed into hourly series', () => {
  const routing = parseRoutingSeries({ data: { stats: [
    { timeline: [{ starttime: '2026-01-08T11:00:00' }], v4_prefixes_ris: 8176, v6_prefixes_ris: 432 },
    { timeline: [{ starttime: '2026-01-08T12:00:00' }], v4_prefixes_ris: 8177, v6_prefixes_ris: 43 },
  ] } });
  assert.equal(routing.v6.get(at('2026-01-08T12:00:00Z')), 43);
  assert.equal(routing.v4.size, 2);
  const traffic = parseRadarHourly({ success: true, result: { serie_0: { timestamps: ['2026-01-08T17:00:00Z'], values: ['0.062585'] } } });
  assert.equal(traffic.get(at('2026-01-08T17:00:00Z')), 0.062585);
  assert.throws(() => parseRadarHourly({ success: false }));
  const from = at('2026-01-08T17:00:00Z') / 1000;
  const reach = parseIodaHourly({ data: [[{ datasource: 'ping-slash24', from, step: 600, values: [1080, 1100, null, 1000, 900, 1200] }]] });
  assert.equal(reach.get(at('2026-01-08T17:00:00Z')), 1080);
  assert.deepEqual(parseTopAses({ result: { top_0: [{ clientASN: 49666, clientASName: 'TIC', value: '31.3' }] } }), [{ asn: 'AS49666', name: 'TIC', share: 31.3 }]);
});

test('a finished shutdown answered by every source is kept on disk and not fetched again', async () => {
  const { mkdtemp, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const storeDir = await mkdtemp(join(tmpdir(), 'anatomy-'));
  let calls = 0;
  const fetch = async (url) => {
    calls += 1;
    if (new URL(url).hostname === 'stat.ripe.net') return { data: { stats: [] } };
    if (url.includes('ioda')) return { data: [[]] };
    if (url.includes('/top/ases')) return { success: true, result: { top_0: [{ clientASN: 49666, clientASName: 'Telecommunication Infrastructure Company', value: '31' }] } };
    return { success: true, result: { serie_0: { timestamps: [], values: [] } } };
  };
  const options = { start: '2025-06-18T12:50:00Z', end: '2025-06-25T05:00:00Z', storeDir, now: at('2026-09-25T00:00:00Z'), token: 'x', iranAsns: new Set(['AS49666']), fetch };
  const first = await getShutdownAnatomy(options);
  assert.equal(first.networks.networks[0].asn, 'AS49666');
  assert.equal((await readdir(storeDir)).length, 1);
  const before = calls;
  await getShutdownAnatomy({ ...options, fetch: async () => { throw new Error('must not fetch'); } });
  assert.equal(calls, before);
});
