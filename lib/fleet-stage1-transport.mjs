import { canonicalFleetJson, verifyFleetManifestEnvelope } from './fleet.mjs';

export const FLEET_STAGE1_MANIFEST_PATH = '/fleet/v1/manifest';
export const FLEET_STAGE1_RESULT_PATH = '/fleet/v1/result';
export const FLEET_STAGE1_MAX_MANIFEST_BYTES = 32 * 1024;
export const FLEET_STAGE1_MAX_RESULT_BYTES = 16 * 1024;
export const FLEET_STAGE1_MIN_POLL_MS = 60_000;
export const FLEET_STAGE1_DEFAULT_POLL_MS = 15 * 60_000;
export const FLEET_STAGE1_MAX_BACKOFF_MS = 60 * 60_000;
export const FLEET_STAGE1_QUEUE_MAX = 8;
export const FLEET_STAGE1_QUEUE_TTL_MS = 60 * 60_000;

function validProbeId(value) {
  return typeof value === 'string' && /^p_[A-Za-z0-9_-]{16,64}$/.test(value);
}

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be a plain object.`);
  }
  return value;
}

function boundedInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
}

function bodyBytes(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  throw new Error('Fleet Stage 1 response body must be a string or Buffer.');
}

function headerMap(headers = {}) {
  const result = new Map();
  if (headers instanceof Map) {
    for (const [key, value] of headers) result.set(String(key).toLowerCase(), String(value));
    return result;
  }
  for (const [key, value] of Object.entries(headers ?? {})) result.set(String(key).toLowerCase(), String(value));
  return result;
}

function parseRetryAfterMs(headers, now = new Date()) {
  const value = headerMap(headers).get('retry-after');
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(Number(value) * 1000, FLEET_STAGE1_MAX_BACKOFF_MS);
  const when = Date.parse(value);
  const current = new Date(now).getTime();
  if (!Number.isFinite(when) || !Number.isFinite(current) || when <= current) return 0;
  return Math.min(when - current, FLEET_STAGE1_MAX_BACKOFF_MS);
}

export function normalizeFleetStage1Config({ origin, pollIntervalMs = FLEET_STAGE1_DEFAULT_POLL_MS } = {}) {
  let url;
  try { url = new URL(origin); } catch { throw new Error('Fleet Stage 1 origin must be an absolute HTTPS URL.'); }
  if (url.protocol !== 'https:') throw new Error('Fleet Stage 1 origin must use HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Fleet Stage 1 origin must not contain credentials, query or fragment.');
  if (url.pathname !== '/' || (url.port && url.port !== '443')) throw new Error('Fleet Stage 1 origin must be a root HTTPS origin on port 443.');
  if (!url.hostname) throw new Error('Fleet Stage 1 origin hostname is required.');
  boundedInteger(pollIntervalMs, 'Fleet Stage 1 pollIntervalMs', FLEET_STAGE1_MIN_POLL_MS, 24 * 60 * 60_000);
  return Object.freeze({ origin: `https://${url.hostname}`, pollIntervalMs });
}

export function buildFleetStage1ManifestRequest(config, probeId, { etag = null } = {}) {
  const normalized = normalizeFleetStage1Config(config);
  if (!validProbeId(probeId)) throw new Error('Fleet Stage 1 probeId is invalid.');
  const headers = { accept: 'application/json', 'x-fleet-probe-id': probeId };
  if (etag != null) {
    if (typeof etag !== 'string' || etag.length < 1 || etag.length > 256 || /[\r\n]/.test(etag)) throw new Error('Fleet Stage 1 ETag is invalid.');
    headers['if-none-match'] = etag;
  }
  return Object.freeze({
    method: 'GET',
    url: `${normalized.origin}${FLEET_STAGE1_MANIFEST_PATH}`,
    headers: Object.freeze(headers),
    redirect: 'manual',
    body: null,
    maxResponseBytes: FLEET_STAGE1_MAX_MANIFEST_BYTES,
  });
}

export function buildFleetStage1ResultRequest(config, probeId, envelope) {
  const normalized = normalizeFleetStage1Config(config);
  if (!validProbeId(probeId)) throw new Error('Fleet Stage 1 probeId is invalid.');
  if (envelope?.result?.probeId !== probeId) throw new Error('Fleet Stage 1 result probeId does not match request identity.');
  const body = canonicalFleetJson(envelope);
  if (Buffer.byteLength(body, 'utf8') > FLEET_STAGE1_MAX_RESULT_BYTES) throw new Error('Fleet Stage 1 result envelope exceeds 16 KiB.');
  return Object.freeze({
    method: 'POST',
    url: `${normalized.origin}${FLEET_STAGE1_RESULT_PATH}`,
    headers: Object.freeze({ accept: 'application/json', 'content-type': 'application/json', 'x-fleet-probe-id': probeId }),
    redirect: 'manual',
    body,
    maxResponseBytes: 1024,
  });
}

function assertNoRedirect(status) {
  if (status >= 300 && status < 400) throw new Error(`Fleet Stage 1 redirect HTTP ${status} refused.`);
}

