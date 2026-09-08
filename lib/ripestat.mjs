import { asRecord, fetchJson, normalizeAsn, parseNumber, utcEnd, utcStart, validateRange } from './common.mjs';

const RIPESTAT_BASE = 'https://stat.ripe.net/data';
const BGP_INDEX_START = '2024-01-01';

function resource(asn) {
  const normalized = normalizeAsn(asn);
  if (!normalized) throw new Error('RIPEstat routing analysis requires a selected ASN.');
  return normalized;
}

export function buildRipeStatUrls({ asn, since, until }) {
  validateRange(since, until, 120);
  const normalizedAsn = resource(asn);
  const encoded = encodeURIComponent(normalizedAsn);
  const starttime = encodeURIComponent(utcStart(since));
  const endtime = encodeURIComponent(utcEnd(until));
  return {
    asn: normalizedAsn,
    routingStatus: `${RIPESTAT_BASE}/routing-status/data.json?resource=${encoded}`,
    announcedPrefixes: `${RIPESTAT_BASE}/announced-prefixes/data.json?resource=${encoded}&starttime=${starttime}&endtime=${endtime}`,
    bgpUpdates: `${RIPESTAT_BASE}/bgp-updates/data.json?resource=${encoded}&starttime=${starttime}&endtime=${endtime}`,
  };
}

function normalizeVisibility(data) {
  const visibility = asRecord(data?.visibility) ?? {};
  const seeing = parseNumber(visibility.v4?.ris_peers_seeing ?? visibility.v4?.peers_seeing ?? visibility.ris_peers_seeing ?? visibility.peers_seeing);
  const total = parseNumber(visibility.v4?.total_ris_peers ?? visibility.v4?.total_peers ?? visibility.total_ris_peers ?? visibility.total_peers);
  const percent = seeing !== null && total ? (seeing / total) * 100 : null;
  return { seeingPeers: seeing, totalPeers: total, percent };
}

export function parseRoutingStatus(payload) {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? {};
  const v4 = asRecord(data.announced_space?.v4) ?? asRecord(data.announced_space) ?? {};
  const v6 = asRecord(data.announced_space?.v6) ?? {};
  const neighbours = Array.isArray(data.observed_neighbours) ? data.observed_neighbours : [];
  return {
    visibility: normalizeVisibility(data),
    announcedSpace: {
      ipv4Prefixes: parseNumber(v4.prefixes ?? data.announced_prefixes_v4 ?? data.announced_prefixes),
      ipv4Addresses: parseNumber(v4.addresses ?? data.announced_space_v4),
      ipv6Prefixes: parseNumber(v6.prefixes ?? data.announced_prefixes_v6),
      ipv6Addresses: parseNumber(v6.addresses ?? data.announced_space_v6),
    },
    observedNeighbours: neighbours.map((item) => {
      const row = asRecord(item) ?? {};
      return {
        asn: row.asn ? `AS${String(row.asn).replace(/^AS/i, '')}` : null,
        power: parseNumber(row.power),
        v4Peers: parseNumber(row.v4_peers),
        v6Peers: parseNumber(row.v6_peers),
      };
    }).filter((row) => row.asn),
    queryTime: typeof data.query_time === 'string' ? data.query_time : null,
  };
}

export function parseAnnouncedPrefixes(payload) {
  const data = asRecord(payload)?.data ?? {};
  const prefixes = Array.isArray(data.prefixes) ? data.prefixes : [];
  return prefixes.map((item) => {
    const row = asRecord(item) ?? {};
    return {
      prefix: typeof row.prefix === 'string' ? row.prefix : null,
      timelines: Array.isArray(row.timelines) ? row.timelines.map((time) => {
        const record = asRecord(time) ?? {};
        return { starttime: record.starttime ?? null, endtime: record.endtime ?? null };
      }) : [],
    };
  }).filter((row) => row.prefix);
}

function normalizePath(path) {
  if (!Array.isArray(path)) return [];
  return path.map((value) => {
    if (Array.isArray(value)) return value.map((part) => String(part)).join(',');
    return String(value);
  });
}

