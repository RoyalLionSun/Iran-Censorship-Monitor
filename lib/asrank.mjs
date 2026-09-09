import { asRecord, fetchJson, normalizeAsn, parseNumber } from './common.mjs';

const ASRANK_BASE = 'https://api.asrank.caida.org/v2/restful';

function requiredAsn(asn) {
  const normalized = normalizeAsn(asn);
  if (!normalized) throw new Error('CAIDA ASRank topology requires a selected ASN.');
  return normalized;
}

export function buildAsRankUrls(asn) {
  const normalized = requiredAsn(asn);
  const number = normalized.slice(2);
  return {
    asn: normalized,
    overview: `${ASRANK_BASE}/asns/${encodeURIComponent(number)}`,
    links: `${ASRANK_BASE}/asns/${encodeURIComponent(number)}/links?page_size=100`,
  };
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return null;
}

export function parseAsRankOverview(payload) {
  const data = asRecord(asRecord(payload)?.data);
  if (!data) return null;
  const cone = asRecord(data.cone) ?? {};
  const degree = asRecord(data.degree) ?? {};
  const org = asRecord(data.org) ?? {};
  const id = String(data.id ?? '').replace(/^AS/i, '');
  return {
    asn: /^\d+$/.test(id) ? `AS${id}` : null,
    name: typeof data.name === 'string' ? data.name : null,
    rank: parseNumber(data.rank),
    country: typeof data.country === 'string' ? data.country : null,
    countryName: typeof data.country_name === 'string' ? data.country_name : null,
    registrySource: typeof data.source === 'string' ? data.source : null,
    clique: normalizeBool(data.clique),
    organization: {
      id: typeof org.id === 'string' ? org.id : null,
      name: typeof org.name === 'string' ? org.name : null,
    },
    customerCone: {
      asns: parseNumber(cone.asns),
      prefixes: parseNumber(cone.prefixes),
      addresses: parseNumber(cone.addresses),
    },
    degree: {
      global: parseNumber(degree.globals ?? degree.global),
      peers: parseNumber(degree.peers),
      siblings: parseNumber(degree.siblings),
      customers: parseNumber(degree.customers),
      transits: parseNumber(degree.transits),
    },
  };
}

export function parseAsRankLinks(payload, limit = 50) {
  const root = asRecord(payload) ?? {};
  const rows = Array.isArray(root.data) ? root.data : [];
  const bounded = Math.max(1, Math.min(Number(limit) || 50, 100));
  return rows.map((raw) => {
    const row = asRecord(raw) ?? {};
    const asn = parseNumber(row.asn);
    return {
      asn: asn === null ? null : `AS${Math.trunc(asn)}`,
      relationship: typeof row.relationship === 'string' ? row.relationship : null,
      paths: parseNumber(row.paths),
      locations: Array.isArray(row.locations) ? row.locations.filter((value) => typeof value === 'string').slice(0, 20) : [],
    };
  }).filter((row) => row.asn).sort((a, b) => (b.paths ?? -1) - (a.paths ?? -1)).slice(0, bounded);
}

export async function getAsRankTopology({ asn }) {
  const urls = buildAsRankUrls(asn);
  const settled = await Promise.allSettled([
    fetchJson(urls.overview, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 }),
    fetchJson(urls.links, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 }),
  ]);

  const overview = settled[0].status === 'fulfilled' ? parseAsRankOverview(settled[0].value) : null;
  const links = settled[1].status === 'fulfilled' ? parseAsRankLinks(settled[1].value) : [];
  if (!overview && settled[1].status === 'rejected') {
    throw settled[0].reason instanceof Error ? settled[0].reason : new Error('CAIDA ASRank requests failed.');
  }

  return {
    ok: true,
    source: 'CAIDA ASRank',
    status: overview || links.length ? (settled.some((item) => item.status === 'rejected') ? 'partial' : 'observed') : 'no_data',
    asn: urls.asn,
    overview,
    links,
    sourceUrls: { overview: urls.overview, links: urls.links },
    partialErrors: {
      overview: settled[0].status === 'rejected' ? String(settled[0].reason?.message ?? settled[0].reason) : null,
      links: settled[1].status === 'rejected' ? String(settled[1].reason?.message ?? settled[1].reason) : null,
    },
    evidenceRole: 'topology-context',
    independentCensorshipVote: false,
    updateCadence: 'monthly',
    provenance: {
      provider: 'CAIDA ASRank',
      derivedFrom: ['CAIDA Ark active topology measurements', 'Route Views BGP data', 'RIPE NCC BGP data'],
      independenceNote: 'ASRank adds inferred macroscopic topology, but its routing inputs overlap Route Views and RIPE and therefore must not inflate routing-source independence.',
    },
    fetchedAt: new Date().toISOString(),
    note: 'ASRank rank, customer-cone and inferred relationship data describe Internet topology. They do not measure end-user reachability, censorship, traffic volume or political intent.',
  };
}
