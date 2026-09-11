import { mean, weightedAverage } from './common.mjs';
import { buildSituationSummary } from './situation-summary.mjs';
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

function summarizeChannel(signals, dimension) {
  const usable = signals.filter((signal) => signal.dimension === dimension && signal.usableForAssessment !== false);
  const availableSources = [...new Set(usable.map((signal) => signal.source))];
  const elevatedCount = usable.filter((signal) => signal.elevated).length;
  const strongCount = usable.filter((signal) => signal.strong).length;
  let status = 'insufficient-data';
  if (availableSources.length) status = 'observed';
  if (elevatedCount === 1) status = 'elevated';
  if (elevatedCount >= 2) status = 'corroborated';
  if (strongCount >= 2) status = 'strongly-corroborated';
  return { status, availableSources, sourceCount: availableSources.length, elevatedCount, strongCount };
}

export function buildControlDataPlaneAssessment({ ripestat, ripe, radar, ioda }) {
  const bgpVisibility = ripestat?.routing?.visibility?.percent ?? null;
  const ripeUsable = ripeUsableForAssessment(ripe);
  const ripeLoss = ripeUsable
    ? ripe?.overall?.packetLossPercent ?? mean(lastRows(ripe?.series ?? [], 2).map((row) => row.packetLossPercent))
    : null;
  const iodaEvents = ioda?.events?.length ?? 0;
  const radarOutageEvents = radar?.outages?.status === 'observed' ? radar.outages?.annotations?.length ?? 0 : 0;
  const radarAnomalyEvents = radar?.trafficAnomalies?.status === 'observed' ? radar.trafficAnomalies?.events?.length ?? 0 : 0;
  const radarEvents = radarOutageEvents + radarAnomalyEvents;
  const controlPlaneHealthy = bgpVisibility !== null && bgpVisibility >= 80;
  const dataPlaneSevere = (ripeLoss !== null && ripeLoss >= 40) || iodaEvents > 0 || radarEvents > 0;
  const observed = bgpVisibility !== null || ripeLoss !== null || iodaEvents > 0 || radarEvents > 0;
  let classification = 'insufficient-data';
  let severity = 'neutral';
  if (observed) classification = 'no-divergence-established';
  if (controlPlaneHealthy && dataPlaneSevere) {
    classification = 'control-data-plane-divergence';
    severity = 'warning';
  }
  return {
    classification,
    severity,
    controlPlaneHealthy,
    dataPlaneSevere,
    bgpVisibilityPercent: bgpVisibility,
    ripePacketLossPercent: ripeLoss,
    ripeUsableForAssessment: ripeUsable,
    iodaOutageEvents: iodaEvents,
    radarDisruptionEvents: radarEvents,
    interpretation: classification === 'control-data-plane-divergence'
      ? 'BGP control-plane visibility remains high while independent data-plane disruption signals are present. This pattern is compatible with selective isolation, filtering, throttling, or whitelisting, but does not identify the mechanism or intent by itself.'
      : 'No strong control-plane/data-plane divergence is established for the selected scope from the available measurements.',
  };
}

