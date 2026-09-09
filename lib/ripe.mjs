import { asRecord, fetchJson, mean, normalizeAsn, parseNumber, validateRange } from './common.mjs';

export const RIPE_ATLAS_PROBE_TIMEOUT_MS = 20_000;
export const RIPE_ATLAS_RESULT_TIMEOUT_MS = 30_000;

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

function chunks(array, size) {
  const output = [];
  for (let i = 0; i < array.length; i += size) output.push(array.slice(i, i + size));
  return output;
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
      fetchedProbeCount: probeIds.length,
      probeListTruncated: probePages.truncated,
      series: [],
      overall: { averageRttMs: null, packetLossPercent: null, samples: 0, observedProbes: 0 },
      status: 'no_data',
      note: 'No active public RIPE Atlas probes matched this scope.',
    };
  }

  const start = Math.floor(Date.parse(`${since}T00:00:00Z`) / 1000);
  const stop = Math.floor(Date.parse(`${until}T23:59:59Z`) / 1000);
  const resultRows = [];
  for (const batch of chunks(probeIds, 100)) {
    const resultUrl = `https://atlas.ripe.net/api/v2/measurements/1001/results/?start=${start}&stop=${stop}&format=json&probe_ids=${batch.join(',')}`;
    const payload = await fetchJson(resultUrl, { timeoutMs: RIPE_ATLAS_RESULT_TIMEOUT_MS });
    const record = asRecord(payload);
    const rows = Array.isArray(payload) ? payload : Array.isArray(record?.results) ? record.results : [];
    resultRows.push(...rows);
  }

  const byDay = new Map();
  const observedProbes = new Set();
  let totalSamples = 0;
  let lostSamples = 0;
  const allRtts = [];

  for (const raw of resultRows) {
    const item = asRecord(raw);
    if (!item || typeof item.timestamp !== 'number') continue;
    const date = new Date(item.timestamp * 1000).toISOString().slice(0, 10);
    const current = byDay.get(date) ?? { rtts: [], total: 0, lost: 0, probes: new Set() };
    current.total += 1;
    totalSamples += 1;
    if (typeof item.prb_id === 'number') {
      current.probes.add(item.prb_id);
      observedProbes.add(item.prb_id);
    }
    let rtt = parseNumber(item.avg);
    if (rtt === null && Array.isArray(item.result)) {
      rtt = item.result.map((part) => parseNumber(asRecord(part)?.rtt)).find((value) => value !== null) ?? null;
    }
    if (rtt === null || rtt < 0) {
      current.lost += 1;
      lostSamples += 1;
    } else {
      current.rtts.push(rtt);
      allRtts.push(rtt);
    }
    byDay.set(date, current);
  }

  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({
    date,
    rttMs: row.rtts.length ? Math.round(mean(row.rtts) * 10) / 10 : null,
    packetLossPercent: row.total ? Math.round((row.lost / row.total) * 1000) / 10 : null,
    samples: row.total,
    probes: row.probes.size,
  }));

  const overall = {
    averageRttMs: allRtts.length ? Math.round(mean(allRtts) * 10) / 10 : null,
    packetLossPercent: totalSamples ? Math.round((lostSamples / totalSamples) * 1000) / 10 : null,
    samples: totalSamples,
    observedProbes: observedProbes.size,
  };

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
    probeCount,
    fetchedProbeCount: probeIds.length,
    probeListTruncated: probePages.truncated,
    series,
    overall,
    status: series.length ? 'observed' : 'no_data',
    note: series.length
      ? `Built-in Ping 1001 observed ${overall.observedProbes} probe(s) in the selected Iran scope. RTT/loss describe paths to the measurement target, not general internet reachability.${probePages.truncated ? ' Probe discovery hit the safety cap; results cover only the fetched probe subset.' : ''}`
      : 'Probes exist, but Built-in Ping 1001 returned no results in the selected period.',
  };
}
