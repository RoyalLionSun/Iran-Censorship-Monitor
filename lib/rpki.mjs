import { asRecord, fetchJson, mapLimit, normalizeAsn, parseNumber } from './common.mjs';
import { normalizeCidr } from './rislive.mjs';

const RIPESTAT_BASE = 'https://stat.ripe.net/data';
export const RPKI_MAX_PREFIXES = 16;
export const RPKI_HISTORY_POINTS = 18;

function requiredAsn(asn) {
  const normalized = normalizeAsn(asn);
  if (!normalized) throw new Error('RPKI integrity context requires a selected ASN.');
  return normalized;
}

export function buildRpkiUrls(asn) {
  const normalized = requiredAsn(asn);
  const resource = encodeURIComponent(normalized);
  return {
    asn: normalized,
    announcedPrefixes: `${RIPESTAT_BASE}/announced-prefixes/data.json?resource=${resource}`,
    history4: `${RIPESTAT_BASE}/rpki-history/data.json?resource=${resource}&family=4&resolution=m`,
    history6: `${RIPESTAT_BASE}/rpki-history/data.json?resource=${resource}&family=6&resolution=m`,
  };
}

export function buildRpkiValidationUrl(asn, prefix) {
  const normalized = requiredAsn(asn);
  const cidr = normalizeCidr(prefix);
  return `${RIPESTAT_BASE}/rpki-validation/data.json?resource=${encodeURIComponent(normalized)}&prefix=${encodeURIComponent(cidr)}`;
}

export function parseRpkiValidation(payload) {
  const data = asRecord(asRecord(payload)?.data) ?? {};
  const rawStatus = String(data.status ?? '').toLowerCase();
  const allowed = new Set(['valid', 'invalid_asn', 'invalid_length', 'unknown']);
  const roas = Array.isArray(data.validating_roas) ? data.validating_roas : [];
  return {
    status: allowed.has(rawStatus) ? rawStatus : 'unknown',
    description: typeof data.description === 'string' ? data.description : null,
    prefix: typeof data.prefix === 'string' ? data.prefix : null,
    resource: data.resource ? normalizeAsn(data.resource) : null,
    validatingRoas: roas.slice(0, 20).map((raw) => {
      const row = asRecord(raw) ?? {};
      return {
        prefix: typeof row.prefix === 'string' ? row.prefix : null,
        maxLength: parseNumber(row.max_length ?? row.maxLength),
        origin: row.origin ? normalizeAsn(row.origin) : (row.asn ? normalizeAsn(row.asn) : null),
      };
    }),
  };
}

export function parseRpkiHistory(payload, limit = RPKI_HISTORY_POINTS) {
  const data = asRecord(asRecord(payload)?.data) ?? {};
  const rows = Array.isArray(data.timeseries) ? data.timeseries : [];
  const bounded = Math.max(1, Math.min(Number(limit) || RPKI_HISTORY_POINTS, 36));
  return rows.map((raw) => {
    const row = asRecord(raw) ?? {};
    const rpki = asRecord(row.rpki) ?? {};
    return {
      time: typeof row.time === 'string' ? row.time : null,
      family: parseNumber(row.family),
      vrpCount: parseNumber(rpki.vrp_count ?? rpki.last ?? rpki.avg),
      min: parseNumber(rpki.min),
      max: parseNumber(rpki.max),
      avg: parseNumber(rpki.avg),
      first: parseNumber(rpki.first),
      last: parseNumber(rpki.last),
      samples: parseNumber(rpki.samples),
    };
  }).filter((row) => row.time).slice(-bounded);
}

function parsePrefixList(payload) {
  const data = asRecord(asRecord(payload)?.data) ?? {};
  const rows = Array.isArray(data.prefixes) ? data.prefixes : [];
  return [...new Set(rows.map((raw) => {
    const row = asRecord(raw) ?? {};
    return typeof row.prefix === 'string' ? normalizeCidr(row.prefix) : null;
  }).filter(Boolean))].sort();
}

function summarizeStates(validations, failedCount, totalPrefixCount) {
  const states = { valid: 0, invalid_asn: 0, invalid_length: 0, unknown: 0, error: failedCount };
  for (const row of validations) states[row.status] = (states[row.status] ?? 0) + 1;
  const checkedPrefixCount = validations.length + failedCount;
  return {
    ...states,
    totalPrefixCount,
    checkedPrefixCount,
    uncheckedPrefixCount: Math.max(0, totalPrefixCount - checkedPrefixCount),
    complete: checkedPrefixCount === totalPrefixCount && failedCount === 0,
  };
}

export async function getRpkiIntegrity({ asn }) {
  const urls = buildRpkiUrls(asn);
  const initial = await Promise.allSettled([
    fetchJson(urls.announcedPrefixes, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 }),
    fetchJson(urls.history4, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 }),
    fetchJson(urls.history6, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 }),
  ]);

  if (initial.every((item) => item.status === 'rejected')) {
    throw initial[0].reason instanceof Error ? initial[0].reason : new Error('RIPEstat RPKI requests failed.');
  }

  const prefixes = initial[0].status === 'fulfilled' ? parsePrefixList(initial[0].value) : [];
  const selectedPrefixes = prefixes.slice(0, RPKI_MAX_PREFIXES);
  const validationSettled = await mapLimit(selectedPrefixes, 3, async (prefix) => {
    try {
      const url = buildRpkiValidationUrl(urls.asn, prefix);
      const payload = await fetchJson(url, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 15_000 });
      return { ok: true, prefix, sourceUrl: url, ...parseRpkiValidation(payload) };
    } catch (error) {
      return { ok: false, prefix, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const validations = validationSettled.filter((row) => row.ok);
  const failed = validationSettled.filter((row) => !row.ok);
  const coverage = summarizeStates(validations, failed.length, prefixes.length);
  const truncated = prefixes.length > selectedPrefixes.length;
  const history4 = initial[1].status === 'fulfilled' ? parseRpkiHistory(initial[1].value) : [];
  const history6 = initial[2].status === 'fulfilled' ? parseRpkiHistory(initial[2].value) : [];
  const partial = truncated || failed.length > 0 || initial.some((item) => item.status === 'rejected');
  const observed = prefixes.length > 0 || history4.length > 0 || history6.length > 0;

  return {
    ok: true,
    source: 'RIPEstat RPKI',
    status: observed ? (partial ? 'partial' : 'observed') : 'no_data',
    asn: urls.asn,
    coverage: { ...coverage, validationLimit: RPKI_MAX_PREFIXES, truncated },
    validations,
    validationErrors: failed,
    history: { ipv4: history4, ipv6: history6 },
    sourceUrls: urls,
    evidenceRole: 'route-origin-integrity-context',
    routingSourceFamily: 'ripe',
    independentCensorshipVote: false,
    fetchedAt: new Date().toISOString(),
    note: 'RPKI validity describes route-origin authorization. Invalid or unknown RPKI state is not proof of hijacking, censorship, intent or end-user unreachability; configuration mistakes and incomplete ROA coverage are possible.',
  };
}
