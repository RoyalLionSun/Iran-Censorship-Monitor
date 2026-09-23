import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessment } from '../lib/assessment.mjs';

function ooni({ rate = 10, count = 30, confirmed = 0, truncated = false } = {}) {
  const anomalies = Math.round(count * rate / 100);
  return {
    ok: true, status: count ? 'observed' : 'no_data', totalMeasurements: count,
    totalAnomalies: anomalies, totalConfirmed: confirmed, anomalyRate: rate,
    truncatedAtApiLimit: truncated,
    points: [
      { date: '2026-09-06', measurements: count / 2, anomalies: anomalies / 2, anomalyRate: rate },
      { date: '2026-09-07', measurements: count / 2, anomalies: anomalies / 2, anomalyRate: rate },
    ],
  };
}

function ripe({ loss = 1, samples = 20, status = 'observed', probes = 7 } = {}) {
  return {
    ok: true, status, probeCount: probes,
    overall: { samples, packetLossPercent: loss, averageRttMs: samples ? 80 : null },
    series: samples ? [
      { date: '2026-09-06', packetLossPercent: loss, samples: samples / 2 },
      { date: '2026-09-07', packetLossPercent: loss, samples: samples / 2 },
    ] : [],
  };
}

function cp({ status = 'observed', events = [] } = {}) {
  return { ok: true, status, iranUnexpectedRate: 12.5, timeseries: [{ date: '2026-09-07', value: .5 }], events };
}

function radar({ eligible = true, outages = [], anomalies = [], status = 'observed' } = {}) {
  return {
    ok: true, status, assessmentEligible: eligible,
    outages: { status: outages.length ? 'observed' : 'no_data', annotations: outages },
    trafficAnomalies: { status: anomalies.length ? 'observed' : 'no_data', events: anomalies },
  };
}

function ioda(events = []) {
  return { ok: true, status: events.length ? 'observed' : 'no_data', series: events.length ? [{ sampleCount: 10 }] : [], events };
}

const selection = { asn: 'AS58224', since: '2026-09-06', until: '2026-09-07', testName: 'web_connectivity', target: '' };

test('signals from different dimensions never become one global critical verdict', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 45 }), ripe: ripe({ loss: 30 }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(result.status, 'dimension-specific');
  assert.equal(result.severity, 'neutral');
  assert.equal(result.interpretation.dimensions.interference.state, 'interference-signals');
  assert.equal(result.interpretation.dimensions.connectivity.state, 'insufficient-data');
  assert.equal(result.interpretation.dimensions.quality.state, 'path-observations-available');
  assert.equal(result.interpretation.invariants.severityRaisesFromSourceCount, false);
});

test('two interference source families without event alignment cannot establish independent support', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 45 }), censoredPlanet: cp({ events: [{ startDate: '2026-09-07' }] }), radar: { status: 'token_required' }, selection: { ...selection, asn: '' }, scopeLabel: 'Iran' });
  const dimension = result.interpretation.dimensions.interference;
  assert.equal(dimension.verification, 'signal');
  assert.equal(dimension.confidence, 'low');
  assert.equal(dimension.severity, 'unknown');
  assert.deepEqual(dimension.supportingSources, ['OONI', 'Censored Planet']);
});

test('country-level Censored Planet cannot cover or support a selected-ASN claim', () => {
  const quiet = buildAssessment({ ooni: ooni({ rate: 0 }), censoredPlanet: cp(), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const dimension = quiet.interpretation.dimensions.interference;
  assert.equal(dimension.state, 'insufficient-data');
  assert.equal(dimension.severity, 'unknown');
  assert.equal(dimension.coverage, 'limited');
  assert.deepEqual(dimension.availableSources, ['OONI']);
  const cpEvidence = dimension.evidence.find((item) => item.source === 'Censored Planet');
  assert.equal(cpEvidence.state, 'out-of-scope');
  assert.equal(cpEvidence.value, null);
  assert.equal(quiet.signals.find((item) => item.source === 'Censored Planet').usableForAssessment, false);

  const signal = buildAssessment({ ooni: ooni({ rate: 45 }), censoredPlanet: cp({ events: [{ startDate: '2026-09-07' }] }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.deepEqual(signal.interpretation.dimensions.interference.supportingSources, ['OONI']);
});

test('country-level Censored Planet cannot cover a selected target or non-web test', () => {
  for (const scoped of [{ target: 'https://www.instagram.com/' }, { testName: 'tor' }]) {
    const result = buildAssessment({ ooni: ooni({ rate: 0 }), censoredPlanet: cp(), radar: { status: 'token_required' }, selection: { ...selection, asn: '', ...scoped }, scopeLabel: 'Iran' });
    const dimension = result.interpretation.dimensions.interference;
    assert.equal(dimension.state, 'insufficient-data');
    assert.deepEqual(dimension.availableSources, ['OONI']);
  }
});

test('country-level Censored Planet still covers a country-level web claim', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 0 }), censoredPlanet: cp(), radar: { status: 'token_required' }, selection: { ...selection, asn: '' }, scopeLabel: 'Iran' });
  const dimension = result.interpretation.dimensions.interference;
  assert.equal(dimension.state, 'no-interference-signals-detected');
  assert.equal(dimension.coverage, 'adequate');
  assert.deepEqual(dimension.availableSources, ['OONI', 'Censored Planet']);
  assert.equal(result.signals.find((item) => item.source === 'Censored Planet').usableForAssessment, true);
});

