import { mean, weightedAverage } from './common.mjs';
import { buildInterpretation, censoredPlanetInScope } from './interpretation.mjs';
import { buildSourceHealth } from './source-health.mjs';

function lastRows(rows, count = 2) {
  return Array.isArray(rows) ? rows.slice(-count) : [];
}

function ripeUsableForAssessment(ripe) {
  return Boolean(ripe?.ok && ripe?.status === 'observed' && ripe?.overall?.samples > 0);
}

function radarUsableForAssessment(radar) {
  return Boolean(radar?.assessmentEligible === true);
}

export function buildControlDataPlaneAssessment({ ripestat, ripe, radar, ioda }) {
  const bgpVisibility = ripestat?.routing?.visibility?.percent ?? null;
  const ripeUsable = ripeUsableForAssessment(ripe);
  const ripeLoss = ripeUsable
    ? ripe?.overall?.packetLossPercent ?? mean(lastRows(ripe?.series ?? [], 2).map((row) => row.packetLossPercent))
    : null;
  const iodaEvents = ioda?.events?.length ?? 0;
  const radarOutageAnnotations = radar?.outages?.status === 'observed' ? radar.outages?.annotations ?? [] : [];
  const radarOutageEvents = radarOutageAnnotations.length;
  const radarAnomalyEvents = radar?.trafficAnomalies?.status === 'observed' ? radar.trafficAnomalies?.events?.length ?? 0 : 0;
  const radarEvents = radarOutageEvents + radarAnomalyEvents;
  const timeAligned = ['aligned', 'latest'].includes(ripestat?.timeAlignment);
  const controlPlaneVisible = timeAligned && ripestat?.routing?.visibility?.seeingPeers > 0;
  const radarBroadDisruption = radarOutageAnnotations.some((event) => {
    const scope = String(event?.scope ?? event?.outageType ?? event?.eventType ?? '').toUpperCase();
    return scope.includes('NATION') || scope.includes('REGIONAL');
  });
  // IODA and generic Radar event counts are observations, not severity measures.
  // This legacy technical comparison is only raised for a broad source-native
  // Radar outage annotation. RIPE path loss remains visible as a measurement,
  // but no project-defined percentage threshold turns it into national severity.
  const broadDataPlaneDisruption = radarBroadDisruption;
  const observed = bgpVisibility !== null || ripeLoss !== null || iodaEvents > 0 || radarEvents > 0;
  let classification = 'insufficient-data';
  let severity = 'neutral';
  if (observed) classification = 'no-divergence-established';
  if (controlPlaneVisible && broadDataPlaneDisruption) {
    classification = 'control-data-plane-divergence';
    severity = 'warning';
  }
  return {
    classification,
    severity,
    controlPlaneVisible,
    broadDataPlaneDisruption,
    bgpVisibilityPercent: bgpVisibility,
    ripePacketLossPercent: ripeLoss,
    ripeUsableForAssessment: ripeUsable,
    iodaOutageEvents: iodaEvents,
    radarDisruptionEvents: radarEvents,
    timeAlignment: ripestat?.timeAlignment ?? 'not-applicable',
    interpretation: classification === 'control-data-plane-divergence'
      ? 'BGP routes remain visible to RIPE RIS peers while a broad source-native data-plane disruption annotation is present. This pattern is compatible with selective isolation, filtering, throttling, or whitelisting, but does not identify the mechanism or intent by itself.'
      : 'No broad, time-aligned control-plane/data-plane divergence is established for the selected scope from the available measurements.',
  };
}

