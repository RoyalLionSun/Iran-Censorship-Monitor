import { compareServicePeriods, summarizeIndependentChecks, summarizeMoreServices, summarizeServiceBrands, summarizeWorkarounds } from '../public/service-findings.js';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sourceState(source) {
  if (!source) return 'not-queried';
  if (source.status === 'token_required') return 'token-required';
  if (source.status === 'scope_required') return 'scope-required';
  if (!source.ok || source.status === 'error') return 'error';
  if (source.status === 'partial') return 'partial';
  if (source.status === 'no_data') return 'no-data';
  return 'observed';
}

function confidenceFor({ supporting = [], confirmed = false, contradicted = false }) {
  if (!supporting.length) return 'none';
  if (contradicted) return 'low';
  // Two source families are not necessarily observing the same incident.
  // Do not promote confidence until time, scope and root lineage are checked.
  if (confirmed) return 'medium';
  return 'low';
}

function coverageFor(validSources, { broad = false } = {}) {
  const count = unique(validSources).length;
  if (!count) return 'none';
  if (broad && count >= 2) return 'broad';
  if (count >= 2) return 'adequate';
  return 'limited';
}

function verificationFor({ signal = false, supported = false, confirmed = false, acknowledged = false }) {
  if (acknowledged) return 'acknowledged';
  if (confirmed) return 'confirmed';
  if (supported) return 'supported';
  if (signal) return 'signal';
  return 'not-established';
}

function radarScopeSeverity(annotations = []) {
  const terms = annotations.flatMap((item) => [item?.scope, item?.outageType, item?.eventType])
    .filter(Boolean)
    .map((value) => String(value).toUpperCase());
  if (terms.some((value) => value.includes('NATIONWIDE') || value.includes('NATIONAL'))) return 'widespread';
  if (terms.some((value) => value.includes('REGIONAL'))) return 'severe';
  if (terms.some((value) => value.includes('NETWORK') || value.includes('ASN'))) return 'moderate';
  return 'unknown';
}

function outageScope(item) {
  const severity = radarScopeSeverity([item]);
  return { widespread: 'nationwide', severe: 'regional', moderate: 'network' }[severity] ?? null;
}

