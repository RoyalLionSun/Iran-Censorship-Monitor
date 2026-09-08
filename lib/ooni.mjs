import { asRecord, fetchJson, mapLimit, normalizeAsn, validateRange } from './common.mjs';

export const OONI_TESTS = new Set([
  'web_connectivity',
  'dns_consistency',
  'http_header_field_manipulation',
  'ndt',
  'tor',
  'psiphon',
  'signal',
  'whatsapp',
  'telegram',
]);

function hasFalse(item, key) {
  return item?.[key] === false || item?.[key] === 'false';
}
function hasTrue(item, key) {
  return item?.[key] === true || item?.[key] === 'true';
}

export function inferDetailedMethods(item) {
  const signals = [];
  if (hasFalse(item, 'dns_consistency') || hasFalse(item, 'dns_resolution') || hasTrue(item, 'dns_experiment_failure')) {
    signals.push({ label: 'DNS inconsistency', code: 'dns_consistency', evidence: 'DNS comparison or experiment signal deviates', confidence: 'high' });
  }
  if (hasFalse(item, 'tcp_connect') || hasTrue(item, 'control_failure') || hasTrue(item, 'tcp_failure') || hasTrue(item, 'connection_failure')) {
    signals.push({ label: 'TCP / transport failure', code: 'tcp_connect', evidence: 'TCP or control connection failed', confidence: 'high' });
  }
  if (hasFalse(item, 'tls_handshake') || hasTrue(item, 'tls_failure') || hasTrue(item, 'cert_chain_failure')) {
    signals.push({ label: 'TLS interference signal', code: 'tls_handshake', evidence: 'TLS handshake or certificate-chain signal failed', confidence: 'high' });
  }
  if (hasFalse(item, 'http_request') || hasFalse(item, 'status_code_match') || hasFalse(item, 'title_match') || hasFalse(item, 'body_length_match') || asRecord(item?.http_experiments)) {
    signals.push({ label: 'HTTP response mismatch', code: 'http_request', evidence: 'HTTP request/response differs from control', confidence: 'medium' });
  }
  if (hasTrue(item, 'ip_blocking') || hasTrue(item, 'blocking')) {
    signals.push({ label: 'Explicit blocking signal', code: 'ip_blocking', evidence: 'Explicit blocking field present in OONI response', confidence: 'medium' });
  }
  if (!signals.length && (hasTrue(item, 'anomaly') || hasTrue(item, 'confirmed'))) {
    signals.push({ label: 'OONI anomaly, method unspecified', code: 'anomaly', evidence: 'Anomaly/confirmation present without a safely inferable mechanism', confidence: 'low' });
  }
  if (!signals.length && hasTrue(item, 'failure')) {
    signals.push({ label: 'Measurement failure, method unspecified', code: 'failure', evidence: 'Measurement failure present; blocking mechanism cannot be inferred', confidence: 'low' });
  }
  return signals;
}

export function buildOoniQuery({ country = 'IR', asn = '', since, until, target = '', testName = 'web_connectivity', limit = 1000 }) {
  validateRange(since, until);
  if (country !== 'IR') throw new Error('This deployment is restricted to Iran (IR).');
  if (!OONI_TESTS.has(testName)) throw new Error('Unsupported OONI test.');
  const normalizedAsn = normalizeAsn(asn);
  const params = new URLSearchParams({
    probe_cc: 'IR',
    test_name: testName,
    since,
    until,
    limit: String(Math.min(Math.max(Number(limit) || 1000, 1), 1000)),
  });
  if (normalizedAsn) params.set('probe_asn', normalizedAsn.replace(/^AS/, ''));
  if (target && testName === 'web_connectivity') params.set('input', target.trim());
  return params;
}

export function aggregateOoniRows(rawRows) {
  const byDate = new Map();
  for (const raw of rawRows) {
    const item = asRecord(raw);
    if (!item) continue;
    const timestamp = item.measurement_start_time ?? item.measurement_start_time_utc;
    if (typeof timestamp !== 'string') continue;
    const date = timestamp.slice(0, 10);
    const current = byDate.get(date) ?? {
      measurements: 0,
      anomalies: 0,
      confirmed: 0,
      failures: 0,
      methods: new Map(),
    };
    current.measurements += 1;
    if (item.anomaly === true || item.confirmed === true) current.anomalies += 1;
    if (item.confirmed === true) current.confirmed += 1;
    if (item.failure === true) current.failures += 1;
    for (const signal of inferDetailedMethods(item)) {
      const key = `${signal.code}|${signal.label}`;
      const existing = current.methods.get(key) ?? { ...signal, count: 0, evidence: new Set() };
      existing.count += 1;
      existing.evidence.add(signal.evidence);
      current.methods.set(key, existing);
    }
    byDate.set(date, current);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({
    date,
    measurements: row.measurements,
    anomalies: row.anomalies,
    confirmed: row.confirmed,
    failures: row.failures,
    anomalyRate: row.measurements ? Math.round((row.anomalies / row.measurements) * 1000) / 10 : null,
    confirmedRate: row.measurements ? Math.round((row.confirmed / row.measurements) * 1000) / 10 : null,
    methods: [...row.methods.values()].map((method) => ({
      label: method.label,
      code: method.code,
      count: method.count,
      evidence: [...method.evidence],
      confidence: method.confidence,
    })),
  }));
}

