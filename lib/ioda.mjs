import { asRecord, fetchJson, normalizeAsn, parseNumber, validateRange } from './common.mjs';

function epochStart(date) { return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000); }
function epochEnd(date) { return Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000); }

function collectObjects(value, predicate, output = [], depth = 0) {
  if (depth > 7 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, predicate, output, depth + 1);
    return output;
  }
  const record = asRecord(value);
  if (!record) return output;
  if (predicate(record)) output.push(record);
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') collectObjects(child, predicate, output, depth + 1);
  }
  return output;
}

function uniqueBy(rows, keyFn) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyFn(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseIodaSeries(payload) {
  const candidates = collectObjects(payload, (item) => Array.isArray(item.values) && (
    item.datasource != null || item.dataSource != null || item.source != null
  ));
  return uniqueBy(candidates.map((item) => {
    const datasource = String(item.datasource ?? item.dataSource ?? item.source ?? 'unknown');
    const from = parseNumber(item.from ?? item.start ?? item.startTime);
    const step = parseNumber(item.step ?? item.nativeStep ?? item.interval);
    const values = Array.isArray(item.values) ? item.values.map(parseNumber) : [];
    const points = values.map((value, index) => ({
      timestamp: from !== null && step !== null ? new Date((from + (index * step)) * 1000).toISOString() : null,
      value,
    })).filter((row) => row.value !== null);
    const nums = points.map((row) => row.value).sort((a, b) => a - b);
    const median = nums.length ? (nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2) : null;
    const latest = points.at(-1)?.value ?? null;
    return {
      datasource,
      from,
      until: parseNumber(item.until ?? item.stop ?? item.endTime),
      step,
      points,
      sampleCount: points.length,
      latest,
      windowMedian: median,
      deltaFromWindowMedianPercent: latest !== null && median !== null && median !== 0 ? Math.round(((latest / median) - 1) * 1000) / 10 : null,
    };
  }), (row) => `${row.datasource}|${row.from}|${row.step}|${row.sampleCount}`);
}

export function parseIodaEvents(payload) {
  const candidates = collectObjects(payload, (item) => (
    item.datasource != null &&
    (item.from != null || item.start != null || item.time != null) &&
    (item.entityCode != null || item.location != null || item.entity != null || item.duration != null || item.until != null)
  ));
  return uniqueBy(candidates.map((item) => {
    const startEpoch = parseNumber(item.from ?? item.start ?? item.time);
    const untilEpoch = parseNumber(item.until);
    const duration = parseNumber(item.duration);
    const endEpoch = untilEpoch ?? (startEpoch !== null && duration !== null ? startEpoch + duration : null);
    const entity = asRecord(item.entity);
    return {
      datasource: String(item.datasource ?? 'unknown'),
      entityType: String(item.entityType ?? entity?.type ?? (typeof item.location === 'string' ? item.location.split('/')[0] : 'country')),
      entityCode: String(item.entityCode ?? entity?.code ?? (typeof item.location === 'string' ? item.location.split('/')[1] : 'IR')),
      entityName: String(item.location_name ?? entity?.name ?? 'Iran'),
      start: startEpoch !== null ? new Date(startEpoch * 1000).toISOString() : null,
      end: endEpoch !== null ? new Date(endEpoch * 1000).toISOString() : null,
      durationSeconds: duration ?? (startEpoch !== null && endEpoch !== null ? endEpoch - startEpoch : null),
      score: parseNumber(item.score),
      status: item.status ?? null,
      fraction: parseNumber(item.fraction),
    };
  }), (row) => `${row.datasource}|${row.entityType}|${row.entityCode}|${row.start}|${row.end}`);
}

async function fetchFirst(urls) {
  let error;
  for (const url of urls) {
    try { return { url, payload: await fetchJson(url) }; }
    catch (candidateError) { error = candidateError; }
  }
  throw error ?? new Error('IODA request failed.');
}

export async function getIodaSignals({ asn = '', since, until }) {
  validateRange(since, until, 90);
  const normalizedAsn = normalizeAsn(asn);
  const from = epochStart(since);
  const to = epochEnd(until);
  const entityType = normalizedAsn ? 'asn' : 'country';
  const entityCode = normalizedAsn ? normalizedAsn.replace(/^AS/, '') : 'IR';

  const signalParams = new URLSearchParams({ from: String(from), until: String(to) });
  const signalUrl = `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/${entityType}/${entityCode}?${signalParams}`;

  const eventParams = new URLSearchParams({ from: String(from), until: String(to), entityType, entityCode, format: 'ioda', limit: '100' });
  const eventUrls = [
    `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?${eventParams}`,
    `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events/${entityType}/${entityCode}?from=${from}&until=${to}&format=ioda&limit=100`,
  ];

  const [signalResult, eventResult] = await Promise.allSettled([
    fetchJson(signalUrl),
    fetchFirst(eventUrls),
  ]);

  if (signalResult.status === 'rejected' && eventResult.status === 'rejected') {
    throw signalResult.reason instanceof Error ? signalResult.reason : eventResult.reason;
  }

  const series = signalResult.status === 'fulfilled' ? parseIodaSeries(signalResult.value) : [];
  const events = eventResult.status === 'fulfilled' ? parseIodaEvents(eventResult.value.payload) : [];
  return {
    ok: true,
    source: 'IODA',
    status: events.length || series.length ? 'observed' : 'no_data',
    country: 'IR',
    asn: normalizedAsn || null,
    entityType,
    entityCode,
    since,
    until,
    fetchedAt: new Date().toISOString(),
    series,
    events,
    sourceUrls: {
      signals: signalUrl,
      events: eventResult.status === 'fulfilled' ? eventResult.value.url : eventUrls[0],
    },
    partialErrors: {
      signals: signalResult.status === 'rejected' ? (signalResult.reason instanceof Error ? signalResult.reason.message : String(signalResult.reason)) : null,
      events: eventResult.status === 'rejected' ? (eventResult.reason instanceof Error ? eventResult.reason.message : String(eventResult.reason)) : null,
    },
    note: 'IODA combines routing visibility, active probing, telescope and other connectivity signals. Event detections are outage indicators; the dashboard does not infer censorship intent from them.',
  };
}
