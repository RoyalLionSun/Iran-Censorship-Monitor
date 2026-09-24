import { asRecord, fetchJson, fetchText, normalizeAsn, parseNumber, validateRange } from './common.mjs';

const APNIC_BASE = 'https://data1.labs.apnic.net/v6stats';
const APNIC_ASN_FALLBACK = 'https://stats.labs.apnic.net/cgi-bin/json-table-v6.pl';
const COUNTRY = 'IR';
const REFERENCE_DAYS = 365;

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

  // A low IPv6 share only means something where IPv6 was in use before. APNIC ships the whole
  // history, so the year before the window is the network's own reference level.
  const referenceSince = new Date(Date.parse(`${since}T00:00:00Z`) - REFERENCE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const reference = { seen: 0, capable: 0, days: 0 };

  const points = data.map((raw) => {
    const row = asRecord(raw);
    if (!row) return null;
    const date = String(row.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < referenceSince || date > until) return null;
    if (String(row.cc ?? '').toUpperCase() !== COUNTRY) return null;
    if (expectedAsn) {
      const observedAsn = row.as === undefined || row.as === null ? '' : normalizeAsn(String(row.as));
      if (observedAsn !== expectedAsn) return null;
    }
    const point = {
      date,
      raw: metricBlock(row.raw),
      smoothed30: metricBlock(row['30']),
      updated: typeof row.updated === 'string' ? row.updated : null,
    };
    if (date < since) {
      if (point.raw.seen > 0 && point.raw.capable !== null) {
        reference.seen += point.raw.seen;
        reference.capable += point.raw.capable;
        reference.days += 1;
      }
      return null;
    }
    return point;
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  const sampleCounts = points.map((point) => point.raw.seen).filter((value) => value !== null);
  const totalSamples = sampleCounts.reduce((sum, value) => sum + value, 0);
  const latest = points.at(-1) ?? null;

  return {
    points,
    latest,
    // Sample-weighted, so days with a handful of samples cannot swing it.
    reference: reference.seen ? {
      since: referenceSince,
      until: new Date(Date.parse(`${since}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10),
      observedDays: reference.days,
      samples: reference.seen,
      capablePercent: Math.round((reference.capable / reference.seen) * 1000) / 10,
    } : null,
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
    reference: parsed.reference,
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

const APNIC_COUNTRY_PAGE = 'https://stats.labs.apnic.net/ipv6/IR';

// APNIC files a sample under Iran by the client's geolocation, like OONI. Its per-network table
// shows networks registered abroad among them, above all Cloudflare's WARP VPN, whose users
// raise Iran's IPv6 share. Returns the split between Iranian and foreign networks.
export function parseApnicCountryTable(html, iranAsns) {
  const rows = [...String(html).matchAll(/AS(\d+)[^"]*","([^"]*)",\{v: ([\d.]+)[^}]*\},\{v: ([\d.]+)[^}]*\},(\d+)\]/g)]
    .map((match) => ({ asn: `AS${match[1]}`, name: match[2], capablePercent: Number(match[3]), samples: Number(match[5]) }));
  if (!rows.length) return null;
  const sum = (list, pick) => list.reduce((total, row) => total + pick(row), 0);
  const foreign = rows.filter((row) => !iranAsns.has(row.asn));
  const iranian = rows.filter((row) => iranAsns.has(row.asn));
  const capable = (list) => {
    const samples = sum(list, (row) => row.samples);
    return samples ? Math.round((sum(list, (row) => row.samples * row.capablePercent / 100) / samples) * 1000) / 10 : null;
  };
  const samples = sum(rows, (row) => row.samples);
  const foreignSamples = sum(foreign, (row) => row.samples);
  return {
    samples, foreignSamples,
    foreignSharePercent: samples ? Math.round((foreignSamples / samples) * 1000) / 10 : null,
    capableAllPercent: capable(rows), capableIranianPercent: capable(iranian),
    foreign: foreign.sort((a, b) => b.samples - a.samples).slice(0, 5),
  };
}

export async function getApnicCountryComposition(iranAsns) {
  if (!iranAsns?.size) return null;
  try {
    const html = await fetchText(APNIC_COUNTRY_PAGE, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 });
    return parseApnicCountryTable(html, iranAsns);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- VPN use (Cloudflare WARP)

// Iranian users who reach the internet through Cloudflare's WARP VPN appear in APNIC's samples
// for Iran under AS13335. Their share of all samples filed under Iran shows, over time, whether
// this way around the filter is in use and when it stopped working (February to August 2026 it
// fell from about 3% to under 1%). Measured from users in Iran; an estimate from APNIC's
// advertisement-based samples, context for circumvention, never an access claim for a service.
export const APNIC_WARP_ASN = 'AS13335';
const APNIC_WARP_URL = `${APNIC_ASN_FALLBACK}?x=${COUNTRY}${APNIC_WARP_ASN.slice(2)}`;
const APNIC_COUNTRY_URL = `${APNIC_BASE}/v6economy/${COUNTRY}.json`;
// Below this many samples for all of Iran (30-day average) a share is noise, e.g. in a blackout.
const VPN_MIN_COUNTRY_SAMPLES = 1000;

function seriesByDate(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return new Map(rows.filter((row) => typeof row?.date === 'string').map((row) => [row.date, Number(row?.['30']?.seen)]));
}

export function parseApnicVpnShare(countryPayload, warpPayload, { until }) {
  const country = seriesByDate(countryPayload);
  const warp = seriesByDate(warpPayload);
  const points = [...warp.entries()].filter(([date]) => country.has(date) && date <= until).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seen]) => {
      const total = country.get(date);
      const reliable = Number.isFinite(total) && total >= VPN_MIN_COUNTRY_SAMPLES && Number.isFinite(seen);
      return { date, share: reliable ? Math.round((seen / total) * 1000) / 10 : null, samples: Math.round(total || 0) };
    });
  const usable = points.filter((point) => point.share !== null);
  const current = usable.at(-1) ?? null;
  if (!current) return null;
  const dayMs = 86_400_000;
  const near = (target) => usable.reduce((best, point) => {
    const distance = Math.abs(Date.parse(point.date) - target);
    return distance <= 20 * dayMs && (!best || distance < best.distance) ? { point, distance } : best;
  }, null)?.point ?? null;
  const yearAgo = near(Date.parse(current.date) - 365 * dayMs);
  // Monthly medians for the last 12 months: a small, honest picture of the trend.
  const months = [];
  for (let back = 11; back >= 0; back -= 1) {
    const date = new Date(Date.parse(`${current.date.slice(0, 7)}-01T00:00:00Z`));
    date.setUTCMonth(date.getUTCMonth() - back);
    const month = date.toISOString().slice(0, 7);
    const values = usable.filter((point) => point.date.startsWith(month)).map((point) => point.share).sort((a, b) => a - b);
    months.push({ month, share: values.length >= 5 ? values[Math.floor(values.length / 2)] : null });
  }
  const measured = months.filter((month) => month.share !== null);
  const lowest = measured.length ? measured.reduce((low, month) => (month.share < low.share ? month : low)) : null;
  return { current, yearAgo, months, lowest };
}

export async function getApnicVpnShare({ until }) {
  const [countryPayload, warpPayload] = await Promise.all([
    fetchJson(APNIC_COUNTRY_URL, { cacheTtlMs: 12 * 60 * 60 * 1000, timeoutMs: 30_000 }),
    fetchJson(APNIC_WARP_URL, { cacheTtlMs: 12 * 60 * 60 * 1000, timeoutMs: 30_000 }),
  ]);
  const parsed = parseApnicVpnShare(countryPayload, warpPayload, { until });
  return {
    ok: true, source: 'APNIC Labs', status: parsed ? 'observed' : 'no_data', asn: APNIC_WARP_ASN, until,
    ...(parsed ?? {}), sourceUrl: APNIC_WARP_URL, countryUrl: APNIC_COUNTRY_URL,
    note: 'Share of APNIC samples filed under Iran that arrive through Cloudflare WARP (AS13335), 30-day averages. An estimate of VPN use, not a census.',
  };
}
