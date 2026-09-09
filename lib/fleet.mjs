import { createHmac, sign as cryptoSign, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

export const FLEET_POLICY_VERSION = '1.2-lab1';
export const FLEET_MAX_MANIFEST_TESTS = 16;
export const FLEET_MAX_MANIFEST_LIFETIME_MS = 60 * 60 * 1000;
export const FLEET_CLASS_A_FAMILIES = Object.freeze(['dns', 'tcp', 'tls', 'https']);

const FAMILY_SET = new Set(FLEET_CLASS_A_FAMILIES);
const RESULT_OUTCOMES = new Set(['observed', 'timeout', 'error']);
const STAGE_OUTCOMES = new Set(['ok', 'timeout', 'error', 'not_run']);
const ERROR_CODES = new Set([
  'dns_error',
  'timeout',
  'connect_error',
  'tls_error',
  'http_error',
  'internal_error',
]);
const STAGE_KEYS = new Set(['dns', 'tcp', 'tls', 'http']);
const TIMING_KEYS = new Set(['dns', 'tcp', 'tls', 'http', 'total']);
const FORBIDDEN_RESULT_KEYS = new Set([
  'sourceip', 'source_ip', 'ip', 'imsi', 'imei', 'msisdn', 'phone', 'phonenumber',
  'simserial', 'iccid', 'ssid', 'bssid', 'mac', 'macaddress', 'gps', 'latitude',
  'longitude', 'coordinates', 'hostname', 'host', 'url', 'port', 'command', 'shell',
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

function requiredString(value, name, pattern, maxLength = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || (pattern && !pattern.test(value))) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function isoTime(value, name) {
  if (typeof value !== 'string') throw new Error(`${name} must be an ISO timestamp.`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${name} must be an ISO timestamp.`);
  return { value: new Date(time).toISOString(), time };
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalFleetJson(value) {
  return JSON.stringify(stableValue(value));
}

export function normalizeFleetTargetRegistry(targets) {
  if (!Array.isArray(targets)) throw new Error('Fleet target registry must be an array.');
  const result = new Map();
  for (const raw of targets) {
    exactKeys(raw, new Set(['targetId', 'safetyClass', 'owner', 'host', 'port', 'families', 'approved', 'enabled']), 'Fleet target');
    const targetId = requiredString(raw.targetId, 'Fleet targetId', /^[a-z0-9][a-z0-9._-]{1,63}$/);
    if (result.has(targetId)) throw new Error(`Duplicate fleet targetId ${targetId}.`);
    if (raw.safetyClass !== 'A') throw new Error(`Fleet target ${targetId} is not Class A.`);
    if (raw.owner !== 'project') throw new Error(`Fleet target ${targetId} must be project-controlled.`);
    const host = requiredString(raw.host, `Fleet target ${targetId} host`, /^[A-Za-z0-9.-]+$/, 253);
    const port = boundedInteger(raw.port, `Fleet target ${targetId} port`, 1, 65535);
    if (!Array.isArray(raw.families) || raw.families.length < 1) throw new Error(`Fleet target ${targetId} must declare families.`);
    const families = [...new Set(raw.families.map((family) => {
      if (!FAMILY_SET.has(family)) throw new Error(`Fleet target ${targetId} has non-Class-A family ${family}.`);
      return family;
    }))].sort();
    if (raw.approved !== true || raw.enabled !== true) throw new Error(`Fleet target ${targetId} must be explicitly approved and enabled.`);
    result.set(targetId, Object.freeze({ targetId, safetyClass: 'A', owner: 'project', host, port, families, approved: true, enabled: true }));
  }
  return result;
}

export function validateFleetManifest(manifest, targets, { now = new Date() } = {}) {
  exactKeys(manifest, new Set(['policyVersion', 'issuedAt', 'expiresAt', 'nonce', 'tests']), 'Fleet manifest');
  if (manifest.policyVersion !== FLEET_POLICY_VERSION) throw new Error(`Unsupported fleet policyVersion ${manifest.policyVersion}.`);
  const current = new Date(now).getTime();
  if (!Number.isFinite(current)) throw new Error('Invalid fleet validation time.');
  const issued = isoTime(manifest.issuedAt, 'Fleet manifest issuedAt');
  const expires = isoTime(manifest.expiresAt, 'Fleet manifest expiresAt');
  if (issued.time > current + 60_000) throw new Error('Fleet manifest issuedAt is too far in the future.');
  if (expires.time <= current) throw new Error('Fleet manifest is expired.');
  if (expires.time <= issued.time || expires.time - issued.time > FLEET_MAX_MANIFEST_LIFETIME_MS) {
    throw new Error('Fleet manifest lifetime exceeds the allowed bound.');
  }
  const nonce = requiredString(manifest.nonce, 'Fleet manifest nonce', /^[A-Za-z0-9_-]{16,128}$/);
  if (!Array.isArray(manifest.tests) || manifest.tests.length < 1 || manifest.tests.length > FLEET_MAX_MANIFEST_TESTS) {
    throw new Error(`Fleet manifest tests must contain between 1 and ${FLEET_MAX_MANIFEST_TESTS} entries.`);
  }
  const registry = targets instanceof Map ? targets : normalizeFleetTargetRegistry(targets);
  const seenTestIds = new Set();
  const tests = manifest.tests.map((test, index) => {
    exactKeys(test, new Set(['testId', 'targetId', 'family', 'af', 'timeoutMs', 'maxAttempts']), `Fleet manifest test ${index}`);
    const testId = requiredString(test.testId, `Fleet manifest test ${index} testId`, /^[a-zA-Z0-9_-]{1,64}$/);
    if (seenTestIds.has(testId)) throw new Error(`Duplicate fleet testId ${testId}.`);
    seenTestIds.add(testId);
    const targetId = requiredString(test.targetId, `Fleet manifest test ${index} targetId`, /^[a-z0-9][a-z0-9._-]{1,63}$/);
    const target = registry.get(targetId);
    if (!target) throw new Error(`Fleet manifest references unknown targetId ${targetId}.`);
    if (!FAMILY_SET.has(test.family) || !target.families.includes(test.family)) {
      throw new Error(`Fleet manifest test ${testId} uses family ${test.family} not approved for target ${targetId}.`);
    }
    if (test.af !== 4 && test.af !== 6) throw new Error(`Fleet manifest test ${testId} af must be 4 or 6.`);
    const timeoutMs = boundedInteger(test.timeoutMs, `Fleet manifest test ${testId} timeoutMs`, 500, 10_000);
    const maxAttempts = boundedInteger(test.maxAttempts, `Fleet manifest test ${testId} maxAttempts`, 1, 3);
    return Object.freeze({ testId, targetId, family: test.family, af: test.af, timeoutMs, maxAttempts });
  });
  return Object.freeze({
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: issued.value,
    expiresAt: expires.value,
    nonce,
    tests: Object.freeze(tests),
  });
}

export function signFleetManifest(manifest, privateKey) {
  return cryptoSign(null, Buffer.from(canonicalFleetJson(manifest)), privateKey).toString('base64url');
}

export function verifyFleetManifestEnvelope(envelope, publicKey, targets, options = {}) {
  exactKeys(envelope, new Set(['manifest', 'signature']), 'Fleet manifest envelope');
  requiredString(envelope.signature, 'Fleet manifest signature', /^[A-Za-z0-9_-]+$/, 256);
  const valid = cryptoVerify(null, Buffer.from(canonicalFleetJson(envelope.manifest)), publicKey, Buffer.from(envelope.signature, 'base64url'));
  if (!valid) throw new Error('Fleet manifest signature verification failed.');
  return validateFleetManifest(envelope.manifest, targets, options);
}

function rejectSensitiveResultKeys(value, path = 'result') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveResultKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll('-', '').replaceAll(' ', '');
    if (FORBIDDEN_RESULT_KEYS.has(key.toLowerCase()) || FORBIDDEN_RESULT_KEYS.has(normalized)) {
      throw new Error(`Fleet result contains forbidden sensitive/free-form field ${path}.${key}.`);
    }
    rejectSensitiveResultKeys(nested, `${path}.${key}`);
  }
}

export function validateFleetResult(result, { now = new Date() } = {}) {
  rejectSensitiveResultKeys(result);
  exactKeys(result, new Set([
    'probeId', 'policyVersion', 'manifestNonce', 'testId', 'targetId', 'family', 'af',
    'measuredAt', 'outcome', 'stages', 'timingsMs', 'errorCode',
  ]), 'Fleet result');
  const probeId = requiredString(result.probeId, 'Fleet probeId', /^p_[A-Za-z0-9_-]{16,64}$/);
  if (result.policyVersion !== FLEET_POLICY_VERSION) throw new Error(`Unsupported fleet result policyVersion ${result.policyVersion}.`);
  const manifestNonce = requiredString(result.manifestNonce, 'Fleet result manifestNonce', /^[A-Za-z0-9_-]{16,128}$/);
  const testId = requiredString(result.testId, 'Fleet result testId', /^[a-zA-Z0-9_-]{1,64}$/);
  const targetId = requiredString(result.targetId, 'Fleet result targetId', /^[a-z0-9][a-z0-9._-]{1,63}$/);
  if (!FAMILY_SET.has(result.family)) throw new Error(`Fleet result family ${result.family} is not Class A.`);
  if (result.af !== 4 && result.af !== 6) throw new Error('Fleet result af must be 4 or 6.');
  const measured = isoTime(result.measuredAt, 'Fleet result measuredAt');
  const current = new Date(now).getTime();
  if (!Number.isFinite(current)) throw new Error('Invalid fleet result validation time.');
  if (measured.time > current + 60_000 || measured.time < current - 24 * 60 * 60 * 1000) {
    throw new Error('Fleet result measuredAt is outside the accepted ingestion window.');
  }
  if (!RESULT_OUTCOMES.has(result.outcome)) throw new Error(`Fleet result outcome ${result.outcome} is invalid.`);

  exactKeys(result.stages, STAGE_KEYS, 'Fleet result stages');
  const stages = {};
  for (const [key, value] of Object.entries(result.stages)) {
    if (!STAGE_OUTCOMES.has(value)) throw new Error(`Fleet result stage ${key} value ${value} is invalid.`);
    stages[key] = value;
  }

  exactKeys(result.timingsMs, TIMING_KEYS, 'Fleet result timingsMs');
  const timingsMs = {};
  for (const [key, value] of Object.entries(result.timingsMs)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 60_000) {
      throw new Error(`Fleet result timing ${key} is invalid.`);
    }
    timingsMs[key] = value;
  }

  const errorCode = result.errorCode == null ? null : result.errorCode;
  if (errorCode !== null && !ERROR_CODES.has(errorCode)) throw new Error(`Fleet result errorCode ${errorCode} is invalid.`);
  if (result.outcome === 'observed' && errorCode !== null) throw new Error('Observed fleet result must not carry an errorCode.');

  return Object.freeze({
    probeId,
    policyVersion: FLEET_POLICY_VERSION,
    manifestNonce,
    testId,
    targetId,
    family: result.family,
    af: result.af,
    measuredAt: measured.value,
    outcome: result.outcome,
    stages: Object.freeze(stages),
    timingsMs: Object.freeze(timingsMs),
    errorCode,
    evidenceRole: 'owned-probe-observation',
    independentCensorshipVote: false,
  });
}

export function assertFleetResultMatchesManifest(result, manifest) {
  if (result.policyVersion !== manifest.policyVersion || result.manifestNonce !== manifest.nonce) {
    throw new Error('Fleet result does not match manifest identity.');
  }
  const test = manifest.tests.find((candidate) => candidate.testId === result.testId);
  if (!test) throw new Error(`Fleet result references unknown manifest testId ${result.testId}.`);
  if (test.targetId !== result.targetId || test.family !== result.family || test.af !== result.af) {
    throw new Error(`Fleet result test ${result.testId} does not match the signed manifest definition.`);
  }
  return test;
}

function hmacFleetResult(result, secret) {
  const key = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret ?? ''));
  if (key.length < 32) throw new Error('Fleet probe secret must contain at least 32 bytes.');
  return createHmac('sha256', key).update(canonicalFleetJson(result)).digest();
}

export function signFleetResult(result, secret) {
  return hmacFleetResult(result, secret).toString('base64url');
}

export function verifyFleetResultEnvelope(envelope, secret, { manifest, now = new Date() } = {}) {
  exactKeys(envelope, new Set(['result', 'mac']), 'Fleet result envelope');
  requiredString(envelope.mac, 'Fleet result MAC', /^[A-Za-z0-9_-]+$/, 128);
  const expected = hmacFleetResult(envelope.result, secret);
  const supplied = Buffer.from(envelope.mac, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Fleet result MAC verification failed.');
  }
  const result = validateFleetResult(envelope.result, { now });
  if (manifest) assertFleetResultMatchesManifest(result, manifest);
  return result;
}