export function buildAssessment({
  ooni,
  ripe,
  radar,
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
  scopeLabel,
}) {
  const signals = [];

  if (ooni?.ok && ooni.totalMeasurements > 0) {
    const recent = lastRows(ooni.points, 2);
    const recentRate = weightedAverage(recent, 'anomalyRate', 'measurements');
    const sample = recent.reduce((sum, row) => sum + (row.measurements || 0), 0);
    const rateUsable = !ooni.truncatedAtApiLimit;
    const elevated = rateUsable && sample >= 10 && recentRate !== null && recentRate >= 25;
    const strong = rateUsable && sample >= 20 && recentRate !== null && recentRate >= 60;
    signals.push({
      source: 'OONI',
      dimension: 'interference',
      elevated,
      strong,
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
    signals.push({
      source: 'Censored Planet',
      dimension: 'interference',
      elevated: eventCount > 0,
      strong: false,
      value: eventCount,
      unit: 'CenAlert events',
      sample: censoredPlanet?.timeseries?.length ?? 0,
      usableForAssessment: true,
      note: 'Censored Planet remote measurements complement OONI. CenAlert events are interference signals for corroboration; they do not establish censorship intent or mechanism by themselves.',
    });
  }

  if (ripe?.ok && ripe.overall?.samples > 0) {
    const ripeUsable = ripeUsableForAssessment(ripe);
    const recent = lastRows(ripe.series, 2);
    const loss = mean(recent.map((row) => row.packetLossPercent));
    const sample = recent.reduce((sum, row) => sum + (row.samples || 0), 0);
    const elevated = ripeUsable && sample >= 5 && loss !== null && loss >= 20;
    const strong = ripeUsable && sample >= 10 && loss !== null && loss >= 40;
    signals.push({
      source: 'RIPE Atlas',
      dimension: 'connectivity',
      elevated,
      strong,
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
    const elevated = radarUsable && (outageCount > 0 || anomalyCount > 0);
    const strong = radarUsable && outageCount > 0 && anomalyCount > 0;
    signals.push({
      source: 'Cloudflare Radar',
      dimension: 'connectivity',
      elevated,
      strong,
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
    const eventDatasources = new Set((ioda.events ?? []).map((event) => event.datasource).filter(Boolean));
    const elevated = eventCount > 0;
    const strong = eventDatasources.size >= 2;
    signals.push({
      source: 'IODA',
      dimension: 'connectivity',
      elevated,
      strong,
      value: eventCount,
      unit: 'outage events',
      sample: ioda.series?.reduce((sum, row) => sum + (row.sampleCount || 0), 0) ?? 0,
      usableForAssessment: true,
      note: 'IODA combines routing, active-probing, telescope and related connectivity signals. Its outage events indicate disruption signals, not political intent.',
    });
  }

  const usableSignals = signals.filter((signal) => signal.usableForAssessment !== false);
  const availableSources = [...new Set(usableSignals.map((signal) => signal.source))];
  const elevatedCount = usableSignals.filter((signal) => signal.elevated).length;
  const strongCount = usableSignals.filter((signal) => signal.strong).length;
  let status = 'insufficient-data';
  let label = 'Insufficient corroboration';
  let severity = 'neutral';

  if (availableSources.length >= 1) {
    status = 'observed';
    label = 'No corroborated major disruption signal';
    severity = 'ok';
  }
  if (elevatedCount === 1) {
    status = 'elevated';
    label = 'Elevated signal in one source';
    severity = 'warning';
  }
  if (elevatedCount >= 2) {
    status = 'corroborated';
    label = 'Corroborated disruption signals';
    severity = 'critical';
  }
  if (strongCount >= 2) {
    status = 'strongly-corroborated';
    label = 'Strong, multi-source disruption signals';
    severity = 'critical';
  }

  const confidence = availableSources.length >= 3 ? 'high' : availableSources.length === 2 ? 'medium' : availableSources.length === 1 ? 'low' : 'none';
  const controlDataPlane = buildControlDataPlaneAssessment({ ripestat, ripe, radar, ioda });
  const channels = {
    interference: summarizeChannel(signals, 'interference'),
    connectivity: summarizeChannel(signals, 'connectivity'),
  };
  const sourceHealth = buildSourceHealth({ ooni, ripe, ioda, tor, mlab, apnic, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki });
  const assessment = {
    scope: scopeLabel,
    status,
    label,
    severity,
    confidence,
    availableSources,
    signals,
    channels,
    sourceHealth,
    controlDataPlane,
    methodologicalBoundary: 'Overall disruption status combines independent interference and connectivity measurements. Only the interference channel addresses censorship/interference evidence; connectivity degradation alone does not establish censorship intent, mechanism or attribution.',
  };
  return { ...assessment, publicSummary: buildSituationSummary(assessment) };
}