test('source-native OONI confirmation confirms only the measured blocking claim', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 45, confirmed: 3 }), radar: { status: 'token_required' }, selection: { ...selection, target: 'https://www.instagram.com/' }, scopeLabel: 'AS58224 / Iran' });
  const dimension = result.interpretation.dimensions.interference;
  assert.equal(dimension.state, 'blocking-confirmed-in-measurements');
  assert.equal(dimension.verification, 'confirmed');
  assert.equal(dimension.scope, 'selected-target-or-test');
  assert.equal(dimension.severity, 'unknown');
  assert.equal(result.interpretation.attribution.state, 'unknown');
});

test('IODA event count is a connectivity signal but never a severity proxy', () => {
  const result = buildAssessment({
    ioda: ioda(Array.from({ length: 6 }, (_, index) => ({ datasource: index % 2 ? 'bgp' : 'ping-slash24' }))),
    ripestat: { ok: true, status: 'observed', timeAlignment: 'aligned', routing: { visibility: { percent: 99.7, seeingPeers: 325, totalPeers: 326 } } },
    radar: { status: 'token_required' }, selection, scopeLabel: 'Iran',
  });
  const dimension = result.interpretation.dimensions.connectivity;
  assert.equal(dimension.state, 'disruption-signals');
  assert.equal(dimension.severity, 'unknown');
  assert.equal(dimension.confidence, 'low');
  assert.equal(dimension.evidence.find((item) => item.source === 'IODA').value, 6);
  assert.equal(result.controlDataPlane.classification, 'no-divergence-established');
});

test('source-native nationwide scope defines impact without unverified incident corroboration', () => {
  const result = buildAssessment({
    radar: radar({ outages: [{ scope: 'NATIONWIDE', outageType: 'CONNECTIVITY' }] }),
    ioda: ioda([{ datasource: 'ping-slash24' }]),
    ripestat: { ok: true, status: 'observed', timeAlignment: 'aligned', routing: { visibility: { percent: 99.7, seeingPeers: 325, totalPeers: 326 } } },
    selection, scopeLabel: 'Iran',
  });
  const dimension = result.interpretation.dimensions.connectivity;
  assert.equal(dimension.severity, 'widespread');
  assert.equal(dimension.verification, 'signal');
  assert.equal(dimension.confidence, 'low');
  assert.equal(dimension.coverage, 'broad');
  assert.equal(result.controlDataPlane.classification, 'control-data-plane-divergence');
});

test('events on different days in one filter window remain separate measurement signals', () => {
  const result = buildAssessment({
    radar: radar({ outages: [{ scope: 'NATIONWIDE', startDate: '2026-09-06', endDate: '2026-09-06' }] }),
    ioda: ioda([{ start: '2026-09-12', end: '2026-09-12', datasource: 'ping-slash24' }]),
    selection: { ...selection, until: '2026-09-12' }, scopeLabel: 'Iran',
  });
  assert.deepEqual(result.interpretation.dimensions.connectivity.supportingSources, ['IODA', 'Cloudflare Radar']);
  assert.equal(result.interpretation.dimensions.connectivity.verification, 'signal');
  assert.equal(result.interpretation.dimensions.connectivity.confidence, 'low');
});

