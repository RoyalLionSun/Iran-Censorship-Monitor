import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import dns from 'node:dns';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_TIMEOUT_MS = 12_000;
const cache = new Map();

// Node tries IPv6 and IPv4 addresses in turn and gives each connect attempt only 250 ms by
// default. On hosts without IPv6, distant sources (APNIC in Australia) never finish the IPv4
// handshake in that window and fail with ETIMEDOUT although they are reachable.
export const CONNECT_ATTEMPT_TIMEOUT_MS = 2_500;
if (net.getDefaultAutoSelectFamilyAttemptTimeout() < CONNECT_ATTEMPT_TIMEOUT_MS) {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}
// Even 2.5 s per attempt was not enough when a page load opens dozens of connections at once:
// seven sources failed together with ETIMEDOUT on hosts without IPv6. Unless the operator says
// IPv6 works (MONITOR_PREFER_IPV6=1), connect over IPv4 directly, with the system timeout; the
// request timeout still bounds every call.
if (process.env.MONITOR_PREFER_IPV6 !== '1') {
  dns.setDefaultResultOrder('ipv4first');
  net.setDefaultAutoSelectFamily(false);
}

export function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function parseNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('Expected date in YYYY-MM-DD format.');
  return value;
}

export function utcStart(date) {
  return `${isoDate(date)}T00:00:00Z`;
}

export function utcEnd(date) {
  return `${isoDate(date)}T23:59:59Z`;
}

