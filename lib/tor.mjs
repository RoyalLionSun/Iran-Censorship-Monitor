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

export async function getTorMetrics({ since, until }) {
  validateRange(since, until, 120);
  const relayParams = new URLSearchParams({ start: since, end: until, country: 'ir', events: 'off' });
  const bridgeParams = new URLSearchParams({ start: since, end: until, country: 'ir' });
  const relayUrl = `https://metrics.torproject.org/userstats-relay-country.csv?${relayParams}`;
  const bridgeUrl = `https://metrics.torproject.org/userstats-bridge-country.csv?${bridgeParams}`;
  const settled = await Promise.allSettled([fetchText(relayUrl), fetchText(bridgeUrl)]);
  const relay = settled[0].status === 'fulfilled' ? summarize(parseTorUserStats(settled[0].value), true) : summarize([], true);
  const bridge = settled[1].status === 'fulfilled' ? summarize(parseTorBridgeStats(settled[1].value), false) : summarize([]);
  if (settled.every((result) => result.status === 'rejected')) {
    throw settled[0].reason instanceof Error ? settled[0].reason : new Error('Tor Metrics requests failed.');
  }
  return {
    ok: true,
    source: 'Tor Metrics',
    status: relay.rows.length || bridge.rows.length ? 'observed' : 'no_data',
    since,
    until,
    country: 'IR',
    fetchedAt: new Date().toISOString(),
    relay,
    bridge,
    sourceUrls: { relay: relayUrl, bridge: bridgeUrl },
    partialErrors: {
      relay: settled[0].status === 'rejected' ? (settled[0].reason instanceof Error ? settled[0].reason.message : String(settled[0].reason)) : null,
      bridge: settled[1].status === 'rejected' ? (settled[1].reason instanceof Error ? settled[1].reason.message : String(settled[1].reason)) : null,
    },
    note: 'Tor user counts are estimates derived from directory requests. A value below Tor Metrics’ expected lower bound may indicate a censorship-related event, but is not proof of censorship and can have other causes.',
  };
}