export function processFleetStage1ManifestResponse(response, { schedulerPublicKey, targets, now = new Date() } = {}) {
  plainObject(response, 'Fleet Stage 1 manifest response');
  const status = Number(response.status);
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Fleet Stage 1 manifest response status is invalid.');
  assertNoRedirect(status);
  if (status === 204 || status === 304) return Object.freeze({ status: 'no_work', manifest: null, retryAfterMs: 0 });
  if (status === 401 || status === 403) return Object.freeze({ status: 'unauthorized', manifest: null, retryAfterMs: FLEET_STAGE1_MIN_POLL_MS });
  if (status === 429) return Object.freeze({ status: 'rate_limited', manifest: null, retryAfterMs: parseRetryAfterMs(response.headers, now) });
  if (status >= 500) return Object.freeze({ status: 'unavailable', manifest: null, retryAfterMs: parseRetryAfterMs(response.headers, now) });
  if (status !== 200) throw new Error(`Fleet Stage 1 manifest HTTP ${status} is not permitted.`);

  const headers = headerMap(response.headers);
  const contentType = headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Error('Fleet Stage 1 manifest response must be application/json.');
  const bytes = bodyBytes(response.body);
  const declared = headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > FLEET_STAGE1_MAX_MANIFEST_BYTES) throw new Error('Fleet Stage 1 manifest Content-Length exceeds limit.');
  if (bytes.length > FLEET_STAGE1_MAX_MANIFEST_BYTES) throw new Error('Fleet Stage 1 manifest body exceeds limit.');
  let envelope;
  try { envelope = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Fleet Stage 1 manifest response is invalid JSON.'); }
  if (!schedulerPublicKey) throw new Error('Fleet Stage 1 scheduler public key is required.');
  const manifest = verifyFleetManifestEnvelope(envelope, schedulerPublicKey, targets, { now });
  return Object.freeze({ status: 'manifest', manifest, retryAfterMs: 0, etag: headers.get('etag') ?? null });
}

export function processFleetStage1ResultResponse(response, { now = new Date() } = {}) {
  plainObject(response, 'Fleet Stage 1 result response');
  const status = Number(response.status);
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Fleet Stage 1 result response status is invalid.');
  assertNoRedirect(status);
  if (status === 202 || status === 204) return Object.freeze({ status: 'accepted', retryAfterMs: 0 });
  if (status === 409) return Object.freeze({ status: 'duplicate', retryAfterMs: 0 });
  if (status === 401 || status === 403) return Object.freeze({ status: 'rejected', retryAfterMs: FLEET_STAGE1_MIN_POLL_MS });
  if (status === 413) return Object.freeze({ status: 'contract_error', retryAfterMs: 0 });
  if (status === 429) return Object.freeze({ status: 'rate_limited', retryAfterMs: parseRetryAfterMs(response.headers, now) });
  if (status >= 500) return Object.freeze({ status: 'unavailable', retryAfterMs: parseRetryAfterMs(response.headers, now) });
  throw new Error(`Fleet Stage 1 result HTTP ${status} is not permitted.`);
}

export function computeFleetStage1Backoff({ attempt, localFloorMs = FLEET_STAGE1_MIN_POLL_MS, serverRetryAfterMs = 0, jitter = 0 } = {}) {
  boundedInteger(attempt, 'Fleet Stage 1 backoff attempt', 0, 16);
  boundedInteger(localFloorMs, 'Fleet Stage 1 localFloorMs', FLEET_STAGE1_MIN_POLL_MS, FLEET_STAGE1_MAX_BACKOFF_MS);
  if (typeof serverRetryAfterMs !== 'number' || !Number.isFinite(serverRetryAfterMs) || serverRetryAfterMs < 0) throw new Error('Fleet Stage 1 serverRetryAfterMs is invalid.');
  if (typeof jitter !== 'number' || !Number.isFinite(jitter) || jitter < 0 || jitter > 0.25) throw new Error('Fleet Stage 1 jitter must be between 0 and 0.25.');
  const exponential = Math.min(localFloorMs * (2 ** attempt), FLEET_STAGE1_MAX_BACKOFF_MS);
  const floor = Math.max(exponential, Math.min(serverRetryAfterMs, FLEET_STAGE1_MAX_BACKOFF_MS));
  return Math.min(Math.round(floor * (1 + jitter)), FLEET_STAGE1_MAX_BACKOFF_MS);
}

export function createFleetStage1MemoryQueue({ maxEntries = FLEET_STAGE1_QUEUE_MAX, ttlMs = FLEET_STAGE1_QUEUE_TTL_MS } = {}) {
  boundedInteger(maxEntries, 'Fleet Stage 1 queue maxEntries', 1, 128);
  boundedInteger(ttlMs, 'Fleet Stage 1 queue ttlMs', FLEET_STAGE1_MIN_POLL_MS, 24 * 60 * 60_000);
  const entries = [];
  const purge = (now) => {
    const current = new Date(now).getTime();
    if (!Number.isFinite(current)) throw new Error('Fleet Stage 1 queue time is invalid.');
    while (entries.length && entries[0].expiresAt <= current) entries.shift();
    return current;
  };
  return Object.freeze({
    enqueue(envelope, now = new Date()) {
      const current = purge(now);
      if (entries.length >= maxEntries) return Object.freeze({ accepted: false, reason: 'queue_full' });
      const serialized = canonicalFleetJson(envelope);
      if (Buffer.byteLength(serialized, 'utf8') > FLEET_STAGE1_MAX_RESULT_BYTES) throw new Error('Fleet Stage 1 queued result exceeds 16 KiB.');
      entries.push(Object.freeze({ envelope, expiresAt: current + ttlMs }));
      return Object.freeze({ accepted: true, reason: 'queued' });
    },
    peek(now = new Date()) { purge(now); return entries[0]?.envelope ?? null; },
    shift(now = new Date()) { purge(now); return entries.shift()?.envelope ?? null; },
    size(now = new Date()) { purge(now); return entries.length; },
    clear(now = new Date()) {
      purge(now);
      const removed = entries.length;
      entries.length = 0;
      return removed;
    },
  });
}