export function inclusiveDays(since, until) {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Invalid date range.');
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function validateRange(since, until, maxDays = 120) {
  isoDate(since);
  isoDate(until);
  const days = inclusiveDays(since, until);
  if (days > maxDays) throw new Error(`Date range must not exceed ${maxDays} days.`);
  return days;
}

export function normalizeAsn(value) {
  if (!value || value === 'ALL') return '';
  const cleaned = String(value).trim().toUpperCase().replace(/^AS/, '');
  if (!/^\d{1,10}$/.test(cleaned)) throw new Error('Invalid ASN.');
  return `AS${cleaned}`;
}

async function fetchCached(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, cacheTtlMs = Number(process.env.CACHE_TTL_MS || 120_000), accept = '*/*', parser = 'json', cacheOnly = false, cacheOnlyMessage = '' } = {}) {
  const key = `${parser}|${url}|${JSON.stringify(headers)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  // A source in cooldown may still answer from cache, but must not be called again.
  if (cacheOnly) throw new Error(cacheOnlyMessage || 'No cached result is available for this request.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept,
        'user-agent': 'Iran-Internet-Monitor/1.0 (+research dashboard)',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 180)}` : ''}`);
    }
    const value = parser === 'text' ? await response.text() : await response.json();
    cache.set(key, { expires: Date.now() + cacheTtlMs, value });
    return value;
  } catch (error) {
    // "fetch failed" alone hides whether DNS, the connection or a timeout failed, and where.
    const cause = error?.cause?.code || error?.cause?.message;
    if (error?.message === 'fetch failed' && cause) {
      let host = '';
      try { host = new URL(url).host; } catch { /* keep it empty */ }
      throw new Error(`fetch failed (${cause}${host ? ` · ${host}` : ''})`, { cause: error.cause });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchJson(url, options = {}) {
  return fetchCached(url, { ...options, accept: options.accept || 'application/json', parser: 'json' });
}

// Revalidation for sources that are too slow for the request timeout but stay valid once
// fetched (RIPEstat historical routing). The result lands in the shared cache, so the next
// request is served from it. Never returns data to the caller and never throws.
const backgroundFetches = new Set();
export function prefetchJson(url, options = {}) {
  if (backgroundFetches.has(url)) return true;
  backgroundFetches.add(url);
  fetchJson(url, options).catch(() => {}).finally(() => backgroundFetches.delete(url));
  return true;
}

export function fetchText(url, options = {}) {
  return fetchCached(url, { ...options, accept: options.accept || 'text/plain,text/csv;q=0.9,*/*;q=0.5', parser: 'text' });
}

// When a source fails or rate-limits us, the last successful answer for the same scope is
// still worth showing — but only as history. It is returned with status "stale" and the time
// it was fetched, so the interpretation can refuse it as current evidence and the UI can say
// how old it is. Nothing is ever presented as fresh that is not.
// With a path the last good answers survive a restart; otherwise a restart during an upstream
// outage leaves every panel empty although good answers were fetched shortly before.
export function createLastGoodStore({ limit = 120, path = null } = {}) {
  const store = new Map();
  if (path) {
    try {
      for (const [key, entry] of JSON.parse(readFileSync(path, 'utf8'))) store.set(key, entry);
    } catch { /* No stored answers yet. */ }
  }
  let saveTimer = null;
  const save = () => {
    if (!path || saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, JSON.stringify([...store.entries()]));
        await rename(`${path}.tmp`, path);
      } catch { /* The stored copy is only a fallback. */ }
    }, 20_000);
    saveTimer.unref?.();
  };
  return {
    remember(key, value) {
      if (!key || !value?.ok || value.status === 'stale') return value;
      store.delete(key);
      store.set(key, { value, at: value.fetchedAt ?? new Date().toISOString() });
      while (store.size > limit) store.delete(store.keys().next().value);
      save();
      return value;
    },
    stale(key, reason) {
      const remembered = key ? store.get(key) : null;
      if (!remembered) return null;
      return {
        ...remembered.value,
        status: 'stale',
        stale: true,
        staleSince: remembered.at,
        staleReason: typeof reason === 'string' ? reason : String(reason?.message ?? reason ?? ''),
      };
    },
    size() { return store.size; },
  };
}

// Compression for text answers. Readers in Iran often sit behind slow or throttled links: the
// Overview answer shrinks from about 570 KB to about 50 KB, the page's scripts from about
// 600 KB to about 150 KB. Brotli where the browser offers it, gzip otherwise.
const COMPRESS_MIN_BYTES = 1024;

export function pickEncoding(acceptEncoding) {
  const offered = String(acceptEncoding ?? '').toLowerCase().split(',').map((part) => part.trim().split(';')[0]);
  if (offered.includes('br')) return 'br';
  if (offered.includes('gzip')) return 'gzip';
  return null;
}

export function compressBody(buffer, encoding) {
  if (encoding === 'br') {
    return brotliCompressSync(buffer, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buffer.length } });
  }
  if (encoding === 'gzip') return gzipSync(buffer, { level: 6 });
  return buffer;
}

export function jsonResponse(res, status, payload, extraHeaders = {}) {
  let body = Buffer.from(JSON.stringify(payload));
  const encoding = body.length >= COMPRESS_MIN_BYTES ? pickEncoding(res.req?.headers?.['accept-encoding']) : null;
  if (encoding) body = compressBody(body, encoding);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'accept-encoding',
    ...(encoding ? { 'content-encoding': encoding } : {}),
    'content-length': body.length,
    ...extraHeaders,
  });
  res.end(body);
}

export function errorPayload(error, source = 'server') {
  return {
    ok: false,
    source,
    error: error instanceof Error ? error.message : String(error),
    fetchedAt: new Date().toISOString(),
  };
}

export function weightedAverage(rows, valueKey, weightKey) {
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    const value = parseNumber(row?.[valueKey]);
    const rowWeight = parseNumber(row?.[weightKey]);
    if (value === null || rowWeight === null || rowWeight <= 0) continue;
    weighted += value * rowWeight;
    weight += rowWeight;
  }
  return weight ? weighted / weight : null;
}


export async function mapLimit(items, limit, mapper) {
  const input = Array.from(items ?? []);
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, input.length || 1));
  const output = new Array(input.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= input.length) return;
      output[index] = await mapper(input[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return output;
}

export function mean(values) {
  const clean = values.map(parseNumber).filter((value) => value !== null);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

// A period that ended two or more days ago no longer changes upstream.
export function isSettledPeriod(until, now = Date.now()) {
  return Date.parse(`${until}T23:59:59Z`) < now - 2 * 86_400_000;
}

// Only an answer in which every source responded may be kept: a failed, stale or still-pending
// source must be retried, never frozen.
export function isCleanOverview(sources) {
  return sources.every((source) => source === null || source === undefined
    || (source.ok !== false && !['error', 'stale'].includes(source.status) && !source.routingRetryInProgress && !source.partialStale
      && !(source.status !== 'token_required' && source.assessmentEligible === false)));
}

// Reads KEY=value lines from an env file into process.env; values already set win.
export async function loadEnvFile(path) {
  const { existsSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  if (!existsSync(path)) return;
  const content = await readFile(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
