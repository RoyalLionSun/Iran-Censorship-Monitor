import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeAsn } from './common.mjs';
import { sampleMechanism } from './ooni.mjs';

// Local store for access evidence. Every collector path (OONI API, OONI raw files, RIPE Atlas,
// Globalping) writes here in parallel; the server reads only from here, so a page view costs
// no upstream quota and one failing path leaves the others' data in place.
// Only the fields the dashboard needs are kept, never raw measurement bodies.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ooni_measurement (
  uid TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  ts TEXT NOT NULL,
  asn TEXT,
  test TEXT NOT NULL,
  host TEXT,
  input TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'anomaly', 'confirmed', 'failure')),
  blocking_type TEXT,
  report_id TEXT,
  routes TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ooni_test_day ON ooni_measurement (test, day);
CREATE INDEX IF NOT EXISTS ooni_host_day ON ooni_measurement (host, day);
CREATE INDEX IF NOT EXISTS ooni_asn_day ON ooni_measurement (asn, day);
CREATE TABLE IF NOT EXISTS active_measurement (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  probe_id TEXT,
  asn TEXT,
  host TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dns', 'tls', 'http')),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'blocked', 'failure')),
  detail TEXT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS active_host_day ON active_measurement (host, day);
CREATE TABLE IF NOT EXISTS collector_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  started TEXT NOT NULL,
  finished TEXT,
  rows INTEGER NOT NULL DEFAULT 0,
  newest TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS run_path ON collector_run (path, id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

// OONI's aggregation counts are exclusive and add up to the number of measurements: a
// confirmed block first, then a failed measurement, then an anomaly, otherwise ok.
export function ooniOutcome({ confirmed, failure, anomaly }) {
  if (confirmed === true) return 'confirmed';
  if (failure === true) return 'failure';
  if (anomaly === true) return 'anomaly';
  return 'ok';
}

function hostOf(input) {
  if (typeof input !== 'string' || !input) return null;
  try {
    return new URL(input).hostname.toLowerCase().replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}

// One OONI measurement as either the list API or a raw file describes it, reduced to the store
// fields. Returns null for a row without identity or time, which is skipped, never guessed.
export function normalizeOoniMeasurement(item) {
  const uid = typeof item?.measurement_uid === 'string' && item.measurement_uid ? item.measurement_uid : null;
  const time = Date.parse(String(item?.measurement_start_time ?? ''));
  const test = typeof item?.test_name === 'string' && item.test_name ? item.test_name : null;
  if (!uid || !Number.isFinite(time) || !test) return null;
  const ts = new Date(time).toISOString();
  // How it was blocked, derived as the dashboard derives it (block-page fingerprints first).
  const mechanism = item?.scores ? sampleMechanism(item) : (item?.blocking_type ?? null);
  const blocking = mechanism === 'unspecified' ? null : mechanism;
  return {
    uid,
    day: ts.slice(0, 10),
    ts,
    asn: normalizeAsn(String(item?.probe_asn ?? '')) || null,
    test,
    host: hostOf(item?.input),
    input: typeof item?.input === 'string' ? item.input : null,
    outcome: ooniOutcome({ confirmed: item?.confirmed, failure: item?.failure, anomaly: item?.anomaly }),
    blocking_type: blocking === null || blocking === undefined || blocking === false ? null : String(blocking),
    report_id: typeof item?.report_id === 'string' ? item.report_id : null,
  };
}

function iranFilter(iranAsns, alias = '') {
  const column = alias ? `${alias}.asn` : 'asn';
  if (!iranAsns?.size) return { sql: '', params: [] };
  const list = [...iranAsns];
  return { sql: ` AND ${column} IN (${list.map(() => '?').join(',')})`, params: list };
}

export function openStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const insertOoni = db.prepare(`INSERT INTO ooni_measurement (uid, day, ts, asn, test, host, input, outcome, blocking_type, report_id, routes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET routes = CASE WHEN instr(routes, excluded.routes) > 0 THEN routes ELSE routes || ',' || excluded.routes END`);
  const insertActive = db.prepare(`INSERT OR IGNORE INTO active_measurement (id, source, probe_id, asn, host, kind, outcome, detail, ts, day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  return {
    db,

    // Same measurement from two routes (API and raw files) is stored once; the routes it came
    // through are recorded, so the health view can say which route delivered it.
    addOoniMeasurements(items, route) {
      let added = 0;
      db.exec('BEGIN');
      try {
        for (const item of items) {
          const row = normalizeOoniMeasurement(item);
          if (!row) continue;
          const before = db.prepare('SELECT 1 FROM ooni_measurement WHERE uid = ?').get(row.uid);
          insertOoni.run(row.uid, row.day, row.ts, row.asn, row.test, row.host, row.input, row.outcome, row.blocking_type, row.report_id, route);
          if (!before) added += 1;
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return added;
    },

    addActiveMeasurements(rows) {
      let added = 0;
      for (const row of rows) {
        const ts = new Date(Date.parse(row.ts)).toISOString();
        const result = insertActive.run(row.id, row.source, row.probeId ?? null, normalizeAsn(String(row.asn ?? '')) || null,
          String(row.host).toLowerCase(), row.kind, row.outcome, row.detail ?? null, ts, ts.slice(0, 10));
        added += Number(result.changes ?? 0);
      }
      return added;
    },

    startRun(path) {
      const started = new Date().toISOString();
      const { lastInsertRowid } = db.prepare('INSERT INTO collector_run (path, started) VALUES (?, ?)').run(path, started);
      return Number(lastInsertRowid);
    },

    finishRun(id, { rows = 0, newest = null, error = null } = {}) {
      db.prepare('UPDATE collector_run SET finished = ?, rows = ?, newest = ?, error = ? WHERE id = ?')
        .run(new Date().toISOString(), rows, newest, error ? String(error).slice(0, 500) : null, id);
    },

    // Per path: the last run, the last successful run and the newest measurement it delivered.
    health() {
      const paths = db.prepare('SELECT DISTINCT path FROM collector_run').all().map((row) => row.path);
      return Object.fromEntries(paths.map((path) => {
        const last = db.prepare('SELECT * FROM collector_run WHERE path = ? ORDER BY id DESC LIMIT 1').get(path);
        const ok = db.prepare('SELECT * FROM collector_run WHERE path = ? AND error IS NULL AND finished IS NOT NULL ORDER BY id DESC LIMIT 1').get(path);
        // The newest stored measurement counts even from a run that also reported an error.
        const newest = db.prepare('SELECT max(newest) AS newest FROM collector_run WHERE path = ?').get(path)?.newest ?? null;
        return [path, { lastRun: last?.started ?? null, lastError: last?.error ?? null, lastSuccess: ok?.finished ?? null, newest }];
      }));
    },

    newestOoni(test = null) {
      const row = test
        ? db.prepare('SELECT max(ts) AS ts FROM ooni_measurement WHERE test = ?').get(test)
        : db.prepare('SELECT max(ts) AS ts FROM ooni_measurement').get();
      return row?.ts ?? null;
    },

    // Web Connectivity per host for a network or, with Iranian networks given, for all of Iran:
    // the same shape the OONI domain aggregation returns, so the interpretation is unchanged.
    domainCounts({ asn = '', since, until, iranAsns = null }) {
      const scope = normalizeAsn(asn);
      const filter = scope ? { sql: ' AND asn = ?', params: [scope] } : iranFilter(iranAsns);
      const rows = db.prepare(`SELECT host AS domain, count(*) AS measurements,
          sum(outcome = 'confirmed') AS confirmed, sum(outcome = 'anomaly') AS anomalous,
          sum(outcome = 'failure') AS failures, sum(outcome = 'ok') AS ok,
          count(DISTINCT day) AS observedDays, max(day) AS lastObserved
        FROM ooni_measurement
        WHERE test = 'web_connectivity' AND host IS NOT NULL AND day BETWEEN ? AND ?${filter.sql}
        GROUP BY host`).all(since, until, ...filter.params);
      const excluded = !scope && iranAsns?.size
        ? db.prepare(`SELECT asn, count(*) AS n FROM ooni_measurement WHERE test = 'web_connectivity' AND day BETWEEN ? AND ?
            AND (asn IS NULL OR asn NOT IN (${[...iranAsns].map(() => '?').join(',')})) GROUP BY asn ORDER BY n DESC`).all(since, until, ...iranAsns)
        : [];
      return {
        domains: rows.map((row) => ({
          ...row,
          anomalyRate: row.measurements ? Math.round((row.anomalous / row.measurements) * 1000) / 10 : 0,
          evidence: row.confirmed ? 'confirmed' : row.anomalous ? 'anomaly' : 'no_blocking_signal',
        })).sort((a, b) => b.confirmed - a.confirmed || b.anomalous - a.anomalous || a.domain.localeCompare(b.domain)),
        excluded: excluded.map((row) => ({ asn: row.asn, measurements: row.n })),
      };
    },

    // One test (app tests, circumvention, Web Connectivity totals) per day.
    testDays({ test, asn = '', since, until, iranAsns = null }) {
      const scope = normalizeAsn(asn);
      const filter = scope ? { sql: ' AND asn = ?', params: [scope] } : iranFilter(iranAsns);
      return db.prepare(`SELECT day AS date, count(*) AS measurements,
          sum(outcome = 'confirmed') AS confirmed, sum(outcome IN ('anomaly', 'confirmed')) AS anomalies,
          sum(outcome = 'failure') AS failures
        FROM ooni_measurement WHERE test = ? AND day BETWEEN ? AND ?${filter.sql}
        GROUP BY day ORDER BY day`).all(test, since, until, ...filter.params);
    },

    // Host by network across Iran, for "Who has access".
    hostNetworkCounts({ hosts, since, until, iranAsns = null }) {
      if (!hosts?.length) return [];
      const filter = iranFilter(iranAsns);
      return db.prepare(`SELECT host AS domain, asn, count(*) AS measurements,
          sum(outcome = 'confirmed') AS confirmed, sum(outcome = 'anomaly') AS anomalous,
          sum(outcome = 'failure') AS failures, sum(outcome = 'ok') AS ok
        FROM ooni_measurement
        WHERE test = 'web_connectivity' AND day BETWEEN ? AND ? AND host IN (${hosts.map(() => '?').join(',')})${filter.sql}
        GROUP BY host, asn`).all(since, until, ...hosts, ...filter.params);
    },

    // How a host is blocked: blocking types among its affected measurements.
    mechanisms({ host, asn = '', since, until, iranAsns = null }) {
      const scope = normalizeAsn(asn);
      const filter = scope ? { sql: ' AND asn = ?', params: [scope] } : iranFilter(iranAsns);
      return db.prepare(`SELECT blocking_type AS type, count(*) AS n, count(DISTINCT report_id) AS runs
        FROM ooni_measurement
        WHERE test = 'web_connectivity' AND host = ? AND day BETWEEN ? AND ? AND outcome IN ('anomaly', 'confirmed')${filter.sql}
        GROUP BY blocking_type ORDER BY n DESC, blocking_type`).all(host, since, until, ...filter.params);
    },

    newestActive(source) {
      return db.prepare('SELECT max(ts) AS ts FROM active_measurement WHERE source = ?').get(source)?.ts ?? null;
    },

    activeResults({ host, since, until }) {
      return db.prepare(`SELECT source, kind, asn, outcome, count(*) AS n, max(ts) AS newest
        FROM active_measurement WHERE host = ? AND day BETWEEN ? AND ? GROUP BY source, kind, asn, outcome`).all(String(host).toLowerCase(), since, until);
    },

    prune(beforeDay) {
      const a = db.prepare('DELETE FROM ooni_measurement WHERE day < ?').run(beforeDay);
      const b = db.prepare('DELETE FROM active_measurement WHERE day < ?').run(beforeDay);
      return Number(a.changes ?? 0) + Number(b.changes ?? 0);
    },

    getMeta(key) {
      return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
    },

    setMeta(key, value) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value === null ? null : String(value));
    },

    // Whether a path has continuously collected [from, to]; only then may the page read the
    // store for that period instead of asking upstream.
    covers(path, from, to) {
      const since = this.getMeta(`${path}:coveredSince`);
      const until = this.getMeta(`${path}:coveredUntil`);
      return Boolean(since && until && since <= from && until >= to);
    },

    close() { db.close(); },
  };
}
