import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export const FLEET_STAGE1_CONSENT_VERSION = '1.2-pilot-consent1';
export const FLEET_STAGE1_MAX_CONSENT_BYTES = 8 * 1024;
export const FLEET_STAGE1_MAX_CONSENT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS = Object.freeze([
  'network_activity_observable',
  'source_ip_visible_to_network_path',
  'local_jurisdiction_risk_understood',
  'class_a_measurement_scope_understood',
  'local_withdrawal_procedure_understood',
  'pilot_result_retention_30d_understood',
  'no_guaranteed_anonymity',
]);

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be a plain object.`);
  }
  return value;
}

function exactKeys(value, allowed, name) {
  plainObject(value, name);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${name} contains unsupported field ${key}.`);
  }
}

function validProbeId(value) {
  return typeof value === 'string' && /^p_[A-Za-z0-9_-]{16,64}$/.test(value);
}

function validConsentRecordId(value) {
  return typeof value === 'string' && /^cons_[A-Za-z0-9_-]{16,64}$/.test(value);
}

function instant(value, name) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error(`${name} is invalid.`);
  return time;
}

function normalizeAcknowledgements(value) {
  if (!Array.isArray(value)) throw new Error('Fleet Stage 1 consent acknowledgements must be an array.');
  const unique = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS.includes(item)) {
      throw new Error(`Fleet Stage 1 consent acknowledgement ${String(item)} is unsupported.`);
    }
    if (unique.has(item)) throw new Error(`Fleet Stage 1 consent acknowledgement ${item} is duplicated.`);
    unique.add(item);
  }
  for (const required of FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS) {
    if (!unique.has(required)) throw new Error(`Fleet Stage 1 consent is missing acknowledgement ${required}.`);
  }
  if (unique.size !== FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS.length) {
    throw new Error('Fleet Stage 1 consent contains unexpected acknowledgements.');
  }
  return Object.freeze([...FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS]);
}

export function validateFleetStage1ConsentRecord(record, { probeId, now = new Date() } = {}) {
  exactKeys(record, new Set([
    'consentVersion',
    'probeId',
    'consentRecordId',
    'issuedAt',
    'expiresAt',
    'acknowledgements',
  ]), 'Fleet Stage 1 consent record');
  if (record.consentVersion !== FLEET_STAGE1_CONSENT_VERSION) throw new Error('Fleet Stage 1 consent version is unsupported.');
  if (!validProbeId(record.probeId)) throw new Error('Fleet Stage 1 consent probeId is invalid.');
  if (probeId != null && record.probeId !== probeId) throw new Error('Fleet Stage 1 consent probeId does not match the local probe.');
  if (!validConsentRecordId(record.consentRecordId)) throw new Error('Fleet Stage 1 consentRecordId is invalid.');

  const issued = instant(record.issuedAt, 'Fleet Stage 1 consent issuedAt');
  const expires = instant(record.expiresAt, 'Fleet Stage 1 consent expiresAt');
  const current = instant(now, 'Fleet Stage 1 consent current time');
  if (expires <= issued) throw new Error('Fleet Stage 1 consent expiresAt must be after issuedAt.');
  if (expires - issued > FLEET_STAGE1_MAX_CONSENT_LIFETIME_MS) throw new Error('Fleet Stage 1 consent lifetime exceeds the 30-day pilot maximum.');
  if (issued > current) throw new Error('Fleet Stage 1 consent is not yet valid.');
  if (expires <= current) throw new Error('Fleet Stage 1 consent has expired.');
  const acknowledgements = normalizeAcknowledgements(record.acknowledgements);

  return Object.freeze({
    consentVersion: FLEET_STAGE1_CONSENT_VERSION,
    probeId: record.probeId,
    consentRecordId: record.consentRecordId,
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    acknowledgements,
  });
}

export async function readFleetStage1LocalConsent(consentFile, probeId, { reader = readFile, now = new Date() } = {}) {
  if (typeof consentFile !== 'string' || !isAbsolute(consentFile)) {
    throw new Error('Fleet Stage 1 local consent file must be an absolute local path.');
  }
  if (!validProbeId(probeId)) throw new Error('Fleet Stage 1 local consent probeId is invalid.');
  if (typeof reader !== 'function') throw new Error('Fleet Stage 1 local consent reader is invalid.');

  let content;
  try {
    content = await reader(consentFile, 'utf8');
  } catch {
    return Object.freeze({ authorized: false, reason: 'consent_unavailable', consentRecordId: null, expiresAt: null });
  }
  if (Buffer.byteLength(String(content), 'utf8') > FLEET_STAGE1_MAX_CONSENT_BYTES) {
    return Object.freeze({ authorized: false, reason: 'consent_invalid', consentRecordId: null, expiresAt: null });
  }

  let raw;
  try {
    raw = JSON.parse(String(content));
  } catch {
    return Object.freeze({ authorized: false, reason: 'consent_invalid', consentRecordId: null, expiresAt: null });
  }

  const current = instant(now, 'Fleet Stage 1 consent current time');
  const expires = Date.parse(raw?.expiresAt);
  if (Number.isFinite(expires) && expires <= current) {
    return Object.freeze({ authorized: false, reason: 'consent_expired', consentRecordId: null, expiresAt: null });
  }

  try {
    const record = validateFleetStage1ConsentRecord(raw, { probeId, now: new Date(current) });
    return Object.freeze({
      authorized: true,
      reason: 'consent_valid',
      consentRecordId: record.consentRecordId,
      expiresAt: record.expiresAt,
    });
  } catch {
    return Object.freeze({ authorized: false, reason: 'consent_invalid', consentRecordId: null, expiresAt: null });
  }
}
