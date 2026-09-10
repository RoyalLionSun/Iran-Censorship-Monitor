import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ASN_COVERAGE_SCHEMA_VERSION = 1;
export const ASN_COVERAGE_DEFAULT_MAX_AGE_HOURS = 168;
export const ASN_COVERAGE_MAX_CANDIDATES = 100;

const CANDIDATE_CLASSES = new Set([
  'transit_core_review',
  'access_review',
  'strategic_service_review',
  'topology_observed_review',
  'long_tail_review',
]);

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function stringValue(value, label, { nullable = false, maxLength = 512 } = {}) {
  if (value === null && nullable) return null;
  const text = String(value ?? '').trim();
  if (!text) {
    if (nullable) return null;
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (text.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters.`);
  return text;
}

function nonNegativeInteger(value, label) {
  if (typeof value === 'boolean' || value === null || value === undefined || String(value).trim() === '') throw new Error(`${label} must be a non-negative integer.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer.`);
  return number;
}

function nullableIso(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return isoTimestamp(value, label);
}

function isoTimestamp(value, label) {
  const text = stringValue(value, label, { maxLength: 64 });
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new Error(`${label} must be an ISO timestamp.`);
  return new Date(time).toISOString();
}

function falseOnly(value, label) {
  if (value !== false) throw new Error(`${label} must be false.`);
  return false;
}

function asnValue(value, label = 'candidate ASN') {
  const text = stringValue(value, label, { maxLength: 16 }).toUpperCase();
  if (!/^AS[1-9]\d{0,9}$/.test(text)) throw new Error(`${label} is invalid: ${value}`);
  const number = Number(text.slice(2));
  if (!Number.isSafeInteger(number) || number > 4_294_967_295) throw new Error(`${label} is outside the supported 32-bit range: ${value}`);
  return `AS${number}`;
}

function stringArray(value, label, { maxItems = 20, itemMaxLength = 256 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maxItems) throw new Error(`${label} exceeds ${maxItems} items.`);
  return value.map((item, index) => stringValue(item, `${label}[${index}]`, { maxLength: itemMaxLength }));
}

function normalizeCandidate(raw, index) {
  const row = objectValue(raw, `candidateQueue[${index}]`);
  const candidateClass = stringValue(row.candidateClass, `candidateQueue[${index}].candidateClass`, { maxLength: 64 });
  if (!CANDIDATE_CLASSES.has(candidateClass)) throw new Error(`candidateQueue[${index}].candidateClass is unsupported: ${candidateClass}`);
  const secondaryRaw = row.secondary === null || row.secondary === undefined ? null : objectValue(row.secondary, `candidateQueue[${index}].secondary`);
  const qualityRaw = objectValue(row.quality ?? {}, `candidateQueue[${index}].quality`);
  if (qualityRaw.secondaryMetadataMissing !== true && qualityRaw.secondaryMetadataMissing !== false) throw new Error(`candidateQueue[${index}].quality.secondaryMetadataMissing must be boolean.`);
  if (qualityRaw.secondaryCountryMismatch !== true && qualityRaw.secondaryCountryMismatch !== false) throw new Error(`candidateQueue[${index}].quality.secondaryCountryMismatch must be boolean.`);

  const secondary = secondaryRaw ? {
    handle: stringValue(secondaryRaw.handle, `candidateQueue[${index}].secondary.handle`, { nullable: true, maxLength: 128 }),
    description: stringValue(secondaryRaw.description, `candidateQueue[${index}].secondary.description`, { nullable: true, maxLength: 512 }),
    countryCode: stringValue(secondaryRaw.countryCode, `candidateQueue[${index}].secondary.countryCode`, { nullable: true, maxLength: 2 }),
    category: stringValue(secondaryRaw.category, `candidateQueue[${index}].secondary.category`, { nullable: true, maxLength: 128 }),
    networkRole: stringValue(secondaryRaw.networkRole, `candidateQueue[${index}].secondary.networkRole`, { nullable: true, maxLength: 128 }),
    lastAnnounced: nullableIso(secondaryRaw.lastAnnounced, `candidateQueue[${index}].secondary.lastAnnounced`),
    ipv4Prefixes: nonNegativeInteger(secondaryRaw.ipv4Prefixes ?? 0, `candidateQueue[${index}].secondary.ipv4Prefixes`),
    ipv6Prefixes: nonNegativeInteger(secondaryRaw.ipv6Prefixes ?? 0, `candidateQueue[${index}].secondary.ipv6Prefixes`),
    providers: nonNegativeInteger(secondaryRaw.providers ?? 0, `candidateQueue[${index}].secondary.providers`),
    customers: nonNegativeInteger(secondaryRaw.customers ?? 0, `candidateQueue[${index}].secondary.customers`),
    peers: nonNegativeInteger(secondaryRaw.peers ?? 0, `candidateQueue[${index}].secondary.peers`),
    degree: nonNegativeInteger(secondaryRaw.degree ?? 0, `candidateQueue[${index}].secondary.degree`),
    reach: nonNegativeInteger(secondaryRaw.reach ?? 0, `candidateQueue[${index}].secondary.reach`),
  } : null;

  return {
    asn: asnValue(row.asn, `candidateQueue[${index}].asn`),
    displayName: stringValue(row.displayName, `candidateQueue[${index}].displayName`, { maxLength: 512 }),
    operatorFamily: stringValue(row.operatorFamily, `candidateQueue[${index}].operatorFamily`, { nullable: true, maxLength: 128 }),
    candidateClass,
    priorityReasons: stringArray(row.priorityReasons ?? [], `candidateQueue[${index}].priorityReasons`),
    quality: {
      secondaryMetadataMissing: qualityRaw.secondaryMetadataMissing,
      secondaryCountryMismatch: qualityRaw.secondaryCountryMismatch,
      secondaryCountryCode: stringValue(qualityRaw.secondaryCountryCode, `candidateQueue[${index}].quality.secondaryCountryCode`, { nullable: true, maxLength: 2 }),
      secondaryOrigin: stringValue(qualityRaw.secondaryOrigin, `candidateQueue[${index}].quality.secondaryOrigin`, { nullable: true, maxLength: 128 }),
    },
    secondary,
    evidenceRole: 'scope-topology-prioritization',
    independentCensorshipVote: falseOnly(row.independentCensorshipVote, `candidateQueue[${index}].independentCensorshipVote`),
  };
}

function normalizeSnapshot(payload) {
  const root = objectValue(payload, 'ASN coverage snapshot');
  if (root.schemaVersion !== ASN_COVERAGE_SCHEMA_VERSION) throw new Error(`Unsupported ASN coverage snapshot schemaVersion: ${root.schemaVersion}`);
  if (String(root.country ?? '').trim().toUpperCase() !== 'IR') throw new Error('ASN coverage snapshot country must be IR.');
  falseOnly(root.independentCensorshipVote, 'ASN coverage snapshot independentCensorshipVote');
  if (root.evidenceRole !== 'scope-topology-prioritization') throw new Error('ASN coverage snapshot evidenceRole is invalid.');

  const generatedAt = isoTimestamp(root.generatedAt, 'ASN coverage snapshot generatedAt');
  const inventoryRaw = objectValue(root.inventory, 'inventory');
  const routingRaw = objectValue(root.routingSummary, 'routingSummary');
  const coverageRaw = objectValue(root.curatedCoverage, 'curatedCoverage');
  const secondaryRaw = objectValue(root.secondaryMetadata, 'secondaryMetadata');
  const enrichmentRaw = objectValue(root.enrichment, 'enrichment');

  const inventory = {
    total: nonNegativeInteger(inventoryRaw.total, 'inventory.total'),
    queryTime: nullableIso(inventoryRaw.queryTime, 'inventory.queryTime'),
    source: stringValue(inventoryRaw.source, 'inventory.source', { maxLength: 128 }),
    sourceUrl: stringValue(inventoryRaw.sourceUrl, 'inventory.sourceUrl', { maxLength: 2048 }),
    sourceBasis: stringValue(inventoryRaw.sourceBasis, 'inventory.sourceBasis', { maxLength: 128 }),
  };
  const routingSummary = {
    registeredCount: nonNegativeInteger(routingRaw.registeredCount, 'routingSummary.registeredCount'),
    routedCount: nonNegativeInteger(routingRaw.routedCount, 'routingSummary.routedCount'),
    registeredMinusRouted: Number(routingRaw.registeredMinusRouted),
    queryTime: nullableIso(routingRaw.queryTime, 'routingSummary.queryTime'),
    latestTime: nullableIso(routingRaw.latestTime, 'routingSummary.latestTime'),
    source: stringValue(routingRaw.source, 'routingSummary.source', { maxLength: 128 }),
    sourceUrl: stringValue(routingRaw.sourceUrl, 'routingSummary.sourceUrl', { maxLength: 2048 }),
    routingBasis: stringValue(routingRaw.routingBasis, 'routingSummary.routingBasis', { maxLength: 128 }),
  };
  if (!Number.isSafeInteger(routingSummary.registeredMinusRouted)) throw new Error('routingSummary.registeredMinusRouted must be an integer.');
  if (routingSummary.registeredMinusRouted !== routingSummary.registeredCount - routingSummary.routedCount) throw new Error('routingSummary.registeredMinusRouted is inconsistent with registered/routed counts.');

  const curatedCoverage = {
    inventoryCount: nonNegativeInteger(coverageRaw.inventoryCount, 'curatedCoverage.inventoryCount'),
    curatedCount: nonNegativeInteger(coverageRaw.curatedCount, 'curatedCoverage.curatedCount'),
    curatedInInventoryCount: nonNegativeInteger(coverageRaw.curatedInInventoryCount, 'curatedCoverage.curatedInInventoryCount'),
    curatedOutsideInventory: stringArray(coverageRaw.curatedOutsideInventory ?? [], 'curatedCoverage.curatedOutsideInventory', { maxItems: 100, itemMaxLength: 16 }).map((asn, index) => asnValue(asn, `curatedCoverage.curatedOutsideInventory[${index}]`)),
    uncuratedCount: nonNegativeInteger(coverageRaw.uncuratedCount, 'curatedCoverage.uncuratedCount'),
    coveragePercent: Number(coverageRaw.coveragePercent),
  };
  if (!Number.isFinite(curatedCoverage.coveragePercent) || curatedCoverage.coveragePercent < 0 || curatedCoverage.coveragePercent > 100) throw new Error('curatedCoverage.coveragePercent must be between 0 and 100.');
  if (curatedCoverage.inventoryCount !== inventory.total) throw new Error('curatedCoverage.inventoryCount must match inventory.total.');
  if (curatedCoverage.curatedInInventoryCount > curatedCoverage.curatedCount) throw new Error('curatedCoverage.curatedInInventoryCount cannot exceed curatedCount.');
  if (curatedCoverage.curatedOutsideInventory.length !== curatedCoverage.curatedCount - curatedCoverage.curatedInInventoryCount) throw new Error('curatedCoverage.curatedOutsideInventory length is inconsistent.');
  if (curatedCoverage.uncuratedCount !== inventory.total - curatedCoverage.curatedInInventoryCount) throw new Error('curatedCoverage.uncuratedCount is inconsistent.');

  const sha256 = stringValue(secondaryRaw.sha256, 'secondaryMetadata.sha256', { maxLength: 64 }).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('secondaryMetadata.sha256 must be a 64-character SHA-256 hex digest.');
  const secondaryMetadata = {
    source: stringValue(secondaryRaw.source, 'secondaryMetadata.source', { maxLength: 128 }),
    sourceUrl: stringValue(secondaryRaw.sourceUrl, 'secondaryMetadata.sourceUrl', { maxLength: 2048 }),
    sourceLicense: stringValue(secondaryRaw.sourceLicense, 'secondaryMetadata.sourceLicense', { maxLength: 64 }),
    fetchedAt: isoTimestamp(secondaryRaw.fetchedAt, 'secondaryMetadata.fetchedAt'),
    sha256,
    matchedInventoryAsnCount: nonNegativeInteger(secondaryRaw.matchedInventoryAsnCount, 'secondaryMetadata.matchedInventoryAsnCount'),
  };
  if (secondaryMetadata.matchedInventoryAsnCount > inventory.total) throw new Error('secondaryMetadata.matchedInventoryAsnCount cannot exceed inventory.total.');

  const candidateClassCounts = objectValue(enrichmentRaw.candidateClassCounts, 'enrichment.candidateClassCounts');
  const normalizedClassCounts = {};
  for (const [key, value] of Object.entries(candidateClassCounts)) {
    if (![...CANDIDATE_CLASSES, 'curated'].includes(key)) throw new Error(`enrichment.candidateClassCounts has unsupported class: ${key}`);
    normalizedClassCounts[key] = nonNegativeInteger(value, `enrichment.candidateClassCounts.${key}`);
  }
  const enrichment = {
    secondaryCoverageCount: nonNegativeInteger(enrichmentRaw.secondaryCoverageCount, 'enrichment.secondaryCoverageCount'),
    secondaryMissingCount: nonNegativeInteger(enrichmentRaw.secondaryMissingCount, 'enrichment.secondaryMissingCount'),
    secondaryCountryMismatchCount: nonNegativeInteger(enrichmentRaw.secondaryCountryMismatchCount, 'enrichment.secondaryCountryMismatchCount'),
    candidateClassCounts: normalizedClassCounts,
  };
  if (enrichment.secondaryCoverageCount !== secondaryMetadata.matchedInventoryAsnCount) throw new Error('enrichment.secondaryCoverageCount must match secondary metadata coverage.');
  if (enrichment.secondaryCoverageCount + enrichment.secondaryMissingCount !== inventory.total) throw new Error('enrichment secondary coverage/missing counts must sum to inventory.total.');
  if (enrichment.secondaryCountryMismatchCount > enrichment.secondaryCoverageCount) throw new Error('enrichment.secondaryCountryMismatchCount cannot exceed secondaryCoverageCount.');

  if (!Array.isArray(root.candidateQueue)) throw new Error('candidateQueue must be an array.');
  if (root.candidateQueue.length > ASN_COVERAGE_MAX_CANDIDATES) throw new Error(`candidateQueue exceeds ${ASN_COVERAGE_MAX_CANDIDATES} items.`);
  const candidateQueue = root.candidateQueue.map(normalizeCandidate);
  const seen = new Set();
  for (const row of candidateQueue) {
    if (seen.has(row.asn)) throw new Error(`candidateQueue contains duplicate ${row.asn}.`);
    seen.add(row.asn);
  }

  return {
    schemaVersion: ASN_COVERAGE_SCHEMA_VERSION,
    generatedAt,
    country: 'IR',
    inventory,
    routingSummary,
    curatedCoverage,
    secondaryMetadata,
    enrichment,
    candidateQueue,
    evidenceRole: 'scope-topology-prioritization',
    independentCensorshipVote: false,
  };
}

export function buildAsnCoverageSnapshot({ generatedAt = new Date().toISOString(), inventory, routingSummary, curatedCoverage, secondaryMetadata, enrichment, candidateQueue }) {
  const inventoryCount = Number(curatedCoverage?.inventoryCount ?? inventory?.total ?? 0);
  const curatedInInventoryCount = Number(curatedCoverage?.curatedInInventoryCount ?? 0);
  const coveragePercent = inventoryCount > 0 ? Math.round((curatedInInventoryCount / inventoryCount) * 10_000) / 100 : 0;
  const payload = {
    schemaVersion: ASN_COVERAGE_SCHEMA_VERSION,
    generatedAt,
    country: 'IR',
    inventory: {
      total: inventory?.total,
      queryTime: inventory?.queryTime ?? null,
      source: inventory?.source,
      sourceUrl: inventory?.sourceUrl,
      sourceBasis: inventory?.sourceBasis,
    },
    routingSummary: {
      registeredCount: routingSummary?.registeredCount,
      routedCount: routingSummary?.routedCount,
      registeredMinusRouted: routingSummary?.registeredMinusRouted,
      queryTime: routingSummary?.queryTime ?? null,
      latestTime: routingSummary?.latestTime ?? null,
      source: routingSummary?.source,
      sourceUrl: routingSummary?.sourceUrl,
      routingBasis: routingSummary?.routingBasis,
    },
    curatedCoverage: {
      inventoryCount: curatedCoverage?.inventoryCount,
      curatedCount: curatedCoverage?.curatedCount,
      curatedInInventoryCount: curatedCoverage?.curatedInInventoryCount,
      curatedOutsideInventory: curatedCoverage?.curatedOutsideInventory ?? [],
      uncuratedCount: curatedCoverage?.uncuratedCount,
      coveragePercent,
    },
    secondaryMetadata: {
      source: secondaryMetadata?.source,
      sourceUrl: secondaryMetadata?.sourceUrl,
      sourceLicense: secondaryMetadata?.sourceLicense,
      fetchedAt: secondaryMetadata?.fetchedAt,
      sha256: secondaryMetadata?.sha256,
      matchedInventoryAsnCount: secondaryMetadata?.matchedInventoryAsnCount,
    },
    enrichment: {
      secondaryCoverageCount: enrichment?.secondaryCoverageCount,
      secondaryMissingCount: enrichment?.secondaryMissingCount,
      secondaryCountryMismatchCount: enrichment?.secondaryCountryMismatchCount,
      candidateClassCounts: enrichment?.candidateClassCounts ?? {},
    },
    candidateQueue: (Array.isArray(candidateQueue) ? candidateQueue : []).slice(0, ASN_COVERAGE_MAX_CANDIDATES).map((row) => ({
      asn: row.asn,
      displayName: row.displayName,
      operatorFamily: row.operatorFamily ?? null,
      candidateClass: row.candidateClass,
      priorityReasons: row.priorityReasons ?? [],
      quality: row.quality ?? { secondaryMetadataMissing: true, secondaryCountryMismatch: false, secondaryCountryCode: null, secondaryOrigin: null },
      secondary: row.secondary ? {
        handle: row.secondary.handle ?? null,
        description: row.secondary.description ?? null,
        countryCode: row.secondary.countryCode ?? null,
        category: row.secondary.category ?? null,
        networkRole: row.secondary.networkRole ?? null,
        lastAnnounced: row.secondary.lastAnnounced ?? null,
        ipv4Prefixes: row.secondary.ipv4Prefixes ?? 0,
        ipv6Prefixes: row.secondary.ipv6Prefixes ?? 0,
        providers: row.secondary.providers ?? 0,
        customers: row.secondary.customers ?? 0,
        peers: row.secondary.peers ?? 0,
        degree: row.secondary.degree ?? 0,
        reach: row.secondary.reach ?? 0,
      } : null,
      evidenceRole: 'scope-topology-prioritization',
      independentCensorshipVote: false,
    })),
    evidenceRole: 'scope-topology-prioritization',
    independentCensorshipVote: false,
  };
  return normalizeSnapshot(payload);
}

export function parseAsnCoverageSnapshot(payload, { now = new Date(), maxAgeHours = ASN_COVERAGE_DEFAULT_MAX_AGE_HOURS } = {}) {
  const normalizedMaxAgeHours = Number(maxAgeHours);
  if (!Number.isFinite(normalizedMaxAgeHours) || normalizedMaxAgeHours <= 0 || normalizedMaxAgeHours > 8_760) throw new Error('ASN coverage maxAgeHours must be > 0 and <= 8760.');
  const normalized = normalizeSnapshot(payload);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) throw new Error('ASN coverage comparison time is invalid.');
  const generatedMs = Date.parse(normalized.generatedAt);
  if (generatedMs > nowMs + 5 * 60 * 1000) throw new Error('ASN coverage snapshot generatedAt is unexpectedly in the future.');
  const ageHours = Math.max(0, (nowMs - generatedMs) / 3_600_000);
  return {
    ok: true,
    source: 'Local Iran ASN coverage snapshot',
    status: ageHours > normalizedMaxAgeHours ? 'stale' : 'observed',
    ageHours: Math.round(ageHours * 10) / 10,
    maxAgeHours: normalizedMaxAgeHours,
    ...normalized,
    note: 'RIR association, routing visibility and ipverse topology metadata are separate context dimensions. Candidate ordering is analyst-review prioritization only and creates zero censorship votes.',
  };
}

export async function readAsnCoverageSnapshot({ path, now = new Date(), maxAgeHours = ASN_COVERAGE_DEFAULT_MAX_AGE_HOURS } = {}) {
  if (!path) throw new Error('ASN coverage snapshot path is required.');
  try {
    const text = await readFile(path, 'utf8');
    let payload;
    try { payload = JSON.parse(text); } catch (error) { throw new Error(`ASN coverage snapshot is invalid JSON: ${error.message}`); }
    return parseAsnCoverageSnapshot(payload, { now, maxAgeHours });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        ok: true,
        source: 'Local Iran ASN coverage snapshot',
        status: 'no_data',
        country: 'IR',
        candidateQueue: [],
        evidenceRole: 'scope-topology-prioritization',
        independentCensorshipVote: false,
        note: 'No local ASN coverage snapshot exists. Run the operator inventory command with --write to create one; absence is not interpreted as zero Iran ASNs.',
      };
    }
    return {
      ok: false,
      source: 'Local Iran ASN coverage snapshot',
      status: 'error',
      country: 'IR',
      error: error?.message || String(error),
      candidateQueue: [],
      evidenceRole: 'scope-topology-prioritization',
      independentCensorshipVote: false,
      note: 'Invalid local snapshot is rejected fail-closed and contributes no censorship evidence.',
    };
  }
}

export async function writeAsnCoverageSnapshot(path, snapshot) {
  if (!path) throw new Error('ASN coverage snapshot path is required.');
  const normalized = normalizeSnapshot(snapshot);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, path);
  return normalized;
}
