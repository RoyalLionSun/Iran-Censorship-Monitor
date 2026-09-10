import { createHash } from 'node:crypto';
import { normalizeAsn } from './common.mjs';

const IPVERSE_AS_METADATA_URL = 'https://raw.githubusercontent.com/ipverse/as-metadata/master/as.json';
const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;
const TRANSIT_ROLES = new Set(['tier1_transit', 'major_transit', 'midsize_transit']);
const STRATEGIC_CATEGORIES = new Set(['hosting', 'government_admin']);
const CLASS_RANK = new Map([
  ['transit_core_review', 0],
  ['access_review', 1],
  ['strategic_service_review', 2],
  ['topology_observed_review', 3],
  ['long_tail_review', 4],
  ['curated', 5],
]);

function asnNumber(asn) {
  return Number(String(asn).replace(/^AS/i, ''));
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isoDateOrNull(value, label) {
  const text = stringOrNull(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`ipverse returned invalid ${label}: ${value}`);
  const time = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== text) throw new Error(`ipverse returned invalid ${label}: ${value}`);
  return text;
}

function nonNegativeIntegerOrZero(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  if (typeof value === 'boolean') throw new Error(`ipverse returned invalid ${label}: ${value}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`ipverse returned invalid ${label}: ${value}`);
  return number;
}

function normalizeCountryCode(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) throw new Error(`ipverse returned invalid country code: ${value}`);
  return upper;
}

function normalizeProviderAsns(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('ipverse connectivity.providerAsns must be an array when present.');
  const result = new Set();
  for (const item of value) {
    if (item === null || item === undefined || typeof item === 'boolean' || String(item).trim() === '') throw new Error(`ipverse returned invalid provider ASN: ${item}`);
    const number = Number(item);
    if (!Number.isSafeInteger(number) || number <= 0 || number > 4_294_967_295) throw new Error(`ipverse returned invalid provider ASN: ${item}`);
    result.add(`AS${number}`);
  }
  return [...result].sort((a, b) => asnNumber(a) - asnNumber(b));
}

function normalizeRawAsn(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') throw new Error(`ipverse returned invalid ASN: ${value}`);
  const numericAsn = Number(value);
  if (!Number.isSafeInteger(numericAsn) || numericAsn <= 0 || numericAsn > 4_294_967_295) throw new Error(`ipverse returned invalid ASN: ${value}`);
  return `AS${numericAsn}`;
}

function optionalObject(value, label) {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`ipverse ${label} must be an object when present.`);
  return value;
}

function normalizeIpverseEntry(raw, normalizedAsn = normalizeRawAsn(raw?.asn)) {
  const numericAsn = asnNumber(normalizedAsn);
  if (!raw?.metadata || typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) throw new Error(`ipverse ${normalizedAsn} is missing metadata object.`);
  const metadata = raw.metadata;
  const stats = optionalObject(raw?.stats, `${normalizedAsn} stats`);
  const ipv4 = optionalObject(stats?.ipv4, `${normalizedAsn} stats.ipv4`);
  const ipv6 = optionalObject(stats?.ipv6, `${normalizedAsn} stats.ipv6`);
  const connectivity = optionalObject(stats?.connectivity, `${normalizedAsn} stats.connectivity`);

  return {
    asn: `AS${numericAsn}`,
    handle: stringOrNull(metadata.handle),
    description: stringOrNull(metadata.description),
    countryCode: normalizeCountryCode(metadata.countryCode),
    origin: stringOrNull(metadata.origin),
    category: stringOrNull(metadata.category),
    networkRole: stringOrNull(metadata.networkRole),
    registered: isoDateOrNull(metadata.registered, 'registered date'),
    metadataLastModified: isoDateOrNull(metadata.lastModified, 'metadata.lastModified'),
    lastAnnounced: isoDateOrNull(raw?.lastAnnounced, 'lastAnnounced'),
    prefixesLastModified: isoDateOrNull(stats?.prefixesLastModified, 'stats.prefixesLastModified'),
    ipv4Prefixes: nonNegativeIntegerOrZero(ipv4.prefixes, 'IPv4 prefix count'),
    ipv4PrefixesAggregated: nonNegativeIntegerOrZero(ipv4.prefixesAggregated, 'aggregated IPv4 prefix count'),
    ipv6Prefixes: nonNegativeIntegerOrZero(ipv6.prefixes, 'IPv6 prefix count'),
    ipv6PrefixesAggregated: nonNegativeIntegerOrZero(ipv6.prefixesAggregated, 'aggregated IPv6 prefix count'),
    providers: nonNegativeIntegerOrZero(connectivity.providers, 'provider count'),
    providerAsns: normalizeProviderAsns(connectivity.providerAsns),
    customers: nonNegativeIntegerOrZero(connectivity.customers, 'customer count'),
    peers: nonNegativeIntegerOrZero(connectivity.peers, 'peer count'),
    degree: nonNegativeIntegerOrZero(connectivity.degree, 'degree'),
    reach: nonNegativeIntegerOrZero(connectivity.reach, 'reach'),
  };
}

export function parseIpverseAsMetadata(payload, { asnFilter = null } = {}) {
  if (!Array.isArray(payload)) throw new Error('ipverse as-metadata payload must be an array.');
  if (asnFilter !== null && !Array.isArray(asnFilter)) throw new Error('ipverse asnFilter must be an array when provided.');
  const filter = asnFilter === null ? null : new Set(asnFilter.map((asn) => normalizeAsn(asn)));
  const seen = new Set();
  const entries = [];
  for (const raw of payload) {
    let normalizedAsn;
    try {
      normalizedAsn = normalizeRawAsn(raw?.asn);
    } catch (error) {
      if (filter) continue;
      throw error;
    }
    if (filter && !filter.has(normalizedAsn)) continue;
    const entry = normalizeIpverseEntry(raw, normalizedAsn);
    if (seen.has(entry.asn)) throw new Error(`ipverse as-metadata contains duplicate ${entry.asn}.`);
    seen.add(entry.asn);
    entries.push(entry);
  }
  return entries.sort((a, b) => asnNumber(a.asn) - asnNumber(b.asn));
}

function candidateClass(secondary, curated) {
  if (curated) return 'curated';
  if (secondary && TRANSIT_ROLES.has(secondary.networkRole)) return 'transit_core_review';
  if (secondary?.networkRole === 'access_provider' || secondary?.category === 'isp') return 'access_review';
  if (secondary?.networkRole === 'content_network' || STRATEGIC_CATEGORIES.has(secondary?.category)) return 'strategic_service_review';
  if (secondary && (
    secondary.lastAnnounced
    || secondary.ipv4Prefixes > 0
    || secondary.ipv6Prefixes > 0
    || secondary.customers > 0
    || secondary.degree > 0
    || secondary.reach > 0
  )) return 'topology_observed_review';
  return 'long_tail_review';
}

function priorityReasons(secondary, classification, secondaryCountryMismatch) {
  const reasons = [`class:${classification}`];
  if (!secondary) return [...reasons, 'secondary_metadata:missing'];
  if (secondary.networkRole) reasons.push(`network_role:${secondary.networkRole}`);
  if (secondary.category) reasons.push(`category:${secondary.category}`);
  if (secondary.lastAnnounced) reasons.push(`last_announced:${secondary.lastAnnounced}`);
  if (secondary.reach > 0) reasons.push(`reach:${secondary.reach}`);
  if (secondary.customers > 0) reasons.push(`customers:${secondary.customers}`);
  if (secondary.degree > 0) reasons.push(`degree:${secondary.degree}`);
  if (secondaryCountryMismatch) reasons.push(`secondary_country:${secondary.countryCode || 'missing'}!=IR`);
  return reasons;
}

export function enrichIranAsnInventory(inventory, curatedProfiles, secondaryEntries) {
  const inventoryAsns = Array.isArray(inventory?.asns) ? inventory.asns.map((asn) => normalizeAsn(asn)) : null;
  if (!inventoryAsns) throw new Error('Iran ASN inventory is missing asns.');
  const inventorySet = new Set(inventoryAsns);
  if (inventorySet.size !== inventoryAsns.length) throw new Error('Iran ASN inventory contains duplicate ASNs.');

  const curated = new Map();
  for (const profile of Array.isArray(curatedProfiles) ? curatedProfiles : []) {
    const asn = normalizeAsn(profile?.asn);
    if (!asn) throw new Error('Curated ASN profile is missing asn.');
    if (curated.has(asn)) throw new Error(`Curated ASN profiles contain duplicate ${asn}.`);
    curated.set(asn, profile);
  }

  const secondary = new Map();
  for (const entry of Array.isArray(secondaryEntries) ? secondaryEntries : []) {
    const asn = normalizeAsn(entry?.asn);
    if (!asn) throw new Error('Secondary ASN metadata is missing asn.');
    if (secondary.has(asn)) throw new Error(`Secondary ASN metadata contains duplicate ${asn}.`);
    secondary.set(asn, entry);
  }

  const records = inventoryAsns.map((asn) => {
    const profile = curated.get(asn) || null;
    const metadata = secondary.get(asn) || null;
    const secondaryCountryMismatch = Boolean(metadata?.countryCode && metadata.countryCode !== 'IR');
    const classification = candidateClass(metadata, Boolean(profile));
    return {
      asn,
      curated: Boolean(profile),
      displayName: profile?.name || metadata?.description || metadata?.handle || asn,
      operatorFamily: profile?.operatorFamily || null,
      candidateClass: classification,
      priorityReasons: priorityReasons(metadata, classification, secondaryCountryMismatch),
      quality: {
        secondaryMetadataMissing: !metadata,
        secondaryCountryMismatch,
        secondaryCountryCode: metadata?.countryCode || null,
        secondaryOrigin: metadata?.origin || null,
      },
      secondary: metadata,
      evidenceRole: 'scope-topology-prioritization',
      independentCensorshipVote: false,
    };
  });

  const candidateClassCounts = {};
  for (const record of records) candidateClassCounts[record.candidateClass] = (candidateClassCounts[record.candidateClass] || 0) + 1;
  const secondaryOutsideInventoryAsns = [...secondary.keys()].filter((asn) => !inventorySet.has(asn)).sort((a, b) => asnNumber(a) - asnNumber(b));

  return {
    country: 'IR',
    inventoryCount: records.length,
    curatedCount: records.filter((record) => record.curated).length,
    secondaryCoverageCount: records.filter((record) => !record.quality.secondaryMetadataMissing).length,
    secondaryMissingCount: records.filter((record) => record.quality.secondaryMetadataMissing).length,
    secondaryCountryMismatchCount: records.filter((record) => record.quality.secondaryCountryMismatch).length,
    secondaryOutsideInventoryAsns,
    candidateClassCounts,
    records,
    evidenceRole: 'scope-topology-prioritization',
    independentCensorshipVote: false,
  };
}

function compareCandidateRecords(a, b) {
  const classDelta = (CLASS_RANK.get(a.candidateClass) ?? 99) - (CLASS_RANK.get(b.candidateClass) ?? 99);
  if (classDelta !== 0) return classDelta;
  const aMeta = a.secondary || {};
  const bMeta = b.secondary || {};
  const dateDelta = String(bMeta.lastAnnounced || '').localeCompare(String(aMeta.lastAnnounced || ''));
  if (dateDelta !== 0) return dateDelta;
  for (const key of ['reach', 'customers', 'degree']) {
    const delta = Number(bMeta[key] || 0) - Number(aMeta[key] || 0);
    if (delta !== 0) return delta;
  }
  const aPrefixes = Number(aMeta.ipv4Prefixes || 0) + Number(aMeta.ipv6Prefixes || 0);
  const bPrefixes = Number(bMeta.ipv4Prefixes || 0) + Number(bMeta.ipv6Prefixes || 0);
  if (bPrefixes !== aPrefixes) return bPrefixes - aPrefixes;
  return asnNumber(a.asn) - asnNumber(b.asn);
}

export function buildIranAsnCandidateQueue(enrichment, { limit = 100 } = {}) {
  const numericLimit = Number(limit);
  if (!Number.isSafeInteger(numericLimit) || numericLimit < 1 || numericLimit > 500) throw new Error('Candidate queue limit must be an integer between 1 and 500.');
  if (!Array.isArray(enrichment?.records)) throw new Error('ASN enrichment is missing records.');
  return enrichment.records.filter((record) => !record.curated).sort(compareCandidateRecords).slice(0, numericLimit);
}

async function readTextBounded(response, maxBytes) {
  const contentLengthText = response?.headers?.get?.('content-length');
  if (contentLengthText) {
    const contentLength = Number(contentLengthText);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(`ipverse as-metadata exceeds ${maxBytes} byte safety cap.`);
  }

  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`ipverse as-metadata exceeds ${maxBytes} byte safety cap.`);
      }
      chunks.push(chunk);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(joined);
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`ipverse as-metadata exceeds ${maxBytes} byte safety cap.`);
  return text;
}

export async function getIpverseAsMetadata({ fetchImpl = fetch, timeoutMs = 90_000, maxBytes = DEFAULT_MAX_BYTES, asnFilter = null } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('ipverse maxBytes must be a positive integer.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(IPVERSE_AS_METADATA_URL, {
      headers: { accept: 'application/json', 'user-agent': 'Iran-Internet-Monitor/1.0 (+research dashboard)' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ipverse as-metadata returned HTTP ${response.status}.`);
    const text = await readTextBounded(response, maxBytes);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`ipverse as-metadata returned invalid JSON: ${error.message}`);
    }
    return {
      ok: true,
      status: 'observed',
      source: 'ipverse/as-metadata',
      sourceUrl: IPVERSE_AS_METADATA_URL,
      sourceLicense: 'CC0-1.0',
      fetchedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(text).digest('hex'),
      entries: parseIpverseAsMetadata(payload, { asnFilter }),
      evidenceRole: 'secondary-topology-enrichment',
      independentCensorshipVote: false,
      note: 'ipverse metadata is secondary enrichment only. RIR country inventory remains the scope authority; category and networkRole are prioritization hints, not censorship evidence.',
    };
  } finally {
    clearTimeout(timer);
  }
}
