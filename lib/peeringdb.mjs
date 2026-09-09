import { asRecord, fetchJson, normalizeAsn, parseNumber } from './common.mjs';

export function buildPeeringDbUrl(asn) {
  const normalized = normalizeAsn(asn);
  if (!normalized) throw new Error('PeeringDB topology requires a selected ASN.');
  const number = normalized.slice(2);
  return `https://www.peeringdb.com/api/net?asn=${encodeURIComponent(number)}&depth=1`;
}

export function parsePeeringDb(payload) {
  const data = Array.isArray(asRecord(payload)?.data) ? payload.data : [];
  return data.map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      id: parseNumber(row.id),
      asn: parseNumber(row.asn),
      name: row.name ?? null,
      aka: row.aka ?? null,
      website: row.website ?? null,
      infoType: row.info_type ?? null,
      infoTypes: Array.isArray(row.info_types) ? row.info_types : [],
      ipv4Prefixes: parseNumber(row.info_prefixes4),
      ipv6Prefixes: parseNumber(row.info_prefixes6),
      traffic: row.info_traffic ?? null,
      scope: row.info_scope ?? null,
      ipv6: typeof row.info_ipv6 === 'boolean' ? row.info_ipv6 : null,
      ixCount: parseNumber(row.ix_count),
      facilityCount: parseNumber(row.fac_count),
      networkToIxIds: Array.isArray(row.netixlan_set) ? row.netixlan_set : [],
      networkToFacilityIds: Array.isArray(row.netfac_set) ? row.netfac_set : [],
      updated: row.updated ?? null,
    };
  });
}

export async function getPeeringDbTopology({ asn }) {
  const sourceUrl = buildPeeringDbUrl(asn);
  const payload = await fetchJson(sourceUrl, { cacheTtlMs: 6 * 60 * 60 * 1000 });
  const networks = parsePeeringDb(payload);
  return {
    ok: true,
    source: 'PeeringDB',
    status: networks.length ? 'observed' : 'no_data',
    asn: normalizeAsn(asn),
    networks,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    note: 'PeeringDB is operator-maintained topology context. Exchange/facility presence and network metadata do not by themselves measure censorship or live reachability.',
  };
}
