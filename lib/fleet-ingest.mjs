import { canonicalFleetJson, verifyFleetResultEnvelope, FLEET_POLICY_VERSION } from './fleet.mjs';

export const FLEET_MAX_INGEST_BYTES = 16 * 1024;
export const FLEET_RATE_WINDOW_MS = 60_000;
export const FLEET_MAX_RESULTS_PER_WINDOW = 60;
export const FLEET_REPLAY_TTL_MS = 24 * 60 * 60 * 1000;
export const FLEET_REPLAY_MAX_ENTRIES = 10_000;

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

function nowMs(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid fleet ingestion time.');
  return time;
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function normalizeFleetProbeRegistry(probes) {
  if (!Array.isArray(probes)) throw new Error('Fleet probe registry must be an array.');
  const registry = new Map();
  for (const raw of probes) {
    exactKeys(raw, new Set(['probeId', 'enabled', 'policyVersion']), 'Fleet probe');
    if (!validProbeId(raw.probeId)) throw new Error('Fleet probeId is invalid.');
    if (registry.has(raw.probeId)) throw new Error(`Duplicate fleet probeId ${raw.probeId}.`);
    if (typeof raw.enabled !== 'boolean') throw new Error(`Fleet probe ${raw.probeId} enabled must be boolean.`);
    if (raw.policyVersion !== FLEET_POLICY_VERSION) throw new Error(`Fleet probe ${raw.probeId} has unsupported policyVersion ${raw.policyVersion}.`);
    registry.set(raw.probeId, Object.freeze({ probeId: raw.probeId, enabled: raw.enabled, policyVersion: raw.policyVersion }));
  }
  return registry;
}

export function createFleetReplayGuard({ ttlMs = FLEET_REPLAY_TTL_MS, maxEntries = FLEET_REPLAY_MAX_ENTRIES } = {}) {
  boundedInteger(ttlMs, 'Fleet replay ttlMs', 60_000, 7 * 24 * 60 * 60 * 1000);
  boundedInteger(maxEntries, 'Fleet replay maxEntries', 1, 1_000_000);
  const seen = new Map();

  function purge(current) {
    const cutoff = current - ttlMs;
    for (const [key, timestamp] of seen) {
      if (timestamp > cutoff) continue;
      seen.delete(key);
    }
  }

  return Object.freeze({
    checkAndRemember(key, at = Date.now()) {
      if (typeof key !== 'string' || key.length < 1 || key.length > 512) throw new Error('Fleet replay key is invalid.');
      const current = nowMs(at);
      purge(current);
      if (seen.has(key)) return false;
      if (seen.size >= maxEntries) throw new Error('Fleet replay guard capacity exhausted; refusing new observations until entries expire.');
      seen.set(key, current);
      return true;
    },
    size(at = Date.now()) {
      purge(nowMs(at));
      return seen.size;
    },
  });
}

export function createFleetRateGuard({ windowMs = FLEET_RATE_WINDOW_MS, maxPerWindow = FLEET_MAX_RESULTS_PER_WINDOW } = {}) {
  boundedInteger(windowMs, 'Fleet rate windowMs', 1_000, 60 * 60 * 1000);
  boundedInteger(maxPerWindow, 'Fleet rate maxPerWindow', 1, 10_000);
  const history = new Map();

  return Object.freeze({
    consume(probeId, at = Date.now()) {
      if (!validProbeId(probeId)) throw new Error('Fleet rate-limit probeId is invalid.');
      const current = nowMs(at);
      const cutoff = current - windowMs;
      const recent = (history.get(probeId) ?? []).filter((timestamp) => timestamp > cutoff);
      if (recent.length >= maxPerWindow) throw new Error(`Fleet probe ${probeId} exceeded the ingestion rate limit.`);
      recent.push(current);
      history.set(probeId, recent);
      return maxPerWindow - recent.length;
    },
  });
}

function replayKey(result) {
  return `${result.probeId}|${result.manifestNonce}|${result.testId}|${result.measuredAt}`;
}

export async function ingestFleetResultEnvelope(envelope, {
  probeRegistry,
  resolveSecret,
  manifest,
  replayGuard,
  rateGuard,
  now = new Date(),
  maxBytes = FLEET_MAX_INGEST_BYTES,
} = {}) {
  boundedInteger(maxBytes, 'Fleet maxBytes', 1024, 1024 * 1024);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || Object.getPrototypeOf(envelope) !== Object.prototype) {
    throw new Error('Fleet result envelope is invalid.');
  }
  const serialized = canonicalFleetJson(envelope);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error(`Fleet result envelope exceeds ${maxBytes} bytes.`);

  const probeId = envelope?.result?.probeId;
  if (!validProbeId(probeId)) throw new Error('Fleet ingestion probeId is invalid.');
  const registry = probeRegistry instanceof Map ? probeRegistry : normalizeFleetProbeRegistry(probeRegistry ?? []);
  const probe = registry.get(probeId);
  if (!probe) throw new Error(`Fleet probe ${probeId} is not registered.`);
  if (!probe.enabled) throw new Error(`Fleet probe ${probeId} is disabled.`);
  if (typeof resolveSecret !== 'function') throw new Error('Fleet ingestion requires a separate probe secret resolver.');
  if (!manifest) throw new Error('Fleet ingestion requires the validated signed-manifest definition.');
  if (!replayGuard || typeof replayGuard.checkAndRemember !== 'function') throw new Error('Fleet ingestion requires a replay guard.');
  if (!rateGuard || typeof rateGuard.consume !== 'function') throw new Error('Fleet ingestion requires a rate guard.');

  const secret = await resolveSecret(probeId);
  if (secret == null) throw new Error(`Fleet probe ${probeId} has no available secret.`);
  const result = verifyFleetResultEnvelope(envelope, secret, { manifest, now });
  if (result.policyVersion !== probe.policyVersion) throw new Error(`Fleet probe ${probeId} result policyVersion does not match registry policy.`);

  const current = nowMs(now);
  rateGuard.consume(probeId, current);
  const fresh = replayGuard.checkAndRemember(replayKey(result), current);
  const ingestedAt = new Date(current).toISOString();

  if (!fresh) {
    return Object.freeze({ status: 'duplicate', accepted: false, ingestedAt, result });
  }
  return Object.freeze({ status: 'accepted', accepted: true, ingestedAt, result });
}
