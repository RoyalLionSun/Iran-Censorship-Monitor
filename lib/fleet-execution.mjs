import { normalizeFleetTargetRegistry, validateFleetManifest } from './fleet.mjs';

const EXECUTION_FAMILIES = new Set(['dns', 'tcp', 'tls', 'https']);

function registryMap(targets) {
  return targets instanceof Map ? targets : normalizeFleetTargetRegistry(targets);
}

function freezeEntry(value) {
  return Object.freeze({ ...value });
}

export function compileFleetExecutionPlan(manifest, targets, { now = new Date() } = {}) {
  const registry = registryMap(targets);
  const validated = validateFleetManifest(manifest, registry, { now });

  const tests = validated.tests.map((test) => {
    const target = registry.get(test.targetId);
    if (!target) throw new Error(`Fleet execution target ${test.targetId} is not installed locally.`);
    if (!EXECUTION_FAMILIES.has(test.family) || !target.families.includes(test.family)) {
      throw new Error(`Fleet execution family ${test.family} is not locally approved for ${test.targetId}.`);
    }

    return freezeEntry({
      testId: test.testId,
      targetId: test.targetId,
      family: test.family,
      af: test.af,
      timeoutMs: test.timeoutMs,
      maxAttempts: test.maxAttempts,
      host: target.host,
      port: target.port,
      targetSource: 'local-target-registry',
      safetyClass: target.safetyClass,
      owner: target.owner,
    });
  });

  return Object.freeze({
    policyVersion: validated.policyVersion,
    manifestNonce: validated.nonce,
    issuedAt: validated.issuedAt,
    expiresAt: validated.expiresAt,
    tests: Object.freeze(tests),
  });
}

function validatePlanEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Fleet execution entry must be an object.');
  if (!EXECUTION_FAMILIES.has(entry.family)) throw new Error(`Unsupported fleet execution family ${entry.family}.`);
  if (entry.targetSource !== 'local-target-registry') throw new Error('Fleet execution entry is not bound to the local target registry.');
  if (entry.safetyClass !== 'A' || entry.owner !== 'project') throw new Error('Fleet execution entry is not an approved project-controlled Class A target.');
  if (typeof entry.host !== 'string' || !entry.host) throw new Error('Fleet execution entry host is invalid.');
  if (!Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) throw new Error('Fleet execution entry port is invalid.');
  if (entry.af !== 4 && entry.af !== 6) throw new Error('Fleet execution entry address family is invalid.');
  if (!Number.isInteger(entry.timeoutMs) || entry.timeoutMs < 500 || entry.timeoutMs > 10_000) throw new Error('Fleet execution entry timeout is invalid.');
  if (!Number.isInteger(entry.maxAttempts) || entry.maxAttempts < 1 || entry.maxAttempts > 3) throw new Error('Fleet execution entry attempt count is invalid.');
  return entry;
}

export async function executeFleetPlanEntry(entry, adapters) {
  const validated = validatePlanEntry(entry);
  if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)) throw new Error('Fleet execution adapters must be an object.');
  const adapter = adapters[validated.family];
  if (typeof adapter !== 'function') throw new Error(`No local fleet adapter installed for family ${validated.family}.`);

  const request = Object.freeze({
    testId: validated.testId,
    targetId: validated.targetId,
    family: validated.family,
    af: validated.af,
    timeoutMs: validated.timeoutMs,
    maxAttempts: validated.maxAttempts,
    host: validated.host,
    port: validated.port,
  });

  const raw = await adapter(request);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Fleet ${validated.family} adapter returned an invalid result.`);
  return Object.freeze({
    testId: validated.testId,
    targetId: validated.targetId,
    family: validated.family,
    af: validated.af,
    adapterResult: Object.freeze({ ...raw }),
  });
}
