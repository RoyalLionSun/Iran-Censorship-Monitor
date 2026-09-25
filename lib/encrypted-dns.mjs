import { mapLimit, normalizeAsn, validateRange } from './common.mjs';
import { iranRegisteredAsns, ooniFetchJson } from './ooni.mjs';

// Encrypted name lookup (DNS over HTTPS / TLS) from inside Iran, from OONI's dnscheck test.
// Iran blocks services such as Instagram through the name lookup, so "use another DNS" is a
// common tip. OONI's aggregate marks every dnscheck run as a failure in every country, so the
// answer is only in the single measurements: a small sample of recent ones from networks
// registered in Iran is read and classified. Resolvers asked by name (dns.google) and by address
// (1.1.1.1) are kept apart, because Iran falsifies the names but not the addresses.

const API = 'https://api.ooni.org/api/v1';
const SAMPLE_PER_GROUP = 12;
const LIST_LIMIT = 300;
export const ENCRYPTED_DNS_MIN_TESTS = 8;
const ADDRESS_INPUTS = ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query', 'dot://1.1.1.1:853/', 'dot://8.8.8.8:853/'];

export function resolverGroup(input) {
  try {
    const host = new URL(String(input).replace(/^dot:/, 'https:')).hostname;
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') ? 'byAddress' : 'byName';
  } catch {
    return null;
  }
}

// One measurement: working when the resolver was found and every lookup through it answered.
export function classifyDnscheck(testKeys) {
  if (!testKeys) return { ok: false, reason: 'no_data' };
  if (testKeys.bootstrap_failure) return { ok: false, reason: String(testKeys.bootstrap_failure) };
  const lookups = Object.values(testKeys.lookups ?? {});
  if (!lookups.length) return { ok: false, reason: 'no_lookup' };
  const failure = lookups.map((lookup) => lookup?.failure).find(Boolean);
  return failure ? { ok: false, reason: String(failure) } : { ok: true, reason: null };
}

export function summarizeEncryptedDns(rows) {
  const groups = {};
  for (const id of ['byName', 'byAddress']) {
    const own = rows.filter((row) => row.group === id);
    const reasons = {};
    for (const row of own.filter((item) => !item.ok)) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
    const ok = own.filter((row) => row.ok).length;
    const failed = own.length - ok;
    groups[id] = {
      tested: own.length,
      ok,
      failed,
      // The most frequent reason, in OONI's words (e.g. dns_bogon_error: the name was answered
      // with an internal address).
      reason: Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      resolvers: [...new Set(own.map((row) => row.input))].slice(0, 6),
      status: own.length < ENCRYPTED_DNS_MIN_TESTS ? 'thin' : failed > ok ? 'fails' : failed * 10 >= own.length ? 'partly' : 'works',
    };
  }
  return groups;
}

export async function getEncryptedDns({ since, until, fetch = ooniFetchJson, iranAsns = null }) {
  validateRange(since, until, 45);
  const iran = iranAsns ?? await iranRegisteredAsns();
  const list = (extra) => {
    const params = new URLSearchParams({ probe_cc: 'IR', test_name: 'dnscheck', since, until, order_by: 'measurement_start_time', order: 'desc', ...extra });
    return `${API}/measurements?${params}`;
  };
  // Resolvers by name make up most runs; those by address are rarer and asked for one by one.
  const listUrl = list({ limit: String(LIST_LIMIT) });
  const listings = await Promise.all([listUrl, ...ADDRESS_INPUTS.map((input) => list({ input, limit: '25' }))]
    .map((url) => fetch(url, { cacheTtlMs: 12 * 60 * 60_000, timeoutMs: 60_000 }).catch(() => null)));
  const candidates = listings.flatMap((listing) => listing?.results ?? [])
    .filter((row) => !iran || iran.has(normalizeAsn(String(row.probe_asn))))
    .map((row) => ({ ...row, group: resolverGroup(row.input) }))
    .filter((row, index, all) => row.group && all.findIndex((other) => other.measurement_uid === row.measurement_uid) === index);
  // Spread the sample over resolvers and networks: take them in turn, not the first dozen.
  const picked = [];
  for (const group of ['byName', 'byAddress']) {
    const pool = candidates.filter((row) => row.group === group);
    const seen = new Set();
    for (const row of pool) {
      if (picked.filter((item) => item.group === group).length >= SAMPLE_PER_GROUP) break;
      const key = `${row.input}|${row.probe_asn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(row);
    }
    for (const row of pool) {
      if (picked.filter((item) => item.group === group).length >= SAMPLE_PER_GROUP) break;
      if (!picked.includes(row)) picked.push(row);
    }
  }
  // Three at a time: quick enough, without asking OONI for two dozen measurements at once.
  const read = await mapLimit(picked, 3, async (row) => {
    try {
      const meta = await fetch(`${API}/measurement_meta?measurement_uid=${encodeURIComponent(row.measurement_uid)}&full=true`, { cacheTtlMs: 7 * 24 * 60 * 60_000, timeoutMs: 30_000 });
      const body = typeof meta?.raw_measurement === 'string' ? JSON.parse(meta.raw_measurement) : meta?.raw_measurement;
      return { group: row.group, input: row.input, asn: normalizeAsn(String(row.probe_asn)), ...classifyDnscheck(body?.test_keys) };
    } catch {
      // A measurement that cannot be read is left out, not counted as a failure.
      return null;
    }
  });
  const rows = read.filter(Boolean);
  return {
    ok: true,
    source: 'OONI dnscheck',
    status: rows.length ? 'observed' : 'no_data',
    since,
    until,
    sampled: rows.length,
    networks: new Set(rows.map((row) => row.asn)).size,
    ...summarizeEncryptedDns(rows),
    sourceUrl: listUrl,
  };
}
