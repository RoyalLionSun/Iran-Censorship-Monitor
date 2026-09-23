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

  // Radar files a nationwide outage under the country without listing ASNs, so an ASN-scoped
  // query never returns it. A nationwide outage covers every network in Iran; ask for it too.
  const countryOutageParams = new URLSearchParams(common);
  countryOutageParams.set('location', 'IR');
  countryOutageParams.set('limit', '100');

  return {
    normalizedAsn,
    effectiveDateEnd,
    dateEndCapped: effectiveDateEnd !== requestedDateEnd,
    trafficUrl: `https://api.cloudflare.com/client/v4/radar/http/timeseries?${trafficParams}`,
    outagesUrl: `https://api.cloudflare.com/client/v4/radar/annotations/outages?${outageParams}`,
    countryOutagesUrl: asnNumber ? `https://api.cloudflare.com/client/v4/radar/annotations/outages?${countryOutageParams}` : null,
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

export function isNationwideAnnotation(item) {
  return /NATION/i.test(String(item?.outageType ?? item?.scope ?? ''));
}

function parseOutageResult(settled, sourceUrl) {
  const outages = { status: 'error', annotations: [], sourceUrl, error: null };
  if (settled.status !== 'fulfilled') {
    outages.error = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
    return outages;
  }
  const payload = asRecord(settled.value);
  const result = asRecord(payload?.result);
  const annotations = Array.isArray(result?.annotations) ? result.annotations : [];
  return {
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
    sourceUrl,
    error: payload?.success === true ? null : normalizeCloudflareError(payload, 'Cloudflare Radar outage response was unsuccessful.'),
  };
}

export async function getRadarSignals({ asn = '', since, until }) {
  const token = process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim();
  if (!token) return tokenState();

  const { normalizedAsn, effectiveDateEnd, dateEndCapped, trafficUrl, outagesUrl, countryOutagesUrl, bgpUrl, anomaliesUrl, summaryUrls } = buildRadarUrls({ asn, since, until });
  const headers = { authorization: `Bearer ${token}` };

  const summaryEntries = Object.entries(summaryUrls);
  const settled = await Promise.allSettled([
    fetchJson(trafficUrl, { headers }),
    fetchJson(outagesUrl, { headers }),
    countryOutagesUrl ? fetchJson(countryOutagesUrl, { headers }) : Promise.resolve(null),
    fetchJson(bgpUrl, { headers }),
    fetchJson(anomaliesUrl, { headers }),
    ...summaryEntries.map(([, url]) => fetchJson(url, { headers })),
  ]);

  const [trafficResult, outageResult, countryOutageResult, bgpResult, anomalyResult, ...summaryResults] = settled;
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

  let outages = parseOutageResult(outageResult, outagesUrl);
  if (countryOutagesUrl) {
    // Only nationwide country annotations apply to a selected network; regional ones may not.
    const country = parseOutageResult(countryOutageResult, countryOutagesUrl);
    const known = new Set(outages.annotations.map((item) => item.id).filter(Boolean));
    const nationwide = country.annotations
      .filter((item) => isNationwideAnnotation(item) && !(item.id && known.has(item.id)))
      .map((item) => ({ ...item, appliesVia: 'country' }));
    outages = {
      ...outages,
      status: outages.status === 'error' ? 'error' : nationwide.length ? 'observed' : outages.status,
      annotations: [...outages.annotations, ...nationwide],
      country: { status: country.status, sourceUrl: countryOutagesUrl, error: country.error },
    };
  }

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
  // For a selected network, a quiet answer is only trustworthy when the nationwide check also answered.
  const countryValid = !countryOutagesUrl || validAssessmentStates.has(outages.country?.status);
  const assessmentEligible = validAssessmentStates.has(outages.status) && validAssessmentStates.has(trafficAnomalies.status) && countryValid;
  return {
    ok: true,
    source: 'Cloudflare Radar',
    status: statuses.some((status) => status === 'observed') ? 'observed' : statuses.every((status) => status === 'error') ? 'error' : 'partial',
    assessmentEligible,
    assessmentEligibility: {
      outages: outages.status,
      trafficAnomalies: trafficAnomalies.status,
      reason: assessmentEligible
        ? 'All required Radar event channels returned valid observed/no_data states.'
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
  return { asn: normalizedAsn || null, scope: normalizedAsn ? 'asn' : 'country', dateStart, dateEnd,
    latency: url('latency'), bandwidth: url('bandwidth'), dns: url('dns') };
}

function qualityPercentiles(payload) {
  const serie = asRecord(asRecord(asRecord(payload)?.result)?.serie_0);
  const timestamps = Array.isArray(serie?.timestamps) ? serie.timestamps : [];
  const points = timestamps.map((timestamp, index) => ({
    date: typeof timestamp === 'string' ? timestamp.slice(0, 10) : '',
    p25: parseNumber(serie?.p25?.[index]),
    p50: parseNumber(serie?.p50?.[index]),
    p75: parseNumber(serie?.p75?.[index]),
  // A day whose quartiles are all zero had no sampled traffic (Radar reports 0, not null,
  // e.g. during a shutdown). Zero latency is physically impossible, so it is no measurement.
  })).filter((row) => row.date && row.p50 !== null && !(row.p25 === 0 && row.p50 === 0 && row.p75 === 0));
  const middle = (values) => {
    const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.floor((sorted.length - 1) / 2)] * 10) / 10 : null;
  };
  const median = middle(points.map((row) => row.p50));
  const meta = asRecord(asRecord(asRecord(payload)?.result)?.meta);
  const range = Array.isArray(meta?.dateRange) ? asRecord(meta.dateRange[0]) : null;
  return {
    points,
    measuredDays: points.length,
    median,
    // A single median hides how wide the experience spreads; the quartiles keep that visible.
    typicalLow: middle(points.map((row) => row.p25)),
    typicalHigh: middle(points.map((row) => row.p75)),
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
    sourceUrls: { latency: urls.latency, bandwidth: urls.bandwidth, dns: urls.dns },
    note: 'Cloudflare Internet Quality Index estimates latency and bandwidth from real user traffic in the selected network. Values are rolling averages of that traffic, not a controlled speed test, and they describe the measured population only.',
  };
  if (!token) {
    return { ...base, status: 'token_required', latency: null, bandwidth: null, dns: null, windowAligned: false, fetchedAt: new Date().toISOString(),
      note: 'Set CLOUDFLARE_RADAR_API_TOKEN with Account > Radar > Read to enable live Radar quality signals.' };
  }
  const headers = { authorization: `Bearer ${token}` };
  const [latencyResult, bandwidthResult, dnsResult] = await Promise.allSettled([
    fetchJson(urls.latency, { headers }),
    fetchJson(urls.bandwidth, { headers }),
    fetchJson(urls.dns, { headers }),
  ]);
  const latency = latencyResult.status === 'fulfilled' ? qualityPercentiles(latencyResult.value) : null;
  const bandwidth = bandwidthResult.status === 'fulfilled' ? qualityPercentiles(bandwidthResult.value) : null;
  const dns = dnsResult.status === 'fulfilled' ? qualityPercentiles(dnsResult.value) : null;
  const windowAligned = Boolean(latency?.window && radarQualityWindowAligned(latency.window, urls));
  const observed = Boolean(latency?.median !== null && latency?.points.length);
  const partialErrors = {
    latency: latencyResult.status === 'rejected' ? String(latencyResult.reason?.message ?? latencyResult.reason) : null,
    bandwidth: bandwidthResult.status === 'rejected' ? String(bandwidthResult.reason?.message ?? bandwidthResult.reason) : null,
    dns: dnsResult.status === 'rejected' ? String(dnsResult.reason?.message ?? dnsResult.reason) : null,
  };
  return {
    ...base,
    status: !observed ? (partialErrors.latency ? 'error' : 'no_data') : windowAligned ? 'observed' : 'partial',
    latency, bandwidth, dns, windowAligned,
    window: latency?.window ?? null,
    partialErrors,
    fetchedAt: new Date().toISOString(),
  };
}

const DAY_MS = 86_400_000;
const OUTAGE_CONTEXT_DAYS = 7;
// Radar refuses daily aggregation for ranges longer than this.
const RADAR_DAILY_MAX_DAYS = 90;

function dayStart(ms) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round2(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function dailyUrl(fromMs, toMs, asnNumber = '') {
  const params = new URLSearchParams({
    location: 'IR',
    aggInterval: '1d',
    dateStart: new Date(fromMs).toISOString(),
    dateEnd: new Date(toMs).toISOString(),
    format: 'JSON',
  });
  if (asnNumber) params.set('asn', asnNumber);
  return `https://api.cloudflare.com/client/v4/radar/http/timeseries?${params}`;
}

// The daily window around one outage: a week before, the outage, a week after. Longer than
// Radar's daily limit, it is split into two requests that overlap.
export function buildRadarOutageTrafficUrls({ start, end = null, asn = '', now = new Date() }) {
  const asnNumber = normalizeAsn(asn)?.replace(/^AS/, '') ?? '';
  const startMs = Date.parse(String(start ?? ''));
  if (!Number.isFinite(startMs)) throw new Error('Radar outage traffic needs a valid start.');
  const nowMs = (now instanceof Date ? now.getTime() : Date.parse(String(now))) - RADAR_NOW_SAFETY_MS;
  const endMs = end ? Date.parse(String(end)) : null;
  const from = dayStart(startMs) - OUTAGE_CONTEXT_DAYS * DAY_MS;
  const outageEnd = Number.isFinite(endMs) ? endMs : nowMs;
  const to = Math.min(dayStart(outageEnd) + (OUTAGE_CONTEXT_DAYS + 1) * DAY_MS, nowMs);
  if (to <= from) throw new Error('Radar outage traffic window is empty.');
  const span = RADAR_DAILY_MAX_DAYS * DAY_MS;
  if (to - from <= span) return { from, to, urls: [dailyUrl(from, to, asnNumber)] };
  return { from, to, urls: [dailyUrl(from, from + span, asnNumber), dailyUrl(to - span, to, asnNumber)] };
}

function dailyPoints(payload) {
  const root = asRecord(payload);
  if (root?.success !== true) throw new Error(normalizeCloudflareError(root, 'Cloudflare Radar traffic response was unsuccessful.'));
  const serie = asRecord(asRecord(root.result)?.serie_0);
  const timestamps = Array.isArray(serie?.timestamps) ? serie.timestamps : [];
  const values = Array.isArray(serie?.values) ? serie.values : [];
  const points = new Map();
  timestamps.forEach((timestamp, index) => {
    const day = Date.parse(String(timestamp));
    const value = parseNumber(values[index]);
    if (Number.isFinite(day) && value !== null) points.set(dayStart(day), value);
  });
  return points;
}

// Each response is scaled to its own maximum, so two responses differ by one constant
// factor. The overlapping day with the largest values carries it most precisely.
function joinDaily(first, second) {
  if (!second) return first;
  let factor = null;
  let best = 0;
  for (const [day, value] of second) {
    const reference = first.get(day);
    if (reference > 0 && value > 0 && reference * value > best) {
      best = reference * value;
      factor = reference / value;
    }
  }
  if (factor === null) throw new Error('Radar outage traffic windows share no usable day.');
  const joined = new Map(first);
  for (const [day, value] of second) if (!joined.has(day)) joined.set(day, value * factor);
  return joined;
}

// Traffic Cloudflare saw from Iran around one nationwide outage, as a share of the week
// before it. Only whole days count: the start and end days mix both states.
export function summarizeOutageTraffic(points, { start, end = null }) {
  const startDay = dayStart(Date.parse(start));
  const endDay = end ? dayStart(Date.parse(end)) : null;
  const days = [...points.keys()].sort((a, b) => a - b);
  const baseline = median(days.filter((day) => day < startDay).map((day) => points.get(day)));
  if (!baseline) return { status: 'no_data', reason: 'no-baseline' };
  const percent = (value) => Math.round((value / baseline) * 10_000) / 100;
  const inside = days.filter((day) => day > startDay && (endDay === null || day < endDay));
  const after = endDay === null ? [] : days.filter((day) => day > endDay);
  if (!inside.length) return { status: 'no_data', reason: 'no-whole-outage-day' };
  const insideValues = inside.map((day) => percent(points.get(day)));
  return {
    status: 'observed',
    baselineDays: days.filter((day) => day < startDay).length,
    outageDays: inside.length,
    lowestPercent: Math.min(...insideValues),
    typicalPercent: round2(median(insideValues)),
    afterPercent: after.length ? round2(median(after.map((day) => percent(points.get(day))))) : null,
    series: days.map((day) => ({ date: new Date(day).toISOString().slice(0, 10), percent: percent(points.get(day)) })),
  };
}

export async function getRadarOutageTraffic({ start, end = null, asn = '', now = new Date() }) {
  const token = process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim();
  if (!token) return { ok: true, source: 'Cloudflare Radar', status: 'token_required' };
  const { urls } = buildRadarOutageTrafficUrls({ start, end, asn, now });
  const headers = { authorization: `Bearer ${token}` };
  // A finished outage no longer changes; its traffic can stay cached for a day.
  const cacheTtlMs = end ? DAY_MS : undefined;
  const [first, second] = await Promise.all(urls.map((url) => fetchJson(url, { headers, ...(cacheTtlMs ? { cacheTtlMs } : {}) })));
  const points = joinDaily(dailyPoints(first), second ? dailyPoints(second) : null);
  return {
    ok: true,
    source: 'Cloudflare Radar',
    scope: 'IR',
    asn: normalizeAsn(asn) || null,
    start,
    end,
    ...summarizeOutageTraffic(points, { start, end }),
    sourceUrls: urls,
    note: 'Cloudflare-observed HTTP traffic from Iran (or from the selected network), per day, as a percentage of its own median day in the week before the outage. It measures traffic volume, not who could still connect.',
  };
}

const OUTAGE_HISTORY_START = '2022-01-01T00:00:00Z';

// Nationwide outages Radar has dated for Iran, for picking a period. An annotation that lies
// entirely inside another one is dropped from the list only; no dates are changed or joined.
export function listNationwideOutages(annotations = []) {
  const nationwide = annotations
    .filter((item) => isNationwideAnnotation(item) && Number.isFinite(Date.parse(String(item?.startDate ?? ''))))
    .map((item) => ({
      start: item.startDate,
      end: Number.isFinite(Date.parse(String(item.endDate ?? ''))) ? item.endDate : null,
      cause: item.outageCause ?? null,
      description: item.description ?? null,
    }));
  const endMs = (item) => (item.end ? Date.parse(item.end) : Infinity);
  const contained = (inner, outer) => inner !== outer
    && Date.parse(outer.start) <= Date.parse(inner.start) && endMs(inner) <= endMs(outer)
    && (Date.parse(outer.start) < Date.parse(inner.start) || endMs(inner) < endMs(outer) || nationwide.indexOf(outer) < nationwide.indexOf(inner));
  return nationwide
    .filter((item) => !nationwide.some((other) => contained(item, other)))
    .sort((a, b) => b.start.localeCompare(a.start));
}

const EPISODE_GAP_MS = 5 * 86_400_000;

// Network and regional outages Radar dated for Iran, joined into episodes for picking a period:
// the 2022 mobile curfews were twenty separate daily shutdowns. The individual dates stay as
// Radar gives them; an episode only spans them.
export function listOutageEpisodes(annotations = []) {
  const items = annotations
    .filter((item) => !isNationwideAnnotation(item) && Number.isFinite(Date.parse(String(item?.startDate ?? ''))))
    .map((item) => ({
      start: item.startDate,
      end: Number.isFinite(Date.parse(String(item.endDate ?? ''))) ? item.endDate : item.startDate,
      scope: /REGION/i.test(String(item.outageType ?? item.scope ?? '')) ? 'regional' : 'network',
      cause: item.outageCause ?? null,
      asns: (item.asns ?? []).map((asn) => `AS${String(asn).replace(/^AS/i, '')}`),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const episodes = [];
  for (const item of items) {
    const last = episodes.at(-1);
    if (last && last.scope === item.scope && last.cause === item.cause && Date.parse(item.start) - Date.parse(last.end) <= EPISODE_GAP_MS) {
      if (item.end > last.end) last.end = item.end;
      last.days.add(item.start.slice(0, 10));
      for (const asn of item.asns) last.asns.add(asn);
    } else {
      episodes.push({ ...item, days: new Set([item.start.slice(0, 10)]), asns: new Set(item.asns) });
    }
  }
  return episodes.map((episode) => ({ ...episode, days: episode.days.size, asns: [...episode.asns].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))) }))
    .sort((a, b) => b.start.localeCompare(a.start));
}

export async function getRadarOutageHistory({ now = new Date() } = {}) {
  const token = process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim();
  if (!token) return { ok: true, source: 'Cloudflare Radar', status: 'token_required', outages: [] };
  const params = new URLSearchParams({
    location: 'IR',
    dateStart: OUTAGE_HISTORY_START,
    dateEnd: new Date((now instanceof Date ? now.getTime() : Date.parse(String(now))) - RADAR_NOW_SAFETY_MS).toISOString(),
    limit: '500',
    format: 'JSON',
  });
  const sourceUrl = `https://api.cloudflare.com/client/v4/radar/annotations/outages?${params}`;
  const payload = await fetchJson(sourceUrl, { headers: { authorization: `Bearer ${token}` }, cacheTtlMs: 6 * 60 * 60 * 1000 });
  const parsed = parseOutageResult({ status: 'fulfilled', value: payload }, sourceUrl);
  if (parsed.status === 'error') throw new Error(parsed.error);
  const outages = listNationwideOutages(parsed.annotations);
  const episodes = listOutageEpisodes(parsed.annotations);
  return { ok: true, source: 'Cloudflare Radar', status: outages.length || episodes.length ? 'observed' : 'no_data', outages, episodes, sourceUrl, fetchedAt: new Date().toISOString() };
}
