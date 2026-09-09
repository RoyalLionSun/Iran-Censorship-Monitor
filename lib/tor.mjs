import { fetchText, parseNumber, validateRange } from './common.mjs';

export const TOR_EVIDENCE_POLICY = Object.freeze({
  sourceFamily: 'tor',
  evidenceRole: 'circumvention-context',
  independentCensorshipVote: false,
});

export const TOR_BRIDGEDB_SCOPE = Object.freeze({
  geographicScope: 'global',
  iranSpecific: false,
  excludesTorExitRequests: true,
  requestsAreApproximate: true,
});

const FOCUS_TRANSPORTS = new Set(['obfs4', 'snowflake', 'webtunnel', 'meek', 'conjure']);

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((part) => part.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function parseTorUserStats(text) {
  return parseCsv(text).map((row) => ({
    date: row.date || null,
    country: row.country || null,
    users: parseNumber(row.users),
    lower: parseNumber(row.lower),
    upper: parseNumber(row.upper),
    frac: parseNumber(row.frac),
  })).filter((row) => row.date && row.users !== null);
}

export function parseTorBridgeStats(text) {
  return parseCsv(text).map((row) => ({
    date: row.date || null,
    country: row.country || null,
    users: parseNumber(row.users),
    frac: parseNumber(row.frac),
  })).filter((row) => row.date && row.users !== null);
}

export function parseTorBridgeTransportStats(text) {
  return parseCsv(text).map((row) => ({
    date: row.date || null,
    country: row.country || null,
    transport: row.transport || null,
    low: parseNumber(row.low ?? row.lower),
    high: parseNumber(row.high ?? row.upper),
    frac: parseNumber(row.frac),
  })).filter((row) => row.date && row.transport && (row.low !== null || row.high !== null));
}

export function parseTorBridgeDbTransportStats(text) {
  return parseCsv(text).map((row) => ({
    date: row.date || null,
    transport: row.transport || null,
    requestsApprox: parseNumber(row.requests),
  })).filter((row) => row.date && row.transport && row.requestsApprox !== null);
}

export function buildTorMetricUrls({ since, until }) {
  validateRange(since, until, 120);
  const relayParams = new URLSearchParams({ start: since, end: until, country: 'ir', events: 'off' });
  const bridgeParams = new URLSearchParams({ start: since, end: until, country: 'ir' });
  const transportParams = new URLSearchParams({ start: since, end: until, country: 'ir' });
  const bridgeDbParams = new URLSearchParams({ start: since, end: until });
  return {
    relay: `https://metrics.torproject.org/userstats-relay-country.csv?${relayParams}`,
    bridge: `https://metrics.torproject.org/userstats-bridge-country.csv?${bridgeParams}`,
    transports: `https://metrics.torproject.org/userstats-bridge-combined.csv?${transportParams}`,
    bridgeDbGlobal: `https://metrics.torproject.org/bridgedb-transport.csv?${bridgeDbParams}`,
  };
}

function summarize(rows, expectation = false) {
  const ordered = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = ordered.at(-1) ?? null;
  const possibleCensorshipDays = expectation ? ordered.filter((row) => row.lower !== null && row.users < row.lower).length : null;
  return {
    rows: ordered,
    latestUsers: latest?.users ?? null,
    latestDate: latest?.date ?? null,
    possibleCensorshipDays,
  };
}

function summarizeTransports(rows) {
  const byTransport = new Map();
  for (const row of rows) {
    if (!byTransport.has(row.transport)) byTransport.set(row.transport, []);
    byTransport.get(row.transport).push(row);
  }
  return [...byTransport.entries()].map(([transport, values]) => {
    values.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const latest = values.at(-1);
    return {
      transport,
      focusTransport: FOCUS_TRANSPORTS.has(String(transport).toLowerCase()),
      estimateKind: 'derived_lower_upper_bounds',
      exactUsers: null,
      rows: values,
      latestDate: latest?.date ?? null,
      latestLow: latest?.low ?? null,
      latestHigh: latest?.high ?? null,
      latestFraction: latest?.frac ?? null,
    };
  }).sort((a, b) => (b.latestHigh ?? 0) - (a.latestHigh ?? 0));
}

function summarizeBridgeDb(rows) {
  const byTransport = new Map();
  for (const row of rows) {
    if (!byTransport.has(row.transport)) byTransport.set(row.transport, []);
    byTransport.get(row.transport).push(row);
  }
  const transports = [...byTransport.entries()].map(([transport, values]) => {
    values.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const latest = values.at(-1);
    return {
      transport,
      rows: values,
      latestDate: latest?.date ?? null,
      latestRequestsApprox: latest?.requestsApprox ?? null,
      windowRequestsApprox: values.reduce((sum, row) => sum + (row.requestsApprox ?? 0), 0),
    };
  }).sort((a, b) => (b.latestRequestsApprox ?? 0) - (a.latestRequestsApprox ?? 0));
  return {
    ...TOR_BRIDGEDB_SCOPE,
    rows,
    transports,
    note: 'BridgeDB requested-transport data is global aggregate demand context. It has no country dimension and must not be presented as Iran-specific.',
  };
}

function feedStatus(result, rows) {
  if (result.status === 'rejected') return 'error';
  return rows.length ? 'observed' : 'no_data';
}

export async function getTorMetrics({ since, until }) {
  const sourceUrls = buildTorMetricUrls({ since, until });
  const settled = await Promise.allSettled([
    fetchText(sourceUrls.relay),
    fetchText(sourceUrls.bridge),
    fetchText(sourceUrls.transports),
    fetchText(sourceUrls.bridgeDbGlobal),
  ]);

  const relayRows = settled[0].status === 'fulfilled' ? parseTorUserStats(settled[0].value) : [];
  const bridgeRows = settled[1].status === 'fulfilled' ? parseTorBridgeStats(settled[1].value) : [];
  const transportRows = settled[2].status === 'fulfilled' ? parseTorBridgeTransportStats(settled[2].value) : [];
  const bridgeDbRows = settled[3].status === 'fulfilled' ? parseTorBridgeDbTransportStats(settled[3].value) : [];

  if (settled.every((result) => result.status === 'rejected')) {
    throw settled[0].reason instanceof Error ? settled[0].reason : new Error('Tor Metrics requests failed.');
  }

  const relay = summarize(relayRows, true);
  const bridge = summarize(bridgeRows, false);
  const transports = summarizeTransports(transportRows);
  const bridgeDemandGlobal = summarizeBridgeDb(bridgeDbRows);
  const anyData = relayRows.length || bridgeRows.length || transportRows.length || bridgeDbRows.length;
  const anyError = settled.some((result) => result.status === 'rejected');

  return {
    ok: true,
    source: 'Tor Metrics',
    ...TOR_EVIDENCE_POLICY,
    status: anyError && anyData ? 'partial' : (anyData ? 'observed' : 'no_data'),
    since,
    until,
    country: 'IR',
    fetchedAt: new Date().toISOString(),
    relay,
    bridge,
    transports,
    bridgeDemandGlobal,
    sourceUrls,
    coverage: {
      relay: feedStatus(settled[0], relayRows),
      bridge: feedStatus(settled[1], bridgeRows),
      transports: feedStatus(settled[2], transportRows),
      bridgeDbGlobal: feedStatus(settled[3], bridgeDbRows),
    },
    partialErrors: {
      relay: settled[0].status === 'rejected' ? (settled[0].reason instanceof Error ? settled[0].reason.message : String(settled[0].reason)) : null,
      bridge: settled[1].status === 'rejected' ? (settled[1].reason instanceof Error ? settled[1].reason.message : String(settled[1].reason)) : null,
      transports: settled[2].status === 'rejected' ? (settled[2].reason instanceof Error ? settled[2].reason.message : String(settled[2].reason)) : null,
      bridgeDbGlobal: settled[3].status === 'rejected' ? (settled[3].reason instanceof Error ? settled[3].reason.message : String(settled[3].reason)) : null,
    },
    note: 'Tor user counts are estimates derived from directory requests. Iran country × transport values are derived lower/upper bounds, not exact client counts. BridgeDB demand is global-only context. Changes can be censorship-related but are not proof on their own.',
  };
}
