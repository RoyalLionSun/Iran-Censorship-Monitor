import { isIP } from 'node:net';
import { fetchJson, normalizeAsn } from './common.mjs';
import { buildRipeStatUrls, parseAnnouncedPrefixes } from './ripestat.mjs';

export const RIS_LIVE_STREAM_URL = 'https://ris-live.ripe.net/v1/stream/?format=json&client=iran-censorship-monitor-v1.1';
export const RIS_LIVE_MAX_PREFIXES = 200;
export const RIS_LIVE_MAX_SUBSCRIPTION_BYTES = 12_000;
export const RIS_LIVE_DEFAULT_RETENTION_DAYS = 7;
export const RIS_LIVE_MAX_RETENTION_DAYS = 30;

export function normalizeCidr(value) {
  const text = String(value ?? '').trim();
  const parts = text.split('/');
  if (parts.length !== 2) throw new Error(`Invalid CIDR prefix: ${text || '(empty)'}`);
  const family = isIP(parts[0]);
  const length = Number(parts[1]);
  const maximum = family === 4 ? 32 : family === 6 ? 128 : null;
  if (!maximum || !Number.isInteger(length) || length < 0 || length > maximum) throw new Error(`Invalid CIDR prefix: ${text}`);
  return `${parts[0]}/${length}`;
}

export function buildRisLiveSubscription(prefixes, { maxPrefixes = RIS_LIVE_MAX_PREFIXES } = {}) {
  const normalized = [...new Set((prefixes ?? []).map(normalizeCidr))].sort();
  if (!normalized.length) throw new Error('RIS Live requires at least one scoped prefix.');
  if (!Number.isInteger(maxPrefixes) || maxPrefixes < 1 || maxPrefixes > RIS_LIVE_MAX_PREFIXES) throw new Error(`RIS Live maxPrefixes must be between 1 and ${RIS_LIVE_MAX_PREFIXES}.`);
  if (normalized.length > maxPrefixes) throw new Error(`RIS Live scope contains ${normalized.length} prefixes; configured maximum is ${maxPrefixes}. Narrow the scope explicitly rather than silently truncating it.`);

  const subscription = {
    type: 'UPDATE',
    prefix: normalized,
    moreSpecific: true,
    lessSpecific: false,
    socketOptions: { includeRaw: false },
  };
  const encoded = JSON.stringify(subscription);
  const bytes = Buffer.byteLength(encoded, 'utf8');
  if (bytes > RIS_LIVE_MAX_SUBSCRIPTION_BYTES) throw new Error(`RIS Live subscription header is ${bytes} bytes; maximum is ${RIS_LIVE_MAX_SUBSCRIPTION_BYTES}. Narrow the prefix scope.`);
  return { subscription, encoded, prefixes: normalized, bytes };
}

export function buildRisLiveStreamRequest(prefixes, options = {}) {
  const built = buildRisLiveSubscription(prefixes, options);
  return {
    url: RIS_LIVE_STREAM_URL,
    headers: {
      accept: 'application/json,application/x-ndjson;q=0.9,*/*;q=0.1',
      'x-ris-subscribe': built.encoded,
    },
    ...built,
  };
}

function normalizeAsPath(path) {
  if (!Array.isArray(path)) return [];
  return path.map((part) => {
    if (Array.isArray(part)) return `{${part.map((asn) => String(asn).replace(/^AS/i, '')).join(',')}}`;
    const text = String(part).replace(/^AS/i, '');
    return /^\d+$/.test(text) ? `AS${text}` : text;
  });
}

function originAsn(asPath) {
  const last = asPath.at(-1);
  return typeof last === 'string' && /^AS\d+$/.test(last) ? last : null;
}

function normalizeCommunities(communities) {
  if (!Array.isArray(communities)) return [];
  return communities.map((value) => Array.isArray(value) && value.length >= 2 ? `${value[0]}:${value[1]}` : null).filter(Boolean);
}

