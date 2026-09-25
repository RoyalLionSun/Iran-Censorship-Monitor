import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_BRANDS, SERVICE_DOMAINS, summarizeMessagingAppTests, summarizeServiceBrands, summarizeServiceFindings } from '../public/service-findings.js';
import { OONI_ROUTINE_TESTS, OONI_SIGNAL_TESTS, OONI_TESTS, getCircumventionSignals } from '../lib/ooni.mjs';

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

test('Signal and Facebook Messenger app tests are part of routine monitoring', () => {
  // OONI runs them thousands of times a month in Iran; they are the only app evidence besides
  // WhatsApp and Telegram.
  assert.equal(OONI_TESTS.has('facebook_messenger'), true);
  assert.deepEqual(OONI_ROUTINE_TESTS, ['tor', 'psiphon', 'whatsapp', 'telegram', 'signal', 'facebook_messenger']);
});

test('circumvention monitoring requests only the defined OONI tests (routine apps plus ways around the filter)', async (t) => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(new URL(url).searchParams.get('test_name'));
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ result: [] }) };
  });
  const payload = await getCircumventionSignals({ since: '2026-08-01', until: '2026-08-02', asn: 'AS64512' });
  assert.deepEqual([...requested].sort(), [...OONI_SIGNAL_TESTS].sort());
  assert.deepEqual(payload.signals.map((row) => row.testName), [...OONI_SIGNAL_TESTS]);
  assert.deepEqual([...OONI_SIGNAL_TESTS].slice(6), ['torsf', 'vanilla_tor', 'stunreachability', 'riseupvpn'], 'ECH and DNS checks carry no verdict and stay out');
});

