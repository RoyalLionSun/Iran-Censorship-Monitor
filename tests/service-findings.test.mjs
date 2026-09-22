import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_BRANDS, SERVICE_DOMAINS, summarizeMessagingAppTests, summarizeServiceBrands, summarizeServiceFindings } from '../public/service-findings.js';
import { OONI_ROUTINE_TESTS, OONI_TESTS, getCircumventionSignals } from '../lib/ooni.mjs';

const payload = {
  ok: true, sourceUrl: 'https://api.ooni.io/api/v1/aggregation?probe_cc=IR',
  domains: [
    { domain: 'facebook.com', measurements: 12, confirmed: 3, anomalous: 2, ok: 7, failures: 0, lastObserved: '2026-09-11' },
    { domain: 'instagram.com', measurements: 5, confirmed: 0, anomalous: 2, ok: 3, failures: 0, lastObserved: '2026-09-10' },
    { domain: 'x.com', measurements: 4, confirmed: 0, anomalous: 0, ok: 4, failures: 0, lastObserved: '2026-09-09' },
    { domain: 'youtube.com', measurements: 2, confirmed: 0, anomalous: 0, ok: 0, failures: 2, lastObserved: '2026-09-07' },
  ],
};

test('priority service findings preserve confirmed, anomalous, absent and failed outcomes', () => {
  const summary = summarizeServiceFindings(payload);
  const statuses = Object.fromEntries(summary.rows.map(({ domain, status }) => [domain, status]));
  assert.equal(summary.focus.domain, 'facebook.com');
  assert.equal(summary.focus.confirmed, 3);
  assert.equal(summary.sourceUrl, payload.sourceUrl);
  assert.equal(statuses['instagram.com'], 'anomaly');
  assert.equal(statuses['www.instagram.com'], 'untested');
  assert.equal(statuses['x.com'], 'no_signal');
  assert.equal(statuses['twitter.com'], 'untested');
  assert.equal(statuses['youtube.com'], 'inconclusive');
  assert.equal(statuses['whatsapp.com'], 'untested');
  assert.equal(SERVICE_DOMAINS.some((entry) => entry.domain === 'signal.org'), false);
});

test('a selected host is scoped to its domain, without pooling X and Twitter or web and app tests', () => {
  const result = summarizeServiceFindings(payload, { target: 'https://www.instagram.com/' });
  assert.equal(result.focus.domain, 'instagram.com');
  assert.equal(result.rows.find((row) => row.domain === 'facebook.com').status, 'out_of_scope');
  assert.equal(result.rows.find((row) => row.domain === 'x.com').status, 'out_of_scope');
  const app = summarizeServiceFindings(payload, { testName: 'whatsapp' });
  assert.equal(app.focus, null);
  assert.ok(app.rows.every((row) => row.status === 'out_of_scope'));
  const distinctHosts = summarizeServiceFindings({ ...payload, domains: [
    { domain: 'www.facebook.com', measurements: 2, confirmed: 1, anomalous: 0, ok: 1, failures: 0, lastObserved: '2026-09-11' },
  ] });
  assert.equal(distinctHosts.rows.find((row) => row.domain === 'www.facebook.com').status, 'confirmed');
  assert.equal(distinctHosts.rows.find((row) => row.domain === 'facebook.com').status, 'untested');
});

test('no payload, upstream error and empty results never imply healthy services', () => {
  assert.ok(summarizeServiceFindings(null).rows.every((row) => row.status === 'loading'));
  assert.ok(summarizeServiceFindings({ ok: false, error: 'upstream failed' }).rows.every((row) => row.status === 'unavailable'));
  const empty = summarizeServiceFindings({ ok: true, domains: [], sourceUrl: payload.sourceUrl });
  assert.equal(empty.focus, null);
  assert.ok(empty.rows.every((row) => row.status === 'untested'));
});

test('legacy Signal is still an accepted OONI test without being a priority service', () => {
  assert.equal(OONI_TESTS.has('signal'), true);
  assert.equal(OONI_ROUTINE_TESTS.includes('signal'), false);
  assert.deepEqual(OONI_ROUTINE_TESTS, ['tor', 'psiphon', 'whatsapp', 'telegram']);
});

