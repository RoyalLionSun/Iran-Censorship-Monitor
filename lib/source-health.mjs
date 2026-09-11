export const PUBLIC_SOURCE_CONTRACT = Object.freeze([
  { id: 'ooni', name: 'OONI' },
  { id: 'ripe', name: 'RIPE Atlas' },
  { id: 'ioda', name: 'IODA' },
  { id: 'tor', name: 'Tor Metrics' },
  { id: 'mlab', name: 'M-Lab NDT' },
  { id: 'apnic', name: 'APNIC Labs IPv6' },
  { id: 'ripestat', name: 'RIPEstat / RIPE RIS' },
  { id: 'globalping', name: 'Globalping passive inventory' },
  { id: 'censoredPlanet', name: 'Censored Planet' },
  { id: 'peeringdb', name: 'PeeringDB' },
  { id: 'ihr', name: 'Internet Health Report' },
  { id: 'asrank', name: 'CAIDA ASRank' },
  { id: 'rpki', name: 'RIPEstat RPKI' },
]);

function normalizedStatus(payload, id) {
  if (!payload || payload.ok !== true) return 'error';
  const status = String(payload.status || '').trim().toLowerCase();
  if (status === 'error') return 'error';
  if (status === 'scope_required') return 'scope_required';
  if (status === 'partial' || status === 'limited_coverage') return 'partial';
  if (status === 'no_data') return 'no_data';
  if (status === 'observed') return 'observed';
  if (id === 'ooni') return Number(payload.totalMeasurements || 0) > 0 ? 'observed' : 'no_data';
  return 'healthy';
}

function classifyFamily(definition, payload) {
  const state = normalizedStatus(payload, definition.id);
  const queried = state !== 'scope_required';
  const reachable = queried && state !== 'error';
  const hasData = state === 'observed' || state === 'partial';
  return {
    id: definition.id,
    name: definition.name,
    state,
    queried,
    reachable,
    hasData,
    upstreamStatus: payload?.status ?? (definition.id === 'ooni' && payload?.ok === true ? state : null),
    error: state === 'error' ? String(payload?.error || 'source adapter failed') : null,
  };
}

export function buildSourceHealth(payloads = {}) {
  const families = PUBLIC_SOURCE_CONTRACT.map((definition) => classifyFamily(definition, payloads[definition.id]));
  const summary = {
    totalContract: families.length,
    queried: families.filter((row) => row.queried).length,
    reachable: families.filter((row) => row.reachable).length,
    dataAvailable: families.filter((row) => row.hasData).length,
    observed: families.filter((row) => row.state === 'observed').length,
    partial: families.filter((row) => row.state === 'partial').length,
    noData: families.filter((row) => row.state === 'no_data').length,
    scopeRequired: families.filter((row) => row.state === 'scope_required').length,
    errors: families.filter((row) => row.state === 'error').length,
  };
  return {
    contractVersion: 1,
    summary,
    families,
    interpretation: 'Adapter reachability is separate from measurement availability. no_data, partial/limited coverage and scope_required are not upstream reachability failures.',
  };
}