test('messaging app evidence is independent of website domain counts', () => {
  const app = summarizeMessagingAppTests({ ok: true, signals: [
    { testName: 'whatsapp', status: 'observed', measurements: 8, anomalies: 3, lastObservation: '2026-09-11', sourceUrl: 'https://api.ooni.io/api/v1/aggregation?test_name=whatsapp' },
    { testName: 'telegram', status: 'no_data', measurements: 0, anomalies: 0 },
    { testName: 'signal', status: 'observed', measurements: 20, anomalies: 9 },
  ] });
  // By majority: 3 failed of 8 is not a failing app; 9 of 20 for Signal neither.
  assert.deepEqual(app.map((row) => [row.testName, row.status]), [['whatsapp','no_signal'],['telegram','untested'],['signal','no_signal'],['facebook_messenger','untested']]);
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

test('a service without usable tests in the network is answered from tests across Iran, labelled', async () => {
  const { summarizeServiceBrands } = await import('../public/service-findings.js');
  const network = { ok: true, domains: [{ domain: 'twitter.com', measurements: 1, confirmed: 0, anomalous: 0, ok: 0, failures: 1 }] };
  const country = { ok: true, domains: [
    { domain: 'www.facebook.com', measurements: 353, confirmed: 5, anomalous: 11, ok: 300 },
    { domain: 'x.com', measurements: 40, confirmed: 0, anomalous: 0, ok: 40 },
  ] };
  const selection = { asn: 'AS58224', testName: 'web_connectivity', target: '' };
  const result = summarizeServiceBrands(network, null, selection, country);
  const facebook = result.items.find((item) => item.id === 'facebook');
  assert.equal(facebook.status, 'untested', 'the network status never takes the country result');
  assert.equal(facebook.country.status, 'blocked');
  assert.equal(facebook.country.confirmed, 5);
  const x = result.items.find((item) => item.id === 'x');
  assert.equal(x.status, 'unclear');
  assert.equal(x.country.status, 'reachable', 'an inconclusive network test also gets the country answer');
  assert.deepEqual(result.countryBlocked, ['facebook']);
  assert.deepEqual(result.blocked, [], 'network claims stay network-only');
  const everywhere = summarizeServiceBrands(country, null, { ...selection, asn: '' }, country);
  assert.equal(everywhere.items.find((item) => item.id === 'facebook').country, null, 'no fallback when Iran is already the scope');
});

test('networks are named per service: blocked, partly blocked, reachable', async () => {
  const { networkStatus, summarizeServiceNetworks } = await import('../public/service-findings.js');
  assert.equal(networkStatus({ confirmed: 224, anomalous: 107, ok: 2 }), 'blocked', 'two successes among hundreds of blocks are a block');
  assert.equal(networkStatus({ confirmed: 32, anomalous: 1, ok: 35 }), 'partial');
  assert.equal(networkStatus({ confirmed: 0, anomalous: 7, ok: 0 }), 'restricted');
  assert.equal(networkStatus({ confirmed: 0, anomalous: 0, ok: 6 }), 'reachable');
  assert.equal(networkStatus({ confirmed: 0, anomalous: 3, ok: 149 }), 'reachable', 'a few odd tests among many do not decide it');
  assert.equal(networkStatus({ confirmed: 1, anomalous: 137, ok: 11 }), 'restricted', 'most failed, few confirmed');
  assert.equal(networkStatus({ confirmed: 62, anomalous: 91, ok: 2 }), 'blocked', 'confirmed blocks far outnumber successes');
  const rows = [
    { domain: 'www.instagram.com', asn: 'AS58224', measurements: 428, confirmed: 224, anomalous: 107, ok: 2, failures: 95 },
    { domain: 'instagram.com', asn: 'AS52140', measurements: 6, confirmed: 0, anomalous: 0, ok: 6, failures: 0 },
    { domain: 'www.instagram.com', asn: 'AS31549', measurements: 68, confirmed: 32, anomalous: 1, ok: 35, failures: 0 },
    { domain: 'unrelated.example', asn: 'AS1', measurements: 5, confirmed: 5, anomalous: 0, ok: 0, failures: 0 },
  ];
  const instagram = summarizeServiceNetworks(rows).find((item) => item.id === 'instagram');
  assert.equal(instagram.measured, 3);
  assert.deepEqual(instagram.reachable.map((entry) => entry.asn), ['AS52140']);
  assert.deepEqual(instagram.partial.map((entry) => entry.asn), ['AS31549']);
  assert.deepEqual(instagram.blocked.map((entry) => entry.asn), ['AS58224']);
});

test('who has access: full only when every tested service was reachable in that network', async () => {
  const { summarizeNetworkAccess } = await import('../public/service-findings.js');
  const row = (domain, asn, confirmed, ok) => ({ domain, asn, measurements: confirmed + ok, confirmed, anomalous: 0, ok, failures: 0 });
  const access = summarizeNetworkAccess([
    row('www.instagram.com', 'AS52140', 0, 6), row('www.youtube.com', 'AS52140', 0, 6),
    row('www.instagram.com', 'AS31549', 32, 35), row('www.youtube.com', 'AS31549', 60, 3),
    row('www.instagram.com', 'AS58224', 224, 2), row('www.youtube.com', 'AS58224', 200, 1),
  ]);
  assert.deepEqual(access.map((entry) => [entry.asn, entry.level]), [['AS52140', 'full'], ['AS31549', 'partial'], ['AS58224', 'blocked']]);
  assert.equal(access[1].services.instagram.status, 'partial');
  assert.equal(access[1].services.youtube.status, 'blocked');
});

test('more services: own network first, other Iranian networks only where it has no usable test', async () => {
  const { summarizeMoreServices } = await import('../public/service-findings.js');
  const row = (domain, confirmed, ok, anomalous = 0) => ({ domain, measurements: confirmed + ok + anomalous, confirmed, anomalous, ok, failures: 0, lastObserved: '2026-09-23' });
  const network = { ok: true, domains: [row('signal.org', 20, 1), row('www.viber.com', 5, 40)] };
  const country = { ok: true, domains: [row('www.tiktok.com', 30, 2), row('signal.org', 1, 99)] };
  const groups = summarizeMoreServices(network, country);
  const find = (id) => groups.flatMap((group) => group.services).find((service) => service.id === id);
  assert.equal(find('signal').status, 'blocked');
  assert.equal(find('signal').scope, 'network', 'the network own answer is never replaced');
  assert.equal(find('viber').status, 'partial');
  assert.equal(find('tiktok').scope, 'country');
  assert.equal(find('tiktok').status, 'blocked');
  assert.equal(find('snapchat').status, 'untested');
  assert.equal(summarizeMoreServices({ ok: false }), null);
});

test('a network with only a handful of tests per service is marked and sorted after well-covered ones', async () => {
  const { summarizeNetworkAccess } = await import('../public/service-findings.js');
  const row = (domain, asn, ok) => ({ domain, asn, measurements: ok, confirmed: 0, anomalous: 0, ok, failures: 0 });
  const access = summarizeNetworkAccess([row('www.instagram.com', 'AS1', 2), row('www.instagram.com', 'AS2', 30)]);
  assert.deepEqual(access.map((entry) => [entry.asn, entry.level, entry.thin]), [['AS2', 'full', false], ['AS1', 'full', true]]);
});

test('what changed: status moves between periods, only with enough tests in both', async () => {
  const { compareServicePeriods } = await import('../public/service-findings.js');
  const row = (domain, confirmed, ok) => ({ domain, measurements: confirmed + ok, confirmed, anomalous: 0, ok, failures: 0 });
  const before = { ok: true, domains: [row('www.viber.com', 0, 40), row('www.instagram.com', 30, 1), row('signal.org', 1, 1)] };
  const now = { ok: true, domains: [row('www.viber.com', 30, 5), row('www.instagram.com', 2, 30), row('signal.org', 20, 0)] };
  const result = compareServicePeriods(before, now);
  assert.deepEqual(result.worse.map((entry) => [entry.id, entry.from, entry.to]), [['viber', 'reachable', 'blocked']]);
  assert.deepEqual(result.better.map((entry) => [entry.id, entry.from, entry.to]), [['instagram', 'blocked', 'partial']]);
  assert.equal(result.compared, 2, 'Signal had too few tests before');
  assert.equal(compareServicePeriods(null, now), null);
});

test('independent checks: DNS to the block address is blocking, failed connections alone are "failing"', async () => {
  const { summarizeIndependentChecks } = await import('../public/service-findings.js');
  const row = (host, kind, outcome, probe, n = 1) => ({ host, source: 'globalping', kind, asn: 'AS202468', probe, outcome, n });
  const result = summarizeIndependentChecks([
    row('web.telegram.org', 'http', 'failure', 'a'), row('web.telegram.org', 'http', 'failure', 'b'), row('web.telegram.org', 'dns', 'ok', 'a'),
    row('signal.org', 'dns', 'blocked', 'a'), row('signal.org', 'dns', 'ok', 'b'), row('signal.org', 'http', 'ok', 'b'),
    row('example.org', 'dns', 'blocked', 'a'),
  ]);
  assert.equal(result.telegram.status, 'failing');
  assert.equal(result.signal.status, 'partial', 'one block against one success is not a majority');
  assert.equal(result.example, undefined, 'hosts outside the service list are ignored');
});

test('app servers: the servers a mobile app uses answer for services without an OONI app test', async () => {
  const { isAppServer, summarizeAppServers, summarizeServiceBrands } = await import('../public/service-findings.js');
  assert.equal(isAppServer('instagram', 'scontent-ams4-1.cdninstagram.com'), true);
  assert.equal(isAppServer('instagram', 'instagram.fsaw1-13.fna.fbcdn.net'), true);
  assert.equal(isAppServer('facebook', 'instagram.fsaw1-13.fna.fbcdn.net'), false, 'Instagram media on fbcdn belongs to Instagram');
  assert.equal(isAppServer('facebook', 'static.xx.fbcdn.net'), true);
  assert.equal(isAppServer('x', 'pbs.twimg.com'), true);
  assert.equal(isAppServer('youtube', 'i.ytimg.com'), true);
  assert.equal(isAppServer('youtube', 'fcm.googleapis.com'), false);
  for (const [brand, host] of [['youtube', 'youtubei.googleapis.com'], ['youtube', 'redirector.googlevideo.com'], ['x', 'api.x.com'], ['x', 'api.twitter.com'],
    ['facebook', 'graph.facebook.com'], ['facebook', 'edge-mqtt.facebook.com'], ['instagram', 'graph.instagram.com']]) {
    assert.equal(isAppServer(brand, host), true, `${host} counts for ${brand} once OONI tests it`);
  }
  // Counts as measured across Iran, 17–23 September 2026.
  const payload = { ok: true, domains: [
    { domain: 'www.youtube.com', measurements: 0, confirmed: 0, anomalous: 0, ok: 0 },
    { domain: 'i.instagram.com', measurements: 162, confirmed: 25, anomalous: 103, ok: 5, failures: 29, observedDays: 7, lastObserved: '2026-09-23' },
    { domain: 'edge-chat.instagram.com', measurements: 161, confirmed: 37, anomalous: 85, ok: 3, failures: 36, observedDays: 7, lastObserved: '2026-09-23' },
    { domain: 'i.ytimg.com', measurements: 9, confirmed: 8, anomalous: 0, ok: 0, failures: 1, observedDays: 3, lastObserved: '2026-09-22' },
    { domain: 'mmg.whatsapp.net', measurements: 10, confirmed: 2, anomalous: 4, ok: 2, failures: 2 },
    { domain: 'pps.whatsapp.net', measurements: 9, confirmed: 1, anomalous: 4, ok: 3, failures: 1 },
  ] };
  const instagram = summarizeAppServers(payload, 'instagram');
  assert.deepEqual({ status: instagram.status, total: instagram.measurements, hosts: instagram.hosts }, { status: 'blocked', total: 323, hosts: ['i.instagram.com', 'edge-chat.instagram.com'] });
  assert.equal(summarizeAppServers(payload, 'whatsapp').status, 'restricted', 'most failed, but confirmed blocks do not outnumber successes');
  assert.equal(summarizeAppServers(payload, 'telegram'), null, 'Telegram has a real app test instead');
  const brands = summarizeServiceBrands(payload, null, { testName: 'web_connectivity' });
  const youtube = brands.items.find((item) => item.id === 'youtube');
  assert.equal(youtube.status, 'blocked', 'a website without tests no longer hides blocked app servers');
  assert.ok(brands.blocked.includes('youtube'));
  const target = summarizeServiceBrands(payload, null, { testName: 'web_connectivity', target: 'https://www.bbc.com/' });
  assert.equal(target.items.find((item) => item.id === 'instagram').appServers, null, 'an unrelated selected website does not bring app servers');
});

test('app servers fall back to all of Iran when the selected network has none, labelled and without changing the status', async () => {
  const { summarizeServiceBrands } = await import('../public/service-findings.js');
  const network = { ok: true, domains: [{ domain: 'www.instagram.com', measurements: 4, confirmed: 0, anomalous: 0, ok: 4 }] };
  const country = { ok: true, domains: [{ domain: 'i.instagram.com', measurements: 50, confirmed: 30, anomalous: 15, ok: 5 }] };
  const instagram = summarizeServiceBrands(network, null, { asn: 'AS58224', testName: 'web_connectivity' }, country).items.find((item) => item.id === 'instagram');
  assert.equal(instagram.appServers.country, true);
  assert.equal(instagram.appServers.status, 'blocked');
  assert.equal(instagram.status, 'reachable', 'the network\'s own result stays its claim');
});

test('ways around the filter: majority verdicts, errors left out, Iran-wide value when the network has too few tests', async () => {
  const { summarizeWorkarounds, workaroundStatus } = await import('../public/service-findings.js');
  assert.equal(workaroundStatus({ failed: 56, ok: 10, usable: 66 }), 'fails');
  assert.equal(workaroundStatus({ failed: 835, ok: 3992, usable: 4827 }), 'partly', '17% failed is not "works"');
  assert.equal(workaroundStatus({ failed: 5, ok: 200, usable: 205 }), 'works');
  assert.equal(workaroundStatus({ failed: 0, ok: 11, usable: 11 }), 'thin');
  const signal = (testName, measurements, anomalies, failures = 0) => ({ testName, status: 'observed', measurements, anomalies, confirmed: 0, failures });
  const network = { ok: true, signals: [signal('torsf', 3, 3), signal('psiphon', 100, 80), signal('vanilla_tor', 46, 4, 33)] };
  const country = { ok: true, signals: [signal('torsf', 66, 56), signal('vanilla_tor', 46, 4, 33)] };
  const rows = summarizeWorkarounds(network, country);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.deepEqual([by.psiphon.status, by.psiphon.scope], ['fails', 'network']);
  assert.deepEqual([by.torsf.status, by.torsf.scope, by.torsf.usable], ['fails', 'country', 66], 'three tests in the network: the Iran-wide result answers');
  assert.deepEqual([by.vanilla_tor.status, by.vanilla_tor.usable, by.vanilla_tor.failures], ['thin', 13, 33], 'errors are not verdicts');
  assert.equal(by.riseupvpn.status, 'thin');
  assert.equal(summarizeWorkarounds({ ok: false }), null);
});

test('the access table has no separate main tab: the six most used services lead social & messaging', async () => {
  const { summarizeNetworkAccessByGroup } = await import('../public/service-findings.js');
  const row = (domain, asn) => ({ domain, asn, measurements: 10, confirmed: 10, anomalous: 0, ok: 0, failures: 0 });
  const groups = summarizeNetworkAccessByGroup([row('www.instagram.com', 'AS58224'), row('signal.org', 'AS58224')]);
  const social = groups.social.find((entry) => entry.asn === 'AS58224');
  assert.ok(social.services.instagram, 'Instagram counts in social & messaging');
  assert.ok(social.services.signal, 'Signal too');
  assert.ok(groups.main, 'the six alone remain available for the headline and shared text');
});

test('a way around the filter whose query failed says "not loaded", not "too few tests"', async () => {
  const { summarizeWorkarounds } = await import('../public/service-findings.js');
  const payload = { ok: true, signals: [
    { testName: 'tor', status: 'observed', measurements: 100, anomalies: 10, confirmed: 0, failures: 0 },
    { testName: 'torsf', status: 'error', measurements: 0, anomalies: 0, confirmed: 0, error: 'OONI rate limit reached.' },
  ] };
  const rows = summarizeWorkarounds(payload);
  assert.equal(rows.find((row) => row.id === 'tor').status, 'partly');
  assert.equal(rows.find((row) => row.id === 'torsf').status, 'unavailable');
  assert.equal(rows.find((row) => row.id === 'psiphon').status, 'thin', 'no row at all is still "too few tests"');
});