export function parseBgpUpdates(payload, limit = 250) {
  const data = asRecord(payload)?.data ?? {};
  const updates = Array.isArray(data.updates) ? data.updates : [];
  return updates.slice(0, Math.max(1, Math.min(limit, 250))).map((item) => {
    const row = asRecord(item) ?? {};
    const attrs = asRecord(row.attrs) ?? {};
    const typeRaw = String(row.type ?? row.update_type ?? '').toUpperCase();
    const type = typeRaw.startsWith('W') ? 'withdrawal' : typeRaw.startsWith('A') ? 'announcement' : typeRaw.toLowerCase() || 'unknown';
    return {
      timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
      type,
      prefix: typeof row.prefix === 'string' ? row.prefix : null,
      asPath: normalizePath(attrs.path ?? row.path),
      collector: row.rrc ? String(row.rrc) : (row.collector ? String(row.collector) : null),
      peerAsn: row.peer_asn ? `AS${String(row.peer_asn).replace(/^AS/i, '')}` : null,
      peerIp: typeof row.peer_ip === 'string' ? row.peer_ip : null,
    };
  });
}

export function bgpWindowAvailability(since, until) {
  validateRange(since, until, 120);
  if (until < BGP_INDEX_START) return { available: false, reason: `RIPEstat BGP Updates is indexed from ${BGP_INDEX_START}.` };
  return { available: true, reason: null };
}

export function boundedBgpWindow(since, until) {
  validateRange(since, until, 120);
  const availability = bgpWindowAvailability(since, until);
  if (!availability.available) return { ...availability, since, until };
  const end = new Date(`${until}T23:59:59Z`);
  const requestedStart = new Date(`${since}T00:00:00Z`);
  const capStart = new Date(end.getTime() - (48 * 60 * 60 * 1000) + 1000);
  const start = requestedStart > capStart ? requestedStart : capStart;
  const boundedSince = start.toISOString().slice(0, 10);
  return { available: true, reason: null, since: boundedSince, until, cappedTo48Hours: start > requestedStart };
}

export async function getRipeStatSignals({ asn, since, until }) {
  const urls = buildRipeStatUrls({ asn, since, until });
  const settled = await Promise.allSettled([
    fetchJson(urls.routingStatus),
    fetchJson(urls.announcedPrefixes),
  ]);
  const routing = settled[0].status === 'fulfilled' ? parseRoutingStatus(settled[0].value) : null;
  const prefixes = settled[1].status === 'fulfilled' ? parseAnnouncedPrefixes(settled[1].value) : [];
  if (!routing && settled[1].status === 'rejected') throw settled[0].reason instanceof Error ? settled[0].reason : new Error('RIPEstat requests failed.');
  return {
    ok: true,
    source: 'RIPEstat / RIPE RIS',
    status: routing || prefixes.length ? 'observed' : 'no_data',
    asn: urls.asn,
    since,
    until,
    fetchedAt: new Date().toISOString(),
    routing,
    announcedPrefixes: prefixes,
    sourceUrls: { routingStatus: urls.routingStatus, announcedPrefixes: urls.announcedPrefixes },
    partialErrors: {
      routingStatus: settled[0].status === 'rejected' ? String(settled[0].reason?.message ?? settled[0].reason) : null,
      announcedPrefixes: settled[1].status === 'rejected' ? String(settled[1].reason?.message ?? settled[1].reason) : null,
    },
    note: 'RIPEstat/RIS describes the BGP control plane. Stable route visibility can coexist with severe data-plane filtering or selective isolation.',
  };
}

export async function getRipeBgpUpdates({ asn, since, until }) {
  const window = boundedBgpWindow(since, until);
  const normalizedAsn = resource(asn);
  if (!window.available) {
    return {
      ok: true,
      source: 'RIPEstat BGP Updates',
      status: 'unavailable_historical_window',
      asn: normalizedAsn,
      requested: { since, until },
      effective: null,
      events: [],
      note: window.reason,
    };
  }
  const urls = buildRipeStatUrls({ asn: normalizedAsn, since: window.since, until: window.until });
  const payload = await fetchJson(urls.bgpUpdates, { cacheTtlMs: 60_000 });
  const events = parseBgpUpdates(payload, 250);
  return {
    ok: true,
    source: 'RIPEstat BGP Updates',
    status: events.length ? 'observed' : 'no_data',
    asn: normalizedAsn,
    requested: { since, until },
    effective: { since: window.since, until: window.until, cappedTo48Hours: window.cappedTo48Hours },
    events,
    preview: events.slice(0, 80),
    sourceUrl: urls.bgpUpdates,
    fetchedAt: new Date().toISOString(),
    note: 'Announcements and withdrawals are routing evidence only. They do not by themselves establish censorship or user-level reachability.',
  };
}
