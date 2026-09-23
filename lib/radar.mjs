import { asRecord, fetchJson, inclusiveDays, normalizeAsn, parseNumber, utcEnd, utcStart, validateRange } from './common.mjs';

const RADAR_NOW_SAFETY_MS = 60_000;

function tokenState() {
  return {
    ok: true,
    source: 'Cloudflare Radar',
    status: 'token_required',
    assessmentEligible: false,
    fetchedAt: new Date().toISOString(),
    traffic: { status: 'token_required', series: [], meta: null },
    outages: { status: 'token_required', annotations: [] },
    bgp: { status: 'token_required', events: [] },
    trafficAnomalies: { status: 'token_required', events: [] },
    protocolMix: { status: 'token_required', dimensions: {} },
    note: 'Set CLOUDFLARE_RADAR_API_TOKEN with Account > Radar > Read to enable live Radar signals.',
  };
}

export function radarAggregationInterval(since, until) {
  const days = inclusiveDays(since, until);
  if (days <= 2) return '15m';
  if (days <= 14) return '1h';
  if (days <= 90) return '1d';
  return '1w';
}

export function radarEffectiveDateEnd(until, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) throw new Error('Invalid current time for Cloudflare Radar request.');

  const requestedDayStartMs = Date.parse(utcStart(until));
  const requestedEnd = utcEnd(until);
  const requestedEndMs = Date.parse(requestedEnd);
  if (requestedDayStartMs >= nowMs) throw new Error('Cloudflare Radar end date must be before the current UTC time.');

  const safeNowMs = nowMs - RADAR_NOW_SAFETY_MS;
  if (requestedEndMs <= safeNowMs) return requestedEnd;

  return new Date(Math.max(requestedDayStartMs, safeNowMs)).toISOString();
}

export function buildRadarUrls({ asn = '', since, until, now = new Date() }) {
  validateRange(since, until, 120);
  const normalizedAsn = normalizeAsn(asn);
  const asnNumber = normalizedAsn ? normalizedAsn.replace(/^AS/, '') : '';
  const requestedDateEnd = utcEnd(until);
  const effectiveDateEnd = radarEffectiveDateEnd(until, now);
  const common = new URLSearchParams({
    dateStart: utcStart(since),
    dateEnd: effectiveDateEnd,
    format: 'JSON',
  });

  const trafficParams = new URLSearchParams(common);
  trafficParams.set('location', 'IR');
  if (asnNumber) trafficParams.set('asn', asnNumber);
  trafficParams.set('aggInterval', radarAggregationInterval(since, until));

  const outageParams = new URLSearchParams(common);
  outageParams.set('location', 'IR');
  if (asnNumber) outageParams.set('asn', asnNumber);
  outageParams.set('limit', '100');

  const bgpParams = new URLSearchParams(common);
  bgpParams.set('per_page', '100');
  bgpParams.set('sortBy', 'TIME');
  bgpParams.set('sortOrder', 'DESC');
  if (asnNumber) bgpParams.set('involvedAsn', asnNumber);
  else bgpParams.set('involvedCountry', 'IR');

  const anomalyParams = new URLSearchParams(common);
  if (asnNumber) anomalyParams.set('asn', asnNumber);
  else anomalyParams.set('location', 'IR');
  anomalyParams.set('limit', '100');

  const summaryParams = new URLSearchParams(common);
  summaryParams.set('location', 'IR');
  if (asnNumber) summaryParams.set('asn', asnNumber);

  const summaryDimensions = ['HTTP_PROTOCOL', 'HTTP_VERSION', 'IP_VERSION', 'TLS_VERSION'];
  const summaryUrls = Object.fromEntries(summaryDimensions.map((dimension) => [
    dimension,
    `https://api.cloudflare.com/client/v4/radar/http/summary/${dimension}?${summaryParams}`,
  ]));

  return {
    normalizedAsn,
    effectiveDateEnd,
    dateEndCapped: effectiveDateEnd !== requestedDateEnd,
    trafficUrl: `https://api.cloudflare.com/client/v4/radar/http/timeseries?${trafficParams}`,
    outagesUrl: `https://api.cloudflare.com/client/v4/radar/annotations/outages?${outageParams}`,
    bgpUrl: `https://api.cloudflare.com/client/v4/radar/bgp/hijacks/events?${bgpParams}`,
    anomaliesUrl: `https://api.cloudflare.com/client/v4/radar/traffic_anomalies?${anomalyParams}`,
    summaryUrls,
  };
}

