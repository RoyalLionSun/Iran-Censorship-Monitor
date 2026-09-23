import net from 'node:net';

const DEFAULT_TIMEOUT_MS = 12_000;
const cache = new Map();

// Node tries IPv6 and IPv4 addresses in turn and gives each connect attempt only 250 ms by
// default. On hosts without IPv6, distant sources (APNIC in Australia) never finish the IPv4
// handshake in that window and fail with ETIMEDOUT although they are reachable.
export const CONNECT_ATTEMPT_TIMEOUT_MS = 2_500;
if (net.getDefaultAutoSelectFamilyAttemptTimeout() < CONNECT_ATTEMPT_TIMEOUT_MS) {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
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
export function createLastGoodStore({ limit = 120 } = {}) {
  const store = new Map();
  return {
    remember(key, value) {
      if (!key || !value?.ok) return value;
      store.delete(key);
      store.set(key, { value, at: value.fetchedAt ?? new Date().toISOString() });
      while (store.size > limit) store.delete(store.keys().next().value);
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

export function jsonResponse(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
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