function isoTimestamp(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseRisLiveLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return { kind: 'empty', events: [] };
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('RIS Live stream returned invalid JSON.'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('RIS Live stream returned an invalid message envelope.');

  if (envelope.type === 'ris_error') {
    return { kind: 'error', events: [], error: String(envelope.data?.message ?? 'RIS Live reported an unspecified error.') };
  }
  if (envelope.type !== 'ris_message') return { kind: 'meta', type: String(envelope.type ?? 'unknown'), events: [] };

  const data = envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data) ? envelope.data : null;
  if (!data || data.type !== 'UPDATE') return { kind: 'message', messageType: String(data?.type ?? 'unknown'), events: [] };

  const asPath = normalizeAsPath(data.path);
  const shared = {
    source: 'RIPE RIS Live',
    evidenceRole: 'routing-control-plane',
    independentCensorshipVote: false,
    timestamp: isoTimestamp(data.timestamp),
    risTimestamp: Number.isFinite(Number(data.timestamp)) ? Number(data.timestamp) : null,
    messageId: typeof data.id === 'string' ? data.id : null,
    collector: typeof data.host === 'string' ? data.host : null,
    peerIp: typeof data.peer === 'string' ? data.peer : null,
    peerAsn: data.peer_asn === undefined || data.peer_asn === null ? null : normalizeAsn(String(data.peer_asn)),
    asPath,
    originAsn: originAsn(asPath),
    communities: normalizeCommunities(data.community),
    origin: typeof data.origin === 'string' ? data.origin : null,
    med: Number.isFinite(Number(data.med)) ? Number(data.med) : null,
    aggregator: typeof data.aggregator === 'string' ? data.aggregator : null,
  };

  const events = [];
  for (const announcement of Array.isArray(data.announcements) ? data.announcements : []) {
    if (!announcement || typeof announcement !== 'object') continue;
    const nextHop = typeof announcement.next_hop === 'string' ? announcement.next_hop : null;
    for (const rawPrefix of Array.isArray(announcement.prefixes) ? announcement.prefixes : []) {
      let prefix;
      try { prefix = normalizeCidr(rawPrefix); } catch { continue; }
      events.push({ ...shared, eventType: 'announcement', prefix, nextHop });
    }
  }
  for (const rawPrefix of Array.isArray(data.withdrawals) ? data.withdrawals : []) {
    let prefix;
    try { prefix = normalizeCidr(rawPrefix); } catch { continue; }
    events.push({ ...shared, eventType: 'withdrawal', prefix, nextHop: null });
  }
  return { kind: 'update', events };
}

export async function* decodeRisLiveJsonLines(chunks) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.trim()) yield line;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.replace(/\r$/, '');
}

function utcDay(value) {
  return value.toISOString().slice(0, 10);
}

export async function resolveRisLivePrefixScope(asn, { now = new Date(), lookbackDays = 7, fetcher = fetchJson, maxPrefixes = RIS_LIVE_MAX_PREFIXES } = {}) {
  const normalizedAsn = normalizeAsn(asn);
  if (!normalizedAsn) throw new Error('RIS Live collector requires an explicit ASN.');
  const untilDate = new Date(now);
  if (Number.isNaN(untilDate.getTime())) throw new Error('Invalid RIS Live scope timestamp.');
  const sinceDate = new Date(untilDate);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - Math.max(1, Math.min(Number(lookbackDays) || 7, 30)));
  const since = utcDay(sinceDate);
  const until = utcDay(untilDate);
  const urls = buildRipeStatUrls({ asn: normalizedAsn, since, until });
  const payload = await fetcher(urls.announcedPrefixes, { cacheTtlMs: 5 * 60_000, timeoutMs: 20_000 });
  const prefixes = [...new Set(parseAnnouncedPrefixes(payload).map((row) => normalizeCidr(row.prefix)))].sort();
  if (!prefixes.length) return { status: 'no_data', asn: normalizedAsn, since, until, prefixes: [], sourceUrl: urls.announcedPrefixes };
  buildRisLiveSubscription(prefixes, { maxPrefixes });
  return { status: 'observed', asn: normalizedAsn, since, until, prefixes, sourceUrl: urls.announcedPrefixes };
}

export function reconnectDelayMs(attempt, maximumMs = 30_000) {
  const safeAttempt = Math.max(0, Math.min(Number(attempt) || 0, 10));
  const safeMaximum = Math.max(1_000, Math.min(Number(maximumMs) || 30_000, 300_000));
  return Math.min(1_000 * (2 ** safeAttempt), safeMaximum);
}