function normalizeCloudflareError(payload, fallback) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (!errors.length) return fallback;
  return errors.slice(0, 3).map((item) => {
    const record = asRecord(item) ?? {};
    const code = record.code ?? 'unknown';
    const message = typeof record.message === 'string' ? record.message : 'Cloudflare API error';
    return `${code}: ${message}`;
  }).join('; ');
}

export async function getRadarSignals({ asn = '', since, until }) {
  const token = process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim();
  if (!token) return tokenState();

  const { normalizedAsn, effectiveDateEnd, dateEndCapped, trafficUrl, outagesUrl, bgpUrl, anomaliesUrl, summaryUrls } = buildRadarUrls({ asn, since, until });
  const headers = { authorization: `Bearer ${token}` };

  const summaryEntries = Object.entries(summaryUrls);
  const settled = await Promise.allSettled([
    fetchJson(trafficUrl, { headers }),
    fetchJson(outagesUrl, { headers }),
    fetchJson(bgpUrl, { headers }),
    fetchJson(anomaliesUrl, { headers }),
    ...summaryEntries.map(([, url]) => fetchJson(url, { headers })),
  ]);

  const [trafficResult, outageResult, bgpResult, anomalyResult, ...summaryResults] = settled;
  const fetchedAt = new Date().toISOString();

  let traffic = { status: 'error', series: [], meta: null, sourceUrl: trafficUrl, error: null };
  if (trafficResult.status === 'fulfilled') {
    const payload = asRecord(trafficResult.value);
    const result = asRecord(payload?.result);
    const serie = asRecord(result?.serie_0);
    const timestamps = Array.isArray(serie?.timestamps) ? serie.timestamps : [];
    const values = Array.isArray(serie?.values) ? serie.values : [];
    const series = timestamps.map((timestamp, index) => ({
      date: typeof timestamp === 'string' ? timestamp : '',
      value: parseNumber(values[index]),
    })).filter((row) => row.date);
    const meta = asRecord(result?.meta);
    traffic = {
      status: payload?.success === true ? (series.length ? 'observed' : 'no_data') : 'error',
      series,
      meta,
      confidenceLevel: parseNumber(asRecord(meta?.confidenceInfo)?.level),
      sourceUrl: trafficUrl,
      error: payload?.success === true ? null : normalizeCloudflareError(payload, 'Cloudflare Radar response was unsuccessful.'),
    };
  } else traffic.error = trafficResult.reason instanceof Error ? trafficResult.reason.message : String(trafficResult.reason);

  let outages = { status: 'error', annotations: [], sourceUrl: outagesUrl, error: null };
  if (outageResult.status === 'fulfilled') {
    const payload = asRecord(outageResult.value);
    const result = asRecord(payload?.result);
    const annotations = Array.isArray(result?.annotations) ? result.annotations : [];
    outages = {
      status: payload?.success === true ? (annotations.length ? 'observed' : 'no_data') : 'error',
      annotations: annotations.map((raw) => {
        const item = asRecord(raw) ?? {};
        return {
          id: item.id ?? null,
          dataSource: item.dataSource ?? null,
          startDate: typeof item.startDate === 'string' ? item.startDate : null,
          endDate: typeof item.endDate === 'string' ? item.endDate : null,
          eventType: item.eventType ?? null,
          scope: item.scope ?? null,
          description: typeof item.description === 'string' ? item.description : null,
          outageCause: asRecord(item.outage)?.outageCause ?? null,
          outageType: asRecord(item.outage)?.outageType ?? null,
          asns: Array.isArray(item.asns) ? item.asns : [],
          asnsDetails: Array.isArray(item.asnsDetails) ? item.asnsDetails : [],
          locations: Array.isArray(item.locations) ? item.locations : [],
          locationsDetails: Array.isArray(item.locationsDetails) ? item.locationsDetails : [],
          linkedUrl: typeof item.linkedUrl === 'string' ? item.linkedUrl : null,
        };
      }),
      sourceUrl: outagesUrl,
      error: payload?.success === true ? null : normalizeCloudflareError(payload, 'Cloudflare Radar outage response was unsuccessful.'),
    };
  } else outages.error = outageResult.reason instanceof Error ? outageResult.reason.message : String(outageResult.reason);

  let bgp = { status: 'error', events: [], sourceUrl: bgpUrl, error: null };
  if (bgpResult.status === 'fulfilled') {
    const payload = asRecord(bgpResult.value);
    const result = asRecord(payload?.result);
    const events = Array.isArray(result?.events) ? result.events : [];
    bgp = {
      status: payload?.success === true ? (events.length ? 'observed' : 'no_data') : 'error',
      events: events.map((raw) => {
        const item = asRecord(raw) ?? {};
        return {
          id: item.id ?? null,
          confidenceScore: parseNumber(item.confidence_score),
          minTimestamp: typeof item.min_hijack_ts === 'string' ? item.min_hijack_ts : null,
          maxTimestamp: typeof item.max_hijack_ts === 'string' ? item.max_hijack_ts : null,
          hijackerAsn: item.hijacker_asn ?? null,
          hijackerCountry: item.hijacker_country ?? null,
          victimAsns: Array.isArray(item.victim_asns) ? item.victim_asns : [],
          victimCountries: Array.isArray(item.victim_countries) ? item.victim_countries : [],
          prefixes: Array.isArray(item.prefixes) ? item.prefixes : [],
          messages: parseNumber(item.hijack_msgs_count),
        };
      }),
      resultInfo: asRecord(payload?.result_info),
      sourceUrl: bgpUrl,
      error: payload?.success === true ? null : normalizeCloudflareError(payload, 'Cloudflare Radar BGP response was unsuccessful.'),
    };
  } else bgp.error = bgpResult.reason instanceof Error ? bgpResult.reason.message : String(bgpResult.reason);

  let trafficAnomalies = { status: 'error', events: [], sourceUrl: anomaliesUrl, error: null };
  if (anomalyResult.status === 'fulfilled') {
    const payload = asRecord(anomalyResult.value);
    const result = asRecord(payload?.result);
    const rawEvents = Array.isArray(result?.trafficAnomalies) ? result.trafficAnomalies : [];
    const events = rawEvents.map((raw) => {
      const item = asRecord(raw) ?? {};
      const asnDetails = asRecord(item.asnDetails);
      const locationDetails = asRecord(item.locationDetails);
      return {
        uuid: item.uuid ?? null,
        startDate: typeof item.startDate === 'string' ? item.startDate : null,
        endDate: typeof item.endDate === 'string' ? item.endDate : null,
        status: item.status ?? null,
        type: item.type ?? null,
        asn: asnDetails?.asn ?? null,
        asnName: asnDetails?.name ?? null,
        locationCode: locationDetails?.code ?? null,
        locationName: locationDetails?.name ?? null,
        visibleInDataSources: Array.isArray(item.visibleInDataSources) ? item.visibleInDataSources : [],
      };
    });
    trafficAnomalies = {
      status: payload?.success === true ? (events.length ? 'observed' : 'no_data') : 'error',
      events,
      sourceUrl: anomaliesUrl,
      error: payload?.success === true ? null : normalizeCloudflareError(payload, 'Cloudflare Radar traffic-anomaly response was unsuccessful.'),
    };
  } else trafficAnomalies.error = anomalyResult.reason instanceof Error ? anomalyResult.reason.message : String(anomalyResult.reason);

  const protocolMix = { status: 'no_data', dimensions: {}, errors: {} };
  for (let index = 0; index < summaryEntries.length; index += 1) {
    const [dimension, sourceUrl] = summaryEntries[index];
    const result = summaryResults[index];
    if (result.status === 'rejected') {
      protocolMix.errors[dimension] = result.reason instanceof Error ? result.reason.message : String(result.reason);
      continue;
    }
    const payload = asRecord(result.value);
    const resultRecord = asRecord(payload?.result);
    const rawSummary = asRecord(resultRecord?.summary_0) ?? {};
    const values = Object.fromEntries(Object.entries(rawSummary).map(([key, value]) => [key, parseNumber(value)]).filter(([, value]) => value !== null));
    protocolMix.dimensions[dimension] = {
      status: payload?.success === true ? (Object.keys(values).length ? 'observed' : 'no_data') : 'error',
      values,
      meta: asRecord(resultRecord?.meta),
      confidenceLevel: parseNumber(asRecord(asRecord(resultRecord?.meta)?.confidenceInfo)?.level),
      sourceUrl,
      error: payload?.success === true ? null : normalizeCloudflareError(payload, 'Cloudflare Radar summary response was unsuccessful.'),
    };
  }
  const dimensionStates = Object.values(protocolMix.dimensions).map((item) => item.status);
  protocolMix.status = dimensionStates.some((status) => status === 'observed') ? 'observed' : Object.keys(protocolMix.errors).length ? 'partial' : 'no_data';

  const statuses = [traffic.status, outages.status, bgp.status, trafficAnomalies.status, protocolMix.status];
  const validAssessmentStates = new Set(['observed', 'no_data']);
  const assessmentEligible = validAssessmentStates.has(outages.status) && validAssessmentStates.has(trafficAnomalies.status);
  return {
    ok: true,
    source: 'Cloudflare Radar',
    status: statuses.some((status) => status === 'observed') ? 'observed' : statuses.every((status) => status === 'error') ? 'error' : 'partial',
    assessmentEligible,
    assessmentEligibility: {
      outages: outages.status,
      trafficAnomalies: trafficAnomalies.status,
      reason: assessmentEligible
        ? 'Both Radar event channels returned valid observed/no_data states.'
        : 'Radar is excluded from assessment confidence because one or more required event channels failed.',
    },
    asn: normalizedAsn || null,
    since,
    until,
    effectiveDateEnd,
    dateEndCapped,
    fetchedAt,
    traffic,
    outages,
    bgp,
    trafficAnomalies,
    protocolMix,
    note: 'Radar HTTP traffic is a Cloudflare-observed series scoped to Iran and, when selected, the requested ASN. Outage, traffic-anomaly and BGP signals are independent event indicators and are not automatically proof of censorship.',
  };
}

