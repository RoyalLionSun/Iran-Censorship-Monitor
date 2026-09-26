import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { blockedSince } from './history.mjs';

// Open daily data (/data/latest.json, /data/YYYY-MM-DD.json, /data/index.json): the day's
// findings for all of Iran as small, stable JSON, for journalists, researchers and mirrors. It
// carries only aggregated results the dashboard shows anyway, never single measurements, and
// nothing about who ran a test.

export const OPEN_DATA_SCHEMA = 'iran-censorship-monitor/daily/1';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const counts = (entry) => (entry?.measurements ? {
  tests: entry.measurements, confirmed: entry.confirmed ?? 0, anomalous: entry.anomalous ?? 0, ok: entry.ok ?? 0,
} : null);

export function buildDailyData({ interpretation, history = null, since, until, date, dashboardUrl, generatedAt = new Date().toISOString() }) {
  const services = interpretation?.services;
  if (!services?.items?.length) return null;
  const since2 = (id) => {
    const months = history?.services?.find((service) => service.id === id)?.months ?? [];
    const found = months.length ? blockedSince(months) : null;
    return found ? { month: found.month, fromStart: Boolean(found.fromStart) } : null;
  };
  const access = services.networkBreakdown?.access ?? [];
  const level = (name) => access.filter((entry) => entry.level === name).length;
  const change = (entry) => ({ id: entry.id, name: entry.name, from: entry.from, to: entry.to });
  return {
    schema: OPEN_DATA_SCHEMA,
    date,
    period: { since, until },
    scope: 'all networks registered in Iran; tests from networks registered abroad are left out',
    generatedAt,
    headline: interpretation.summary?.headline ? { state: interpretation.summary.headline.state, services: interpretation.summary.headline.services ?? [] } : null,
    services: services.items.map((item) => ({
      id: item.id,
      status: item.status,
      website: counts(item.web),
      app: item.app?.measurements ? { status: item.app.status ?? null, tests: item.app.measurements, failed: item.app.anomalies ?? null } : null,
      appServers: item.appServers?.measurements ? { status: item.appServers.status, tests: item.appServers.measurements } : null,
      blockedSince: since2(item.id),
    })),
    changes: services.changes?.compared ? {
      comparedServices: services.changes.compared,
      previousPeriod: services.changes.previous ?? null,
      worse: services.changes.worse.map(change),
      better: services.changes.better.map(change),
    } : null,
    moreServices: (services.more ?? []).map((group) => ({
      group: group.id,
      services: group.services.filter((service) => service.scope).map((service) => ({
        id: service.id, name: service.name, status: service.status, tests: service.measurements,
      })),
    })),
    waysAroundTheFilter: (services.workarounds ?? []).map((item) => ({
      id: item.id, status: item.status, usableTests: item.usable ?? 0, worked: item.ok ?? 0, failed: item.failed ?? 0,
    })),
    // Use of ways around the filter from inside Iran: usage, never proof that a service is reachable.
    usage: {
      cloudflareWarp: services.vpnUse?.current ? { date: services.vpnUse.current.date, sharePercent: services.vpnUse.current.share } : null,
      psiphonConduit: services.conduit?.latest ? { date: services.conduit.latest.date, connections: services.conduit.latest.connections } : null,
      tor: services.torUse?.date ? { date: services.torUse.date, directUsers: services.torUse.direct ?? null, bridgeUsers: services.torUse.bridges ?? null } : null,
    },
    networks: access.length ? { tested: access.length, fullAccess: level('full'), partial: level('partial'), blocked: level('blocked') } : null,
    dashboard: dashboardUrl,
    licence: { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', credit: 'Iran Censorship Monitor; measurements by OONI and the sources named on the dashboard' },
  };
}

export function openDataStore(dir) {
  return {
    async write(data) {
      if (!data?.date || !DAY.test(data.date)) return;
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${data.date}.json`);
      await writeFile(`${file}.tmp`, JSON.stringify(data));
      await rename(`${file}.tmp`, file);
    },
    async read(date) {
      if (!DAY.test(String(date ?? ''))) return null;
      try { return JSON.parse(await readFile(join(dir, `${date}.json`), 'utf8')); } catch { return null; }
    },
    async dates() {
      try {
        return (await readdir(dir)).filter((name) => DAY.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))
          .map((name) => name.slice(0, 10)).sort().reverse();
      } catch { return []; }
    },
  };
}
