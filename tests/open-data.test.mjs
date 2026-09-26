import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDailyData, OPEN_DATA_SCHEMA, openDataStore } from '../lib/open-data.mjs';

const interpretation = {
  summary: { headline: { state: 'services-blocked', services: ['instagram'] } },
  services: {
    items: [{ id: 'instagram', status: 'blocked', web: { measurements: 480, confirmed: 233, anomalous: 157, ok: 90 }, app: null, appServers: { status: 'blocked', measurements: 1760 } }],
    changes: { compared: 3, previous: { since: '2026-09-13', until: '2026-09-19' }, worse: [{ id: 'viber', name: 'Viber', from: 'reachable', to: 'partial', before: 20, now: 22 }], better: [] },
    more: [{ id: 'ai', services: [{ id: 'chatgpt', name: 'ChatGPT', scope: 'country', status: 'reachable', measurements: 180 }, { id: 'grok', name: 'Grok', scope: null, status: 'untested', measurements: 0 }] }],
    workarounds: [{ id: 'tor', status: 'partly', usable: 444, ok: 389, failed: 55 }],
    vpnUse: { current: { date: '2026-09-20', share: 6.4, samples: 3663 } },
    conduit: { latest: { date: '2026-09-25', connections: 873608 } },
    torUse: { date: '2026-09-24', direct: 84400, bridges: 22126 },
    networkBreakdown: { access: [{ asn: 'AS1', level: 'full' }, { asn: 'AS2', level: 'blocked' }] },
  },
};
const history = { services: [{ id: 'instagram', months: [{ month: '2026-08', status: 'blocked' }, { month: '2026-09', status: 'blocked' }] }] };

test('the open daily data carries aggregated results only, with licence and scope', () => {
  const data = buildDailyData({ interpretation, history, since: '2026-09-20', until: '2026-09-26', date: '2026-09-26', dashboardUrl: 'https://m.example/' });
  assert.equal(data.schema, OPEN_DATA_SCHEMA);
  assert.deepEqual(data.services[0].website, { tests: 480, confirmed: 233, anomalous: 157, ok: 90 });
  assert.equal(data.services[0].blockedSince.month, '2026-08');
  assert.deepEqual(data.changes.worse, [{ id: 'viber', name: 'Viber', from: 'reachable', to: 'partial' }]);
  assert.deepEqual(data.moreServices[0].services.map((service) => service.id), ['chatgpt'], 'untested services are left out');
  assert.deepEqual(data.usage.psiphonConduit, { date: '2026-09-25', connections: 873608 });
  assert.deepEqual(data.networks, { tested: 2, fullAccess: 1, partial: 0, blocked: 1 });
  assert.equal(data.licence.name, 'CC BY-NC-SA 4.0');
  // Nothing that could point to a person: no network list, no measurement ids, no probe data.
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /AS\d+|probe|report_id|measurement_uid/i);
  assert.equal(buildDailyData({ interpretation: null, date: '2026-09-26' }), null);
});

test('daily files are stored per day and listed newest first', async () => {
  const store = openDataStore(await mkdtemp(join(tmpdir(), 'open-data-')));
  await store.write({ date: '2026-09-25', n: 1 });
  await store.write({ date: '2026-09-26', n: 2 });
  await store.write({ date: '../escape', n: 3 });
  assert.deepEqual(await store.dates(), ['2026-09-26', '2026-09-25']);
  assert.equal((await store.read('2026-09-25')).n, 1);
  assert.equal(await store.read('../../etc/passwd'), null);
});
