import { asRecord, fetchJson, normalizeAsn, parseNumber, validateRange } from './common.mjs';

const APNIC_BASE = 'https://data1.labs.apnic.net/v6stats';
const APNIC_ASN_FALLBACK = 'https://stats.labs.apnic.net/cgi-bin/json-table-v6.pl';
const COUNTRY = 'IR';

export const APNIC_IPV6_DOCS = 'https://data1.labs.apnic.net/ipv6-data-format.html';

export function buildApnicIpv6Urls({ asn = '' } = {}) {
  const normalized = asn ? normalizeAsn(asn) : '';
  if (!normalized) {
    return {
      primary: `${APNIC_BASE}/v6economy/${COUNTRY}.json`,
      fallback: null,
      scope: 'country',
      asn: null,
    };
  }
  const numeric = normalized.slice(2);
  return {
    primary: `${APNIC_BASE}/v6economyas/${COUNTRY}/${normalized}.json`,
    fallback: `${APNIC_ASN_FALLBACK}?x=${COUNTRY}${numeric}`,
    scope: 'asn',
    asn: normalized,
  };
}

function metricBlock(value) {
  const row = asRecord(value) ?? {};
  return {
    seen: parseNumber(row.seen),
    capable: parseNumber(row.capable),
    capablePercent: parseNumber(row.capable_pc),
    preferred: parseNumber(row.preferred),
    preferredPercent: parseNumber(row.preferred_pc),
  };
}

function percentile(values, fraction) {
  const clean = values.map(parseNumber).filter((value) => value !== null).sort((a, b) => a - b);
  if (!clean.length) return null;
  const position = (clean.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return clean[lower];
  return clean[lower] + (clean[upper] - clean[lower]) * (position - lower);
}

export function parseApnicIpv6(payload, { asn = '', since, until }) {
  validateRange(since, until, 120);
  const root = asRecord(payload) ?? {};
  const data = Array.isArray(root.data) ? root.data : [];
  const expectedAsn = asn ? normalizeAsn(asn) : '';

  const points = data.map((raw) => {
    const row = asRecord(raw);
    if (!row) return null;
    const date = String(row.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < since || date > until) return null;
    if (String(row.cc ?? '').toUpperCase() !== COUNTRY) return null;
    if (expectedAsn) {
      const observedAsn = row.as === undefined || row.as === null ? '' : normalizeAsn(String(row.as));
      if (observedAsn !== expectedAsn) return null;
    }
    return {
      date,
      raw: metricBlock(row.raw),
      smoothed30: metricBlock(row['30']),
      updated: typeof row.updated === 'string' ? row.updated : null,
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  const sampleCounts = points.map((point) => point.raw.seen).filter((value) => value !== null);
  const totalSamples = sampleCounts.reduce((sum, value) => sum + value, 0);
  const latest = points.at(-1) ?? null;

  return {
    points,
    latest,
    coverage: {
      observedDays: points.length,
      totalRawSamples: totalSamples,
      dailySamplesMin: sampleCounts.length ? Math.min(...sampleCounts) : null,
      dailySamplesMedian: percentile(sampleCounts, 0.5),
      dailySamplesMax: sampleCounts.length ? Math.max(...sampleCounts) : null,
    },
    providerUpdated: latest?.updated ?? null,
    copyright: typeof root.copyright === 'string' ? root.copyright : null,
    description: typeof root.description === 'string' ? root.description : null,
  };
}

async function fetchWithFallback(urls) {
  try {
    return { payload: await fetchJson(urls.primary, { cacheTtlMs: 30 * 60_000, timeoutMs: 20_000 }), sourceUrl: urls.primary, fallbackUsed: false };
  } catch (primaryError) {
    if (!urls.fallback) throw primaryError;
    try {
      return { payload: await fetchJson(urls.fallback, { cacheTtlMs: 30 * 60_000, timeoutMs: 20_000 }), sourceUrl: urls.fallback, fallbackUsed: true };
    } catch (fallbackError) {
      throw new Error(`APNIC IPv6 JSON unavailable from primary and fallback endpoints. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}; fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }
}

export async function getApnicIpv6(input) {
  validateRange(input.since, input.until, 120);
  const urls = buildApnicIpv6Urls(input);
  const fetched = await fetchWithFallback(urls);
  const parsed = parseApnicIpv6(fetched.payload, input);
  return {
    ok: true,
    source: 'APNIC Labs IPv6',
    status: parsed.points.length ? 'observed' : 'no_data',
    country: COUNTRY,
    asn: urls.asn,
    since: input.since,
    until: input.until,
    points: parsed.points,
    latest: parsed.latest,
    coverage: parsed.coverage,
    providerUpdated: parsed.providerUpdated,
    sourceUrl: fetched.sourceUrl,
    primarySourceUrl: urls.primary,
    fallbackUsed: fetched.fallbackUsed,
    docsUrl: APNIC_IPV6_DOCS,
    attribution: parsed.copyright,
    fetchedAt: new Date().toISOString(),
    note: 'APNIC Labs IPv6 capability/preference is client-side protocol deployment context derived from APNIC measurement experiments. Raw sample counts are preserved. IPv6 capability or preference changes are not, by themselves, evidence of censorship, throttling intent, or Internet availability, and this source is not counted as an independent censorship vote.',
  };
}
