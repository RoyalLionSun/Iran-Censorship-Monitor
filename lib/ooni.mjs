import { asRecord, fetchJson, mapLimit, normalizeAsn, parseNumber, validateRange } from './common.mjs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIranAsnInventory } from './iran-asn-inventory.mjs';

// The OONI API enforces a request quota and answers 429 when a dashboard load fires a dozen
// parallel queries. All OONI traffic passes through one gate, and daily-grained results are
// cached long enough that a reload costs no upstream request.
export const OONI_MAX_PARALLEL_REQUESTS = 2;
export const OONI_CACHE_TTL_MS = 10 * 60_000;
export const OONI_COOLDOWN_MS = 60_000;
export const OONI_RATE_LIMIT_MESSAGE = 'OONI rate limit reached. No values are fabricated; the query can be retried in a moment.';

let ooniCooldownUntil = 0;
let ooniInFlight = 0;
const ooniWaiting = [];

function releaseOoniSlot() {
  ooniInFlight -= 1;
  const next = ooniWaiting.shift();
  if (next) { ooniInFlight += 1; next(); }
}

async function ooniFetchJson(url, options = {}) {
  if (ooniInFlight >= OONI_MAX_PARALLEL_REQUESTS) await new Promise((resolve) => ooniWaiting.push(resolve));
  else ooniInFlight += 1;
  const cooling = Date.now() < ooniCooldownUntil;
  try {
    return await fetchJson(url, {
      cacheTtlMs: OONI_CACHE_TTL_MS, ...options,
      cacheOnly: cooling, cacheOnlyMessage: OONI_RATE_LIMIT_MESSAGE,
    });
  } catch (error) {
    if (/\b429\b|quota exceeded/i.test(String(error?.message ?? ''))) {
      ooniCooldownUntil = Date.now() + OONI_COOLDOWN_MS;
      throw new Error(OONI_RATE_LIMIT_MESSAGE);
    }
    throw error;
  } finally {
    releaseOoniSlot();
  }
}

export function ooniRateLimitedUntil() {
  return ooniCooldownUntil;
}

export const OONI_TESTS = new Set([
  'web_connectivity',
  'dns_consistency',
  'http_header_field_manipulation',
  'ndt',
  'tor',
  'psiphon',
  'signal',
  'whatsapp',
  'telegram',
]);

// Historical test acceptance and routinely requested tests are distinct policies.
export const OONI_ROUTINE_TESTS = Object.freeze(['tor', 'psiphon', 'whatsapp', 'telegram']);

function hasFalse(item, key) {
  return item?.[key] === false || item?.[key] === 'false';
}
function hasTrue(item, key) {
  return item?.[key] === true || item?.[key] === 'true';
}

export function inferDetailedMethods(item) {
  const signals = [];
  if (hasFalse(item, 'dns_consistency') || hasFalse(item, 'dns_resolution') || hasTrue(item, 'dns_experiment_failure')) {
    signals.push({ label: 'DNS inconsistency', code: 'dns_consistency', evidence: 'DNS comparison or experiment signal deviates', confidence: 'high' });
  }
  if (hasFalse(item, 'tcp_connect') || hasTrue(item, 'control_failure') || hasTrue(item, 'tcp_failure') || hasTrue(item, 'connection_failure')) {
    signals.push({ label: 'TCP / transport failure', code: 'tcp_connect', evidence: 'TCP or control connection failed', confidence: 'high' });
  }
  if (hasFalse(item, 'tls_handshake') || hasTrue(item, 'tls_failure') || hasTrue(item, 'cert_chain_failure')) {
    signals.push({ label: 'TLS interference signal', code: 'tls_handshake', evidence: 'TLS handshake or certificate-chain signal failed', confidence: 'high' });
  }
  if (hasFalse(item, 'http_request') || hasFalse(item, 'status_code_match') || hasFalse(item, 'title_match') || hasFalse(item, 'body_length_match') || asRecord(item?.http_experiments)) {
    signals.push({ label: 'HTTP response mismatch', code: 'http_request', evidence: 'HTTP request/response differs from control', confidence: 'medium' });
  }
  if (hasTrue(item, 'ip_blocking') || hasTrue(item, 'blocking')) {
    signals.push({ label: 'Explicit blocking signal', code: 'ip_blocking', evidence: 'Explicit blocking field present in OONI response', confidence: 'medium' });
  }
  if (!signals.length && (hasTrue(item, 'anomaly') || hasTrue(item, 'confirmed'))) {
    signals.push({ label: 'OONI anomaly, method unspecified', code: 'anomaly', evidence: 'Anomaly/confirmation present without a safely inferable mechanism', confidence: 'low' });
  }
  if (!signals.length && hasTrue(item, 'failure')) {
    signals.push({ label: 'Measurement failure, method unspecified', code: 'failure', evidence: 'Measurement failure present; blocking mechanism cannot be inferred', confidence: 'low' });
  }
  return signals;
}

