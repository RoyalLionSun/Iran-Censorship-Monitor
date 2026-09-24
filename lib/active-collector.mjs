import { normalizeAsn } from './common.mjs';
import { validateGlobalpingTarget } from './globalping.mjs';

// Independent inside-out measurements from probes in Iranian networks (RIPE Atlas, Globalping).
// They are a second family next to OONI: DNS answers and TLS/HTTPS handshakes towards public
// services, never page content. They run only when the owner switches them on deliberately
// (ACTIVE_MEASUREMENTS_ENABLED=true, see DATA_RESILIENCE_PLAN.md), and only probes on networks
// registered in Iran count; a probe geolocated in Iran on a foreign network is dropped.

const HOUR = 60 * 60 * 1000;
const PENDING_MAX_AGE_MS = 48 * HOUR;
// A one-off RIPE Atlas measurement has delivered its results after this long.
const ATLAS_SETTLE_MS = 30 * 60 * 1000;

// Only the six mass services that millions in Iran contact every day (owner's ethics decision,
// 24 September 2026): the probes belong to private hosts who never agreed to test news or
// circumvention sites, so those stay with OONI, whose volunteers did. One host per service.
export const ACTIVE_HOSTS = Object.freeze([
  'www.instagram.com', 'web.whatsapp.com', 'web.telegram.org', 'www.youtube.com', 'x.com', 'www.facebook.com',
]);

// Which collector paths exist, which are on, and what each still needs. The page and the
// technical analysis show this, so "not switched on" is never mistaken for "no data".
export function collectorPlan(env = process.env) {
  const collector = env.MONITOR_COLLECTOR === '1';
  const active = env.ACTIVE_MEASUREMENTS_ENABLED === 'true';
  const needs = (list) => list.filter(([ok]) => !ok).map(([, name]) => name);
  const path = (missing) => ({ enabled: missing.length === 0, missing });
  // A single path can be paused (e.g. the OONI API while it blocks this address).
  const paused = new Set(String(env.MONITOR_COLLECTOR_PAUSE ?? '').split(',').map((name) => name.trim()).filter(Boolean));
  const paths = {
    'ooni-api': path(needs([[collector, 'MONITOR_COLLECTOR=1']])),
    // Heavy (about 400 MB of downloads per day for Iran): never part of default operation.
    'ooni-s3': path(needs([[collector, 'MONITOR_COLLECTOR=1'], [env.OONI_S3_ENABLED === '1', 'OONI_S3_ENABLED=1']])),
    'ripe-atlas': path(needs([[collector, 'MONITOR_COLLECTOR=1'], [active, 'ACTIVE_MEASUREMENTS_ENABLED=true'], [Boolean(env.RIPE_ATLAS_API_KEY?.trim()), 'RIPE_ATLAS_API_KEY']])),
    globalping: path(needs([[collector, 'MONITOR_COLLECTOR=1'], [active, 'ACTIVE_MEASUREMENTS_ENABLED=true']])),
  };
  return Object.fromEntries(Object.entries(paths).map(([name, entry]) => [name,
    paused.has(name) ? { enabled: false, paused: true, missing: [`MONITOR_COLLECTOR_PAUSE without ${name}`] } : entry]));
}

function ipv4Octets(value) {
  const parts = String(value ?? '').split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? octets : null;
}

// Iran's filter answers with its block-page addresses (10.10.34.34-36); any private or
// reserved answer for a public service is the same manipulation.
export function isBlockAddress(value) {
  const o = ipv4Octets(value);
  if (!o) return false;
  return o[0] === 10 || o[0] === 127 || o[0] === 0 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31)
    || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254) || (o[0] === 100 && o[1] >= 64 && o[1] <= 127);
}