test('routine circumvention monitoring requests only the routine OONI tests', async (t) => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(new URL(url).searchParams.get('test_name'));
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ result: [] }) };
  });
  const payload = await getCircumventionSignals({ since: '2026-08-01', until: '2026-08-02', asn: 'AS64512' });
  assert.deepEqual([...requested].sort(), [...OONI_ROUTINE_TESTS].sort());
  assert.deepEqual(payload.signals.map((row) => row.testName), [...OONI_ROUTINE_TESTS]);
});

test('messaging app evidence is independent of website domain counts', () => {
  const app = summarizeMessagingAppTests({ ok: true, signals: [
    { testName: 'whatsapp', status: 'observed', measurements: 8, anomalies: 3, lastObservation: '2026-09-11', sourceUrl: 'https://api.ooni.io/api/v1/aggregation?test_name=whatsapp' },
    { testName: 'telegram', status: 'no_data', measurements: 0, anomalies: 0 },
    { testName: 'signal', status: 'observed', measurements: 20, anomalies: 9 },
  ] });
  assert.deepEqual(app.map((row) => [row.testName, row.status]), [['whatsapp','anomaly'],['telegram','untested']]);
  assert.equal(app[0].anomalies, 3);
  assert.equal(summarizeMessagingAppTests(null)[0].status, 'loading');
  assert.equal(summarizeMessagingAppTests({ ok: false })[0].status, 'unavailable');
  assert.equal(summarizeMessagingAppTests({ ok: true, signals: [{ testName: 'whatsapp', status: 'error' }] })[0].status, 'unavailable');
});


test('messaging payloads without a signals array never imply no_signal', () => {
  assert.equal(summarizeMessagingAppTests({ ok: true })[0].status, 'unavailable');
});

const appPayload = { ok: true, signals: [
  { testName: 'whatsapp', status: 'observed', measurements: 441, anomalies: 319, lastObservation: '2026-09-22' },
  { testName: 'telegram', status: 'observed', measurements: 442, anomalies: 0, lastObservation: '2026-09-21' },
] };

test('brand summary shows the strongest single domain result without summing domain groups', () => {
  const domains = { ok: true, sourceUrl: 'https://api.ooni.io/', domains: [
    { domain: 'x.com', measurements: 179, confirmed: 19, anomalous: 120, ok: 40, failures: 0, lastObserved: '2026-09-22' },
    { domain: 'twitter.com', measurements: 441, confirmed: 0, anomalous: 129, ok: 312, failures: 0, lastObserved: '2026-09-22' },
    { domain: 'www.youtube.com', measurements: 20, confirmed: 0, anomalous: 0, ok: 20, failures: 0, lastObserved: '2026-09-21' },
  ] };
  const summary = summarizeServiceBrands(domains, appPayload);
  const x = summary.items.find((item) => item.id === 'x');
  assert.equal(x.status, 'blocked');
  assert.equal(x.web.domain, 'x.com');
  assert.equal(x.web.measurements, 179);
  assert.equal(summary.items.find((item) => item.id === 'youtube').status, 'reachable');
  assert.equal(summary.state, 'blocked');
  assert.deepEqual(summary.blocked, ['x']);
  assert.equal(summary.latestObserved, '2026-09-22');
  assert.deepEqual(SERVICE_BRANDS.flatMap((brand) => brand.domains).filter((domain) => !SERVICE_DOMAINS.some((row) => row.domain === domain)), []);
});

test('app tests stay a separate channel and never borrow website results', () => {
  const summary = summarizeServiceBrands({ ok: true, domains: [] }, appPayload);
  const whatsapp = summary.items.find((item) => item.id === 'whatsapp');
  assert.equal(whatsapp.status, 'restricted');
  assert.equal(whatsapp.web.status, 'untested');
  assert.equal(whatsapp.app.status, 'anomaly');
  const telegram = summary.items.find((item) => item.id === 'telegram');
  assert.equal(telegram.status, 'reachable');
  assert.equal(telegram.web.status, 'untested');
  assert.equal(summary.items.find((item) => item.id === 'instagram').app, null);
  assert.equal(summary.items.find((item) => item.id === 'instagram').status, 'untested');
});

