import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOoniListUrl, collectOoniApi, runCollectors } from '../lib/collector.mjs';
import { openStore } from '../lib/store.mjs';

const item = (uid, time, extra = {}) => ({ measurement_uid: uid, measurement_start_time: time, probe_asn: 58224, test_name: 'web_connectivity', input: 'https://www.instagram.com/', anomaly: false, confirmed: false, failure: false, ...extra });

test('the list request asks Iran, oldest first, in whole seconds', () => {
  const url = new URL(buildOoniListUrl({ since: '2026-09-24T06:00:00Z', until: '2026-09-24T09:00:00Z' }));
  assert.equal(url.searchParams.get('probe_cc'), 'IR');
  assert.equal(url.searchParams.get('since'), '2026-09-24T06:00:00');
  assert.equal(url.searchParams.get('order'), 'asc');
});

test('the collector follows the pages and records coverage; the next run continues with an overlap', async () => {
  const store = openStore();
  const pages = {
    first: { results: [item('a', '2026-09-24T06:10:00Z'), item('b', '2026-09-24T07:00:00Z')], metadata: { next_url: 'page-2' } },
    'page-2': { results: [item('c', '2026-09-24T08:30:00Z')], metadata: { next_url: null } },
  };
  const requested = [];
  const fetchPage = async (url) => { requested.push(url); return url.startsWith('https://') ? pages.first : pages[url]; };
  const first = await collectOoniApi(store, { now: new Date('2026-09-24T09:00:00Z'), fetchPage });
  assert.deepEqual({ ok: first.ok, added: first.added, pages: first.pages, complete: first.complete }, { ok: true, added: 3, pages: 2, complete: true });
  assert.equal(store.getMeta('ooni-api:coveredSince'), '2026-09-24T06:00:00Z');
  assert.equal(store.getMeta('ooni-api:coveredUntil'), '2026-09-24T09:00:00Z');
  assert.ok(store.covers('ooni-api', '2026-09-24T06:00:00Z', '2026-09-24T09:00:00Z'));

  requested.length = 0;
  const again = await collectOoniApi(store, { now: new Date('2026-09-24T10:00:00Z'), fetchPage: async (url) => { requested.push(url); return { results: [item('c', '2026-09-24T08:30:00Z'), item('d', '2026-09-24T09:40:00Z')], metadata: {} }; } });
  assert.equal(again.added, 1, 'the overlap re-reads c, which is stored once');
  assert.equal(new URL(requested[0]).searchParams.get('since'), '2026-09-24T06:00:00', 'continues 3 h before the covered end');
  assert.equal(store.getMeta('ooni-api:coveredSince'), '2026-09-24T06:00:00Z', 'coverage stays continuous');
  store.close();
});

test('a cut-off listing covers only up to its last measurement', async () => {
  const store = openStore();
  const result = await collectOoniApi(store, {
    now: new Date('2026-09-24T09:00:00Z'), maxPages: 1,
    fetchPage: async () => ({ results: [item('a', '2026-09-24T06:30:00Z')], metadata: { next_url: 'more' } }),
  });
  assert.equal(result.complete, false);
  assert.equal(store.getMeta('ooni-api:coveredUntil'), '2026-09-24T06:30:00Z');
  store.close();
});

test('a failed run keeps what was read, records the error, and a long gap restarts coverage', async () => {
  const store = openStore();
  const failed = await collectOoniApi(store, { now: new Date('2026-09-24T09:00:00Z'), fetchPage: async () => { throw new Error('OONI rate limit reached.'); } });
  assert.equal(failed.ok, false);
  assert.equal(store.health()['ooni-api'].lastError, 'OONI rate limit reached.');
  assert.equal(store.getMeta('ooni-api:coveredSince'), null, 'nothing is covered by a failed first run');

  await collectOoniApi(store, { now: new Date('2026-09-20T09:00:00Z'), fetchPage: async () => ({ results: [], metadata: {} }) });
  assert.equal(store.getMeta('ooni-api:coveredSince'), '2026-09-20T06:00:00Z');
  await collectOoniApi(store, { now: new Date('2026-09-24T09:00:00Z'), fetchPage: async () => ({ results: [], metadata: {} }) });
  assert.equal(store.getMeta('ooni-api:coveredSince'), '2026-09-24T06:00:00Z', 'four days without collection are a hole, not coverage');
  store.close();
});

test('all paths run together; one failing path does not stop the others', async () => {
  const store = openStore();
  const result = await runCollectors(store, {
    'ooni-api': async () => ({ ok: true, added: 2 }),
    'ooni-s3': async () => { throw new Error('bucket unreachable'); },
  });
  assert.equal(result['ooni-api'].ok, true);
  assert.deepEqual(result['ooni-s3'], { ok: false, error: 'bucket unreachable' });
  store.close();
});