test('valid Radar and IODA no-event responses establish no detected connectivity event only', () => {
  const result = buildAssessment({ radar: radar(), ioda: ioda(), selection, scopeLabel: 'Iran' });
  const dimension = result.interpretation.dimensions.connectivity;
  assert.equal(dimension.state, 'no-disruption-events-detected');
  assert.equal(dimension.severity, 'none');
  assert.equal(dimension.coverage, 'adequate');
  assert.equal(result.interpretation.dimensions.interference.state, 'insufficient-data');
});

test('RIPE probes without samples keep connection quality explicitly unknown', () => {
  const result = buildAssessment({ ripe: ripe({ samples: 0, status: 'no_data' }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const quality = result.interpretation.dimensions.quality;
  assert.equal(quality.state, 'insufficient-data');
  assert.equal(quality.coverage, 'none');
  assert.equal(quality.severity, 'unknown');
  assert.equal(quality.evidence.find((item) => item.metric === 'probes').value, 7);
  assert.equal(quality.evidence.find((item) => item.metric === 'samples').value, 0);
});

test('aligned historical BGP observation stays a routing-only claim', () => {
  const result = buildAssessment({ ripestat: { ok: true, status: 'observed', timeAlignment: 'aligned', routing: { visibility: { percent: 99.7, seeingPeers: 325, totalPeers: 326 } } }, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const routing = result.interpretation.dimensions.routing;
  assert.equal(routing.state, 'routes-visible');
  assert.equal(routing.confidence, 'medium');
  assert.equal(routing.severity, 'unknown');
  assert.equal(result.interpretation.invariants.bgpVisibilityProvesReachability, false);
});

test('time-unaligned BGP is confidence-limited and cannot create control/data-plane divergence', () => {
  const result = buildAssessment({ ripe: ripe({ loss: 65 }), ripestat: { ok: true, status: 'observed', timeAlignment: 'unknown', routing: { visibility: { percent: 99, seeingPeers: 99, totalPeers: 100 } } }, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(result.interpretation.dimensions.routing.confidence, 'low');
  assert.equal(result.controlDataPlane.classification, 'no-divergence-established');
});

test('widespread connectivity evidence alone does not establish an intentional shutdown', () => {
  const result = buildAssessment({ radar: radar({ outages: [{ scope: 'NATIONWIDE' }] }), ioda: ioda([{ datasource: 'bgp' }]), pulse: { ok: true, status: 'no_data', events: [] }, selection, scopeLabel: 'Iran' });
  assert.equal(result.interpretation.dimensions.shutdown.state, 'not-established');
  assert.equal(result.interpretation.dimensions.shutdown.verification, 'not-established');
});

test('unlinked widespread signals and acknowledged Pulse context cannot establish a nationwide shutdown', () => {
  const result = buildAssessment({ radar: radar({ outages: [{ scope: 'NATIONWIDE' }] }), ioda: ioda([{ datasource: 'bgp' }]), pulse: { ok: true, status: 'observed', events: [{ verificationLevel: 'acknowledged', cause: 'government directed' }] }, selection, scopeLabel: 'Iran' });
  const shutdown = result.interpretation.dimensions.shutdown;
  assert.equal(shutdown.state, 'not-established');
  assert.equal(shutdown.verification, 'not-established');
  assert.equal(shutdown.contextVerification, 'acknowledged');
  assert.deepEqual(shutdown.supportingSources, []);
  assert.ok(!result.availableSources.includes('Internet Society Pulse'));
  assert.equal(result.interpretation.attribution.state, 'unknown');
});

test('a verified regional Pulse record is never promoted to a nationwide shutdown', () => {
  const result = buildAssessment({
    radar: radar({ outages: [{ scope: 'NATIONWIDE', startDate: '2026-09-10' }] }),
    ioda: ioda([{ datasource: 'bgp', entityType: 'asn', entityCode: '58224', start: '2026-09-10' }]),
    pulse: { ok: true, status: 'observed', events: [{ country: 'Iran', type: 'regional shutdown', affectedRegions: 'one province', verificationLevel: 'confirmed', startDate: '2026-09-10' }] },
    selection, scopeLabel: 'AS58224 / Iran',
  });
  const shutdown = result.interpretation.dimensions.shutdown;
  assert.equal(shutdown.state, 'not-established');
  assert.equal(shutdown.contextVerification, 'confirmed');
  assert.equal(shutdown.verification, 'not-established');
});

test('missing data and cross-dimension signals preserve all methodological invariants', () => {
  const result = buildAssessment({ ooni: ooni({ count: 0 }), radar: { status: 'token_required' }, selection, scopeLabel: 'Iran' });
  assert.deepEqual(result.interpretation.invariants, {
    globalScore: false,
    severityRaisesFromSourceCount: false,
    missingDataMeansNormal: false,
    connectivityProvesCensorship: false,
    bgpVisibilityProvesReachability: false,
  });
  assert.ok(result.interpretation.unknowns.includes('complete-nationwide-shutdown'));
  assert.ok(result.interpretation.unknowns.includes('connection-quality'));
  assert.ok(result.interpretation.unknowns.includes('cause-and-intent'));
});

test('partial Censored Planet data remains visible but cannot support OONI automatically', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 45 }), censoredPlanet: cp({ status: 'partial', events: [{}] }), radar: { status: 'token_required' }, selection, scopeLabel: 'Iran' });
  const dimension = result.interpretation.dimensions.interference;
  assert.deepEqual(dimension.supportingSources, ['OONI']);
  assert.equal(dimension.confidence, 'low');
  assert.equal(result.signals.find((item) => item.source === 'Censored Planet').usableForAssessment, false);
});

test('ineligible Radar data cannot improve connectivity coverage or confidence', () => {
  const result = buildAssessment({ radar: radar({ eligible: false, outages: [{ scope: 'NATIONWIDE' }] }), ioda: ioda([{ datasource: 'bgp' }]), selection, scopeLabel: 'Iran' });
  const dimension = result.interpretation.dimensions.connectivity;
  assert.deepEqual(dimension.supportingSources, ['IODA']);
  assert.equal(dimension.coverage, 'limited');
  assert.equal(dimension.severity, 'unknown');
});

test('one quiet interference source is insufficient for a healthy claim', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 0 }), radar: { status: 'token_required' }, selection, scopeLabel: 'Iran' });
  const dimension = result.interpretation.dimensions.interference;
  assert.equal(dimension.state, 'insufficient-data');
  assert.equal(dimension.severity, 'unknown');
  assert.equal(dimension.coverage, 'limited');
});

