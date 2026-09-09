import { FLEET_CLASS_A_FAMILIES, FLEET_POLICY_VERSION } from './fleet.mjs';

export const FLEET_STAGE1_PREDEPLOY_VERSION = '1.2-lab1';

const KEY_POLICY_FIELDS = new Set([
  'policyVersion',
  'schedulerSigningKeyStorage',
  'schedulerPrivateKeyCommitted',
  'probePublicKeyProvisioning',
  'probeSecretStorage',
  'probeSecretInCommandLine',
  'probeSecretCommitted',
  'rotationDays',
  'emergencyRevocation',
  'replacementRequiresLocalOperator',
]);

const TARGET_FIELDS = new Set([
  'targetId', 'safetyClass', 'owner', 'purpose', 'scope', 'host', 'port', 'families',
  'approved', 'enabled', 'hostingGroup', 'controlEvidence', 'ninClassification', 'provinceClassification',
]);

const FAMILY_SET = new Set(FLEET_CLASS_A_FAMILIES);
const KEY_STORES = new Set(['offline-encrypted', 'hsm-or-kms']);
const PROBE_SECRET_STORES = new Set(['root-readable-file', 'os-credential-store']);
const TARGET_SCOPES = new Set(['lab-only', 'global-control']);
const CONTROL_EVIDENCE = new Set(['owned-account', 'contracted-dedicated']);

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

function requiredString(value, name, pattern, maxLength = 253) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || (pattern && !pattern.test(value))) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

export function validateFleetStage1KeyPolicy(policy) {
  exactKeys(policy, KEY_POLICY_FIELDS, 'Fleet Stage 1 key policy');
  if (policy.policyVersion !== FLEET_POLICY_VERSION) throw new Error('Fleet Stage 1 key policy version is incompatible.');
  if (!KEY_STORES.has(policy.schedulerSigningKeyStorage)) throw new Error('Fleet Stage 1 scheduler signing key storage is not approved.');
  if (policy.schedulerPrivateKeyCommitted !== false) throw new Error('Fleet Stage 1 scheduler private key must never be committed.');
  if (policy.probePublicKeyProvisioning !== 'out-of-band-pinned') throw new Error('Fleet Stage 1 scheduler public key must be provisioned out of band and pinned locally.');
  if (!PROBE_SECRET_STORES.has(policy.probeSecretStorage)) throw new Error('Fleet Stage 1 probe secret storage is not approved.');
  if (policy.probeSecretInCommandLine !== false) throw new Error('Fleet Stage 1 probe secret must never be passed on a command line.');
  if (policy.probeSecretCommitted !== false) throw new Error('Fleet Stage 1 probe secret must never be committed.');
  if (!Number.isInteger(policy.rotationDays) || policy.rotationDays < 1 || policy.rotationDays > 90) throw new Error('Fleet Stage 1 key rotationDays must be between 1 and 90.');
  if (policy.emergencyRevocation !== true) throw new Error('Fleet Stage 1 key policy must support emergency revocation.');
  if (policy.replacementRequiresLocalOperator !== true) throw new Error('Fleet Stage 1 probe replacement must require local operator action.');
  return Object.freeze({
    ...policy,
    repositoryKeyPolicyReady: true,
    deploymentAuthorized: false,
  });
}

export function validateFleetStage1TargetProvenance(targets) {
  if (!Array.isArray(targets)) throw new Error('Fleet Stage 1 target provenance must be an array.');
  const seen = new Set();
  const normalized = [];
  for (const [index, raw] of targets.entries()) {
    exactKeys(raw, TARGET_FIELDS, `Fleet Stage 1 target ${index}`);
    const targetId = requiredString(raw.targetId, 'Fleet Stage 1 targetId', /^[a-z0-9][a-z0-9._-]{1,63}$/);
    if (seen.has(targetId)) throw new Error(`Duplicate Fleet Stage 1 targetId ${targetId}.`);
    seen.add(targetId);
    if (raw.safetyClass !== 'A' || raw.owner !== 'project' || raw.purpose !== 'benign-control') {
      throw new Error(`Fleet Stage 1 target ${targetId} must be project-controlled benign Class A infrastructure.`);
    }
    if (!TARGET_SCOPES.has(raw.scope)) throw new Error(`Fleet Stage 1 target ${targetId} scope is invalid.`);
    const host = requiredString(raw.host, `Fleet Stage 1 target ${targetId} host`, /^[A-Za-z0-9.-]+$/);
    if (!Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) throw new Error(`Fleet Stage 1 target ${targetId} port is invalid.`);
    if (!Array.isArray(raw.families) || raw.families.length < 1) throw new Error(`Fleet Stage 1 target ${targetId} must declare Class A families.`);
    const families = [...new Set(raw.families.map((family) => {
      if (!FAMILY_SET.has(family)) throw new Error(`Fleet Stage 1 target ${targetId} contains a non-Class-A family.`);
      return family;
    }))].sort();
    if (raw.approved !== true || raw.enabled !== true) throw new Error(`Fleet Stage 1 target ${targetId} must be explicitly approved and enabled.`);
    const hostingGroup = requiredString(raw.hostingGroup, `Fleet Stage 1 target ${targetId} hostingGroup`, /^[A-Za-z0-9._-]{2,64}$/);
    if (!CONTROL_EVIDENCE.has(raw.controlEvidence)) throw new Error(`Fleet Stage 1 target ${targetId} control evidence is insufficient.`);
    if (raw.ninClassification !== null || raw.provinceClassification !== null) {
      throw new Error(`Fleet Stage 1 target ${targetId} must not carry inferred NIN or province classification.`);
    }
    normalized.push(Object.freeze({
      targetId,
      safetyClass: 'A',
      owner: 'project',
      purpose: 'benign-control',
      scope: raw.scope,
      host,
      port: raw.port,
      families: Object.freeze(families),
      approved: true,
      enabled: true,
      hostingGroup,
      controlEvidence: raw.controlEvidence,
      ninClassification: null,
      provinceClassification: null,
    }));
  }

  const globalControls = normalized.filter((target) => target.scope === 'global-control');
  const globalHostingGroups = new Set(globalControls.map((target) => target.hostingGroup));
  const globalReachabilityEligible = globalControls.length >= 2 && globalHostingGroups.size >= 2;

  return Object.freeze({
    version: FLEET_STAGE1_PREDEPLOY_VERSION,
    targets: Object.freeze(normalized),
    totalTargets: normalized.length,
    globalControls: globalControls.length,
    independentGlobalHostingGroups: globalHostingGroups.size,
    globalReachabilityEligible,
    ninClassificationEligible: false,
    provinceClassificationEligible: false,
    deploymentAuthorized: false,
  });
}

export function evaluateFleetStage1RepositoryPredeployment({ keyPolicy, targets } = {}) {
  const keys = validateFleetStage1KeyPolicy(keyPolicy);
  const targetPolicy = validateFleetStage1TargetProvenance(targets ?? []);
  return Object.freeze({
    version: FLEET_STAGE1_PREDEPLOY_VERSION,
    repositoryKeyPolicyReady: keys.repositoryKeyPolicyReady,
    productionTargetPolicyValidated: true,
    globalReachabilityEligible: targetPolicy.globalReachabilityEligible,
    deploymentAuthorized: false,
    remainingExternalGates: Object.freeze([
      'real-consenting-pilot-operator',
      'real-project-controlled-target-endpoints',
      'systemd-kernel-cgroup-egress-validation',
      'external-collection-edge-validation',
      'explicit-pilot-authorization',
    ]),
  });
}
