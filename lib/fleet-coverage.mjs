import { FLEET_POLICY_VERSION } from './fleet.mjs';
import { normalizeFleetProbeRegistry } from './fleet-ingest.mjs';

export const FLEET_COVERAGE_VERSION = '1.2-lab1';

function timestampMs(value, name) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error(`${name} is invalid.`);
  return time;
}

function normalizeWindow(from, to) {
  const fromMs = timestampMs(from, 'Fleet coverage window start');
  const toMs = timestampMs(to, 'Fleet coverage window end');
  if (fromMs > toMs) throw new Error('Fleet coverage window start must not be after the end.');
  return {
    fromMs,
    toMs,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}

function resultReplayKey(result) {
  return `${result.probeId}|${result.manifestNonce}|${result.testId}|${result.measuredAt}`;
}

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be a plain object.`);
  }
  return value;
}

export function buildFleetCoverageSnapshot({ probeRegistry, ingestedResults = [], from, to } = {}) {
  if (!Array.isArray(ingestedResults)) throw new Error('Fleet ingestedResults must be an array.');
  const window = normalizeWindow(from, to);
  const registry = probeRegistry instanceof Map ? probeRegistry : normalizeFleetProbeRegistry(probeRegistry ?? []);
  const enabled = [...registry.values()].filter((probe) => probe.enabled).sort((a, b) => a.probeId.localeCompare(b.probeId));
  const perProbe = new Map(enabled.map((probe) => [probe.probeId, {
    probeId: probe.probeId,
    status: 'no_data',
    observations: 0,
    lastMeasuredAt: null,
    offlineKnown: false,
    offline: null,
  }]));
  const seen = new Set();
  let acceptedObservations = 0;

  for (const entry of ingestedResults) {
    plainObject(entry, 'Fleet ingested result entry');
    if (entry.accepted !== true || entry.status !== 'accepted') continue;
    const result = plainObject(entry.result, 'Fleet accepted result');
    if (typeof result.probeId !== 'string') throw new Error('Fleet accepted result probeId is invalid.');
    const registered = registry.get(result.probeId);
    if (!registered) throw new Error(`Fleet accepted result references unregistered probe ${result.probeId}.`);
    if (result.policyVersion !== FLEET_POLICY_VERSION || result.policyVersion !== registered.policyVersion) {
      throw new Error(`Fleet accepted result for ${result.probeId} has incompatible policyVersion.`);
    }
    if (!registered.enabled) continue;
    if (typeof result.manifestNonce !== 'string' || typeof result.testId !== 'string') {
      throw new Error('Fleet accepted result is missing manifest/test identity.');
    }
    const measuredMs = timestampMs(result.measuredAt, 'Fleet accepted result measuredAt');
    if (measuredMs < window.fromMs || measuredMs > window.toMs) continue;
    const key = resultReplayKey(result);
    if (seen.has(key)) continue;
    seen.add(key);

    const probe = perProbe.get(result.probeId);
    probe.status = 'observed';
    probe.observations += 1;
    if (!probe.lastMeasuredAt || measuredMs > timestampMs(probe.lastMeasuredAt, 'Fleet lastMeasuredAt')) {
      probe.lastMeasuredAt = new Date(measuredMs).toISOString();
    }
    acceptedObservations += 1;
  }

  const probes = [...perProbe.values()].map((probe) => Object.freeze({ ...probe }));
  const observedProbes = probes.filter((probe) => probe.status === 'observed').length;
  const coverageComplete = enabled.length > 0 && observedProbes === enabled.length;
  const status = acceptedObservations === 0 ? 'no_data' : coverageComplete ? 'observed' : 'partial';

  return Object.freeze({
    source: 'Owned probe fleet',
    sourceFamily: 'owned-probe-fleet',
    evidenceRole: 'owned-probe-fleet-coverage',
    independentCensorshipVote: false,
    coverageVersion: FLEET_COVERAGE_VERSION,
    status,
    window: Object.freeze({ from: window.from, to: window.to }),
    expectedEnabledProbes: enabled.length,
    observedProbes,
    acceptedObservations,
    coverageComplete,
    aggregatePublicationAllowed: false,
    nationalStatus: null,
    provinceStatus: null,
    offlineInferenceAllowed: false,
    note: 'No result is no_data. Without an explicit heartbeat it does not prove that a probe was offline.',
    probes: Object.freeze(probes),
  });
}