const RADAR_QUALITY_BASE = 'https://api.cloudflare.com/client/v4/radar/quality/iqi/timeseries_groups';

export function buildRadarQualityUrls({ asn = '', since, until, now = new Date() }) {
  validateRange(since, until, 120);
  const normalizedAsn = normalizeAsn(asn);
  const dateStart = utcStart(since);
  const dateEnd = radarEffectiveDateEnd(until, now);
  const url = (metric) => {
    const params = new URLSearchParams({ metric, dateStart, dateEnd, aggInterval: '1d', format: 'json' });
    if (normalizedAsn) params.set('asn', normalizedAsn.replace(/^AS/, ''));
    else params.set('location', 'IR');
    return `${RADAR_QUALITY_BASE}?${params}`;
  };
  return { asn: normalizedAsn || null, scope: normalizedAsn ? 'asn' : 'country', dateStart, dateEnd, latency: url('latency'), bandwidth: url('bandwidth') };
}

function qualityPercentiles(payload) {
  const serie = asRecord(asRecord(asRecord(payload)?.result)?.serie_0);
  const timestamps = Array.isArray(serie?.timestamps) ? serie.timestamps : [];
  const points = timestamps.map((timestamp, index) => ({
    date: typeof timestamp === 'string' ? timestamp.slice(0, 10) : '',
    p25: parseNumber(serie?.p25?.[index]),
    p50: parseNumber(serie?.p50?.[index]),
    p75: parseNumber(serie?.p75?.[index]),
  })).filter((row) => row.date && row.p50 !== null);
  const medians = points.map((row) => row.p50).sort((a, b) => a - b);
  const median = medians.length ? medians[Math.floor((medians.length - 1) / 2)] : null;
  const meta = asRecord(asRecord(asRecord(payload)?.result)?.meta);
  const range = Array.isArray(meta?.dateRange) ? asRecord(meta.dateRange[0]) : null;
  return {
    points,
    median: median === null ? null : Math.round(median * 10) / 10,
    latest: points.at(-1)?.p50 ?? null,
    window: range ? { start: range.startTime ?? null, end: range.endTime ?? null } : null,
    normalization: typeof meta?.normalization === 'string' ? meta.normalization : null,
  };
}

