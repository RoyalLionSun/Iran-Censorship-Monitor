import assert from 'node:assert/strict';
import test from 'node:test';
import { alertChanges, alertState, buildAlertEntries, CONFIRM_MS, decideAlerts } from '../lib/alerts.mjs';
import { outageDay, renderAtom } from '../lib/feed.mjs';

const interpretation = ({ outage = null, radar = true, services = { instagram: 'blocked', telegram: 'blocked' }, stale = false } = {}) => ({
  selection: { until: '2026-03-06' },
  dimensions: { connectivity: {
    availableSources: radar ? ['IODA', 'Cloudflare Radar'] : ['IODA'],
    outagePeriods: outage ? [{ scope: 'nationwide', start: outage, end: null, endedInWindow: false }] : [],
  } },
  services: { state: 'blocked', ...(stale ? { stale: { since: '2026-03-01' } } : {}), items: Object.entries(services).map(([id, status]) => ({ id, status })) },
});

test('only what is known is watched: no Radar, no outage state; a stale answer, no service states', () => {
  assert.equal(alertState(interpretation({ radar: false })).outage, null);
  assert.equal(alertState(interpretation()).outage, false);
  assert.deepEqual(alertState(interpretation({ outage: '2026-02-28T07:00:00Z' })).outage, { start: '2026-02-28T07:00:00Z' });
  assert.equal(alertState(interpretation({ stale: true })).services, null);
  assert.deepEqual(alertState(interpretation({ services: { instagram: 'blocked', x: 'restricted' } })).services, { instagram: 'blocked' }, 'only blocked and reachable are watched');
});

test('an outage or a service change is sent only once a second check at least 50 minutes later confirms it', () => {
  const quiet = alertState(interpretation());
  const dark = alertState(interpretation({ outage: '2026-02-28T07:00:00Z' }));
  const first = decideAlerts(null, quiet, 0);
  assert.deepEqual(first.alerts, [], 'the first check only records');
  const seen = decideAlerts(first.next, dark, 1_000);
  assert.deepEqual(seen.alerts, []);
  assert.ok(seen.next.pending);
  const tooSoon = decideAlerts(seen.next, dark, 1_000 + CONFIRM_MS - 1);
  assert.deepEqual(tooSoon.alerts, []);
  const confirmed = decideAlerts(tooSoon.next, dark, 1_000 + CONFIRM_MS);
  assert.deepEqual(confirmed.alerts.map((alert) => alert.kind), ['outage-start']);
  assert.deepEqual(decideAlerts(confirmed.next, dark, 2_000 + CONFIRM_MS * 2).alerts, [], 'sent once');
  // One odd answer in between is dropped.
  const odd = decideAlerts(first.next, dark, 1_000);
  assert.deepEqual(decideAlerts(odd.next, quiet, 1_000 + CONFIRM_MS).next.pending, null);
});

test('a check that cannot see Radar neither ends an outage nor drops a waiting change', () => {
  const dark = alertState(interpretation({ outage: '2026-02-28T07:00:00Z' }));
  const blind = alertState(interpretation({ radar: false }));
  assert.deepEqual(alertChanges(dark, blind), []);
  const quiet = alertState(interpretation());
  const waiting = decideAlerts(decideAlerts(null, quiet, 0).next, dark, 1_000).next;
  const kept = decideAlerts(waiting, blind, 2_000).next;
  assert.deepEqual(kept.pending, waiting.pending);
});

test('services turning blocked or reachable are the service changes; restricted is not', () => {
  const before = { outage: false, services: { instagram: 'blocked', telegram: 'reachable' } };
  const now = { outage: false, services: { instagram: 'reachable', telegram: 'blocked' } };
  assert.deepEqual(alertChanges(before, now), [{ kind: 'reachable', service: 'instagram' }, { kind: 'blocked', service: 'telegram' }]);
  assert.deepEqual(alertChanges(before, { outage: false, services: { instagram: 'blocked' } }), []);
});

test('alert entries speak both languages, carry their time and sort before the day entry', () => {
  const at = new Date('2026-03-01T09:30:00Z');
  const [en] = buildAlertEntries([{ kind: 'outage-start', start: '2026-02-28T07:00:00Z' }], { lang: 'en', link: 'https://m.example/', at });
  assert.match(en.title, /Nationwide internet outage since/);
  assert.match(en.label, /UTC$/);
  assert.equal(en.id, '2026-03-01T0930-outage-start');
  assert.ok(en.id.localeCompare('2026-03-01') > 0, 'newest first');
  const [fa] = buildAlertEntries([{ kind: 'reachable', service: 'instagram' }], { lang: 'fa', link: 'https://m.example/', at });
  assert.match(fa.title, /اینستاگرام/);
  assert.doesNotMatch(fa.title, /^[A-Za-z]/);
  assert.match(renderAtom({ entries: [en], lang: 'en', selfUrl: 'https://m.example/feed.xml', siteUrl: 'https://m.example/' }), /<title>[^<]*UTC · Nationwide/);
});

test('the day of an outage under way: the first day is day 1', () => {
  const now = Date.parse('2026-03-02T10:00:00Z');
  assert.equal(outageDay('2026-02-28T07:00:00Z', null, now), 3);
  assert.equal(outageDay('2026-02-28T07:00:00Z', '2026-02-28', now), 1, 'counted to the end of the selected period');
  assert.equal(outageDay('2026-03-05T00:00:00Z', null, now), null);
});