export function buildAssessment({
  outageTraffic = null,
  serviceNetworks = null,
  previousOoniDomains = null,
  countryOoniDomains = null,
  networkOutageTraffic = null,
  ooni,
  ripe,
  radar,
  radarQuality,
  ioda,
  ripestat,
  censoredPlanet,
  tor,
  mlab,
  apnic,
  globalping,
  peeringdb,
  ihr,
  asrank,
  rpki,
  pulse,
  ooniDomains,
  circumvention,
  ooniSamples,
  ooniNetworks,
  selection = {},
  scopeLabel,
}) {
  const signals = [];

  if (ooni?.ok && ooni.totalMeasurements > 0) {
    const recent = lastRows(ooni.points, 2);
    const recentRate = weightedAverage(recent, 'anomalyRate', 'measurements');
    const sample = recent.reduce((sum, row) => sum + (row.measurements || 0), 0);
    const rateUsable = !ooni.truncatedAtApiLimit;
    signals.push({
      source: 'OONI',
      dimension: 'interference',
      elevated: false,
      strong: false,
      value: recentRate,
      unit: '% anomalies',
      sample,
      usableForAssessment: rateUsable,
      note: rateUsable
        ? 'OONI anomalies require contextual interpretation and do not by themselves prove blocking.'
        : 'OONI result hit the API row limit; anomaly-rate classification is suppressed to avoid treating a truncated sample as a complete population.',
    });
  }

  const cpHasData = Boolean(censoredPlanet?.ok && ['observed', 'partial'].includes(censoredPlanet?.status) && (
    censoredPlanet?.iranUnexpectedRate !== null && censoredPlanet?.iranUnexpectedRate !== undefined ||
    censoredPlanet?.timeseries?.length ||
    censoredPlanet?.events?.length
  ));
  if (cpHasData) {
    const eventCount = censoredPlanet?.events?.length ?? 0;
    const cpInScope = censoredPlanetInScope(selection);
    const cpUsable = censoredPlanet.status === 'observed' && cpInScope;
    signals.push({
      source: 'Censored Planet',
      dimension: 'interference',
      elevated: false,
      strong: false,
      value: eventCount,
      unit: 'CenAlert events',
      sample: censoredPlanet?.timeseries?.length ?? 0,
      usableForAssessment: cpUsable,
      note: !cpInScope
        ? 'Censored Planet measures from outside Iran towards servers inside it. A vantage point abroad cannot check what people inside Iran can reach, so it stays outside-in context and never supports or covers an access claim.'
        : cpUsable
          ? 'Censored Planet remote measurements complement OONI. CenAlert events are interference signals for corroboration; they do not establish censorship intent or mechanism by themselves.'
          : 'Censored Planet returned partial data. The observations remain visible but are excluded from automated support and confidence.',
    });
  }

  if (ripe?.ok && ripe.overall?.samples > 0) {
    const ripeUsable = ripeUsableForAssessment(ripe);
    const recent = lastRows(ripe.series, 2);
    const loss = mean(recent.map((row) => row.packetLossPercent));
    const sample = recent.reduce((sum, row) => sum + (row.samples || 0), 0);
    signals.push({
      source: 'RIPE Atlas',
      dimension: 'connectivity',
      elevated: false,
      strong: false,
      value: loss,
      unit: '% missing ping packets',
      sample,
      usableForAssessment: ripeUsable,
      note: ripeUsable
        ? 'RIPE measures paths to a specific public measurement target, not total Internet availability.'
        : 'RIPE Atlas coverage is partial or otherwise incomplete; the measurements remain visible but are excluded from automated corroboration.',
    });
  }

  if (radar?.status && radar.status !== 'token_required' && radar.status !== 'error') {
    const radarUsable = radarUsableForAssessment(radar);
    const outageCount = radar.outages?.status === 'observed' ? radar.outages?.annotations?.length ?? 0 : 0;
    const anomalyCount = radar.trafficAnomalies?.status === 'observed' ? radar.trafficAnomalies?.events?.length ?? 0 : 0;
    signals.push({
      source: 'Cloudflare Radar',
      dimension: 'connectivity',
      elevated: false,
      strong: false,
      value: outageCount + anomalyCount,
      unit: 'event signals',
      sample: outageCount + anomalyCount,
      usableForAssessment: radarUsable,
      note: radarUsable
        ? 'Radar annotations are connectivity/event indicators, not an attribution of censorship intent.'
        : 'Radar event coverage is incomplete; the source remains visible but is excluded from assessment confidence until both outage and traffic-anomaly channels return valid observed/no_data states.',
    });
  }

  if (ioda?.ok && (ioda.series?.length || ioda.events?.length)) {
    const eventCount = ioda.events?.length ?? 0;
    signals.push({
      source: 'IODA',
      dimension: 'connectivity',
      elevated: false,
      strong: false,
      value: eventCount,
      unit: 'outage events',
      sample: ioda.series?.reduce((sum, row) => sum + (row.sampleCount || 0), 0) ?? 0,
      usableForAssessment: true,
      note: 'IODA combines routing, active-probing, telescope and related connectivity signals. Its outage events indicate disruption signals, not political intent.',
    });
  }

  const controlDataPlane = buildControlDataPlaneAssessment({ ripestat, ripe, radar, ioda });
  const sourceHealth = buildSourceHealth({ ooni, ripe, ioda, tor, mlab, apnic, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki });
  const interpretation = buildInterpretation({
    ooni, ripe, radar, radarQuality, ioda, ripestat, censoredPlanet, mlab, pulse, ooniDomains, countryOoniDomains, circumvention, ooniSamples, ooniNetworks, outageTraffic, networkOutageTraffic, serviceNetworks, previousOoniDomains, selection, scopeLabel,
  });
  const dimensions = interpretation.dimensions;
  const technicalDimensions = Object.entries(dimensions).filter(([id]) => id !== 'shutdown').map(([, dimension]) => dimension);
  const availableSources = [...new Set(technicalDimensions.flatMap((dimension) => dimension.availableSources ?? []))];
  const supportingSources = [...new Set(technicalDimensions.flatMap((dimension) => dimension.supportingSources ?? []))];
  const assessment = {
    scope: scopeLabel,
    status: 'dimension-specific',
    label: 'Dimension-specific evidence assessment',
    severity: 'neutral',
    confidence: 'per-finding',
    availableSources,
    supportingSources,
    signals,
    channels: {
      interference: dimensions.interference,
      connectivity: dimensions.connectivity,
    },
    sourceHealth,
    controlDataPlane,
    interpretation,
    methodologicalBoundary: 'Severity, confidence, verification, coverage and attribution are evaluated per claim. Signals from different dimensions are not merged into proof of one common disruption or censorship cause.',
  };
  return assessment;
}