test('brand summary never turns missing or failed data into a reachable state', () => {
  const failed = summarizeServiceBrands({ ok: false }, { ok: false });
  assert.equal(failed.state, 'unavailable');
  assert.ok(failed.items.every((item) => item.status === 'unavailable'));
  const untested = summarizeServiceBrands({ ok: true, domains: [] }, { ok: true, signals: [] });
  assert.equal(untested.state, 'untested');
  assert.equal(untested.tested, 0);
  const onlyReachable = summarizeServiceBrands({ ok: true, domains: [
    { domain: 'www.instagram.com', measurements: 12, confirmed: 0, anomalous: 0, ok: 12, failures: 0, lastObserved: '2026-09-20' },
  ] }, { ok: true, signals: [] });
  assert.equal(onlyReachable.state, 'no-problems-detected');
  const nonWeb = summarizeServiceBrands({ ok: true, domains: [] }, appPayload, { testName: 'tor' });
  assert.equal(nonWeb.items.find((item) => item.id === 'instagram').status, 'out-of-scope');
  assert.equal(nonWeb.items.find((item) => item.id === 'whatsapp').status, 'out-of-scope', 'a Tor test says nothing about WhatsApp');
  assert.deepEqual(nonWeb.visible, []);
  assert.equal(nonWeb.state, 'out-of-scope');
});

test('a selected OONI app test keeps only its own app in scope', () => {
  const summary = summarizeServiceBrands({ ok: true, domains: [] }, appPayload, { testName: 'whatsapp' });
  assert.equal(summary.items.find((item) => item.id === 'whatsapp').status, 'restricted');
  assert.equal(summary.items.find((item) => item.id === 'telegram').status, 'out-of-scope');
  assert.deepEqual(summary.visible.map((item) => item.id), ['whatsapp']);
  assert.equal(summary.scoped, true);
});

test('a selected website target becomes its own tile and silences unrelated app findings', () => {
  const selection = { testName: 'web_connectivity', target: 'https://play.google.com/' };
  const summary = summarizeServiceBrands({ ok: true, domains: [], sourceUrl: 'https://api.ooni.io/' }, appPayload, selection);
  assert.deepEqual(summary.visible.map((item) => item.id), ['selected-target']);
  const target = summary.items[0];
  assert.equal(target.name, 'play.google.com');
  assert.equal(target.status, 'untested');
  assert.equal(target.web.domain, 'play.google.com');
  assert.equal(summary.state, 'untested');
  assert.equal(summary.scoped, true);
  assert.equal(summary.items.find((item) => item.id === 'whatsapp').status, 'out-of-scope');
  assert.deepEqual(summary.restricted, []);

  const measured = summarizeServiceBrands({ ok: true, sourceUrl: 'https://api.ooni.io/', domains: [
    { domain: 'play.google.com', measurements: 9, confirmed: 4, anomalous: 1, ok: 4, failures: 0, lastObserved: '2026-09-22' },
  ] }, appPayload, selection);
  assert.equal(measured.items[0].status, 'blocked');
  assert.deepEqual(measured.blocked, ['selected-target']);
  assert.equal(measured.items[0].web.confirmed, 4);
});

test('a target that a priority brand already covers does not create a second tile', () => {
  const summary = summarizeServiceBrands({ ok: true, domains: [
    { domain: 'www.instagram.com', measurements: 10, confirmed: 6, anomalous: 2, ok: 2, failures: 0, lastObserved: '2026-09-22' },
  ] }, appPayload, { testName: 'web_connectivity', target: 'https://www.instagram.com/' });
  assert.equal(summary.items.some((item) => item.id === 'selected-target'), false);
  assert.deepEqual(summary.visible.map((item) => item.id), ['instagram']);
  assert.deepEqual(summary.blocked, ['instagram']);
});