// The periods Radar itself dates. A reader needs when an outage began and ended, not only
// that one overlapped the selected window; the dates come from the source, never from us.
function outagePeriods(outages, selection) {
  const since = selection?.since ? Date.parse(`${selection.since}T00:00:00Z`) : null;
  const until = selection?.until ? Date.parse(`${selection.until}T23:59:59Z`) : null;
  return outages
    .map((item) => ({ item, scope: outageScope(item) }))
    .filter(({ item, scope }) => scope && Number.isFinite(Date.parse(String(item?.startDate ?? ''))))
    .map(({ item, scope }) => {
      const end = Number.isFinite(Date.parse(String(item.endDate ?? ''))) ? item.endDate : null;
      const endMs = end ? Date.parse(end) : null;
      return {
        start: item.startDate,
        end,
        scope,
        cause: item.outageCause ?? null,
        appliesVia: item.appliesVia ?? null,
        startedBeforeWindow: since !== null && Date.parse(item.startDate) < since,
        endedInWindow: endMs !== null && (since === null || endMs >= since) && (until === null || endMs <= until),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

function buildConnectivity({ ioda, radar, selection }) {
  const radarEligible = radar?.assessmentEligible === true;
  const radarOutages = radar?.outages?.status === 'observed' ? radar.outages.annotations ?? [] : [];
  const radarAnomalies = radar?.trafficAnomalies?.status === 'observed' ? radar.trafficAnomalies.events ?? [] : [];
  const radarEvents = [...radarOutages, ...radarAnomalies];
  const eligibleRadarEvents = radarEligible ? radarEvents : [];
  const eligibleRadarOutages = radarEligible ? radarOutages : [];
  const iodaEvents = ioda?.ok && ioda?.status === 'observed' ? ioda.events ?? [] : [];
  const validSources = [
    ioda?.ok && ['observed', 'no_data'].includes(ioda?.status) ? 'IODA' : null,
    radarEligible ? 'Cloudflare Radar' : null,
  ];
  const supportingSources = [iodaEvents.length ? 'IODA' : null, eligibleRadarEvents.length ? 'Cloudflare Radar' : null];
  const coverage = coverageFor(validSources, {
    broad: eligibleRadarOutages.some((item) => String(item?.scope ?? '').toUpperCase().includes('NATION')),
  });
  const hasSignal = supportingSources.some(Boolean);
  const severity = hasSignal ? radarScopeSeverity(eligibleRadarOutages) : coverage === 'adequate' ? 'none' : 'unknown';
  const confidence = confidenceFor({ supporting: unique(supportingSources) });
  return {
    id: 'connectivity',
    state: hasSignal ? 'disruption-signals' : coverage === 'adequate' ? 'no-disruption-events-detected' : 'insufficient-data',
    severity,
    confidence,
    verification: verificationFor({ signal: hasSignal }),
    coverage,
    availableSources: unique(validSources),
    supportingSources: unique(supportingSources),
    eventCount: iodaEvents.length + eligibleRadarEvents.length,
    outagePeriods: outagePeriods(eligibleRadarOutages, selection),
    // "1 disruption signal" tells a reader nothing; the latest event says what, when and who.
    latestEvent: [
      ...iodaEvents.map((item) => ({ source: 'IODA', kind: item.datasource ?? null, start: item.start ?? null, end: item.end ?? null })),
      ...(radarEligible ? radarAnomalies.map((item) => ({ source: 'Cloudflare Radar', kind: 'traffic-anomaly', start: item.startDate ?? null, end: item.endDate ?? null })) : []),
    ].filter((item) => item.start).sort((a, b) => String(b.start).localeCompare(String(a.start)))[0] ?? null,
    evidence: [
      { source: 'IODA', state: sourceState(ioda), metric: 'events', value: iodaEvents.length },
      { source: 'Cloudflare Radar', state: sourceState(radar), metric: 'events', value: radarEligible ? radarEvents.length : null },
    ],
    limitationKey: 'interpretation.connectivity.limit',
  };
}

function isTargetSpecific(selection) {
  return Boolean(selection?.target || (selection?.testName && selection.testName !== 'web_connectivity'));
}

// Censored Planet measures from outside Iran towards servers inside it. A vantage point abroad
// cannot check what people inside Iran can reach, so it never supports or covers an access
// claim; it stays visible as outside-in context.
export function censoredPlanetInScope() {
  return false;
}

// For a selected service the claim is about that service, so its own measured channel is
// the evidence, not the network-wide OONI totals.
const CHANNEL_RANK = { confirmed: 4, anomaly: 3, no_signal: 2, inconclusive: 1 };

function selectedChannel(item) {
  const webRank = CHANNEL_RANK[item?.web?.status] ?? 0;
  const appRank = CHANNEL_RANK[item?.app?.status] ?? 0;
  if (!webRank && !appRank) return null;
  if (appRank > webRank) return { measurements: item.app.measurements, anomalous: item.app.anomalies, confirmed: 0 };
  return { measurements: item.web.measurements, anomalous: item.web.anomalous, confirmed: item.web.confirmed };
}

function buildInterference({ ooni, censoredPlanet, selection, services }) {
  // Only a service tile that is actually in scope can stand for the claim; a selected test
  // without a tile (Tor, Psiphon, DNS) keeps the OONI timeline, which the server scoped to it.
  const scopedSelection = Boolean(services?.scoped && services.visible?.length);
  const focus = scopedSelection ? selectedChannel(services.visible[0]) : null;
  const ooniCurrent = Boolean(ooni?.ok && ooni.status !== 'stale');
  const ooniUsable = scopedSelection
    ? Boolean(focus) && ooniCurrent
    : Boolean(ooniCurrent && ooni.totalMeasurements > 0 && !ooni.truncatedAtApiLimit);
  const cpHasData = Boolean(censoredPlanet?.ok && ['observed', 'partial'].includes(censoredPlanet?.status) && (
    censoredPlanet?.iranUnexpectedRate != null || censoredPlanet?.timeseries?.length || censoredPlanet?.events?.length
  ));
  const cpInScope = censoredPlanetInScope(selection);
  const cpUsable = cpHasData && censoredPlanet.status === 'observed' && cpInScope;
  const ooniAnomalies = !ooniUsable ? 0 : scopedSelection ? Number(focus.anomalous ?? 0) : Number(ooni.totalAnomalies ?? 0);
  const ooniConfirmed = !ooniUsable ? 0 : scopedSelection ? Number(focus.confirmed ?? 0) : Number(ooni.totalConfirmed ?? 0);
  // A stale source shows no current value; its history lives in the service tiles instead.
  const ooniMeasurements = !ooniCurrent ? 0 : scopedSelection ? Number(focus?.measurements ?? 0) : Number(ooni?.totalMeasurements ?? 0);
  const ooniAnomalyRate = !ooniCurrent ? null
    : scopedSelection
      ? (ooniMeasurements ? Math.round((ooniAnomalies / ooniMeasurements) * 1000) / 10 : null)
      : ooni?.anomalyRate ?? null;
  const cpEvents = cpHasData ? censoredPlanet?.events?.length ?? 0 : 0;
  const validSources = [ooniUsable ? 'OONI' : null, cpUsable ? 'Censored Planet' : null];
  const supportingSources = [ooniAnomalies > 0 || ooniConfirmed > 0 ? 'OONI' : null, cpUsable && cpEvents > 0 ? 'Censored Planet' : null];
  const coverage = coverageFor(validSources);
  const hasSignal = supportingSources.some(Boolean);
  const confirmed = ooniConfirmed > 0;
  const confidence = confidenceFor({ supporting: unique(supportingSources), confirmed });
  const targetSpecific = isTargetSpecific(selection);
  return {
    id: 'interference',
    state: confirmed ? 'blocking-confirmed-in-measurements' : hasSignal ? 'interference-signals' : coverage === 'adequate' ? 'no-interference-signals-detected' : 'insufficient-data',
    severity: hasSignal ? 'unknown' : coverage === 'adequate' ? 'none' : 'unknown',
    confidence,
    verification: verificationFor({ signal: hasSignal, confirmed }),
    coverage,
    scope: targetSpecific ? 'selected-target-or-test' : 'selected-measurement-scope',
    availableSources: unique(validSources),
    supportingSources: unique(supportingSources),
    evidence: [
      { source: 'OONI', state: sourceState(ooni), metric: 'measurements', value: ooniMeasurements },
      { source: 'OONI', state: sourceState(ooni), metric: 'anomaly-rate', value: ooniAnomalyRate },
      { source: 'OONI', state: sourceState(ooni), metric: 'confirmed', value: ooniConfirmed },
      { source: 'Censored Planet', state: 'outside-in', scope: 'country', metric: 'events', value: null },
    ],
    limitationKey: 'interpretation.interference.limit',
  };
}

function buildRouting({ ripestat, selection }) {
  const visibility = ripestat?.routing?.visibility ?? null;
  const percent = visibility?.percent ?? null;
  const hasRoutingData = Boolean(ripestat?.ok && ripestat?.status === 'observed' && percent != null);
  const timeAlignment = hasRoutingData
    ? ripestat?.timeAlignment ?? (selection?.until ? 'unknown' : 'latest')
    : 'not-applicable';
  const aligned = ['aligned', 'latest'].includes(timeAlignment);
  return {
    id: 'routing',
    state: !hasRoutingData ? 'insufficient-data' : visibility.seeingPeers > 0 ? 'routes-visible' : 'routes-not-visible',
    severity: !hasRoutingData || visibility.seeingPeers > 0 ? 'unknown' : 'widespread',
    confidence: hasRoutingData && aligned ? 'medium' : hasRoutingData ? 'low' : 'none',
    verification: verificationFor({ signal: hasRoutingData }),
    coverage: hasRoutingData ? 'limited' : 'none',
    timeAlignment,
    pending: Boolean(!hasRoutingData && ripestat?.routingRetryInProgress),
    availableSources: hasRoutingData ? ['RIPEstat / RIPE RIS'] : [],
    supportingSources: hasRoutingData ? ['RIPEstat / RIPE RIS'] : [],
    evidence: [
      { source: 'RIPEstat / RIPE RIS', state: sourceState(ripestat), metric: 'visibility-percent', value: percent },
      { source: 'RIPEstat / RIPE RIS', state: sourceState(ripestat), metric: 'peers-seeing', value: visibility?.seeingPeers ?? null },
      { source: 'RIPEstat / RIPE RIS', state: sourceState(ripestat), metric: 'total-peers', value: visibility?.totalPeers ?? null },
    ],
    limitationKey: 'interpretation.routing.limit',
  };
}

function buildQuality({ ripe, mlab, radarQuality }) {
  const ripeSamples = Number(ripe?.overall?.samples ?? 0);
  const ripeUsable = Boolean(ripe?.ok && ripe?.status === 'observed' && ripeSamples > 0);
  const mlabUsable = Boolean(mlab?.ok && mlab?.status === 'observed');
  // Radar quality only counts when its response stayed inside the selected window.
  const radarUsable = Boolean(radarQuality?.ok && radarQuality.status === 'observed'
    && radarQuality.windowAligned && radarQuality.latency?.median != null);
  const validSources = [ripeUsable ? 'RIPE Atlas' : null, mlabUsable ? 'M-Lab NDT' : null, radarUsable ? 'Cloudflare Radar' : null];
  const coverage = coverageFor(validSources);
  return {
    id: 'quality',
    state: ripeUsable || mlabUsable || radarUsable ? 'path-observations-available' : 'insufficient-data',
    severity: 'unknown',
    confidence: validSources.some(Boolean) ? 'low' : 'none',
    verification: verificationFor({ signal: validSources.some(Boolean) }),
    coverage,
    availableSources: unique(validSources),
    supportingSources: [],
    // Days with sampled traffic; during a shutdown a network can go days without any.
    measuredDays: radarUsable ? radarQuality.latency.measuredDays ?? null : null,
    // A median alone hides the spread of what users actually experience.
    typicalRange: radarUsable ? {
      latency: { low: radarQuality.latency.typicalLow, high: radarQuality.latency.typicalHigh },
      download: { low: radarQuality.bandwidth?.typicalLow ?? null, high: radarQuality.bandwidth?.typicalHigh ?? null },
    } : null,
    evidence: [
      { source: 'RIPE Atlas', state: sourceState(ripe), metric: 'probes', value: Number(ripe?.probeCount ?? 0) },
      { source: 'RIPE Atlas', state: sourceState(ripe), metric: 'samples', value: ripeSamples },
      { source: 'RIPE Atlas', state: sourceState(ripe), metric: 'packet-loss-percent', value: ripeUsable ? ripe?.overall?.packetLossPercent ?? null : null },
      { source: 'RIPE Atlas', state: sourceState(ripe), metric: 'rtt-ms', value: ripeUsable ? ripe?.overall?.averageRttMs ?? null : null },
      { source: 'M-Lab NDT', state: sourceState(mlab), metric: 'availability', value: mlabUsable ? 1 : 0 },
      { source: 'Cloudflare Radar', state: sourceState(radarQuality), metric: 'latency-ms', value: radarUsable ? radarQuality.latency.median : null },
      { source: 'Cloudflare Radar', state: sourceState(radarQuality), metric: 'download-mbps', value: radarUsable ? radarQuality.bandwidth?.median ?? null : null },
      { source: 'Cloudflare Radar', state: sourceState(radarQuality), metric: 'dns-ms', value: radarUsable ? radarQuality.dns?.median ?? null : null },
    ],
    limitationKey: 'interpretation.quality.limit',
  };
}

function pulseVerification(events = []) {
  const levels = events.map((event) => String(event?.verificationLevel ?? '').toLowerCase());
  if (levels.includes('acknowledged')) return 'acknowledged';
  if (levels.includes('confirmed')) return 'confirmed';
  if (levels.includes('unconfirmed')) return 'signal';
  return 'not-established';
}

function timeRange(start, end) {
  const from = Date.parse(String(start ?? ''));
  if (!Number.isFinite(from)) return null;
  const to = Date.parse(String(end ?? ''));
  return { start: from, end: Number.isFinite(to) && to >= from ? to : from };
}

function rangesOverlap(left, right) {
  return Boolean(left && right && left.start <= right.end && right.start <= left.end);
}

function nationwideRadarRanges(radar) {
  if (radar?.assessmentEligible !== true || radar?.outages?.status !== 'observed') return [];
  return (radar.outages.annotations ?? [])
    .filter((item) => /NATION/i.test(String(item?.outageType ?? item?.scope ?? '')))
    .map((item) => timeRange(item?.startDate, item?.endDate))
    .filter(Boolean);
}

function iodaRanges(ioda) {
  if (!ioda?.ok || ioda?.status !== 'observed') return [];
  return (ioda.events ?? []).map((item) => timeRange(item?.start, item?.end)).filter(Boolean);
}

// The contract requires, for the same incident: source-native nationwide technical impact,
// at least two independent technical connectivity roots, and confirmed or acknowledged
// nationwide Pulse context whose time actually overlaps that technical evidence. Pulse
// remains context and never counts as a technical vote.
function buildShutdown({ connectivity, pulse, ioda, radar }) {
  const pulseEvents = pulse?.ok && pulse?.status === 'observed' ? pulse.events ?? [] : [];
  const contextVerification = pulseVerification(pulseEvents);
  const nationwidePulse = pulseEvents
    .filter((event) => String(event?.type ?? '').toLowerCase() === 'national'
      && ['confirmed', 'acknowledged'].includes(String(event?.verificationLevel ?? '').toLowerCase()))
    .map((event) => ({ event, range: timeRange(event?.startTime, event?.endTime) }))
    .filter((entry) => entry.range);
  const radarRanges = nationwideRadarRanges(radar);
  const iodaEventRanges = iodaRanges(ioda);
  const technicalRoots = unique(connectivity.supportingSources ?? []);
  const matched = nationwidePulse.find((entry) =>
    radarRanges.some((range) => rangesOverlap(entry.range, range))
    && iodaEventRanges.some((range) => rangesOverlap(entry.range, range)));
  const established = Boolean(matched && connectivity.severity === 'widespread' && technicalRoots.length >= 2);
  // A curated national record that does not meet the rule is still context a reader must see.
  const nationalContext = pulseEvents
    .filter((event) => String(event?.type ?? '').toLowerCase() === 'national')
    .sort((a, b) => String(b.startTime ?? '').localeCompare(String(a.startTime ?? '')))[0] ?? null;
  const verification = established
    ? (String(matched.event.verificationLevel).toLowerCase() === 'acknowledged' ? 'acknowledged' : 'confirmed')
    : 'not-established';
  // A curated record can span what the measurements show as separate outages, or a period in
  // which they show none. Put the record next to what Radar dates, so neither stands alone.
  const nationwidePeriods = (connectivity.outagePeriods ?? []).filter((period) => period.scope === 'nationwide');
  const contextRange = nationalContext ? timeRange(nationalContext.startTime, nationalContext.endTime) : null;
  let contextComparison = null;
  if (nationalContext && radar?.assessmentEligible === true) {
    if (!nationwidePeriods.length) contextComparison = 'radar-no-nationwide-outage';
    else {
      const day = 86_400_000;
      const differs = nationwidePeriods.every((period) => {
        const range = timeRange(period.start, period.end);
        return !range || Math.abs(range.start - contextRange.start) > day
          || (period.end && nationalContext.endTime && Math.abs(range.end - contextRange.end) > day);
      });
      contextComparison = differs ? 'radar-dates-differ' : 'radar-dates-match';
    }
  }
  // Nothing to confirm: no source reports a nationwide outage and the incident record has none.
  const quiet = !established && radar?.assessmentEligible === true && connectivity.severity !== 'widespread'
    && !nationalContext && pulse?.ok && ['observed', 'no_data'].includes(pulse?.status);
  return {
    id: 'shutdown',
    state: established ? 'nationwide-shutdown-established' : 'not-established',
    quiet,
    severity: established ? 'widespread' : 'unknown',
    // Root lineage between the sources is still not verified, so confidence stops at medium.
    confidence: established ? 'medium' : 'none',
    verification,
    contextVerification,
    coverage: established ? 'broad' : 'none',
    contextComparison,
    contextEvent: nationalContext ? {
      startDate: nationalContext.startDate ?? null,
      endDate: nationalContext.endDate ?? null,
      cause: nationalContext.cause ?? null,
      verificationLevel: nationalContext.verificationLevel ?? null,
    } : null,
    establishedEvent: established ? {
      startDate: matched.event.startDate ?? null,
      endDate: matched.event.endDate ?? null,
      cause: matched.event.cause ?? null,
      verificationLevel: matched.event.verificationLevel ?? null,
    } : null,
    availableSources: unique([...connectivity.availableSources, pulseEvents.length ? 'Internet Society Pulse' : null]),
    supportingSources: established ? technicalRoots : [],
    evidence: [
      { source: 'Internet Society Pulse', state: sourceState(pulse), metric: 'events', value: pulseEvents.length },
    ],
    limitationKey: 'interpretation.shutdown.limit',
  };
}

function buildAttribution({ shutdown, pulse }) {
  const events = pulse?.ok && pulse?.status === 'observed' ? pulse.events ?? [] : [];
  const hasReportedCause = events.some((event) => event?.cause);
  return {
    state: shutdown.state === 'nationwide-shutdown-established' && hasReportedCause ? 'reported' : 'unknown',
    evidence: hasReportedCause ? ['Internet Society Pulse'] : [],
  };
}

function finding(id, dimension, state, evidence = []) {
  return { id, dimension, state, evidence };
}

function buildFindings({ connectivity, interference, routing, quality, shutdown }) {
  const findings = [];
  if (interference.state === 'blocking-confirmed-in-measurements') findings.push(finding('ooni-confirmed', 'interference', 'confirmed', interference.evidence.filter((item) => item.source === 'OONI')));
  else if (interference.state === 'interference-signals') findings.push(finding('interference-signals', 'interference', 'signal', interference.evidence));
  if (connectivity.state === 'disruption-signals') findings.push(finding('connectivity-events', 'connectivity', 'signal', connectivity.evidence));
  if (routing.state === 'routes-visible') findings.push(finding('routing-visible', 'routing', 'observed', routing.evidence));
  if (quality.state === 'insufficient-data') findings.push(finding('quality-unknown', 'quality', 'unknown', quality.evidence));
  else if (quality.state === 'path-observations-available') findings.push(finding('quality-observed', 'quality', 'observed', quality.evidence.filter((item) => ['packet-loss-percent', 'rtt-ms', 'probes'].includes(item.metric))));
  // Measured nationwide impact without a confirmed record is reported as what it is.
  if (shutdown.state !== 'nationwide-shutdown-established') {
    findings.push(connectivity.severity === 'widespread'
      ? finding('shutdown-measured-unconfirmed', 'shutdown', 'signal', [...connectivity.evidence, ...shutdown.evidence])
      : finding('shutdown-not-established', 'shutdown', 'not-established', shutdown.evidence));
  }
  return findings;
}

function buildUnknowns({ connectivity, interference, quality, shutdown, attribution, services }) {
  const unknowns = [];
  // A question about one service is not answered by nationwide-shutdown caveats. Once outage
  // monitors measured a nationwide outage, what stays open is its confirmation, not whether it happens.
  if (shutdown.state !== 'nationwide-shutdown-established' && !services?.scoped) {
    if (!shutdown.quiet) unknowns.push(connectivity?.severity === 'widespread' ? 'shutdown-confirmation' : 'complete-nationwide-shutdown');
  }
  if (interference.verification !== 'confirmed') unknowns.push('target-blocking');
  // Once priority services were tested, the open question is the services outside that list.
  if (interference.scope !== 'selected-target-or-test') unknowns.push(services?.tested ? 'other-services' : 'affected-services');
  if (quality.coverage === 'none') unknowns.push('connection-quality');
  if (attribution.state === 'unknown') unknowns.push('cause-and-intent');
  return unique(unknowns);
}

// Plain-language headline for the first screen. Priority: a broad outage outranks blocked
// services, which outrank unconfirmed service problems and generic connectivity events.
function buildHeadline({ connectivity, interference, shutdown, services }) {
  if (shutdown.state === 'nationwide-shutdown-established') return { state: 'shutdown', services: [] };
  // An outage that ended inside the period is not the situation at its end. What stayed
  // blocked afterwards is: a restored connection is not open access.
  const nationwide = (connectivity.outagePeriods ?? []).filter((period) => period.scope === 'nationwide');
  if (connectivity.severity === 'widespread' && nationwide.length && nationwide.every((period) => period.endedInWindow)) {
    return { state: 'outage-ended', services: services?.blocked ?? [], endedOn: nationwide.at(-1).end };
  }
  if (['widespread', 'severe'].includes(connectivity.severity)) return { state: 'major-outage', services: services?.blocked ?? [] };
  if (services?.blocked.length) return { state: 'services-blocked', services: services.blocked };
  if (services?.restricted.length) return { state: 'services-restricted', services: services.restricted };
  if (services?.independentBlocked?.length) return { state: 'services-blocked-independent', services: services.independentBlocked };
  // An explicit target/test selection is a question; answer it even when nothing was measured.
  if (services?.scoped && services.state === 'no-problems-detected') return { state: 'services-reachable', services: services.reachable };
  if (services?.scoped && services.state === 'untested') return { state: 'services-untested', services: services.visible.map((item) => item.id) };
  if (services?.scoped && services.state === 'unavailable') return { state: 'services-unavailable', services: [] };
  // Every popular service reachable is the answer, even when other tested sites had problems;
  // those follow in the lede instead of turning the headline into "signs of blocking".
  if (!services?.scoped && services?.state === 'no-problems-detected' && services.reachable?.length) {
    return { state: 'services-reachable', services: services.reachable };
  }
  // Without any service result, a minor connectivity signal must not become the headline; the
  // reader is told that the test results are missing, the signal stays in the status row.
  if (services?.state === 'unavailable') return { state: 'services-unavailable', services: [] };
  // Selected tests that the service tiles do not cover (Tor, Psiphon, DNS…) still get an answer.
  if (interference?.state === 'blocking-confirmed-in-measurements') return { state: 'interference-confirmed', services: [] };
  if (interference?.state === 'interference-signals') return { state: 'interference-signals', services: [] };
  if (connectivity.state === 'disruption-signals') return { state: 'connectivity-signals', services: [] };
  if (services?.state === 'no-problems-detected' && connectivity.state === 'no-disruption-events-detected') return { state: 'no-problems-detected', services: [] };
  return { state: 'limited-evidence', services: [] };
}

function buildSummary({ connectivity, interference, routing, shutdown }) {
  let state = 'limited-evidence';
  if (shutdown.state === 'nationwide-shutdown-established') state = 'nationwide-shutdown-established';
  else if (connectivity.state === 'disruption-signals' && ['interference-signals', 'blocking-confirmed-in-measurements'].includes(interference.state)) state = 'access-and-connectivity-signals';
  else if (connectivity.state === 'disruption-signals') state = 'connectivity-signals';
  else if (['interference-signals', 'blocking-confirmed-in-measurements'].includes(interference.state)) state = 'access-signals';
  else if (connectivity.severity === 'none' && interference.severity === 'none') state = 'no-disruption-detected';
  return {
    state,
    evidenceMode: 'per-finding',
    shutdownState: shutdown.state,
    routingState: routing.state,
  };
}

export function buildInterpretation({ ooni, ripe, radar, radarQuality, ioda, tor = null, ripestat, censoredPlanet, mlab, pulse, ooniDomains, countryOoniDomains = null, circumvention, ooniSamples, ooniNetworks, outageTraffic = null, networkOutageTraffic = null, outageAnatomy = null, encryptedDns = null, conduit = null, serviceNetworks = null, previousOoniDomains = null, activeChecks = null, vpnUse = null, countryCircumvention = null, selection = {}, scopeLabel = null }) {
  const connectivity = buildConnectivity({ ioda, radar, selection });
  // Context for the reader, never a vote: it cannot change state, severity or confidence.
  const charted = connectivity.outagePeriods.filter((period) => period.scope === 'nationwide').at(-1) ?? null;
  const trafficView = (traffic) => (charted && traffic?.ok && traffic.status === 'observed' && traffic.start === charted.start ? {
    start: traffic.start,
    end: traffic.end ?? null,
    baselineDays: traffic.baselineDays,
    outageDays: traffic.outageDays,
    lowestPercent: traffic.lowestPercent,
    typicalPercent: traffic.typicalPercent,
    afterPercent: traffic.afterPercent,
    series: traffic.series,
  } : null);
  connectivity.outageTraffic = trafficView(outageTraffic);
  // The selected network's own traffic, only for that network and only next to the country.
  const networkTraffic = connectivity.outageTraffic && selection?.asn && networkOutageTraffic?.asn === selection.asn
    ? trafficView(networkOutageTraffic) : null;
  if (connectivity.outageTraffic) connectivity.outageTraffic.network = networkTraffic ? { asn: selection.asn, ...networkTraffic } : null;
  // The same outage hour by hour; routing and reachability describe the networks, not access.
  connectivity.outageAnatomy = charted && outageAnatomy?.ok && outageAnatomy.status === 'observed' && outageAnatomy.start === charted.start ? {
    start: outageAnatomy.start,
    end: outageAnatomy.end ?? null,
    onset: outageAnatomy.onset ?? [],
    restoration: outageAnatomy.restoration ?? [],
    networks: outageAnatomy.networks ?? null,
  } : null;
  // Iran-wide results only stand in when foreign networks were actually filtered out of them.
  // During a nationwide outage the only tests that reach OONI come from the few networks that
  // still have access; their results do not stand for Iran and are not used in its place.
  const nationwideOutage = (connectivity.outagePeriods ?? []).some((period) => period.scope === 'nationwide');
  const countryFiltered = !nationwideOutage && countryOoniDomains?.ok && countryOoniDomains.foreignExclusion?.checked === true ? countryOoniDomains : null;
  const services = ooniDomains || circumvention ? summarizeServiceBrands(ooniDomains ?? null, circumvention ?? null, selection, countryFiltered) : null;
  // Service results from a failed source stay visible as the last known state, dated.
  const staleSince = [ooniDomains, circumvention].filter((source) => source?.stale)
    .map((source) => source.staleSince).sort().at(-1) ?? null;
  if (services && staleSince) services.stale = { since: staleSince };
  // "No data" alone hides that OONI is only limiting requests for a minute.
  if (services && [ooniDomains, circumvention].some((source) => /rate limit/i.test(String(source?.error ?? '')))) services.rateLimited = true;
  // A failed Iran-wide check must not look like "no tests anywhere".
  if (services && selection.asn && countryOoniDomains && !countryFiltered) services.countryCheck = nationwideOutage ? 'outage' : 'unavailable';
  // What changed against the period before, for the whole selection; a stale answer is history,
  // not a period to compare with.
  if (services && !services.scoped && previousOoniDomains?.ok && previousOoniDomains.status !== 'stale' && ooniDomains?.status !== 'stale') {
    const changes = previousOoniDomains.outageOverlap ? { compared: 0, worse: [], better: [], outageOverlap: true }
      : compareServicePeriods(previousOoniDomains, ooniDomains);
    if (changes) services.changes = { ...changes, previous: previousOoniDomains.period ?? null };
  }
  // Independent checks stand next to OONI's result per service, never inside its counts.
  if (services && activeChecks?.length) {
    const independent = summarizeIndependentChecks(activeChecks);
    for (const item of services.items) if (independent[item.id]) item.independent = independent[item.id];
    services.independentSources = [...new Set(Object.values(independent).flatMap((entry) => entry.sources))].sort();
    // Where OONI has no answer for a service, the independent check answers instead, labelled.
    services.independentBlocked = services.visible
      .filter((item) => ['untested', 'unclear', 'unavailable'].includes(item.status) && item.country?.status !== 'blocked' && item.independent?.status === 'blocked')
      .map((item) => item.id);
  }
  // How many users in Iran go through Cloudflare's WARP VPN (APNIC), next to the circumvention
  // tools: whether this way around the filter works, and since when. Country-wide context.
  if (services && vpnUse?.ok && vpnUse.current) {
    services.vpnUse = { current: vpnUse.current, yearAgo: vpnUse.yearAgo ?? null, lowest: vpnUse.lowest ?? null, months: vpnUse.months ?? [], sourceUrl: vpnUse.sourceUrl };
  }
  // Which ways around the filter work: OONI's tests of Tor, Snowflake, Psiphon, Riseup VPN and
  // STUN, with the Iran-wide result where the selected network tested a method too rarely.
  // Context for the ways around the filter: encrypted DNS from inside Iran (OONI dnscheck sample)
  // and Tor use from Iran (Tor Metrics). Usage figures describe use, never a block.
  if (services && !services.scoped) {
    // The last sample for the same period stands in, dated, when OONI does not answer now.
    if (encryptedDns?.ok && (encryptedDns.status === 'observed' || (encryptedDns.status === 'stale' && encryptedDns.byName))) {
      services.encryptedDns = { sampled: encryptedDns.sampled, networks: encryptedDns.networks, byName: encryptedDns.byName, byAddress: encryptedDns.byAddress, staleSince: encryptedDns.status === 'stale' ? encryptedDns.staleSince ?? null : null };
    }
    const relay = tor?.relay?.latestUsers ?? null;
    const bridge = tor?.bridge?.latestUsers ?? null;
    // Bridge types people in Iran use (Tor Metrics, mid of its range): people use what works.
    const transports = (tor?.transports ?? []).filter((item) => item.focusTransport && Array.isArray(item.rows) && item.rows.length)
      .map((item) => {
        const rows = [...item.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const mid = (row) => ((Number(row.low) || 0) + (Number(row.high) || 0)) / 2;
        return { transport: String(item.transport).toLowerCase(), users: Math.round(mid(rows.at(-1))), first: Math.round(mid(rows[0])), date: rows.at(-1).date };
      })
      .filter((item) => item.users > 0)
      .sort((a, b) => b.users - a.users);
    if (tor?.ok && (relay || bridge)) services.torUse = { direct: relay, bridges: bridge, date: tor.relay?.latestDate ?? tor.bridge?.latestDate ?? null, transports };
    if (conduit?.ok && conduit.latest && (conduit.status === 'observed' || conduit.status === 'stale')) {
      services.conduit = { latest: conduit.latest, series: conduit.series ?? [], stationsInIran: conduit.stationsInIran ?? null, staleSince: conduit.status === 'stale' ? conduit.staleSince ?? null : null };
    }
  }
  if (services && !services.scoped) {
    const workarounds = summarizeWorkarounds(circumvention, selection.asn ? (nationwideOutage ? null : countryCircumvention) : null);
    if (workarounds) services.workarounds = workarounds;
  }
  // Iran-wide results in an outage come only from the networks that stayed connected.
  if (services && !selection.asn && nationwideOutage) services.survivorsOnly = true;
  // Further services in groups, for the whole selection only; a single selected service or test
  // is its own question.
  if (services && !services.scoped) services.more = summarizeMoreServices(ooniDomains, selection.asn ? countryFiltered : null, circumvention);
  // How many independent measurement runs stand behind the claim. OONI publishes no probe
  // identity, so runs and days are the honest coverage units, and the sample is bounded.
  if (services && Array.isArray(ooniSamples) && ooniSamples.length) {
    const byDomain = new Map(ooniSamples.filter((sample) => sample?.ok).map((sample) => [sample.domain, sample]));
    for (const item of services.items) {
      const sample = item.web?.domain ? byDomain.get(item.web.domain) : null;
      if (sample) item.web.sample = {
        runs: sample.runs, observedDays: sample.observedDays, sampled: sample.sampled, bounded: sample.bounded,
        affected: sample.affected, mechanisms: sample.mechanisms, dominantMechanism: sample.dominantMechanism,
      };
    }
    services.vantage = services.visible[0]?.web?.sample ?? null;
  }
  // The same finding in many networks is a country-wide pattern; in one network it is not.
  // This is scope evidence for the reader, not an extra source that raises severity.
  if (services && ooniNetworks?.ok && ooniNetworks.measured > 0) {
    const item = services.items.find((entry) => entry.web?.domain === ooniNetworks.domain) ?? null;
    services.networkScope = { ...ooniNetworks, serviceId: item?.id ?? null };
  }
  // Named networks per service: where it was blocked, partly blocked or reachable. Context for
  // the reader; it never changes a claim about the selected network.
  if (services && serviceNetworks && !serviceNetworks.ok) {
    services.networkBreakdownMissing = /rate limit/i.test(String(serviceNetworks.error ?? '')) ? 'rate-limited' : 'unavailable';
  }
  if (services && serviceNetworks?.ok) {
    services.networkBreakdown = {
      staleSince: serviceNetworks.status === 'stale' ? serviceNetworks.staleSince ?? null : null,
      items: serviceNetworks.breakdown, access: serviceNetworks.access ?? [], accessByGroup: serviceNetworks.accessByGroup ?? null, names: serviceNetworks.names ?? {},
      types: serviceNetworks.types ?? {}, coverage: serviceNetworks.coverage ?? null, excludedMeasurements: serviceNetworks.excludedMeasurements ?? 0,
    };
  }
  const interference = buildInterference({ ooni, censoredPlanet, selection, services });
  const routing = buildRouting({ ripestat, selection });
  const quality = buildQuality({ ripe, mlab, radarQuality });
  const shutdown = buildShutdown({ connectivity, pulse, ioda, radar });
  const attribution = buildAttribution({ shutdown, pulse });
  const dimensions = { connectivity, interference, routing, quality, shutdown };
  const summary = buildSummary({ connectivity, interference, routing, shutdown });
  summary.headline = buildHeadline({ connectivity, interference, shutdown, services });
  summary.latestObservation = services?.latestObserved ?? ooni?.points?.at(-1)?.date ?? null;
  // OONI measurements filed under Iran from networks registered abroad were left out; the
  // reader is told how many, so the figures shown can be read for what they are.
  const exclusions = [ooni, ooniDomains, countryOoniDomains].map((source) => source?.foreignExclusion).filter((item) => item?.excludedMeasurements > 0);
  // Country figures that could not be filtered may include foreign networks; the reader is told.
  summary.foreignUnchecked = [ooni, ooniDomains].some((source) => source?.ok && source.foreignExclusion?.checked === false);
  summary.foreignExcluded = exclusions.length ? {
    measurements: Math.max(...exclusions.map((item) => item.excludedMeasurements)),
    networks: [...new Set(exclusions.flatMap((item) => item.networks))],
  } : null;
  return {
    schemaVersion: 1,
    scope: scopeLabel,
    selection: {
      asn: selection.asn || null,
      since: selection.since || null,
      until: selection.until || null,
      testName: selection.testName || null,
      target: selection.target || null,
    },
    summary,
    dimensions,
    services,
    attribution,
    findings: buildFindings({ connectivity, interference, routing, quality, shutdown }),
    unknowns: buildUnknowns({ connectivity, interference, quality, shutdown, attribution, services }),
    invariants: {
      globalScore: false,
      severityRaisesFromSourceCount: false,
      missingDataMeansNormal: false,
      connectivityProvesCensorship: false,
      bgpVisibilityProvesReachability: false,
    },
  };
}