const RCODES = { 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED' };

export function classifyDns({ rcode = 0, addresses = [] } = {}) {
  const blocked = addresses.find(isBlockAddress);
  if (blocked) return { outcome: 'blocked', detail: blocked };
  if (addresses.length) return { outcome: 'ok', detail: addresses[0] };
  return { outcome: 'failure', detail: RCODES[rcode] ?? (rcode ? `rcode ${rcode}` : 'no answer') };
}

// Minimal DNS wire-format reader for RIPE Atlas "abuf": the response code and the A records.
export function parseDnsAbuf(abuf) {
  const bytes = Buffer.from(String(abuf ?? ''), 'base64');
  if (bytes.length < 12) return null;
  const rcode = bytes[3] & 0x0f;
  const questions = bytes.readUInt16BE(4);
  const answers = bytes.readUInt16BE(6);
  let offset = 12;
  const skipName = () => {
    while (offset < bytes.length) {
      const length = bytes[offset];
      if (length === 0) { offset += 1; return; }
      if ((length & 0xc0) === 0xc0) { offset += 2; return; }
      offset += length + 1;
    }
  };
  for (let i = 0; i < questions; i += 1) { skipName(); offset += 4; }
  const addresses = [];
  for (let i = 0; i < answers && offset < bytes.length; i += 1) {
    skipName();
    if (offset + 10 > bytes.length) break;
    const type = bytes.readUInt16BE(offset);
    const length = bytes.readUInt16BE(offset + 8);
    offset += 10;
    if (type === 1 && length === 4 && offset + 4 <= bytes.length) addresses.push([...bytes.subarray(offset, offset + 4)].join('.'));
    offset += length;
  }
  return { rcode, addresses };
}

function isoSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---------------------------------------------------------------- RIPE Atlas

const ATLAS = 'https://atlas.ripe.net/api/v2';
// A deliberately high estimate per one-off DNS or TLS result, so a round is never started
// that the balance may not cover; the actual charge is shown in the Atlas credit history.
const ATLAS_CREDITS_PER_RESULT = 20;

// Connected probes on Iranian-registered networks, spread over as many networks as possible.
export function pickAtlasProbes(probes, iranAsns, limit = 10) {
  const byAsn = new Map();
  for (const probe of probes ?? []) {
    const asn = normalizeAsn(String(probe?.asn_v4 ?? ''));
    if (!asn || !iranAsns?.has(asn) || !Number.isInteger(probe?.id)) continue;
    if (!byAsn.has(asn)) byAsn.set(asn, []);
    byAsn.get(asn).push(probe.id);
  }
  const picked = {};
  const queues = [...byAsn.entries()];
  let count = 0;
  while (count < limit && queues.some(([, ids]) => ids.length)) {
    for (const [asn, ids] of queues) {
      if (count >= limit || !ids.length) continue;
      picked[ids.shift()] = asn;
      count += 1;
    }
  }
  return picked;
}

export function buildAtlasRequest(hosts, probeIds) {
  const definitions = hosts.flatMap((host) => [
    { type: 'dns', af: 4, query_class: 'IN', query_type: 'A', query_argument: host, use_probe_resolver: true, description: `ICM dns ${host}` },
    { type: 'sslcert', af: 4, target: host, hostname: host, port: 443, description: `ICM tls ${host}` },
  ]);
  return { definitions, probes: [{ type: 'probes', value: probeIds.join(','), requested: probeIds.length }], is_oneoff: true };
}

export function parseAtlasResults(results, { kind, host, probeAsns, measurementId }) {
  const rows = [];
  for (const result of Array.isArray(results) ? results : []) {
    const asn = probeAsns?.[result?.prb_id];
    if (!asn || !Number.isFinite(result?.timestamp)) continue;
    let verdict;
    if (kind === 'dns') {
      const answer = (result.resultset ?? [result]).find((entry) => entry?.result?.abuf)?.result;
      const parsed = answer ? parseDnsAbuf(answer.abuf) : null;
      verdict = parsed ? classifyDns(parsed) : { outcome: 'failure', detail: result.error ? Object.keys(result.error)[0] ?? 'error' : 'no answer' };
    } else {
      verdict = Array.isArray(result.cert) && result.cert.length
        ? { outcome: 'ok', detail: 'handshake completed' }
        : { outcome: 'failure', detail: String(result.err ?? (result.alert ? `alert ${result.alert.description ?? ''}`.trim() : 'no handshake')).slice(0, 120) };
    }
    rows.push({
      id: `atlas-${measurementId}-${result.prb_id}-${result.timestamp}`, source: 'ripe-atlas', probeId: String(result.prb_id),
      asn, host, kind, ...verdict, ts: isoSeconds(result.timestamp * 1000),
    });
  }
  return rows;
}

export function atlasPath({ http, key, hosts = ACTIVE_HOSTS, probeLimit = 10 }) {
  const headers = { authorization: `Key ${key}` };
  return {
    async create({ iranAsns, now }) {
      const listing = await http(`${ATLAS}/probes/?country_code=IR&status=1&page_size=500`);
      const probeAsns = pickAtlasProbes(listing?.results, iranAsns, probeLimit);
      const ids = Object.keys(probeAsns).map(Number);
      if (!ids.length) return [];
      const request = buildAtlasRequest(hosts, ids);
      // Skip a round the balance cannot pay, with a clear reason, instead of a refused request.
      // Without the credits permission the check is skipped and Atlas itself enforces the limit.
      const credits = await http(`${ATLAS}/credits/`, { headers }).catch(() => null);
      const balance = Number(credits?.current_balance);
      const needed = request.definitions.length * ids.length * ATLAS_CREDITS_PER_RESULT;
      if (Number.isFinite(balance) && balance < needed) {
        throw new Error(`RIPE Atlas credits too low for a round: ${balance} available, about ${needed} needed. Round skipped.`);
      }
      const created = await http(`${ATLAS}/measurements/`, { method: 'POST', headers, body: request });
      const measurementIds = Array.isArray(created?.measurements) ? created.measurements : [];
      return measurementIds.map((id, index) => ({
        id, kind: index % 2 === 0 ? 'dns' : 'tls', host: hosts[Math.floor(index / 2)], probeAsns, created: isoSeconds(now),
      }));
    },
    async collect(entry, { now }) {
      const results = await http(`${ATLAS}/measurements/${encodeURIComponent(entry.id)}/results/?format=json`);
      const rows = parseAtlasResults(results, { ...entry, measurementId: entry.id });
      return { rows, done: now - Date.parse(entry.created) >= ATLAS_SETTLE_MS };
    },
  };
}

// ---------------------------------------------------------------- Globalping

const GLOBALPING = 'https://api.globalping.io/v1';

export function buildGlobalpingRequests(host, limit = 5) {
  const target = validateGlobalpingTarget(host, 'dns').target;
  const locations = [{ country: 'IR', limit }];
  return [
    { kind: 'dns', body: { type: 'dns', target, limit, locations, measurementOptions: { query: { type: 'A' } } } },
    { kind: 'http', body: { type: 'http', target, limit, locations, measurementOptions: { protocol: 'HTTPS', request: { method: 'HEAD', path: '/' } } } },
  ];
}

export function parseGlobalpingResults(measurement, { kind, host, iranAsns }) {
  const rows = [];
  const ts = isoSeconds(Date.parse(measurement?.createdAt ?? '') || Date.now());
  (measurement?.results ?? []).forEach((entry, index) => {
    const asn = normalizeAsn(String(entry?.probe?.asn ?? ''));
    if (!asn || !iranAsns?.has(asn)) return;
    const result = entry.result ?? {};
    if (result.status === 'in-progress') return;
    let verdict;
    if (kind === 'dns') {
      const addresses = (result.answers ?? []).filter((answer) => answer?.type === 'A').map((answer) => String(answer.value));
      verdict = result.status === 'failed' && !addresses.length
        ? { outcome: 'failure', detail: String(result.rawOutput ?? 'failed').slice(0, 120) }
        : classifyDns({ addresses });
    } else if (isBlockAddress(result.resolvedAddress)) {
      verdict = { outcome: 'blocked', detail: result.resolvedAddress };
    } else if (result.status === 'finished' && Number.isInteger(result.statusCode)) {
      verdict = { outcome: 'ok', detail: `HTTP ${result.statusCode}` };
    } else {
      verdict = { outcome: 'failure', detail: String(result.rawOutput ?? 'failed').slice(0, 120) };
    }
    const probeId = [entry.probe?.asn, entry.probe?.city].filter(Boolean).join('-') || null;
    rows.push({ id: `gp-${measurement.id}-${index}`, source: 'globalping', probeId, asn, host, kind, ...verdict, ts });
  });
  return rows;
}

export function globalpingPath({ http, token = '', hosts = ACTIVE_HOSTS, limit = 5 }) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return {
    async create({ now }) {
      const entries = [];
      for (const host of hosts) {
        for (const request of buildGlobalpingRequests(host, limit)) {
          const created = await http(`${GLOBALPING}/measurements`, { method: 'POST', headers, body: request.body });
          if (typeof created?.id === 'string') entries.push({ id: created.id, kind: request.kind, host, created: isoSeconds(now) });
        }
      }
      return entries;
    },
    async collect(entry, { iranAsns }) {
      const measurement = await http(`${GLOBALPING}/measurements/${encodeURIComponent(entry.id)}`, { headers });
      return { rows: parseGlobalpingResults(measurement, { ...entry, iranAsns }), done: measurement?.status === 'finished' };
    },
  };
}

