import { asRecord, fetchJson, mapLimit, normalizeAsn, parseNumber, validateRange, weightedAverage } from './common.mjs';

export const RIPE_ATLAS_PROBE_TIMEOUT_MS = 20_000;
export const RIPE_ATLAS_STATS_TIMEOUT_MS = 15_000;
export const RIPE_ATLAS_STATS_CONCURRENCY = 6;
export const RIPE_ATLAS_STATS_MAX_PAGES = 3;

export async function readProbePages(initialUrl, fetcher = fetchJson, maxPages = 10) {
  const rows = [];
  let nextUrl = initialUrl;
  let declaredCount = null;
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    const payload = asRecord(await fetcher(nextUrl));
    if (!payload) break;
    if (declaredCount === null && typeof payload.count === 'number') declaredCount = payload.count;
    const pageRows = Array.isArray(payload.results) ? payload.results : [];
    rows.push(...pageRows);
    nextUrl = typeof payload.next === 'string' && payload.next ? payload.next : null;
    pages += 1;
  }

  return {
    rows,
    declaredCount: declaredCount ?? rows.length,
    pages,
    truncated: Boolean(nextUrl),
    nextUrl,
  };
}

function timestampMs(value) {
  const numeric = parseNumber(value);
  if (numeric !== null) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRipePingStatsUrl({ probeId, since, until, page = 1 }) {
  const id = Number(probeId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Exactly one valid RIPE Atlas probe ID is required.');
  const params = new URLSearchParams({
    probe_ids: String(id),
    resolution: 'day',
    start: `${since}T00:00:00Z`,
    stop: `${until}T23:59:59Z`,
    page_size: '500',
    page: String(page),
    format: 'json',
  });
  return `https://atlas.ripe.net/api/v2/measurements/1001/ping-stats/?${params}`;
}

export async function readPingStatsPages(initialUrl, fetcher = fetchJson, maxPages = RIPE_ATLAS_STATS_MAX_PAGES) {
  const rows = [];
  let nextUrl = initialUrl;
  let pages = 0;
  while (nextUrl && pages < maxPages) {
    const payload = asRecord(await fetcher(nextUrl));
    if (!payload) throw new Error('RIPE Atlas ping-stats returned an invalid response envelope.');
    rows.push(...(Array.isArray(payload.results) ? payload.results : []));
    nextUrl = typeof payload.next === 'string' && payload.next ? payload.next : null;
    pages += 1;
  }
  return { rows, pages, truncated: Boolean(nextUrl), nextUrl };
}

export function parseRipePingStats(rows, { since, until }) {
  const byDay = new Map();
  const observedProbes = new Set();

  for (const raw of rows ?? []) {
    const item = asRecord(raw);
    const probeId = parseNumber(item?.probe_id);
    if (!item || probeId === null || !Array.isArray(item.data)) continue;

    for (const bucket of item.data) {
      if (!Array.isArray(bucket) || bucket.length < 3) continue;
      const time = timestampMs(bucket[0]);
      const sent = parseNumber(bucket[1]);
      const received = parseNumber(bucket[2]);
      const medianRtt = parseNumber(bucket[4]);
      if (time === null || sent === null || received === null || sent < 0 || received < 0) continue;
      const date = new Date(time).toISOString().slice(0, 10);
      if (date < since || date > until) continue;

      const current = byDay.get(date) ?? { sent: 0, received: 0, rttRows: [], probes: new Set() };
      current.sent += sent;
      current.received += Math.min(received, sent);
      if (medianRtt !== null && medianRtt >= 0 && received > 0) current.rttRows.push({ value: medianRtt, weight: received });
      current.probes.add(probeId);
      observedProbes.add(probeId);
      byDay.set(date, current);
    }
  }

  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => {
    const rttMs = weightedAverage(row.rttRows, 'value', 'weight');
    return {
      date,
      rttMs: rttMs === null ? null : Math.round(rttMs * 10) / 10,
      packetLossPercent: row.sent ? Math.round(((row.sent - row.received) / row.sent) * 1000) / 10 : null,
      samples: row.sent,
      receivedPackets: row.received,
      probes: row.probes.size,
    };
  });

  const totalSent = series.reduce((sum, row) => sum + row.samples, 0);
  const totalReceived = series.reduce((sum, row) => sum + row.receivedPackets, 0);
  const averageRtt = weightedAverage(series.map((row) => ({ value: row.rttMs, weight: row.receivedPackets })), 'value', 'weight');
  return {
    series,
    overall: {
      averageRttMs: averageRtt === null ? null : Math.round(averageRtt * 10) / 10,
      packetLossPercent: totalSent ? Math.round(((totalSent - totalReceived) / totalSent) * 1000) / 10 : null,
      samples: totalSent,
      observedProbes: observedProbes.size,
    },
  };
}

export async function getRipeSignals({ asn = '', since, until }) {
  validateRange(since, until, 120);
  const normalizedAsn = normalizeAsn(asn);
  const params = new URLSearchParams({ country_code: 'IR', status: '1', page_size: '500' });
  if (normalizedAsn) params.set('asn_v4', normalizedAsn.replace(/^AS/, ''));
  const probesUrl = `https://atlas.ripe.net/api/v2/probes/?${params}`;
  const fetchedAt = new Date().toISOString();
  const probePages = await readProbePages(
    probesUrl,
    (url) => fetchJson(url, { timeoutMs: RIPE_ATLAS_PROBE_TIMEOUT_MS }),
  );
  const probeRows = probePages.rows;
  const probeIds = [...new Set(probeRows.map((row) => asRecord(row)?.id).filter((id) => Number.isInteger(id)))];
  const probeCount = probePages.declaredCount;

  if (!probeIds.length) {
    return {
      ok: true,
      source: 'RIPE Atlas',
      asn: normalizedAsn || null,
      since,
      until,
      fetchedAt,
      probesUrl,
      measurementId: 1001,
      probeCount,
      fetchedProbeCount: 0,
      probeListTruncated: probePages.truncated,
      statsRequests: 0,
      failedStatsProbes: [],
      series: [],
      overall: { averageRttMs: null, packetLossPercent: null, samples: 0, observedProbes: 0 },
      status: 'no_data',
      note: 'No active public RIPE Atlas probes matched this scope.',
    };
  }

  const probeStats = await mapLimit(probeIds, RIPE_ATLAS_STATS_CONCURRENCY, async (probeId, index) => {
    const url = buildRipePingStatsUrl({ probeId, since, until });
    try {
      const pages = await readPingStatsPages(
        url,
        (nextUrl) => fetchJson(nextUrl, { timeoutMs: RIPE_ATLAS_STATS_TIMEOUT_MS }),
      );
      return { index, probeId, url, ...pages };
    } catch (error) {
      return { index, probeId, url, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const successfulStats = probeStats.filter((result) => !result.error);
  const failedStatsProbes = probeStats.filter((result) => result.error).map(({ probeId, url, error }) => ({ probeId, url, error }));
  const truncatedStatsProbes = successfulStats.filter((result) => result.truncated).map(({ probeId, nextUrl }) => ({ probeId, nextUrl }));

  if (!successfulStats.length) {
    const detail = failedStatsProbes.map((result) => `probe ${result.probeId}: ${result.error}`).join('; ');
    throw new Error(`RIPE Atlas ping-stats unavailable for the selected scope. ${detail}`);
  }

  const parsed = parseRipePingStats(successfulStats.flatMap((result) => result.rows), { since, until });
  const incomplete = probePages.truncated || failedStatsProbes.length > 0 || truncatedStatsProbes.length > 0;
  const status = parsed.series.length ? (incomplete ? 'partial' : 'observed') : (incomplete ? 'partial' : 'no_data');

  return {
    ok: true,
    source: 'RIPE Atlas',
    asn: normalizedAsn || null,
    since,
    until,
    fetchedAt,
    probesUrl,
    measurementId: 1001,
    measurementUrl: 'https://atlas.ripe.net/measurements/1001/',
    statsEndpoint: 'https://atlas.ripe.net/api/v2/measurements/1001/ping-stats/',
    probeCount,
    fetchedProbeCount: probeIds.length,
    probeListTruncated: probePages.truncated,
    statsRequests: probeIds.length,
    successfulStatsProbes: successfulStats.length,
    failedStatsProbes,
    truncatedStatsProbes,
    series: parsed.series,
    overall: parsed.overall,
    status,
    methodology: {
      source: 'RIPE Atlas built-in IPv4 Ping 1001 to k.root-servers.net.',
      aggregation: 'RIPE Atlas ping-stats daily buckets. Packet loss is derived from packets sent versus received. RTT is the received-packet-weighted mean of RIPE per-probe daily median RTT values.',
      transport: 'Runtime acceptance on 2026-09-09 showed that the public ping-stats service requires one probe per request despite the reference describing probe_ids as comma-separated. The adapter therefore issues one bounded request per selected probe with limited concurrency.',
      coverage: 'Probe inventory is restricted to active Iran probes and optional selected ASN. Failed or pagination-truncated probe requests are surfaced and force status=partial.',
      assessmentBoundary: 'Only complete status=observed RIPE Atlas coverage is eligible for automated corroboration/control-vs-data-plane assessment. Partial results remain visible but are excluded from those votes.',
    },
    note: parsed.series.length
      ? `Built-in Ping 1001 observed ${parsed.overall.observedProbes} probe(s) in the selected Iran scope using RIPE Atlas daily ping statistics. RTT/loss describe paths to k.root-servers.net, not general Internet reachability.${incomplete ? ' Coverage is partial; incomplete probe requests are excluded from automated assessment.' : ''}`
      : incomplete
        ? 'RIPE Atlas returned incomplete ping-stat coverage and no usable daily buckets; the source is marked partial and excluded from automated assessment.'
        : 'Probes exist, but Built-in Ping 1001 returned no daily ping-stat buckets in the selected period.',
  };
}