// Cloudflare silently widens some quality queries to a 90-day window. A response that does
// not stay inside the selected window is kept visible but never speaks for that window.
export function radarQualityWindowAligned(window, { dateStart, dateEnd }) {
  const start = Date.parse(window?.start ?? '');
  const end = Date.parse(window?.end ?? '');
  const requestedStart = Date.parse(dateStart);
  const requestedEnd = Date.parse(dateEnd);
  if (![start, end, requestedStart, requestedEnd].every(Number.isFinite)) return false;
  const tolerance = 36 * 60 * 60 * 1000;
  return start >= requestedStart - tolerance && end <= requestedEnd + tolerance;
}

export async function getRadarConnectionQuality({ asn = '', since, until, now = new Date() }) {
  const token = process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim();
  const urls = buildRadarQualityUrls({ asn, since, until, now });
  const base = {
    ok: true, source: 'Cloudflare Radar', asn: urls.asn, scope: urls.scope, since, until,
    sourceUrls: { latency: urls.latency, bandwidth: urls.bandwidth },
    note: 'Cloudflare Internet Quality Index estimates latency and bandwidth from real user traffic in the selected network. Values are rolling averages of that traffic, not a controlled speed test, and they describe the measured population only.',
  };
  if (!token) {
    return { ...base, status: 'token_required', latency: null, bandwidth: null, windowAligned: false, fetchedAt: new Date().toISOString(),
      note: 'Set CLOUDFLARE_RADAR_API_TOKEN with Account > Radar > Read to enable live Radar quality signals.' };
  }
  const headers = { authorization: `Bearer ${token}` };
  const [latencyResult, bandwidthResult] = await Promise.allSettled([
    fetchJson(urls.latency, { headers }),
    fetchJson(urls.bandwidth, { headers }),
  ]);
  const latency = latencyResult.status === 'fulfilled' ? qualityPercentiles(latencyResult.value) : null;
  const bandwidth = bandwidthResult.status === 'fulfilled' ? qualityPercentiles(bandwidthResult.value) : null;
  const windowAligned = Boolean(latency?.window && radarQualityWindowAligned(latency.window, urls));
  const observed = Boolean(latency?.median !== null && latency?.points.length);
  const partialErrors = {
    latency: latencyResult.status === 'rejected' ? String(latencyResult.reason?.message ?? latencyResult.reason) : null,
    bandwidth: bandwidthResult.status === 'rejected' ? String(bandwidthResult.reason?.message ?? bandwidthResult.reason) : null,
  };
  return {
    ...base,
    status: !observed ? (partialErrors.latency ? 'error' : 'no_data') : windowAligned ? 'observed' : 'partial',
    latency, bandwidth, windowAligned,
    window: latency?.window ?? null,
    partialErrors,
    fetchedAt: new Date().toISOString(),
  };
}
