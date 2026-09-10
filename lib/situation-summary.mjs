const STATUS_DEFINITIONS = Object.freeze({
  'insufficient-data': {
    state: 'insufficient-data',
    severity: 'neutral',
    headlineKey: 'situation.headline.insufficient',
    meaningKey: 'situation.meaning.insufficient',
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

export function buildSituationSummary(assessment = {}) {
  const definition = STATUS_DEFINITIONS[assessment.status] || STATUS_DEFINITIONS['insufficient-data'];
  const signals = Array.isArray(assessment.signals) ? assessment.signals : [];
  const availableSources = Array.isArray(assessment.availableSources) ? assessment.availableSources : [];
  const drivers = signals
    .filter((signal) => signal?.strong || signal?.elevated)
    .slice(0, 4)
    .map((signal) => ({
      source: signal.source || 'Unknown source',
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
    drivers,
    controlDataPlane: {
      classification: assessment.controlDataPlane?.classification || 'insufficient-data',
      messageKey: divergence ? 'situation.controlDataPlane.divergence' : 'situation.controlDataPlane.noDivergence',
    },
    completeShutdownVerdict: 'not-established',
    nationwideImpactVerdict: 'not-established',
  };
}
