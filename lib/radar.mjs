import { asRecord, fetchJson, inclusiveDays, normalizeAsn, parseNumber, utcEnd, utcStart, validateRange } from './common.mjs';

function tokenState() {
  return {
    ok: true,
    source: 'Cloudflare Radar',
    status: 'token_required',
    fetchedAt: new Date().toISOString(),
    traffic: { status: 'token_required', series: [], meta: null },
    outages: { status: 'token_required', annotations: [] },
    bgp: { status: 'token_required', events: [] },
    trafficAnomalies: { status: 'token_required', events: [] },
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

export function buildRadarUrls({ asn = '', since, until }) {
  validateRange(since, until, 120);
  const normalizedAsn = normalizeAsn(asn);
  const asnNumber = normalizedAsn ? normalizedAsn.replace(/^AS/, '') : '';
  const common = new URLSearchParams({
    dateStart: utcStart(since),
    dateEnd: utcEnd(until),
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
  anomalyParams.set('location', 'IR');
  if (asnNumber) anomalyParams.set('asn', asnNumber);
  anomalyParams.set('limit', '100');

  return {
    normalizedAsn,
    trafficUrl: `https://api.cloudflare.com/client/v4/radar/http/timeseries?${trafficParams}`,
    outagesUrl: `https://api.cloudflare.com/client/v4/radar/annotations/outages?${outageParams}`,
    bgpUrl: `https://api.cloudflare.com/client/v4/radar/bgp/hijacks/events?${bgpParams}`,
    anomaliesUrl: `https://api.cloudflare.com/client/v4/radar/traffic_anomalies?${anomalyParams}`,
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

  const { normalizedAsn, trafficUrl, outagesUrl, bgpUrl, anomaliesUrl } = buildRadarUrls({ asn, since, until });
  const headers = { authorization: `Bearer ${token}` };

  const settled = await Promise.allSettled([
    fetchJson(trafficUrl, { headers }),
    fetchJson(outagesUrl, { headers }),
    fetchJson(bgpUrl, { headers }),
    fetchJson(anomaliesUrl, { headers }),
  ]);

  const [trafficResult, outageResult, bgpResult, anomalyResult] = settled;
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

  const statuses = [traffic.status, outages.status, bgp.status, trafficAnomalies.status];
  return {
    ok: true,
    source: 'Cloudflare Radar',
    status: statuses.some((status) => status === 'observed') ? 'observed' : statuses.every((status) => status === 'error') ? 'error' : 'partial',
    asn: normalizedAsn || null,
    since,
    until,
    fetchedAt,
    traffic,
    outages,
    bgp,
    trafficAnomalies,
    note: 'Radar HTTP traffic is a Cloudflare-observed series scoped to Iran and, when selected, the requested ASN. Outage, traffic-anomaly and BGP signals are independent event indicators and are not automatically proof of censorship.',
  };
}
