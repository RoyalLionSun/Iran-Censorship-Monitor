import { normalizeAsn } from './common.mjs';
import { normalizeCidr, resolveRisLivePrefixScope, RIS_LIVE_MAX_PREFIXES } from './rislive.mjs';

export const BGPSTREAM_BROKER_URL = 'https://broker.bgpstream.caida.org/v2';
export const BGPSTREAM_ROUTEVIEWS_PROJECT = 'routeviews-stream';
export const BGPSTREAM_ROUTEVIEWS_DEFAULT_RETENTION_DAYS = 7;
export const BGPSTREAM_ROUTEVIEWS_MAX_RETENTION_DAYS = 30;
export const BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES = RIS_LIVE_MAX_PREFIXES;

function boundedPrefixScope(prefixes, { maxPrefixes = BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES } = {}) {
  const normalized = [...new Set((prefixes ?? []).map(normalizeCidr))].sort();
  if (!normalized.length) throw new Error('Route Views BGPStream requires at least one scoped prefix.');
  if (!Number.isInteger(maxPrefixes) || maxPrefixes < 1 || maxPrefixes > BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES) {
    throw new Error(`Route Views BGPStream maxPrefixes must be between 1 and ${BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES}.`);
  }
  if (normalized.length > maxPrefixes) {
    throw new Error(`Route Views BGPStream scope contains ${normalized.length} prefixes; configured maximum is ${maxPrefixes}. Narrow the scope explicitly rather than silently truncating it.`);
  }
  return normalized;
}

export function buildRouteViewsBgpReaderArgs(prefixes, options = {}) {
  const normalized = boundedPrefixScope(prefixes, options);
  const args = ['-p', BGPSTREAM_ROUTEVIEWS_PROJECT, '-t', 'updates', '-e'];
  for (const prefix of normalized) args.push('-k', prefix);
  return { args, prefixes: normalized };
}

function isoTimestamp(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeAsPath(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text.split(/\s+/).map((part) => {
    if (/^\d+$/.test(part)) return `AS${part}`;
    if (/^\{[\d, ]+\}$/.test(part)) return `{${part.slice(1, -1).split(',').map((item) => item.trim().replace(/^AS/i, '')).filter(Boolean).join(',')}}`;
    return part;
  });
}

function normalizeOriginAsn(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  return normalizeAsn(text);
}

function normalizeCommunities(value) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/).filter(Boolean) : [];
}

export function parseRouteViewsBgpReaderLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return { kind: 'empty', events: [] };
  const fields = text.split('|');
  if (fields.length < 16) throw new Error(`BGPReader returned ${fields.length} fields; expected at least 16.`);

  const [recordType, elemType, rawTimestamp, project, collector, router, routerIp, peerAsn, peerIp, rawPrefix, nextHop, rawAsPath, rawOriginAsn, rawCommunities, oldState, newState] = fields;
  if (project !== BGPSTREAM_ROUTEVIEWS_PROJECT) {
    throw new Error(`BGPReader returned unexpected project ${project || '(empty)'}; refusing to mix non-Route-Views data into the Route Views collector.`);
  }
  if (elemType !== 'A' && elemType !== 'W') return { kind: 'meta', elemType, events: [] };

  const prefix = normalizeCidr(rawPrefix);
  const event = {
    source: 'Route Views BMP via CAIDA BGPStream',
    provider: 'Route Views',
    accessFramework: 'CAIDA BGPStream',
    routingSourceFamily: 'routeviews',
    evidenceRole: 'routing-control-plane',
    independentCensorshipVote: false,
    recordType: recordType || null,
    eventType: elemType === 'A' ? 'announcement' : 'withdrawal',
    timestamp: isoTimestamp(rawTimestamp),
    bgpTimestamp: Number.isFinite(Number(rawTimestamp)) ? Number(rawTimestamp) : null,
    project,
    collector: collector || null,
    router: router || null,
    routerIp: routerIp || null,
    peerAsn: /^\d+$/.test(String(peerAsn ?? '').trim()) ? normalizeAsn(peerAsn) : null,
    peerIp: peerIp || null,
    prefix,
    nextHop: elemType === 'A' && nextHop ? nextHop : null,
    asPath: elemType === 'A' ? normalizeAsPath(rawAsPath) : [],
    originAsn: elemType === 'A' ? normalizeOriginAsn(rawOriginAsn) : null,
    communities: elemType === 'A' ? normalizeCommunities(rawCommunities) : [],
    oldState: oldState || null,
    newState: newState || null,
  };
  return { kind: 'update', events: [event] };
}

export function buildRouteViewsBrokerUrl({ now = new Date() } = {}) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid BGPStream broker timestamp.');
  const start = Math.floor(date.getTime() / 1000);
  const url = new URL(`${BGPSTREAM_BROKER_URL}/data`);
  url.searchParams.append('projects[]', BGPSTREAM_ROUTEVIEWS_PROJECT);
  url.searchParams.append('resourceTypes[]', 'stream');
  url.searchParams.append('types[]', 'updates');
  // Match libBGPStream live mode exactly: begin at the current epoch and use
  // end=0 (BGPSTREAM_FOREVER), rather than a finite historical interval.
  url.searchParams.append('intervals[]', `${start},0`);
  return url.href;
}

export function parseRouteViewsBrokerPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('BGPStream broker returned an invalid JSON envelope.');
  if (payload.error) throw new Error(`BGPStream broker reported an error: ${typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error)}`);
  const resources = Array.isArray(payload.data?.resources) ? payload.data.resources : [];
  const matched = resources.filter((resource) => resource && resource.project === BGPSTREAM_ROUTEVIEWS_PROJECT);
  return {
    status: matched.length ? 'observed' : 'no_data',
    resourceCount: matched.length,
    resources: matched.map((resource) => ({
      project: resource.project,
      collector: resource.collector ?? null,
      router: resource.router ?? null,
      type: resource.type ?? null,
      format: resource.format ?? null,
      transport: resource.transport ?? null,
      url: typeof resource.url === 'string' ? resource.url : null,
      initialTime: Number.isFinite(Number(resource.initialTime)) ? Number(resource.initialTime) : null,
      duration: Number.isFinite(Number(resource.duration)) ? Number(resource.duration) : null,
    })),
  };
}

export async function resolveRouteViewsPrefixScope(asn, options = {}) {
  const scope = await resolveRisLivePrefixScope(asn, options);
  return {
    ...scope,
    scopeSource: 'RIPEstat announced-prefixes',
  };
}
