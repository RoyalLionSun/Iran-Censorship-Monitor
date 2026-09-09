import { fetchText, parseNumber, validateRange } from './common.mjs';

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

function summarize(rows, expectation = false) {
  const latest = rows.at(-1) ?? null;
  const possibleCensorshipDays = expectation ? rows.filter((row) => row.lower !== null && row.users < row.lower).length : null;
  return {
    rows,
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
      rows: values,
      latestDate: latest?.date ?? null,
      latestLow: latest?.low ?? null,
      latestHigh: latest?.high ?? null,
      latestFraction: latest?.frac ?? null,
    };
  }).sort((a, b) => (b.latestHigh ?? 0) - (a.latestHigh ?? 0));
}

export async function getTorMetrics({ since, until }) {
  validateRange(since, until, 120);
  const relayParams = new URLSearchParams({ start: since, end: until, country: 'ir', events: 'off' });
  const bridgeParams = new URLSearchParams({ start: since, end: until, country: 'ir' });
  const transportParams = new URLSearchParams({ start: since, end: until, country: 'ir' });
  const relayUrl = `https://metrics.torproject.org/userstats-relay-country.csv?${relayParams}`;
  const bridgeUrl = `https://metrics.torproject.org/userstats-bridge-country.csv?${bridgeParams}`;
  const transportUrl = `https://metrics.torproject.org/userstats-bridge-combined.csv?${transportParams}`;
  const settled = await Promise.allSettled([fetchText(relayUrl), fetchText(bridgeUrl), fetchText(transportUrl)]);
  const relay = settled[0].status === 'fulfilled' ? summarize(parseTorUserStats(settled[0].value), true) : summarize([], true);
  const bridge = settled[1].status === 'fulfilled' ? summarize(parseTorBridgeStats(settled[1].value), false) : summarize([]);
  const transportRows = settled[2].status === 'fulfilled' ? parseTorBridgeTransportStats(settled[2].value) : [];
  const transports = summarizeTransports(transportRows);
  if (settled.every((result) => result.status === 'rejected')) {
    throw settled[0].reason instanceof Error ? settled[0].reason : new Error('Tor Metrics requests failed.');
  }
  return {
    ok: true,
    source: 'Tor Metrics',
    status: relay.rows.length || bridge.rows.length || transports.length ? 'observed' : 'no_data',
    since,
    until,
    country: 'IR',
    fetchedAt: new Date().toISOString(),
    relay,
    bridge,
    transports,
    sourceUrls: { relay: relayUrl, bridge: bridgeUrl, transports: transportUrl },
    partialErrors: {
      relay: settled[0].status === 'rejected' ? (settled[0].reason instanceof Error ? settled[0].reason.message : String(settled[0].reason)) : null,
      bridge: settled[1].status === 'rejected' ? (settled[1].reason instanceof Error ? settled[1].reason.message : String(settled[1].reason)) : null,
      transports: settled[2].status === 'rejected' ? (settled[2].reason instanceof Error ? settled[2].reason.message : String(settled[2].reason)) : null,
    },
    note: 'Tor user counts are estimates derived from directory requests. Country × transport values are derived lower/upper bounds, not exact client counts. Changes can be censorship-related but are not proof on their own.',
  };
}
