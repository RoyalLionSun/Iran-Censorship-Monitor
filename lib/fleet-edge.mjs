import { FLEET_MAX_INGEST_BYTES } from './fleet-ingest.mjs';

export const FLEET_RESULT_PATH = '/fleet/v1/result';
export const FLEET_EDGE_MAX_CONCURRENCY = 32;

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be a plain object.`);
  }
  return value;
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function validProbeId(value) {
  return typeof value === 'string' && /^p_[A-Za-z0-9_-]{16,64}$/.test(value);
}

function normalizeHeaders(headers = {}) {
  plainObject(headers, 'Fleet edge headers');
  const normalized = new Map();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof name !== 'string' || typeof value !== 'string') throw new Error('Fleet edge headers must be string pairs.');
    normalized.set(name.toLowerCase(), value.trim());
  }
  return normalized;
}

function bodyBuffer(body) {
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (Buffer.isBuffer(body)) return body;
  throw new Error('Fleet collection body must be UTF-8 text or Buffer.');
}

export function admitFleetCollectionRequest(request, { maxBytes = FLEET_MAX_INGEST_BYTES } = {}) {
  plainObject(request, 'Fleet collection request');
  boundedInteger(maxBytes, 'Fleet collection maxBytes', 1024, 1024 * 1024);

  if (request.method !== 'POST') throw new Error('Fleet collection endpoint accepts POST only.');
  if (request.path !== FLEET_RESULT_PATH) throw new Error('Fleet collection endpoint path is invalid.');

  const headers = normalizeHeaders(request.headers ?? {});
  const contentType = headers.get('content-type')?.toLowerCase();
  if (contentType !== 'application/json') throw new Error('Fleet collection Content-Type must be application/json.');

  const probeId = headers.get('x-fleet-probe-id');
  if (!validProbeId(probeId)) throw new Error('Fleet collection X-Fleet-Probe-Id is invalid.');

  const body = bodyBuffer(request.body);
  if (body.byteLength > maxBytes) throw new Error(`Fleet collection body exceeds ${maxBytes} bytes.`);

  const declaredLength = headers.get('content-length');
  if (declaredLength != null) {
    if (!/^\d+$/.test(declaredLength)) throw new Error('Fleet collection Content-Length is invalid.');
    const length = Number(declaredLength);
    if (length !== body.byteLength) throw new Error('Fleet collection Content-Length does not match body size.');
    if (length > maxBytes) throw new Error(`Fleet collection body exceeds ${maxBytes} bytes.`);
  }

  let envelope;
  try {
    envelope = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('Fleet collection body is not valid JSON.');
  }
  plainObject(envelope, 'Fleet collection envelope');
  if (envelope?.result?.probeId !== probeId) throw new Error('Fleet collection probe identity does not match result envelope.');

  return Object.freeze({
    probeId,
    bodyBytes: body.byteLength,
    envelope,
    sourceMetadataRetained: false,
    evidenceRole: 'fleet-collection-admission',
    independentCensorshipVote: false,
  });
}

export function createFleetEdgeConcurrencyGate({ maxConcurrent = FLEET_EDGE_MAX_CONCURRENCY } = {}) {
  boundedInteger(maxConcurrent, 'Fleet edge maxConcurrent', 1, 1024);
  let active = 0;

  return Object.freeze({
    acquire() {
      if (active >= maxConcurrent) throw new Error('Fleet collection concurrency limit reached.');
      active += 1;
      let released = false;
      return Object.freeze({
        release() {
          if (released) return false;
          released = true;
          active -= 1;
          return true;
        },
      });
    },
    active() {
      return active;
    },
    capacity() {
      return maxConcurrent;
    },
  });
}
