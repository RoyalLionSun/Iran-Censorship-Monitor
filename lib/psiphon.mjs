import { asRecord, fetchJson, parseNumber } from './common.mjs';

// Psiphon's public statistics (the data behind conduit.psiphon.ca/stats). Conduit stations are
// run by volunteers; Psiphon users in Iran connect through them instead of Psiphon's own servers,
// which Iran blocks far more easily. The daily count of Conduit connections from clients in Iran
// shows whether this way is getting through: usage seen by Psiphon, from inside Iran. It says that
// connections succeed, not which services people then reach.

export const PSIPHON_CONDUIT_URL = 'https://stats.psianalytics.live/conduitStats';

export function parseConduitStats(payload, region = 'IR') {
  const root = asRecord(payload);
  if (!root) return null;
  const series = (Array.isArray(root.daily_inproxy_count_last30) ? root.daily_inproxy_count_last30 : [])
    .filter((row) => row?.client_region === region && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)))
    .map((row) => ({ date: row.date, connections: parseNumber(row.doc_count) }))
    .filter((row) => row.connections !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const stations = (Array.isArray(root.station_regions) ? root.station_regions : []).find((row) => row?.region === region);
  return {
    series,
    stationsInRegion: parseNumber(stations?.stations),
    stationsWorld: parseNumber(root.total_stations),
    updated: typeof root._last_updated === 'string' ? root._last_updated : null,
    partial: root._partial === true,
  };
}

export async function getPsiphonConduit({ fetch = fetchJson } = {}) {
  const payload = await fetch(PSIPHON_CONDUIT_URL, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 });
  const parsed = parseConduitStats(payload);
  if (!parsed) throw new Error('Psiphon statistics answered without data.');
  // The last day is still being counted; the day before is the latest complete one.
  const complete = parsed.series.length > 1 ? parsed.series.slice(0, -1) : parsed.series;
  const latest = complete.at(-1) ?? null;
  return {
    ok: true,
    source: 'Psiphon Conduit statistics',
    status: latest ? 'observed' : 'no_data',
    region: 'IR',
    latest,
    series: complete,
    stationsInIran: parsed.stationsInRegion,
    stationsWorld: parsed.stationsWorld,
    updated: parsed.updated,
    sourceUrl: 'https://conduit.psiphon.ca/en/stats',
    note: 'Daily Conduit connections from Psiphon clients in Iran (Psiphon statistics). Usage from inside Iran, not an access claim for any service.',
  };
}