export async function getOoniTimeline(input) {
  const params = buildOoniQuery(input);
  const sourceUrl = `https://api.ooni.io/api/v1/measurements?${params}`;
  const fetchedAt = new Date().toISOString();
  const payload = asRecord(await fetchJson(sourceUrl));
  const raw = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
  const points = aggregateOoniRows(raw);
  const normalizedAsn = normalizeAsn(input.asn);
  const totalAnomalies = points.reduce((sum, point) => sum + point.anomalies, 0);
  const totalConfirmed = points.reduce((sum, point) => sum + point.confirmed, 0);
  const totalFailures = points.reduce((sum, point) => sum + point.failures, 0);
  return {
    ok: true,
    source: 'OONI',
    country: 'IR',
    asn: normalizedAsn || null,
    since: input.since,
    until: input.until,
    target: input.testName === 'web_connectivity' ? (input.target || '') : '',
    testName: input.testName,
    fetchedAt,
    sourceUrl,
    totalMeasurements: raw.length,
    totalAnomalies,
    totalConfirmed,
    totalFailures,
    anomalyRate: raw.length ? Math.round((totalAnomalies / raw.length) * 1000) / 10 : null,
    confirmedRate: raw.length ? Math.round((totalConfirmed / raw.length) * 1000) / 10 : null,
    truncatedAtApiLimit: raw.length >= 1000,
    points,
    warning: raw.length ? null : 'No OONI measurements were returned for this selection.',
  };
}

export async function listOoniMeasurements(input) {
  const params = buildOoniQuery({ ...input, limit: 50 });
  const sourceUrl = `https://api.ooni.io/api/v1/measurements?${params}`;
  const payload = asRecord(await fetchJson(sourceUrl));
  const raw = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
  return {
    ok: true,
    source: 'OONI',
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    measurements: raw.map((entry) => {
      const item = asRecord(entry) ?? {};
      const uid = typeof item.measurement_uid === 'string' ? item.measurement_uid : typeof item.report_id === 'string' ? item.report_id : '';
      return {
        uid,
        timestamp: typeof item.measurement_start_time === 'string' ? item.measurement_start_time : typeof item.measurement_start_time_utc === 'string' ? item.measurement_start_time_utc : null,
        testName: typeof item.test_name === 'string' ? item.test_name : 'unknown',
        asn: typeof item.probe_asn === 'string' ? item.probe_asn : item.probe_asn != null ? `AS${item.probe_asn}` : null,
        anomaly: typeof item.anomaly === 'boolean' ? item.anomaly : null,
        confirmed: typeof item.confirmed === 'boolean' ? item.confirmed : null,
        explorerUrl: uid ? `https://explorer.ooni.org/measurement/${encodeURIComponent(uid)}` : null,
      };
    }).filter((row) => row.uid),
  };
}

export async function getOoniMeasurementDetail(uid) {
  const cleanUid = String(uid || '').trim();
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(cleanUid)) throw new Error('Invalid OONI measurement UID.');
  const candidates = [
    `https://api.ooni.io/api/v1/measurement/${encodeURIComponent(cleanUid)}`,
    `https://api.ooni.io/api/v1/measurement_meta?measurement_uid=${encodeURIComponent(cleanUid)}`,
  ];
  let lastError = null;
  for (const sourceUrl of candidates) {
    try {
      return { ok: true, source: 'OONI', uid: cleanUid, sourceUrl, fetchedAt: new Date().toISOString(), raw: await fetchJson(sourceUrl) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('OONI measurement could not be loaded.');
}

export async function getCircumventionSignals({ since, until, asn = '' }) {
  validateRange(since, until, 45);
  const tests = ['tor', 'psiphon', 'signal', 'whatsapp', 'telegram'];
  const results = await mapLimit(tests, 2, async (testName) => {
    try {
      const timeline = await getOoniTimeline({ country: 'IR', asn, since, until, target: '', testName });
      return {
        testName,
        status: timeline.totalMeasurements ? 'observed' : 'no_data',
        measurements: timeline.totalMeasurements,
        anomalies: timeline.totalAnomalies,
        anomalyRate: timeline.anomalyRate,
        confirmed: timeline.totalConfirmed,
        lastObservation: timeline.points.at(-1)?.date ?? null,
        sourceUrl: timeline.sourceUrl,
      };
    } catch (error) {
      return { testName, status: 'error', measurements: 0, anomalies: 0, anomalyRate: null, confirmed: 0, lastObservation: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return {
    ok: true,
    source: 'OONI',
    fetchedAt: new Date().toISOString(),
    since,
    until,
    asn: normalizeAsn(asn) || null,
    signals: results,
    note: 'These are OONI application/circumvention test observations. They are not WireGuard/OpenVPN tunnel measurements or provider rankings.',
  };
}
