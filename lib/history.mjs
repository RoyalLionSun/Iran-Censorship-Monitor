import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fetchOoniDailyCounts } from './ooni.mjs';

// How long each main service has been blocked, month by month since January 2022, from OONI
// tests on the three networks that carry most users in Iran (TCI, MCI, Irancell — about 92%).
// Inside-out only: probes on these Iranian networks, never the country-wide mix that includes
// foreign VPN exits. Completed months never change, so they are stored and only the current
// month is asked again, at most once a day.

export const HISTORY_START = '2022-01-01';
export const HISTORY_NETWORKS = Object.freeze([
  { asn: 'AS58224', name: 'TCI' }, { asn: 'AS197207', name: 'MCI' }, { asn: 'AS44244', name: 'Irancell' },
]);
// The address of each service that OONI has tested longest (x.com only since 2023).
export const HISTORY_SERVICES = Object.freeze([
  { id: 'instagram', domain: 'www.instagram.com' }, { id: 'whatsapp', domain: 'www.whatsapp.com' },
  { id: 'telegram', domain: 'telegram.org' }, { id: 'youtube', domain: 'www.youtube.com' },
  { id: 'x', domain: 'twitter.com' }, { id: 'facebook', domain: 'www.facebook.com' },
]);
const REFRESH_MS = 24 * 60 * 60 * 1000;
// Fewer tests than this in a month say nothing about that month.
const MONTH_MIN_TESTS = 10;

const COUNT_KEYS = ['measurement_count', 'confirmed_count', 'anomaly_count', 'ok_count'];

// Monthly sums over networks; the verdict follows the same majority rule as a network: most
// tests failed and confirmed blocks outnumber successes → blocked.
export function monthlyStatus(dailyRowsByNetwork) {
  const months = new Map();
  for (const rows of dailyRowsByNetwork) {
    for (const row of rows ?? []) {
      const month = String(row.measurement_start_day ?? '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const sum = months.get(month) ?? { month, measurements: 0, confirmed: 0, anomalous: 0, ok: 0 };
      sum.measurements += Number(row.measurement_count) || 0;
      sum.confirmed += Number(row.confirmed_count) || 0;
      sum.anomalous += Number(row.anomaly_count) || 0;
      sum.ok += Number(row.ok_count) || 0;
      months.set(month, sum);
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((sum) => {
    const failed = sum.confirmed + sum.anomalous;
    const status = sum.measurements < MONTH_MIN_TESTS ? 'thin'
      : failed > sum.ok ? (sum.confirmed > sum.ok ? 'blocked' : 'restricted')
        : sum.confirmed > 0 ? 'partial' : 'reachable';
    return { ...sum, status };
  });
}

// The unbroken stretch of blocked months up to the latest one with enough tests. A month with
// too few tests (e.g. a blackout) does not break it, but more than three such months in a row
// do: without tests there is no continuity to claim.
const MAX_OPEN_MONTHS = 3;
export function blockedSince(months) {
  let index = months.length - 1;
  while (index >= 0 && ['thin', 'outage'].includes(months[index].status)) index -= 1;
  if (index < 0 || months[index].status !== 'blocked') return null;
  let first = index;
  let open = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const status = months[cursor].status;
    if (status === 'blocked') { first = cursor; open = 0; } else if ((status === 'thin' || status === 'outage') && ++open <= MAX_OPEN_MONTHS) continue; else break;
  }
  return { month: months[first].month, fromStart: first === 0 && months[0].month === HISTORY_START.slice(0, 7) };
}

// A month more than half covered by a nationwide shutdown is marked "outage": the few tests
// that reached OONI then came from the networks that kept access and do not stand for the
// month. Like a month without tests it neither breaks nor extends "blocked since".
export function markOutageMonths(months, outages = []) {
  const dayMs = 86_400_000;
  return months.map((month) => {
    const start = Date.parse(`${month.month}-01T00:00:00Z`);
    const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
    const covered = outages.reduce((sum, outage) => {
      const from = Math.max(start, Date.parse(outage.start));
      const to = Math.min(next.getTime(), outage.end ? Date.parse(outage.end) : next.getTime());
      return sum + Math.max(0, to - from);
    }, 0);
    return covered > (next.getTime() - start) / 2 && Number.isFinite(covered) ? { ...month, status: 'outage', statusMeasured: month.status } : month;
  });
}

function fillMonths(months, until) {
  const byMonth = new Map(months.map((month) => [month.month, month]));
  const out = [];
  for (let date = new Date(`${HISTORY_START}T00:00:00Z`); date.toISOString().slice(0, 7) <= until.slice(0, 7); date.setUTCMonth(date.getUTCMonth() + 1)) {
    const month = date.toISOString().slice(0, 7);
    out.push(byMonth.get(month) ?? { month, measurements: 0, confirmed: 0, anomalous: 0, ok: 0, status: 'thin' });
  }
  return out;
}

async function readStored(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

// Daily rows for one network and address: stored completed months, plus the months from the
// last stored one on, asked again once a day.
async function dailyRows({ asn, domain, now, storeDir, fetch }) {
  const path = join(storeDir, `${asn}-${domain}.json`);
  const stored = await readStored(path);
  const today = new Date(now).toISOString().slice(0, 10);
  if (stored?.rows && now - Date.parse(stored.fetchedAt ?? 0) < REFRESH_MS) return stored.rows;
  const lastMonth = stored?.rows?.map((row) => row.measurement_start_day).sort().at(-1)?.slice(0, 7);
  const since = lastMonth ? `${lastMonth}-01` : HISTORY_START;
  const payload = await fetch({ asn, domain, since, until: today });
  const fresh = (Array.isArray(payload?.result) ? payload.result : [])
    .map((row) => Object.fromEntries([['measurement_start_day', row.measurement_start_day], ...COUNT_KEYS.map((key) => [key, Number(row[key]) || 0])]));
  const kept = (stored?.rows ?? []).filter((row) => row.measurement_start_day < since);
  const rows = [...kept, ...fresh].sort((a, b) => a.measurement_start_day.localeCompare(b.measurement_start_day));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify({ fetchedAt: new Date(now).toISOString(), asn, domain, rows }));
  await rename(`${path}.tmp`, path);
  return rows;
}

export async function getServiceHistory({ now = Date.now(), storeDir, fetch = fetchOoniDailyCounts, outages = [] } = {}) {
  const until = new Date(now).toISOString().slice(0, 10);
  const services = [];
  const errors = [];
  // One after another: at most one OONI request at a time for this background view.
  for (const service of HISTORY_SERVICES) {
    const perNetwork = [];
    for (const network of HISTORY_NETWORKS) {
      try {
        perNetwork.push(await dailyRows({ asn: network.asn, domain: service.domain, now, storeDir, fetch }));
      } catch (error) {
        errors.push(`${service.id}/${network.name}: ${error?.message ?? String(error)}`);
      }
    }
    if (perNetwork.length !== HISTORY_NETWORKS.length) continue;
    const months = markOutageMonths(fillMonths(monthlyStatus(perNetwork), until), outages);
    services.push({ id: service.id, domain: service.domain, since: blockedSince(months), months });
  }
  return {
    ok: services.length > 0, source: 'OONI', start: HISTORY_START, until, networks: HISTORY_NETWORKS, services,
    errors, note: 'Monthly OONI Web Connectivity results on TCI, MCI and Irancell; majority rule per month; months with fewer than 10 tests are left open.',
  };
}