test('M-Lab alone provides limited performance context rather than a national quality verdict', () => {
  const result = buildAssessment({ mlab: { ok: true, status: 'observed' }, radar: { status: 'token_required' }, selection, scopeLabel: 'Iran' });
  const quality = result.interpretation.dimensions.quality;
  assert.equal(quality.state, 'path-observations-available');
  assert.equal(quality.coverage, 'limited');
  assert.equal(quality.confidence, 'low');
  assert.equal(quality.severity, 'unknown');
});

test('country scope without an ASN leaves routing explicitly unevaluated', () => {
  const result = buildAssessment({ ripestat: { ok: true, status: 'scope_required' }, radar: { status: 'token_required' }, selection: { ...selection, asn: '' }, scopeLabel: 'Iran' });
  const routing = result.interpretation.dimensions.routing;
  assert.equal(routing.state, 'insufficient-data');
  assert.equal(routing.coverage, 'none');
  assert.equal(routing.timeAlignment, 'not-applicable');
});

test('technical evidence never creates attribution without curated cause context', () => {
  const result = buildAssessment({ radar: radar({ outages: [{ scope: 'NATIONWIDE' }] }), ioda: ioda([{ datasource: 'bgp' }]), pulse: { ok: true, status: 'no_data', events: [] }, selection, scopeLabel: 'Iran' });
  assert.equal(result.interpretation.attribution.state, 'unknown');
  assert.deepEqual(result.interpretation.attribution.evidence, []);
});

const serviceDomains = { ok: true, sourceUrl: 'https://api.ooni.io/', domains: [
  { domain: 'www.instagram.com', measurements: 415, confirmed: 223, anomalous: 100, ok: 92, failures: 0, lastObserved: '2026-09-22' },
] };
const serviceApps = { ok: true, signals: [{ testName: 'whatsapp', status: 'observed', measurements: 441, anomalies: 319, lastObservation: '2026-09-22' }] };

