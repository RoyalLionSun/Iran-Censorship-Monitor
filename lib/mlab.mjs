import { fetchJson, normalizeAsn, parseNumber } from './common.mjs';

const MLAB_STATS_BASE = 'https://statistics.measurementlab.net/v0';
const CONTINENT = 'AS';
const COUNTRY = 'IR';

export const MLAB_MIN_DAILY_SAMPLES = 20;
export const MLAB_RECENT_DAYS = 3;
export const MLAB_MAX_BASELINE_DAYS = 7;
export const MLAB_MIN_BASELINE_DAYS = 3;

function median(values) {
  const clean = values.map(parseNumber).filter((value) => value !== null).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function relativeChangePercent(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function yearsForRange(since, until) {
  const start = Number(String(since).slice(0, 4));
  const end = Number(String(until).slice(0, 4));
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) throw new Error('Invalid M-Lab date range.');
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function buildMlabStatsUrls({ asn = '', since, until }) {
  const normalizedAsn = asn ? normalizeAsn(asn) : '';
  const scope = normalizedAsn ? `/asn/${normalizedAsn}` : '';
  return yearsForRange(since, until).map((year) => ({
    year,
    url: `${MLAB_STATS_BASE}/${CONTINENT}/${COUNTRY}${scope}/${year}/histogram_daily_stats.json`,
  }));
}

function firstNumber(rows, key) {
  for (const row of rows) {
    const value = parseNumber(row?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function histogram(rows, prefix) {
  const fractionKey = `${prefix}_frac_bucket`;
  const sampleKey = `${prefix}_samples_bucket`;
  return rows.map((row) => ({
    bucketMinMbps: parseNumber(row?.bucket_min),
    bucketMaxMbps: parseNumber(row?.bucket_max),
    fraction: parseNumber(row?.[fractionKey]),
    samples: parseNumber(row?.[sampleKey]),
  })).filter((row) => row.bucketMinMbps !== null && row.bucketMaxMbps !== null);
}

export function parseMlabStats(payloads, { asn = '', since, until }) {
  const rows = payloads.flatMap((payload) => Array.isArray(payload) ? payload : []);
  const byDate = new Map();

  for (const row of rows) {
    const date = String(row?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < since || date > until) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }

  const points = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayRows]) => ({
    date,
    downloadMedianMbps: firstNumber(dayRows, 'download_MED'),
    uploadMedianMbps: firstNumber(dayRows, 'upload_MED'),
    downloadMinRttMedianMs: firstNumber(dayRows, 'download_minRTT_MED'),
    uploadMinRttMedianMs: firstNumber(dayRows, 'upload_minRTT_MED'),
    downloadSamples: firstNumber(dayRows, 'dl_samples_day'),
    uploadSamples: firstNumber(dayRows, 'ul_samples_day'),
    downloadHistogram: histogram(dayRows, 'dl'),
    uploadHistogram: histogram(dayRows, 'ul'),
  }));

  return {
    asn: asn ? normalizeAsn(asn) : null,
    points,
  };
}

function compareMetric(points, { valueKey, sampleKey, unit }) {
  const eligible = points.filter((point) => {
    const value = parseNumber(point?.[valueKey]);
    const samples = parseNumber(point?.[sampleKey]);
    return value !== null && samples !== null && samples >= MLAB_MIN_DAILY_SAMPLES;
  });

  const minimumDays = MLAB_RECENT_DAYS + MLAB_MIN_BASELINE_DAYS;
  if (eligible.length < minimumDays) {
    return {
      status: 'insufficient-data',
      unit,
      eligibleDays: eligible.length,
      requiredDailySamples: MLAB_MIN_DAILY_SAMPLES,
      requiredEligibleDays: minimumDays,
    };
  }

  const recent = eligible.slice(-MLAB_RECENT_DAYS);
  const preceding = eligible.slice(0, -MLAB_RECENT_DAYS);
  const baseline = preceding.slice(-MLAB_MAX_BASELINE_DAYS);
  if (baseline.length < MLAB_MIN_BASELINE_DAYS) {
    return {
      status: 'insufficient-data',
      unit,
      eligibleDays: eligible.length,
      requiredDailySamples: MLAB_MIN_DAILY_SAMPLES,
      requiredEligibleDays: minimumDays,
    };
  }

  const baselineMedian = median(baseline.map((point) => point[valueKey]));
  const recentMedian = median(recent.map((point) => point[valueKey]));
  return {
    status: 'observed',
    unit,
    baselineMedian,
    recentMedian,
    changePercent: relativeChangePercent(recentMedian, baselineMedian),
    baselineDays: baseline.map((point) => point.date),
    recentDays: recent.map((point) => point.date),
    baselineSamples: baseline.reduce((sum, point) => sum + (parseNumber(point[sampleKey]) || 0), 0),
    recentSamples: recent.reduce((sum, point) => sum + (parseNumber(point[sampleKey]) || 0), 0),
    requiredDailySamples: MLAB_MIN_DAILY_SAMPLES,
  };
}

export function buildMlabComparison(points) {
  const metrics = {
    downloadMedianMbps: compareMetric(points, { valueKey: 'downloadMedianMbps', sampleKey: 'downloadSamples', unit: 'Mbps' }),
    uploadMedianMbps: compareMetric(points, { valueKey: 'uploadMedianMbps', sampleKey: 'uploadSamples', unit: 'Mbps' }),
    downloadMinRttMedianMs: compareMetric(points, { valueKey: 'downloadMinRttMedianMs', sampleKey: 'downloadSamples', unit: 'ms' }),
  };
  const observedMetrics = Object.values(metrics).filter((metric) => metric.status === 'observed').length;
  return {
    status: observedMetrics ? 'observed' : 'insufficient-data',
    observedMetrics,
    requiredDailySamples: MLAB_MIN_DAILY_SAMPLES,
    recentWindowDays: MLAB_RECENT_DAYS,
    maxBaselineWindowDays: MLAB_MAX_BASELINE_DAYS,
    minimumBaselineDays: MLAB_MIN_BASELINE_DAYS,
    metrics,
    interpretation: 'Relative NDT performance context only. A throughput decrease or RTT increase is not, by itself, evidence of censorship, throttling intent, or national Internet unavailability.',
  };
}

export async function getMlabPerformance(input) {
  const requests = buildMlabStatsUrls(input);
  const results = await Promise.all(requests.map(async ({ year, url }) => {
    try {
      return { year, url, payload: await fetchJson(url) };
    } catch (error) {
      return { year, url, error: error instanceof Error ? error.message : String(error) };
    }
  }));

  const successful = results.filter((result) => Array.isArray(result.payload));
  if (!successful.length) {
    const detail = results.map((result) => `${result.year}: ${result.error || 'no JSON array returned'}`).join('; ');
    throw new Error(`M-Lab statistics unavailable for the selected scope. ${detail}`);
  }

  const parsed = parseMlabStats(successful.map((result) => result.payload), input);
  const comparison = buildMlabComparison(parsed.points);
  const latest = parsed.points.at(-1) || null;
  const partialErrors = results.filter((result) => result.error).map(({ year, url, error }) => ({ year, url, error }));

  return {
    ok: true,
    source: 'M-Lab NDT',
    status: parsed.points.length ? (comparison.status === 'observed' ? 'observed' : 'limited_coverage') : 'no_data',
    country: COUNTRY,
    asn: parsed.asn,
    since: input.since,
    until: input.until,
    sourceUrls: requests.map((request) => request.url),
    points: parsed.points,
    latest,
    comparison,
    partialErrors,
    methodology: {
      aggregation: 'M-Lab stats-pipeline daily NDT aggregates; the eight speed-histogram buckets for each day share the same daily summary statistics and are collapsed to one dashboard point per day.',
      coverageGate: `Relative comparisons use only days with at least ${MLAB_MIN_DAILY_SAMPLES} samples for the relevant direction.`,
      comparison: `Median of the newest ${MLAB_RECENT_DAYS} eligible days versus the median of up to ${MLAB_MAX_BASELINE_DAYS} preceding eligible days; at least ${MLAB_MIN_BASELINE_DAYS} baseline days are required.`,
      boundary: 'M-Lab NDT reflects the population of clients that ran tests and IP-derived geography. It is performance context, not an independent censorship vote or a complete population-representative national availability measure.',
    },
    fetchedAt: new Date().toISOString(),
  };
}