// ---------------------------------------------------------------- shared run

// One run of an active path: first read the results of measurements started earlier, then
// start a new round when the last one is older than the interval. Pending ids live in the
// store, so a restart loses nothing; entries older than two days are given up.
export async function collectActivePath(store, name, path, { now = new Date(), iranAsns, everyHours = 6 } = {}) {
  const nowMs = now.getTime();
  const run = store.startRun(name);
  try {
    if (!iranAsns?.size) throw new Error('The list of networks registered in Iran is unavailable; no probe can be verified.');
    const pending = JSON.parse(store.getMeta(`${name}:pending`) ?? '[]');
    const keep = [];
    let added = 0;
    const errors = [];
    for (const entry of pending) {
      try {
        const { rows, done } = await path.collect(entry, { now: nowMs, iranAsns });
        added += store.addActiveMeasurements(rows);
        if (!done && nowMs - Date.parse(entry.created) < PENDING_MAX_AGE_MS) keep.push(entry);
      } catch (error) {
        errors.push(error?.message ?? String(error));
        if (nowMs - Date.parse(entry.created) < PENDING_MAX_AGE_MS) keep.push(entry);
      }
    }
    const last = Date.parse(store.getMeta(`${name}:lastCreated`) ?? '');
    let created = 0;
    if (!Number.isFinite(last) || nowMs - last >= everyHours * HOUR) {
      const fresh = await path.create({ iranAsns, now: nowMs });
      keep.push(...fresh);
      created = fresh.length;
      store.setMeta(`${name}:lastCreated`, isoSeconds(nowMs));
    }
    store.setMeta(`${name}:pending`, JSON.stringify(keep));
    const error = errors.length ? `${errors.length} result request(s) failed: ${errors[0]}` : null;
    store.finishRun(run, { rows: added, newest: store.newestActive(name), error });
    return { ok: !error, added, created, pending: keep.length, error };
  } catch (error) {
    const message = error?.message ?? String(error);
    store.finishRun(run, { newest: store.newestActive(name), error: message });
    return { ok: false, error: message };
  }
}

// JSON over HTTPS with a timeout, for the active paths.
export async function activeHttp(url, { method = 'GET', headers = {}, body = null, timeoutMs = 20_000 } = {}) {
  const response = await fetch(url, {
    method,
    headers: { accept: 'application/json', 'user-agent': 'Iran-Censorship-Monitor/1.9', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}: ${JSON.stringify(payload ?? {}).slice(0, 200)}`);
  return payload;
}