test('the plain-language headline names confirmed blocked services and the open unknown is untested services', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 45, confirmed: 3 }), ooniDomains: serviceDomains, circumvention: serviceApps, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const { summary, services, unknowns } = result.interpretation;
  assert.equal(summary.headline.state, 'services-blocked');
  assert.deepEqual(summary.headline.services, ['instagram']);
  assert.deepEqual(services.restricted, ['whatsapp']);
  assert.equal(summary.latestObservation, '2026-09-22');
  assert.ok(unknowns.includes('other-services'));
  assert.ok(!unknowns.includes('affected-services'));
});

test('without service data the headline falls back to the measured signals and affected services remain unknown', () => {
  const result = buildAssessment({ ooni: ooni({ rate: 45 }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(result.interpretation.services, null);
  assert.equal(result.interpretation.summary.headline.state, 'interference-signals');
  assert.ok(result.interpretation.unknowns.includes('affected-services'));

  const quiet = buildAssessment({ ooni: ooni({ count: 0 }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(quiet.interpretation.summary.headline.state, 'limited-evidence');
});

test('a source-native broad outage outranks blocked services in the headline', () => {
  const result = buildAssessment({ radar: radar({ outages: [{ scope: 'NATIONWIDE' }] }), ioda: ioda([{ datasource: 'bgp' }]), ooniDomains: serviceDomains, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(result.interpretation.summary.headline.state, 'major-outage');
  assert.deepEqual(result.interpretation.summary.headline.services, ['instagram']);
});

test('usable path measurements become a quality finding with packet loss and latency', () => {
  const result = buildAssessment({ ripe: ripe({ loss: 2 }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const finding = result.interpretation.findings.find((item) => item.id === 'quality-observed');
  assert.ok(finding);
  assert.deepEqual(finding.evidence.map((item) => item.metric), ['probes', 'packet-loss-percent', 'rtt-ms']);
  assert.equal(result.interpretation.findings.some((item) => item.id === 'quality-unknown'), false);
});

test('routing keeps its time alignment and pending state visible for the presentation layer', () => {
  const unaligned = buildAssessment({ ripestat: { ok: true, status: 'observed', timeAlignment: 'unknown', routing: { visibility: { percent: 99.7, seeingPeers: 324, totalPeers: 325 } } }, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(unaligned.interpretation.dimensions.routing.timeAlignment, 'unknown');
  assert.equal(unaligned.interpretation.dimensions.routing.confidence, 'low');
  assert.equal(unaligned.interpretation.dimensions.routing.pending, false);

  const pending = buildAssessment({ ripestat: { ok: true, status: 'observed', routingRetryInProgress: true, routing: null }, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(pending.interpretation.dimensions.routing.state, 'insufficient-data');
  assert.equal(pending.interpretation.dimensions.routing.pending, true);
});

test('an explicit target selection is answered, not replaced by unrelated app findings', () => {
  const apps = { ok: true, signals: [{ testName: 'whatsapp', status: 'observed', measurements: 78, anomalies: 76, lastObservation: '2026-09-22' }] };
  const targetSelection = { ...selection, target: 'https://play.google.com/' };
  const untested = buildAssessment({ ooni: ooni({ count: 0 }), ooniDomains: { ok: true, domains: [] }, circumvention: apps, radar: { status: 'token_required' }, selection: targetSelection, scopeLabel: 'AS197207 / Iran' });
  const { summary, services } = untested.interpretation;
  assert.equal(summary.headline.state, 'services-untested');
  assert.deepEqual(summary.headline.services, ['selected-target']);
  assert.deepEqual(services.visible.map((item) => item.name), ['play.google.com']);
  assert.deepEqual(services.restricted, [], 'app findings outside the selection cannot drive the headline');

  const reachable = buildAssessment({ ooni: ooni({ rate: 0 }), ooniDomains: { ok: true, domains: [
    { domain: 'play.google.com', measurements: 6, confirmed: 0, anomalous: 0, ok: 6, failures: 0, lastObserved: '2026-09-22' },
  ] }, circumvention: apps, radar: { status: 'token_required' }, selection: targetSelection, scopeLabel: 'AS197207 / Iran' });
  assert.equal(reachable.interpretation.summary.headline.state, 'services-reachable');
});

test('a selected test outside the service tiles still gets its own headline', () => {
  const torSelection = { ...selection, testName: 'tor' };
  const signals = buildAssessment({ ooni: ooni({ rate: 40 }), ooniDomains: { ok: true, domains: [] }, circumvention: { ok: true, signals: [] }, radar: { status: 'token_required' }, selection: torSelection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(signals.interpretation.services.state, 'out-of-scope');
  assert.equal(signals.interpretation.summary.headline.state, 'interference-signals');

  const confirmed = buildAssessment({ ooni: ooni({ rate: 40, confirmed: 5 }), radar: { status: 'token_required' }, selection: torSelection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(confirmed.interpretation.summary.headline.state, 'interference-confirmed');
});

test('connection quality gains a second source only when Radar stayed in the selected window', () => {
  const radarQuality = (extra = {}) => ({ ok: true, source: 'Cloudflare Radar', status: 'observed', windowAligned: true,
    latency: { median: 115.1, typicalLow: 94.1, typicalHigh: 158.3 }, bandwidth: { median: 5.1, typicalLow: 3.8, typicalHigh: 6.9 },
    dns: { median: 100.1 }, ...extra });

  const both = buildAssessment({ ripe: ripe({ loss: 2 }), radarQuality: radarQuality(), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const dimension = both.interpretation.dimensions.quality;
  assert.deepEqual(dimension.availableSources, ['RIPE Atlas', 'Cloudflare Radar']);
  assert.equal(dimension.coverage, 'adequate');
  assert.equal(dimension.evidence.find((item) => item.metric === 'latency-ms').value, 115.1);
  assert.equal(dimension.evidence.find((item) => item.metric === 'download-mbps').value, 5.1);
  assert.equal(dimension.evidence.find((item) => item.metric === 'dns-ms').value, 100.1);
  assert.deepEqual(dimension.typicalRange.latency, { low: 94.1, high: 158.3 }, 'the spread travels with the claim');

  const widened = buildAssessment({ ripe: ripe({ samples: 0, status: 'no_data' }), radarQuality: radarQuality({ windowAligned: false }), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const widenedQuality = widened.interpretation.dimensions.quality;
  assert.deepEqual(widenedQuality.availableSources, [], 'a 90-day answer cannot cover a 7-day claim');
  assert.equal(widenedQuality.state, 'insufficient-data');
  assert.equal(widenedQuality.evidence.find((item) => item.metric === 'latency-ms').value, null);

  const radarOnly = buildAssessment({ ripe: ripe({ samples: 0, status: 'no_data' }), radarQuality: radarQuality(), radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  assert.equal(radarOnly.interpretation.dimensions.quality.state, 'path-observations-available');
  assert.equal(radarOnly.interpretation.dimensions.quality.coverage, 'limited');
});

test('the network comparison travels with the service claim without changing its severity', () => {
  const networks = { ok: true, domain: 'www.instagram.com', measured: 6, blocked: 5, restricted: 0, reachable: 1, inconclusive: 0, networks: [] };
  const result = buildAssessment({ ooni: ooni({ rate: 45, confirmed: 3 }), ooniDomains: serviceDomains, ooniNetworks: networks, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran' });
  const scope = result.interpretation.services.networkScope;
  assert.equal(scope.blocked, 5);
  assert.equal(scope.measured, 6);
  assert.equal(scope.serviceId, 'instagram', 'the comparison is bound to the service it describes');
  assert.equal(result.interpretation.dimensions.interference.severity, 'unknown', 'a wider pattern is scope, not severity');
});

test('stale source data stays visible as history but cannot support a current claim', () => {
  const staleDomains = { ...serviceDomains, status: 'stale', stale: true, staleSince: '2026-09-23T08:00:00.000Z' };
  const result = buildAssessment({
    ooni: { ...ooni({ rate: 45, confirmed: 3 }), status: 'stale', stale: true, staleSince: '2026-09-23T08:00:00.000Z' },
    ooniDomains: staleDomains, radar: { status: 'token_required' }, selection, scopeLabel: 'AS58224 / Iran',
  });
  const { services, dimensions } = result.interpretation;
  assert.equal(services.stale.since, '2026-09-23T08:00:00.000Z', 'the age travels with the last known state');
  assert.equal(services.visible.find((item) => item.id === 'instagram').status, 'blocked', 'the last known state stays visible');
  assert.equal(dimensions.interference.state, 'insufficient-data', 'a stale source cannot carry a current claim');
  assert.deepEqual(dimensions.interference.availableSources, []);
  assert.equal(dimensions.interference.evidence.find((item) => item.metric === 'measurements').value, 0);
});
