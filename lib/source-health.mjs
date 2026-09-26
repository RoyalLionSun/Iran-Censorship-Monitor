// Every source the Overview asks for a view. `register` is the entry in the source register
// (/api/config) it belongs to, so the badge and the register count the same sources: RPKI is
// part of the RIPEstat entry. Register entries without a family here are loaded elsewhere
// (context panels, local collectors).
export const PUBLIC_SOURCE_CONTRACT = Object.freeze([
  { id: 'ooni', name: 'OONI', register: 'ooni' },
  { id: 'ripe', name: 'RIPE Atlas', register: 'ripe' },
  { id: 'radar', name: 'Cloudflare Radar', register: 'radar' },
  { id: 'ioda', name: 'IODA', register: 'ioda' },
  { id: 'tor', name: 'Tor Metrics', register: 'tor' },
  { id: 'mlab', name: 'M-Lab NDT', register: 'mlab' },
  { id: 'apnic', name: 'APNIC Labs IPv6', register: 'apnic-ipv6' },
  { id: 'ripestat', name: 'RIPEstat / RIPE RIS', register: 'ripestat' },
  { id: 'globalping', name: 'Globalping passive inventory', register: 'globalping' },
  { id: 'censoredPlanet', name: 'Censored Planet', register: 'censored-planet' },
  { id: 'peeringdb', name: 'PeeringDB', register: 'peeringdb' },
  { id: 'ihr', name: 'Internet Health Report', register: 'ihr' },
  { id: 'asrank', name: 'CAIDA ASRank', register: 'asrank' },
  { id: 'rpki', name: 'RIPEstat RPKI', register: 'ripestat' },
  { id: 'pulse', name: 'Internet Society Pulse', register: 'pulse' },
  { id: 'psiphon', name: 'Psiphon Conduit statistics', register: 'psiphon' },
]);

function normalizedStatus(payload, id) {
  if (!payload || payload.ok !== true) return 'error';
  const status = String(payload.status || '').trim().toLowerCase();
  if (status === 'error') return 'error';
  if (status === 'scope_required') return 'scope_required';
  // A source that needs an operator's token is not asked; that is no failure of the source.
  if (status === 'token_required') return 'not_configured';
  // The last good answer standing in for a failed request: the source did not answer now.
  if (status === 'stale') return 'error';
  if (status === 'partial' || status === 'limited_coverage') return 'partial';
  if (status === 'no_data') return 'no_data';
  // Still loading in the background: asked and answering, just not finished for this request.
  if (status === 'pending') return 'pending';
  if (status === 'observed') return 'observed';
  if (id === 'ooni') return Number(payload.totalMeasurements || 0) > 0 ? 'observed' : 'no_data';
  return 'healthy';
}

function classifyFamily(definition, payload) {
  const state = normalizedStatus(payload, definition.id);
  const queried = state !== 'scope_required' && state !== 'not_configured';
  const reachable = queried && state !== 'error';
  const hasData = state === 'observed' || state === 'partial';
  return {
    id: definition.id,
    name: definition.name,
    register: definition.register,
    state,
    queried,
    reachable,
    hasData,
    upstreamStatus: payload?.status ?? (definition.id === 'ooni' && payload?.ok === true ? state : null),
    error: state === 'error' ? String(payload?.error || (payload?.status === 'stale' ? `no answer now; last answer ${payload?.staleSince ?? payload?.fetchedAt ?? ''}`.trim() : 'source adapter failed')) : null,
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
    notConfigured: families.filter((row) => row.state === 'not_configured').length,
    errors: families.filter((row) => row.state === 'error').length,
  };
  // The same counts per register entry, as the reader sees them in the source register. An entry
  // made of several families (RIPEstat with RPKI) answered when one of them answered.
  const byEntry = new Map();
  for (const family of families) byEntry.set(family.register, [...(byEntry.get(family.register) ?? []), family]);
  const entries = [...byEntry].map(([id, rows]) => {
    const queried = rows.filter((row) => row.queried);
    const state = !queried.length ? (rows.some((row) => row.state === 'not_configured') ? 'not_configured' : 'scope_required')
      : queried.some((row) => row.hasData) ? 'observed'
        : queried.some((row) => row.reachable) ? (queried.some((row) => row.state === 'no_data') ? 'no_data' : 'healthy')
          : 'error';
    return { id, state, error: state === 'error' ? queried.map((row) => row.error).filter(Boolean).join('; ') : null };
  });
  const register = {
    entries,
    queried: entries.filter((row) => !['scope_required', 'not_configured'].includes(row.state)).length,
    reachable: entries.filter((row) => !['scope_required', 'not_configured', 'error'].includes(row.state)).length,
    scopeRequired: entries.filter((row) => row.state === 'scope_required').length,
    notConfigured: entries.filter((row) => row.state === 'not_configured').length,
    errors: entries.filter((row) => row.state === 'error').length,
  };
  return {
    contractVersion: 1,
    summary,
    families,
    register,
    interpretation: 'Adapter reachability is separate from measurement availability. no_data, partial/limited coverage and scope_required are not upstream reachability failures.',
  };
}
