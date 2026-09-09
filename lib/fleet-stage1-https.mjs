import { createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import {
  FLEET_STAGE1_MANIFEST_PATH,
  FLEET_STAGE1_MAX_MANIFEST_BYTES,
  FLEET_STAGE1_MAX_RESULT_BYTES,
  FLEET_STAGE1_RESULT_PATH,
} from './fleet-stage1-transport.mjs';

export const FLEET_STAGE1_HTTPS_TIMEOUT_MS = 10_000;
export const FLEET_STAGE1_HTTPS_MAX_TIMEOUT_MS = 30_000;
export const FLEET_STAGE1_MIN_SPKI_PINS = 2;

function boundedInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

function canonicalPin(value) {
  if (typeof value !== 'string') throw new Error('Fleet Stage 1 SPKI pin must be a string.');
  const raw = value.startsWith('sha256/') ? value.slice(7) : value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error('Fleet Stage 1 SPKI pin must be base64 SHA-256.');
  let decoded;
  try { decoded = Buffer.from(raw, 'base64'); } catch { throw new Error('Fleet Stage 1 SPKI pin must be base64 SHA-256.'); }
  if (decoded.length !== 32 || decoded.toString('base64') !== raw) {
    throw new Error('Fleet Stage 1 SPKI pin must decode to exactly 32 SHA-256 bytes.');
  }
  return raw;
}

export function normalizeFleetStage1SpkiPins(pins) {
  if (!Array.isArray(pins) || pins.length < FLEET_STAGE1_MIN_SPKI_PINS) {
    throw new Error(`Fleet Stage 1 requires at least ${FLEET_STAGE1_MIN_SPKI_PINS} locally provisioned SPKI pins.`);
  }
  const normalized = [...new Set(pins.map(canonicalPin))];
  if (normalized.length < FLEET_STAGE1_MIN_SPKI_PINS) {
    throw new Error(`Fleet Stage 1 requires at least ${FLEET_STAGE1_MIN_SPKI_PINS} distinct SPKI pins for rotation.`);
  }
  if (normalized.length > 8) throw new Error('Fleet Stage 1 SPKI pin set is unexpectedly large.');
  return Object.freeze(normalized);
}

export function fleetStage1SpkiPinFromCertificate(cert) {
  const pubkey = cert?.pubkey;
  if (!Buffer.isBuffer(pubkey) && !(pubkey instanceof Uint8Array)) {
    throw new Error('Fleet Stage 1 peer certificate does not expose a public key for pinning.');
  }
  return createHash('sha256').update(Buffer.from(pubkey)).digest('base64');
}

export function createFleetStage1CheckServerIdentity(spkiPins) {
  const pins = new Set(normalizeFleetStage1SpkiPins(spkiPins));
  return function fleetStage1CheckServerIdentity(hostname, cert) {
    const identityError = checkServerIdentity(hostname, cert);
    if (identityError) return identityError;
    let presented;
    try { presented = fleetStage1SpkiPinFromCertificate(cert); } catch (error) { return error; }
    if (!pins.has(presented)) return new Error('Fleet Stage 1 server SPKI pin verification failed.');
    return undefined;
  };
}

function exactStage1Request(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Fleet Stage 1 HTTPS request is invalid.');
  let url;
  try { url = new URL(request.url); } catch { throw new Error('Fleet Stage 1 HTTPS request URL is invalid.'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.search || url.hash) {
    throw new Error('Fleet Stage 1 HTTPS transport accepts only fixed HTTPS port-443 URLs without credentials/query/fragment.');
  }
  const isManifest = url.pathname === FLEET_STAGE1_MANIFEST_PATH && request.method === 'GET';
  const isResult = url.pathname === FLEET_STAGE1_RESULT_PATH && request.method === 'POST';
  if (!isManifest && !isResult) throw new Error('Fleet Stage 1 HTTPS transport refuses unexpected method/path.');
  if (request.redirect !== 'manual') throw new Error('Fleet Stage 1 HTTPS transport requires manual redirect handling.');
  const maxAllowed = isManifest ? FLEET_STAGE1_MAX_MANIFEST_BYTES : 1024;
  boundedInteger(request.maxResponseBytes, 'Fleet Stage 1 HTTPS maxResponseBytes', 1, maxAllowed);
  if (isManifest && request.body != null) throw new Error('Fleet Stage 1 manifest request must not contain a body.');
  if (isResult) {
    if (typeof request.body !== 'string') throw new Error('Fleet Stage 1 result request body must be JSON text.');
    if (Buffer.byteLength(request.body, 'utf8') > FLEET_STAGE1_MAX_RESULT_BYTES) throw new Error('Fleet Stage 1 result request exceeds 16 KiB.');
  }
  if (!request.headers || typeof request.headers !== 'object' || Array.isArray(request.headers)) {
    throw new Error('Fleet Stage 1 HTTPS request headers are invalid.');
  }
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (!/^[A-Za-z0-9-]+$/.test(key) || typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error('Fleet Stage 1 HTTPS request header is invalid.');
    }
    headers[key] = value;
  }
  return Object.freeze({ url, method: request.method, headers: Object.freeze(headers), body: request.body, maxResponseBytes: request.maxResponseBytes });
}

function normalizeCa(ca) {
  if (ca == null) return null;
  const values = Array.isArray(ca) ? ca : [ca];
  if (values.length < 1 || values.length > 8) throw new Error('Fleet Stage 1 CA bundle size is invalid.');
  for (const value of values) {
    if (typeof value !== 'string' && !Buffer.isBuffer(value)) throw new Error('Fleet Stage 1 CA entries must be PEM strings or Buffers.');
  }
  return ca;
}

export function createFleetStage1HttpsTransport({
  spkiPins,
  ca = null,
  timeoutMs = FLEET_STAGE1_HTTPS_TIMEOUT_MS,
  requestImpl = httpsRequest,
} = {}) {
  const pins = normalizeFleetStage1SpkiPins(spkiPins);
  const trustedCa = normalizeCa(ca);
  boundedInteger(timeoutMs, 'Fleet Stage 1 HTTPS timeoutMs', 1000, FLEET_STAGE1_HTTPS_MAX_TIMEOUT_MS);
  if (typeof requestImpl !== 'function') throw new Error('Fleet Stage 1 HTTPS request implementation is invalid.');
  const identityCheck = createFleetStage1CheckServerIdentity(pins);

  return async function fleetStage1HttpsTransport(requestSpec) {
    const request = exactStage1Request(requestSpec);
    const options = {
      protocol: 'https:',
      hostname: request.url.hostname,
      port: 443,
      path: request.url.pathname,
      method: request.method,
      headers: request.headers,
      servername: request.url.hostname,
      rejectUnauthorized: true,
      checkServerIdentity: identityCheck,
      minVersion: 'TLSv1.2',
      agent: false,
    };
    if (trustedCa != null) options.ca = trustedCa;

    return await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error('Fleet Stage 1 HTTPS transport failed.'));
      };

      let clientRequest;
      try {
        clientRequest = requestImpl(options, (response) => {
          const chunks = [];
          let total = 0;
          response.on('data', (chunk) => {
            if (settled) return;
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += bytes.length;
            if (total > request.maxResponseBytes) {
              settled = true;
              if (typeof response.destroy === 'function') response.destroy();
              reject(new Error(`Fleet Stage 1 HTTPS response exceeds ${request.maxResponseBytes} bytes.`));
              return;
            }
            chunks.push(bytes);
          });
          response.on('error', fail);
          response.on('end', () => {
            if (settled) return;
            settled = true;
            const status = Number(response.statusCode);
            if (!Number.isInteger(status) || status < 100 || status > 599) {
              reject(new Error('Fleet Stage 1 HTTPS response status is invalid.'));
              return;
            }
            resolve(Object.freeze({
              status,
              headers: Object.freeze({ ...(response.headers ?? {}) }),
              body: Buffer.concat(chunks),
            }));
          });
        });
      } catch (error) {
        fail(error);
        return;
      }

      clientRequest.on('error', fail);
      if (typeof clientRequest.setTimeout === 'function') {
        clientRequest.setTimeout(timeoutMs, () => clientRequest.destroy(new Error('Fleet Stage 1 HTTPS request timed out.')));
      }
      if (request.body != null) clientRequest.write(request.body);
      clientRequest.end();
    });
  };
}