function validateOoniInput({ country = 'IR', testName = 'web_connectivity', since, until }) {
  validateRange(since, until);
  if (country !== 'IR') throw new Error('This deployment is restricted to Iran (IR).');
  if (!OONI_TESTS.has(testName)) throw new Error('Unsupported OONI test.');
}

function exclusiveOoniUntil(inclusiveDay) {
  // UI date filters are inclusive; OONI date-window aggregation is queried with the next day as the exclusive bound.
  return new Date(Date.parse(`${inclusiveDay}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// OONI files a measurement under Iran by the probe's geolocation, not by its network. In the
// 2026 blackouts most "Iranian" tests came from networks registered abroad (a Hong Kong ASN in
// March, a hosting/VPN provider in January), so they report what works outside Iran. Country
// figures therefore count only networks registered in Iran; what was excluded is reported.
const IRAN_ASN_TTL_MS = 24 * 60 * 60 * 1000;
export const OONI_MAX_EXCLUDED_NETWORKS = 5;
let iranAsnCache = null;

const IRAN_ASN_STORE = fileURLToPath(new URL('../var/iran-asns.json', import.meta.url));
// A stored registry older than this is not trusted as the fallback.
const IRAN_ASN_STORE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function loadWithRetry(loader) {
  try { return await loader({ timeoutMs: 20_000 }); }
  catch { return loader({ timeoutMs: 20_000 }); }
}

// The registry is needed on every country-wide answer. When RIPEstat does not answer, the last
// successfully loaded list stands in; only without both is the exclusion reported as missing.
export async function iranRegisteredAsns({ loader = getIranAsnInventory, now = Date.now(), storePath = IRAN_ASN_STORE } = {}) {
  if (iranAsnCache && iranAsnCache.expires > now) return iranAsnCache.asns;
  try {
    const inventory = await loadWithRetry(loader);
    const list = (inventory?.asns ?? []).map((asn) => normalizeAsn(String(asn))).filter(Boolean);
    if (!list.length) throw new Error('Empty Iran ASN registry.');
    const asns = new Set(list);
    iranAsnCache = { asns, expires: now + IRAN_ASN_TTL_MS };
    if (storePath) {
      try {
        await mkdir(dirname(storePath), { recursive: true });
        await writeFile(`${storePath}.tmp`, JSON.stringify({ savedAt: new Date(now).toISOString(), asns: list }));
        await rename(`${storePath}.tmp`, storePath);
      } catch { /* The stored copy is only a fallback. */ }
    }
    return asns;
  } catch {
    if (iranAsnCache?.asns) return iranAsnCache.asns;
    if (!storePath) return null;
    try {
      const stored = JSON.parse(await readFile(storePath, 'utf8'));
      if (!(now - Date.parse(stored.savedAt) < IRAN_ASN_STORE_MAX_AGE_MS)) return null;
      const asns = new Set((stored.asns ?? []).map((asn) => normalizeAsn(String(asn))).filter(Boolean));
      if (!asns.size) return null;
      // Retry the live registry soon, but answer with the stored one meanwhile.
      iranAsnCache = { asns, expires: now + 10 * 60_000 };
      return asns;
    } catch {
      return null;
    }
  }
}

export function resetIranAsnCache() {
  iranAsnCache = null;
}

const COUNT_FIELDS = ['measurement_count', 'anomaly_count', 'confirmed_count', 'failure_count', 'ok_count'];

// Removes the rows of excluded networks from a country aggregation, key by key. Every count
// is subtracted, so the ok + anomaly + confirmed + failure = measurements identity holds.
export function subtractOoniRows(totalRows, excludedRowSets, keyOf) {
  const remaining = new Map();
  for (const raw of totalRows ?? []) {
    const item = asRecord(raw);
    if (item) remaining.set(keyOf(item), { ...item });
  }
  for (const rows of excludedRowSets) {
    for (const raw of rows ?? []) {
      const item = asRecord(raw);
      const row = item ? remaining.get(keyOf(item)) : null;
      if (!row) continue;
      for (const field of COUNT_FIELDS) {
        if (Number.isFinite(row[field]) && Number.isFinite(item[field])) row[field] = Math.max(0, row[field] - item[field]);
      }
    }
  }
  return [...remaining.values()].filter((row) => (row.measurement_count ?? 0) > 0);
}

// Country-scope aggregations only: which networks answered, and which of them are not
// registered in Iran. A selected ASN is already one network and needs no exclusion.
async function excludedNetworks(params) {
  const iran = await iranRegisteredAsns();
  if (!iran) return { checked: false, networks: [], measurements: 0, remaining: 0 };
  const breakdown = new URLSearchParams(params);
  breakdown.set('axis_x', 'probe_asn');
  breakdown.delete('axis_y');
  breakdown.delete('time_grain');
  const payload = asRecord(await ooniFetchJson(`https://api.ooni.io/api/v1/aggregation?${breakdown}`));
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  const foreign = rows.map((row) => ({ asn: normalizeAsn(String(row?.probe_asn ?? '')), measurements: Number(row?.measurement_count) || 0 }))
    .filter((row) => row.asn && row.measurements > 0 && !iran.has(row.asn))
    .sort((a, b) => b.measurements - a.measurements);
  const handled = foreign.slice(0, OONI_MAX_EXCLUDED_NETWORKS);
  return {
    checked: true,
    networks: handled,
    measurements: handled.reduce((sum, row) => sum + row.measurements, 0),
    // More foreign networks than can be subtracted stay in, and are said to.
    remaining: foreign.slice(OONI_MAX_EXCLUDED_NETWORKS).reduce((sum, row) => sum + row.measurements, 0),
  };
}

async function countryRowsWithoutForeign(params, rows, keyOf, asn) {
  if (normalizeAsn(asn)) return { rows, exclusion: null };
  const excluded = await excludedNetworks(params);
  if (!excluded.networks.length) return { rows, exclusion: excluded };
  const excludedRows = await mapLimit(excluded.networks, 2, async ({ asn: foreignAsn }) => {
    const scoped = new URLSearchParams(params);
    scoped.set('probe_asn', foreignAsn);
    const payload = asRecord(await ooniFetchJson(`https://api.ooni.io/api/v1/aggregation?${scoped}`));
    return Array.isArray(payload?.result) ? payload.result : [];
  });
  return { rows: subtractOoniRows(rows, excludedRows, keyOf), exclusion: excluded };
}

function exclusionSummary(exclusion) {
  if (!exclusion) return null;
  return {
    checked: exclusion.checked,
    networks: exclusion.networks.map((row) => row.asn),
    excludedMeasurements: exclusion.measurements,
    notExcludedMeasurements: exclusion.remaining,
  };
}

export function buildOoniQuery({ country = 'IR', asn = '', since, until, target = '', testName = 'web_connectivity', limit = 1000 }) {
  validateOoniInput({ country, testName, since, until });
  const normalizedAsn = normalizeAsn(asn);
  const params = new URLSearchParams({
    probe_cc: 'IR',
    test_name: testName,
    since,
    until: exclusiveOoniUntil(until),
    limit: String(Math.min(Math.max(Number(limit) || 1000, 1), 1000)),
  });
  if (normalizedAsn) params.set('probe_asn', normalizedAsn.replace(/^AS/, ''));
  if (target && testName === 'web_connectivity') params.set('input', target.trim());
  return params;
}

export function buildOoniAggregationQuery({ country = 'IR', asn = '', since, until, target = '', testName = 'web_connectivity' }) {
  validateOoniInput({ country, testName, since, until });
  const normalizedAsn = normalizeAsn(asn);
  const params = new URLSearchParams({
    probe_cc: 'IR',
    test_name: testName,
    since,
    until: exclusiveOoniUntil(until),
    axis_x: 'measurement_start_day',
    time_grain: 'day',
    format: 'JSON',
  });
  if (normalizedAsn) params.set('probe_asn', normalizedAsn);
  if (target && testName === 'web_connectivity') params.set('input', target.trim());
  return params;
}

export function buildOoniDomainQuery(input) {
  validateOoniInput({ ...input, testName: 'web_connectivity' });
  if (input.testName && input.testName !== 'web_connectivity') throw new Error('Domain findings require Web Connectivity.');
  const params = buildOoniAggregationQuery({ ...input, testName: 'web_connectivity' });
  params.set('axis_x', 'domain');
  params.set('axis_y', 'measurement_start_day');
  return params;
}

function domainCount(item, key) {
  const value = item[key];
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid OONI domain ${key}.`);
  return value;
}

export function aggregateOoniDomains(rawRows) {
  if (!Array.isArray(rawRows)) throw new Error('Invalid OONI domain aggregation response.');
  const domains = new Map();
  const seen = new Set();
  // OONI also reports tested inputs that are not plain host names, for example
  // "128.31.0.39:9131" or a single-label name. Such a row is skipped and counted; it must
  // never discard the rest of the window, which used to blind the whole dashboard.
  const skipped = [];
  for (const raw of rawRows) {
    const item = asRecord(raw);
    const rawDomain = item?.domain;
    const date = item?.measurement_start_day;
    if (typeof rawDomain !== 'string' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid OONI domain or observation day.');
    let domain;
    try { domain = normalizedDomain(rawDomain); }
    catch { skipped.push(rawDomain); continue; }
    // The same host appears in several spellings ("Instagram.com" and "instagram.com").
    // Those belong to one domain group; only an identical row twice is a broken response.
    const key = `${rawDomain}\0${date}`;
    if (seen.has(key)) throw new Error('Repeated OONI domain observation day.');
    seen.add(key);
    const measurements = domainCount(item, 'measurement_count');
    const anomalous = domainCount(item, 'anomaly_count');
    const confirmed = domainCount(item, 'confirmed_count');
    const failures = domainCount(item, 'failure_count');
    const ok = domainCount(item, 'ok_count');
    if (measurements === 0 || ok + anomalous + confirmed + failures !== measurements) throw new Error('Inconsistent OONI domain counts.');
    const row = domains.get(domain) ?? { domain, measurements: 0, anomalous: 0, confirmed: 0, failures: 0, ok: 0, days: new Set(), lastObserved: date };
    row.measurements += measurements;
    row.anomalous += anomalous;
    row.confirmed += confirmed;
    row.failures += failures;
    row.ok += ok;
    row.days.add(date);
    if (date > row.lastObserved) row.lastObserved = date;
    domains.set(domain, row);
  }
  const rows = [...domains.values()].map(({ days, ...row }) => ({
    ...row,
    observedDays: days.size,
    anomalyRate: Math.round((row.anomalous / row.measurements) * 1000) / 10,
    // Confirmed is source-native; anomalous rows alone never become confirmed blocking.
    evidence: row.confirmed ? 'confirmed' : row.anomalous ? 'anomaly' : 'no_blocking_signal',
  })).sort((a, b) => b.confirmed - a.confirmed || b.anomalous - a.anomalous || a.domain.localeCompare(b.domain));
  rows.skippedInputs = [...new Set(skipped)];
  return rows;
}

export async function getOoniDomains(input) {
  const params = buildOoniDomainQuery(input);
  const sourceUrl = `https://api.ooni.io/api/v1/aggregation?${params}`;
  const payload = asRecord(await ooniFetchJson(sourceUrl, { timeoutMs: 25_000 }));
  const { rows, exclusion } = await countryRowsWithoutForeign(params, Array.isArray(payload?.result) ? payload.result : payload?.result,
    (item) => `${item.domain}\0${item.measurement_start_day}`, input.asn);
  const domains = aggregateOoniDomains(rows);
  const skippedInputs = domains.skippedInputs ?? [];
  const totalMeasurements = domains.reduce((sum, row) => sum + row.measurements, 0);
  return {
    ok: true, source: 'OONI', status: domains.length ? 'observed' : 'no_data',
    country: 'IR', asn: normalizeAsn(input.asn) || null,
    skippedInputs: skippedInputs.slice(0, 20), skippedInputCount: skippedInputs.length,
    since: input.since, until: input.until, testName: 'web_connectivity',
    target: input.target || '', fetchedAt: new Date().toISOString(), sourceUrl,
    domainCount: domains.length, totalMeasurements,
    foreignExclusion: exclusionSummary(exclusion),
    domains,
    note: 'Grouped OONI Web Connectivity tests, not a census of all sites or users. Confirmed and anomalous are distinct OONI outcomes. A domain may include multiple tested URLs; this view does not establish a blocking mechanism, political intent, or VPN availability.',
  };
}

export const OONI_DOMAIN_PAGE_SIZE = 25;
export const OONI_DOMAIN_MAX_OFFSET = 75;

function normalizedDomain(value) {
  if (typeof value !== 'string' || !value || value.length > 253 || /[\s/?#@\\:%]/.test(value)) throw new Error('Invalid OONI domain.');
  let hostname;
  try { hostname = new URL(`http://${value}`).hostname.toLowerCase(); }
  catch { throw new Error('Invalid OONI domain.'); }
  // A fully qualified name may carry one trailing root dot; it is the same host.
  hostname = hostname.replace(/\.$/, '');
  if (!hostname || hostname.length > 253 || !hostname.includes('.') || hostname.split('.').some((label) => !label || label.length > 63)) throw new Error('Invalid OONI domain.');
  return hostname;
}

export function buildOoniDomainMeasurementsQuery(input, domain, offset = 0) {
  const selected = normalizedDomain(domain);
  if (!Number.isInteger(offset) || offset < 0 || offset > OONI_DOMAIN_MAX_OFFSET || offset % OONI_DOMAIN_PAGE_SIZE !== 0) throw new Error('Invalid OONI domain page offset.');
  if (input.testName && input.testName !== 'web_connectivity') throw new Error('Domain measurements require Web Connectivity.');
  const target = input.target || '';
  if (target) {
    let targetDomain;
    try { targetDomain = new URL(target).hostname.toLowerCase(); }
    catch { throw new Error('Invalid OONI target URL.'); }
    if (targetDomain !== selected && !targetDomain.endsWith(`.${selected}`)) throw new Error('Selected domain does not match the target URL.');
  }
  const params = buildOoniQuery({ ...input, testName: 'web_connectivity', limit: OONI_DOMAIN_PAGE_SIZE });
  // The list endpoint is <= until (unlike the aggregation endpoint's exclusive
  // bound). Exclude the following day's exact midnight from this detail view.
  params.set('until', `${input.until}T23:59:59Z`);
  if (!target) params.set('domain', domain);
  params.set('offset', String(offset));
  params.set('order', 'desc');
  return params;
}

// OONI deliberately publishes no stable probe identity, so the honest coverage unit is the
// measurement run (report_id) plus the days it covers. The sample is bounded, which makes
// both counts a floor and never a total.
export const OONI_SAMPLE_SIZE = 200;

// How a service is blocked is source-native: OONI reports the analysed blocking type and,
// for confirmed cases, where the block fingerprint was found. It is never inferred.
export function sampleMechanism(row) {
  const fingerprint = Array.isArray(row?.scores?.fingerprints) ? row.scores.fingerprints[0] : null;
  const location = typeof fingerprint?.location_found === 'string' ? fingerprint.location_found.toLowerCase() : '';
  if (location === 'dns') return 'dns';
  if (location) return 'blockpage';
  const type = String(row?.scores?.analysis?.blocking_type ?? '').toLowerCase();
  if (type === 'dns') return 'dns';
  if (type === 'tcp_ip') return 'tcp';
  if (type === 'http-diff') return 'blockpage';
  if (type === 'http-failure') return 'http-failure';
  return 'unspecified';
}

export function buildOoniSampleQuery(input, domain) {
  const selected = normalizedDomain(domain);
  const params = buildOoniQuery({ ...input, testName: 'web_connectivity', target: '', limit: OONI_SAMPLE_SIZE });
  params.set('until', `${input.until}T23:59:59Z`);
  params.set('domain', selected);
  params.set('order', 'desc');
  return params;
}

export function summarizeOoniSample(payload, { domain, input, iranAsns = null }) {
  const data = asRecord(payload);
  if (!Array.isArray(data?.results)) throw new Error('Invalid OONI vantage sample response.');
  if (data.results.length > OONI_SAMPLE_SIZE) throw new Error('OONI vantage sample exceeded its limit.');
  const expected = normalizedDomain(domain);
  const asn = normalizeAsn(input.asn) || null;
  const runs = new Set();
  const days = new Set();
  const mechanisms = {};
  let affected = 0;
  let excluded = 0;
  for (const raw of data.results) {
    const item = asRecord(raw);
    if (!item || item.probe_cc !== 'IR' || item.test_name !== 'web_connectivity') throw new Error('OONI vantage sample scope mismatch.');
    const itemAsn = normalizeAsn(String(item.probe_asn ?? '')) || null;
    if (asn && itemAsn !== asn) throw new Error('OONI vantage sample scope mismatch.');
    // A probe on a network registered abroad does not measure access from inside Iran.
    if (!asn && iranAsns && !iranAsns.has(itemAsn)) { excluded += 1; continue; }
    let host;
    try { host = new URL(String(item.input)).hostname.toLowerCase(); }
    catch { throw new Error('Invalid OONI tested URL.'); }
    if (host !== expected && !host.endsWith(`.${expected}`)) throw new Error('OONI vantage sample scope mismatch.');
    if (typeof item.report_id === 'string' && item.report_id) runs.add(item.report_id);
    if (item.anomaly === true || item.confirmed === true) {
      affected += 1;
      const mechanism = sampleMechanism(item);
      mechanisms[mechanism] = (mechanisms[mechanism] ?? 0) + 1;
    }
    const day = typeof item.measurement_start_time === 'string' ? item.measurement_start_time.slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  }
  const dominant = Object.entries(mechanisms).filter(([code]) => code !== 'unspecified')
    .sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    domain: expected,
    runs: runs.size,
    observedDays: days.size,
    sampled: data.results.length - excluded,
    excludedOutsideIran: excluded,
    bounded: data.results.length >= OONI_SAMPLE_SIZE,
    affected,
    mechanisms,
    dominantMechanism: dominant ? { code: dominant[0], count: dominant[1] } : null,
  };
}

export async function getOoniSample(input, domain) {
  const params = buildOoniSampleQuery(input, domain);
  const sourceUrl = `https://api.ooni.io/api/v1/measurements?${params}`;
  const payload = await ooniFetchJson(sourceUrl, { timeoutMs: 25_000 });
  const iranAsns = normalizeAsn(input.asn) ? null : await iranRegisteredAsns();
  return { ok: true, source: 'OONI', sourceUrl, ...summarizeOoniSample(payload, { domain, input, iranAsns }) };
}

// Whether a service is blocked in one network or in every measured network separates a
// provider decision from a country-wide pattern. One aggregation answers it for one service.
export function buildOoniNetworkQuery(input, domain) {
  const selected = normalizedDomain(domain);
  const params = buildOoniAggregationQuery({ ...input, asn: '', target: '', testName: 'web_connectivity' });
  params.set('axis_x', 'probe_asn');
  params.delete('axis_y');
  params.delete('time_grain');
  params.set('domain', selected);
  return params;
}

export function aggregateOoniNetworks(rawRows) {
  if (!Array.isArray(rawRows)) throw new Error('Invalid OONI network aggregation response.');
  const networks = [];
  const seen = new Set();
  for (const raw of rawRows) {
    const item = asRecord(raw);
    const asn = normalizeAsn(String(item?.probe_asn ?? ''));
    if (!asn) throw new Error('Invalid OONI network in aggregation response.');
    if (seen.has(asn)) throw new Error('Repeated OONI network in aggregation response.');
    seen.add(asn);
    const measurements = domainCount(item, 'measurement_count');
    const anomalous = domainCount(item, 'anomaly_count');
    const confirmed = domainCount(item, 'confirmed_count');
    const failures = domainCount(item, 'failure_count');
    const ok = domainCount(item, 'ok_count');
    if (measurements === 0 || ok + anomalous + confirmed + failures !== measurements) throw new Error('Inconsistent OONI network counts.');
    networks.push({
      asn, measurements, anomalous, confirmed, failures, ok,
      status: confirmed > 0 ? 'blocked' : anomalous > 0 ? 'restricted' : ok > 0 ? 'reachable' : 'inconclusive',
    });
  }
  return networks.sort((a, b) => b.confirmed - a.confirmed || b.anomalous - a.anomalous || b.measurements - a.measurements);
}

export function summarizeOoniNetworks(networks, domain) {
  const count = (status) => networks.filter((row) => row.status === status).length;
  return {
    domain: normalizedDomain(domain),
    measured: networks.length,
    blocked: count('blocked'),
    restricted: count('restricted'),
    reachable: count('reachable'),
    inconclusive: count('inconclusive'),
    networks: networks.slice(0, 12),
  };
}

export async function getOoniNetworks(input, domain) {
  const params = buildOoniNetworkQuery(input, domain);
  const sourceUrl = `https://api.ooni.io/api/v1/aggregation?${params}`;
  const payload = asRecord(await ooniFetchJson(sourceUrl, { timeoutMs: 25_000 }));
  const iran = await iranRegisteredAsns();
  const all = aggregateOoniNetworks(payload?.result);
  // A network registered abroad is not one of "the Iranian networks" a reader is told about.
  const networks = iran ? all.filter((row) => iran.has(row.asn)) : all;
  return {
    ok: true, source: 'OONI', sourceUrl, ...summarizeOoniNetworks(networks, domain),
    excludedNetworks: iran ? all.filter((row) => !iran.has(row.asn)).map((row) => row.asn) : [],
    foreignChecked: Boolean(iran),
  };
}

export function parseOoniDomainMeasurements(payload, { domain, input, offset = 0, sourceUrl, iranAsns = null }) {
  const data = asRecord(payload);
  if (!Array.isArray(data?.results) || !asRecord(data?.metadata)) throw new Error('Invalid OONI domain measurement response.');
  const expected = normalizedDomain(domain);
  if (data.results.length > OONI_DOMAIN_PAGE_SIZE) throw new Error('OONI domain measurement page exceeded its limit.');
  const asn = normalizeAsn(input.asn) || null;
  const seen = new Set();
  const rows = data.results.map((raw) => {
    const item = asRecord(raw);
    if (!item || item.probe_cc !== 'IR' || item.test_name !== 'web_connectivity' || typeof item.input !== 'string') throw new Error('OONI domain measurement scope mismatch.');
    let rowDomain;
    try {
      const testedUrl = new URL(item.input);
      if (!['http:', 'https:'].includes(testedUrl.protocol)) throw new Error('Unsupported URL protocol.');
      rowDomain = testedUrl.hostname.toLowerCase();
    }
    catch { throw new Error('Invalid OONI tested URL.'); }
    const rowAsn = normalizeAsn(String(item.probe_asn ?? '')) || null;
    if ((rowDomain !== expected && !(input.target && rowDomain.endsWith(`.${expected}`)))
      || (asn && rowAsn !== asn) || (input.target && item.input !== input.target)) throw new Error('OONI domain measurement scope mismatch.');
    const timestampMs = typeof item.measurement_start_time === 'string' ? Date.parse(item.measurement_start_time) : NaN;
    const day = Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString().slice(0, 10) : '';
    if (!day || day < input.since || day > input.until) throw new Error('OONI measurement outside selected dates.');
    const uid = typeof item.measurement_uid === 'string' && /^[A-Za-z0-9_.:-]{8,200}$/.test(item.measurement_uid) ? item.measurement_uid : null;
    let rawUrl = null;
    if (typeof item.measurement_url === 'string' && typeof item.report_id === 'string') {
      try {
        const candidate = new URL(item.measurement_url);
        if (candidate.origin === 'https://api.ooni.io' && !candidate.username && !candidate.password && !candidate.hash
          && candidate.pathname === '/api/v1/raw_measurement'
          && candidate.searchParams.getAll('report_id').length === 1 && candidate.searchParams.get('report_id') === item.report_id
          && candidate.searchParams.getAll('input').length === 1 && candidate.searchParams.get('input') === item.input) rawUrl = candidate.href;
      } catch { /* Untrusted/malformed source links are not surfaced. */ }
    }
    const identity = uid || `${item.report_id || ''}|${item.input}|${item.measurement_start_time}`;
    if (seen.has(identity)) throw new Error('Duplicate OONI domain measurement.');
    seen.add(identity);
    const flags = [item.confirmed, item.anomaly, item.failure];
    const outcome = flags.every((value) => typeof value === 'boolean')
      ? item.confirmed ? 'confirmed' : item.anomaly ? 'anomaly' : item.failure ? 'failure' : 'ok'
      : 'unknown';
    return {
      uid, url: item.input, timestamp: item.measurement_start_time, asn: rowAsn,
      // Individual records stay listed for inspection, but a record from a network registered
      // abroad is marked: it does not show access from inside Iran.
      outsideIran: iranAsns ? !iranAsns.has(rowAsn) : null,
      outcome, explorerUrl: uid ? `https://explorer.ooni.org/measurement/${encodeURIComponent(uid)}` : null, rawUrl,
    };
  });
  const more = Boolean(data.metadata.next_url) && rows.length > 0;
  return {
    ok: true, source: 'OONI', status: rows.length ? 'observed' : 'no_data',
    country: 'IR', asn, domain, since: input.since, until: input.until,
    target: input.target || '', sourceUrl, fetchedAt: new Date().toISOString(),
    offset, pageSize: OONI_DOMAIN_PAGE_SIZE, rows,
    hasMore: more && offset < OONI_DOMAIN_MAX_OFFSET,
    limitReached: more && offset >= OONI_DOMAIN_MAX_OFFSET,
    note: 'These are at most 100 on-demand individual OONI Web Connectivity records. URLs and source-native outcomes refer only to tested connections; missing rows are not healthy or blocked by inference.',
  };
}

export async function getOoniDomainMeasurements(input, domain, offset = 0) {
  const params = buildOoniDomainMeasurementsQuery(input, domain, offset);
  const sourceUrl = `https://api.ooni.io/api/v1/measurements?${params}`;
  const payload = await ooniFetchJson(sourceUrl, { timeoutMs: 25_000 });
  const iranAsns = normalizeAsn(input.asn) ? null : await iranRegisteredAsns();
  return parseOoniDomainMeasurements(payload, { domain, input, offset, sourceUrl, iranAsns });
}


export function aggregateOoniRows(rawRows) {
  const byDate = new Map();
  for (const raw of rawRows) {
    const item = asRecord(raw);
    if (!item) continue;
    const timestamp = item.measurement_start_time ?? item.measurement_start_time_utc;
    if (typeof timestamp !== 'string') continue;
    const date = timestamp.slice(0, 10);
    const current = byDate.get(date) ?? {
      measurements: 0,
      anomalies: 0,
      confirmed: 0,
      failures: 0,
      methods: new Map(),
    };
    current.measurements += 1;
    if (item.anomaly === true || item.confirmed === true) current.anomalies += 1;
    if (item.confirmed === true) current.confirmed += 1;
    if (item.failure === true) current.failures += 1;
    for (const signal of inferDetailedMethods(item)) {
      const key = `${signal.code}|${signal.label}`;
      const existing = current.methods.get(key) ?? { ...signal, count: 0, evidence: new Set() };
      existing.count += 1;
      existing.evidence.add(signal.evidence);
      current.methods.set(key, existing);
    }
    byDate.set(date, current);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({
    date,
    measurements: row.measurements,
    anomalies: row.anomalies,
    confirmed: row.confirmed,
    failures: row.failures,
    anomalyRate: row.measurements ? Math.round((row.anomalies / row.measurements) * 1000) / 10 : null,
    confirmedRate: row.measurements ? Math.round((row.confirmed / row.measurements) * 1000) / 10 : null,
    methods: [...row.methods.values()].map((method) => ({
      label: method.label,
      code: method.code,
      count: method.count,
      evidence: [...method.evidence],
      confidence: method.confidence,
    })),
  }));
}

export function aggregateOoniAggregationRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map((raw) => {
    const item = asRecord(raw) ?? {};
    const dateValue = item.measurement_start_day ?? item.measurement_start_time;
    const date = typeof dateValue === 'string' ? dateValue.slice(0, 10) : '';
    const measurements = Math.max(0, Math.trunc(parseNumber(item.measurement_count) ?? 0));
    const anomalyOnly = Math.max(0, Math.trunc(parseNumber(item.anomaly_count) ?? 0));
    const confirmed = Math.max(0, Math.trunc(parseNumber(item.confirmed_count) ?? 0));
    const failures = Math.max(0, Math.trunc(parseNumber(item.failure_count) ?? 0));
    const anomalies = Math.min(measurements, anomalyOnly + confirmed);
    return {
      date,
      measurements,
      anomalies,
      confirmed,
      failures,
      anomalyRate: measurements ? Math.round((anomalies / measurements) * 1000) / 10 : null,
      confirmedRate: measurements ? Math.round((confirmed / measurements) * 1000) / 10 : null,
      methods: [],
    };
  }).filter((row) => row.date).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getOoniTimeline(input) {
  const params = buildOoniAggregationQuery(input);
  const sourceUrl = `https://api.ooni.io/api/v1/aggregation?${params}`;
  const fetchedAt = new Date().toISOString();
  const payload = asRecord(await ooniFetchJson(sourceUrl));
  const rawResult = Array.isArray(payload?.result) ? payload.result : asRecord(payload?.result) ? [payload.result] : [];
  const { rows, exclusion } = await countryRowsWithoutForeign(params, rawResult,
    (item) => String(item.measurement_start_day ?? item.measurement_start_time ?? '').slice(0, 10), input.asn);
  const points = aggregateOoniAggregationRows(rows);
  const normalizedAsn = normalizeAsn(input.asn);
  const totalMeasurements = points.reduce((sum, point) => sum + point.measurements, 0);
  const totalAnomalies = points.reduce((sum, point) => sum + point.anomalies, 0);
  const totalConfirmed = points.reduce((sum, point) => sum + point.confirmed, 0);
  const totalFailures = points.reduce((sum, point) => sum + point.failures, 0);
  return {
    ok: true,
    source: 'OONI',
    status: totalMeasurements ? 'observed' : 'no_data',
    country: 'IR',
    asn: normalizedAsn || null,
    since: input.since,
    until: input.until,
    target: input.testName === 'web_connectivity' ? (input.target || '') : '',
    testName: input.testName,
    fetchedAt,
    sourceUrl,
    totalMeasurements,
    totalAnomalies,
    totalConfirmed,
    totalFailures,
    anomalyRate: totalMeasurements ? Math.round((totalAnomalies / totalMeasurements) * 1000) / 10 : null,
    confirmedRate: totalMeasurements ? Math.round((totalConfirmed / totalMeasurements) * 1000) / 10 : null,
    truncatedAtApiLimit: false,
    aggregationComplete: true,
    aggregationAxis: 'measurement_start_day',
    foreignExclusion: exclusionSummary(exclusion),
    points,
    warning: totalMeasurements ? null : 'No OONI measurements were returned for this selection.',
    note: 'Timeline counts come from the OONI aggregation API, avoiding the 1000-row list endpoint cap. Detailed measurement bodies remain on-demand only.',
  };
}

export async function listOoniMeasurements(input) {
  const params = buildOoniQuery({ ...input, limit: 50 });
  const sourceUrl = `https://api.ooni.io/api/v1/measurements?${params}`;
  const payload = asRecord(await ooniFetchJson(sourceUrl));
  const raw = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
  return {
    ok: true,
    source: 'OONI',
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    measurements: raw.map((entry) => {
      const item = asRecord(entry) ?? {};
      const uid = typeof item.measurement_uid === 'string' ? item.measurement_uid : typeof item.report_id === 'string' ? item.report_id : '';
      return {
        uid,
        timestamp: typeof item.measurement_start_time === 'string' ? item.measurement_start_time : typeof item.measurement_start_time_utc === 'string' ? item.measurement_start_time_utc : null,
        testName: typeof item.test_name === 'string' ? item.test_name : 'unknown',
        asn: typeof item.probe_asn === 'string' ? item.probe_asn : item.probe_asn != null ? `AS${item.probe_asn}` : null,
        anomaly: typeof item.anomaly === 'boolean' ? item.anomaly : null,
        confirmed: typeof item.confirmed === 'boolean' ? item.confirmed : null,
        explorerUrl: uid ? `https://explorer.ooni.org/measurement/${encodeURIComponent(uid)}` : null,
      };
    }).filter((row) => row.uid),
  };
}

export async function getOoniMeasurementDetail(uid) {
  const cleanUid = String(uid || '').trim();
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(cleanUid)) throw new Error('Invalid OONI measurement UID.');
  const candidates = [
    `https://api.ooni.io/api/v1/measurement/${encodeURIComponent(cleanUid)}`,
    `https://api.ooni.io/api/v1/measurement_meta?measurement_uid=${encodeURIComponent(cleanUid)}`,
  ];
  let lastError = null;
  for (const sourceUrl of candidates) {
    try {
      return { ok: true, source: 'OONI', uid: cleanUid, sourceUrl, fetchedAt: new Date().toISOString(), raw: await ooniFetchJson(sourceUrl) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('OONI measurement could not be loaded.');
}

export async function getCircumventionSignals({ since, until, asn = '' }) {
  validateRange(since, until, 45);
  // Preserve the legacy Signal API test, but do not include it in routine monitoring.
  const results = await mapLimit(OONI_ROUTINE_TESTS, 2, async (testName) => {
    try {
      const timeline = await getOoniTimeline({ country: 'IR', asn, since, until, target: '', testName });
      return {
        testName,
        status: timeline.totalMeasurements ? 'observed' : 'no_data',
        measurements: timeline.totalMeasurements,
        anomalies: timeline.totalAnomalies,
        anomalyRate: timeline.anomalyRate,
        confirmed: timeline.totalConfirmed,
        lastObservation: timeline.points.at(-1)?.date ?? null,
        sourceUrl: timeline.sourceUrl,
      };
    } catch (error) {
      return { testName, status: 'error', measurements: 0, anomalies: 0, anomalyRate: null, confirmed: 0, lastObservation: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return {
    ok: true,
    source: 'OONI',
    fetchedAt: new Date().toISOString(),
    since,
    until,
    asn: normalizeAsn(asn) || null,
    signals: results,
    note: 'These are OONI application/circumvention test observations. They are not WireGuard/OpenVPN tunnel measurements or provider rankings.',
  };
}
