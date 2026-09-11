const STATUS_DEFINITIONS = Object.freeze({
  'insufficient-data': {
    state: 'insufficient-data',
    severity: 'neutral',
    headlineKey: 'situation.headline.insufficient',
    meaningKey: 'situation.meaning.insufficient',
    caveatKey: 'situation.caveat.insufficient',
  },
  limited: {
    state: 'limited-measurement-evidence',
    severity: 'neutral',
    headlineKey: 'situation.headline.limited',
    meaningKey: 'situation.meaning.limited',
    caveatKey: 'situation.caveat.insufficient',
  },
  observed: {
    state: 'no-major-disruption-detected',
    severity: 'ok',
    headlineKey: 'situation.headline.observed',
    meaningKey: 'situation.meaning.observed',
    caveatKey: 'situation.caveat.observed',
  },
  elevated: {
    state: 'possible-disruption',
    severity: 'warning',
    headlineKey: 'situation.headline.elevated',
    meaningKey: 'situation.meaning.elevated',
    caveatKey: 'situation.caveat.elevated',
  },
  corroborated: {
    state: 'significant-disruption-signals',
    severity: 'critical',
    headlineKey: 'situation.headline.corroborated',
    meaningKey: 'situation.meaning.corroborated',
    caveatKey: 'situation.caveat.corroborated',
  },
  'strongly-corroborated': {
    state: 'strong-multisource-disruption-signals',
    severity: 'critical',
    headlineKey: 'situation.headline.strong',
    meaningKey: 'situation.meaning.strong',
    caveatKey: 'situation.caveat.strong',
  },
});

function driverState(signal) {
  if (signal?.strong) return 'strong';
  if (signal?.elevated) return 'elevated';
  if (signal?.usableForAssessment === false) return 'excluded';
  return 'not-elevated';
}

function channelSummary(channel = {}) {
  return {
    status: channel.status || 'insufficient-data',
    sourceCount: Number(channel.sourceCount || 0),
    availableSources: Array.isArray(channel.availableSources) ? channel.availableSources : [],
  };
}

export function buildSituationSummary(assessment = {}) {
  const sourceHealth = assessment.sourceHealth?.summary || null;
  const hasReachableAdapters = Number(sourceHealth?.reachable || 0) > 0;
  const definitionKey = assessment.status === 'insufficient-data' && hasReachableAdapters ? 'limited' : assessment.status;
  const definition = STATUS_DEFINITIONS[definitionKey] || STATUS_DEFINITIONS['insufficient-data'];
  const signals = Array.isArray(assessment.signals) ? assessment.signals : [];
  const availableSources = Array.isArray(assessment.availableSources) ? assessment.availableSources : [];
  const drivers = signals
    .filter((signal) => signal?.usableForAssessment !== false && (signal?.strong || signal?.elevated))
    .slice(0, 4)
    .map((signal) => ({
      source: signal.source || 'Unknown source',
      dimension: signal.dimension || 'unspecified',
      state: driverState(signal),
      value: signal.value ?? null,
      unit: signal.unit || '',
      sample: Number.isFinite(Number(signal.sample)) ? Number(signal.sample) : 0,
    }));
  const divergence = assessment.controlDataPlane?.classification === 'control-data-plane-divergence';

  return {
    state: definition.state,
    severity: definition.severity,
    headlineKey: definition.headlineKey,
    meaningKey: definition.meaningKey,
    caveatKey: definition.caveatKey,
    confidence: assessment.confidence || 'none',
    scope: assessment.scope || null,
    sourceCount: availableSources.length,
    channels: {
      interference: channelSummary(assessment.channels?.interference),
      connectivity: channelSummary(assessment.channels?.connectivity),
    },
    sourceHealth: sourceHealth ? {
      totalContract: Number(sourceHealth.totalContract || 0),
      queried: Number(sourceHealth.queried || 0),
      reachable: Number(sourceHealth.reachable || 0),
      dataAvailable: Number(sourceHealth.dataAvailable || 0),
      scopeRequired: Number(sourceHealth.scopeRequired || 0),
      errors: Number(sourceHealth.errors || 0),
    } : null,
    drivers,
    controlDataPlane: {
      classification: assessment.controlDataPlane?.classification || 'insufficient-data',
      messageKey: divergence ? 'situation.controlDataPlane.divergence' : 'situation.controlDataPlane.noDivergence',
    },
    completeShutdownVerdict: 'not-established',
    nationwideImpactVerdict: 'not-established',
  };
}
