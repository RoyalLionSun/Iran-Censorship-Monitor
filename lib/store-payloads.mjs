import { normalizeAsn } from './common.mjs';
import { OONI_ROUTINE_TESTS } from './ooni.mjs';

// The local store answers in exactly the shapes the live OONI functions return, so the
// interpretation and the page do not know or care which route delivered the data. A payload
// is only built when the store covers the whole period; otherwise the caller asks upstream.

const COVERING_PATHS = ['ooni-api', 'ooni-s3'];
// The newest hours are still arriving at OONI; a period counts as covered up to this lag.
const ARRIVAL_LAG_MS = 2 * 60 * 60 * 1000;

export function storeCovers(store, { since, until }, now = Date.now()) {
  if (!store) return false;
  const from = `${since}T00:00:00Z`;
  const end = Math.min(Date.parse(`${until}T23:59:59Z`), now - ARRIVAL_LAG_MS);
  const to = new Date(end).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return COVERING_PATHS.some((path) => store.covers(path, from, to));
}

function base(input, extra = {}) {
  return {
    ok: true, source: 'OONI', via: 'store', country: 'IR', asn: normalizeAsn(input.asn) || null,
    since: input.since, until: input.until, fetchedAt: new Date().toISOString(), ...extra,
  };
}

function exclusion(excluded, scoped) {
  if (scoped) return null;
  return { checked: true, networks: excluded.map((row) => row.asn).filter(Boolean), excludedMeasurements: excluded.reduce((sum, row) => sum + row.measurements, 0), notExcludedMeasurements: 0 };
}

export function storeDomains(store, input, iranAsns) {
  const scoped = Boolean(normalizeAsn(input.asn));
  const { domains, excluded } = store.domainCounts({ asn: input.asn, since: input.since, until: input.until, iranAsns });
  const totalMeasurements = domains.reduce((sum, row) => sum + row.measurements, 0);
  return base(input, {
    status: domains.length ? 'observed' : 'no_data', testName: 'web_connectivity', target: '',
    skippedInputs: [], skippedInputCount: 0, domainCount: domains.length, totalMeasurements,
    foreignExclusion: exclusion(excluded, scoped), domains,
    note: 'Grouped OONI Web Connectivity tests from the local store, not a census of all sites or users.',
  });
}

export function storeTimeline(store, input, iranAsns) {
  const scoped = Boolean(normalizeAsn(input.asn));
  const points = store.testDays({ test: input.testName, asn: input.asn, since: input.since, until: input.until, iranAsns })
    .map((row) => ({
      date: row.date, measurements: row.measurements, anomalies: row.anomalies, confirmed: row.confirmed, failures: row.failures,
      anomalyRate: row.measurements ? Math.round((row.anomalies / row.measurements) * 1000) / 10 : null,
      confirmedRate: row.measurements ? Math.round((row.confirmed / row.measurements) * 1000) / 10 : null,
      methods: [],
    }));
  const sum = (key) => points.reduce((total, point) => total + point[key], 0);
  const totalMeasurements = sum('measurements');
  return base(input, {
    status: totalMeasurements ? 'observed' : 'no_data', testName: input.testName, target: '',
    totalMeasurements, totalAnomalies: sum('anomalies'), totalConfirmed: sum('confirmed'), totalFailures: sum('failures'),
    anomalyRate: totalMeasurements ? Math.round((sum('anomalies') / totalMeasurements) * 1000) / 10 : null,
    confirmedRate: totalMeasurements ? Math.round((sum('confirmed') / totalMeasurements) * 1000) / 10 : null,
    truncatedAtApiLimit: false, aggregationComplete: true, aggregationAxis: 'measurement_start_day',
    foreignExclusion: scoped ? null : { checked: true, networks: [], excludedMeasurements: 0, notExcludedMeasurements: 0 },
    points, warning: totalMeasurements ? null : 'No OONI measurements are stored for this selection.',
  });
}

export function storeCircumvention(store, input, iranAsns) {
  const signals = OONI_ROUTINE_TESTS.map((testName) => {
    const days = store.testDays({ test: testName, asn: input.asn, since: input.since, until: input.until, iranAsns });
    const measurements = days.reduce((sum, row) => sum + row.measurements, 0);
    const anomalies = days.reduce((sum, row) => sum + row.anomalies, 0);
    return {
      testName, status: measurements ? 'observed' : 'no_data', measurements, anomalies,
      anomalyRate: measurements ? Math.round((anomalies / measurements) * 1000) / 10 : null,
      confirmed: days.reduce((sum, row) => sum + row.confirmed, 0), lastObservation: days.at(-1)?.date ?? null, sourceUrl: null,
    };
  });
  return base(input, { signals });
}

export function storeServiceNetworks(store, input, hosts, iranAsns) {
  const rows = store.hostNetworkCounts({ hosts, since: input.since, until: input.until, iranAsns });
  return base(input, { status: 'observed', rows, excludedMeasurements: 0 });
}

export function storeNetworks(store, input, domain, iranAsns) {
  const networks = store.hostNetworkCounts({ hosts: [domain], since: input.since, until: input.until, iranAsns })
    .map((row) => ({
      asn: row.asn, measurements: row.measurements, anomalous: row.anomalous, confirmed: row.confirmed, failures: row.failures, ok: row.ok,
      status: row.confirmed > 0 ? 'blocked' : row.anomalous > 0 ? 'restricted' : row.ok > 0 ? 'reachable' : 'inconclusive',
    }))
    .sort((a, b) => b.confirmed - a.confirmed || b.anomalous - a.anomalous || b.measurements - a.measurements);
  const count = (status) => networks.filter((row) => row.status === status).length;
  return base(input, {
    domain, measured: networks.length, blocked: count('blocked'), restricted: count('restricted'), reachable: count('reachable'),
    inconclusive: count('inconclusive'), networks: networks.slice(0, 12), excludedNetworks: [], foreignChecked: true,
  });
}

// The store holds every measurement, so the "sample" is complete, never a bounded floor.
export function storeSample(store, input, domain, iranAsns) {
  const scope = normalizeAsn(input.asn);
  const filter = scope ? ' AND asn = ?' : iranAsns?.size ? ` AND asn IN (${[...iranAsns].map(() => '?').join(',')})` : '';
  const params = scope ? [scope] : iranAsns?.size ? [...iranAsns] : [];
  const totals = store.db.prepare(`SELECT count(*) AS sampled, count(DISTINCT report_id) AS runs, count(DISTINCT day) AS observedDays,
      sum(outcome IN ('anomaly', 'confirmed')) AS affected
    FROM ooni_measurement WHERE test = 'web_connectivity' AND host = ? AND day BETWEEN ? AND ?${filter}`).get(domain, input.since, input.until, ...params);
  const mechanisms = {};
  for (const row of store.mechanisms({ host: domain, asn: input.asn, since: input.since, until: input.until, iranAsns })) {
    mechanisms[row.type ?? 'unspecified'] = row.n;
  }
  const dominant = Object.entries(mechanisms).filter(([code]) => code !== 'unspecified').sort((a, b) => b[1] - a[1])[0] ?? null;
  return base(input, {
    domain, runs: totals.runs ?? 0, observedDays: totals.observedDays ?? 0, sampled: totals.sampled ?? 0, excludedOutsideIran: 0,
    bounded: false, affected: totals.affected ?? 0, mechanisms,
    dominantMechanism: dominant ? { code: dominant[0], count: dominant[1] } : null,
  });
}
