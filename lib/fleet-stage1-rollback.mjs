import { FLEET_POLICY_VERSION } from './fleet.mjs';

export const FLEET_STAGE1_ROLLBACK_VERSION = '1.2-rollback1';
export const FLEET_STAGE1_ROLLBACK_STEPS = Object.freeze([
  'stop_local_service',
  'remove_local_consent',
  'remove_local_enable',
  'purge_memory_queue',
  'disable_probe_registry',
  'revoke_probe_secret',
  'stop_scheduling',
  'retire_affected_targets',
  'restore_known_safe_software',
  'verify_sandbox_and_egress',
  'require_fresh_consent_before_reenable',
]);
export const FLEET_STAGE1_ROLLBACK_CHECKS = Object.freeze([
  'local_kill_switch_tested',
  'consent_withdrawal_tested',
  'central_probe_disable_tested',
  'secret_revocation_tested',
  'target_retirement_tested',
  'queue_purge_tested',
  'sandbox_runtime_tested',
  'software_artifact_verified',
  'no_remote_shell_confirmed',
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

function requiredString(value, name, pattern, maximum = 128) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !pattern.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function exactStepList(value) {
  if (!Array.isArray(value) || value.length !== FLEET_STAGE1_ROLLBACK_STEPS.length) {
    throw new Error('Fleet Stage 1 rollback steps must contain the exact reviewed sequence.');
  }
  for (let index = 0; index < FLEET_STAGE1_ROLLBACK_STEPS.length; index += 1) {
    if (value[index] !== FLEET_STAGE1_ROLLBACK_STEPS[index]) {
      throw new Error(`Fleet Stage 1 rollback step ${index} must be ${FLEET_STAGE1_ROLLBACK_STEPS[index]}.`);
    }
  }
  return Object.freeze([...FLEET_STAGE1_ROLLBACK_STEPS]);
}

export function validateFleetStage1RollbackPlan(plan) {
  exactKeys(plan, new Set([
    'rollbackVersion',
    'softwareCommit',
    'policyVersion',
    'targetRegistryRevision',
    'automaticReenable',
    'remoteShellAllowed',
    'requiresFreshConsent',
    'requiresFreshLocalEnable',
    'steps',
  ]), 'Fleet Stage 1 rollback plan');

  if (plan.rollbackVersion !== FLEET_STAGE1_ROLLBACK_VERSION) throw new Error('Fleet Stage 1 rollback version is unsupported.');
  const softwareCommit = requiredString(plan.softwareCommit, 'Fleet Stage 1 rollback softwareCommit', /^[0-9a-f]{40}$/, 40);
  if (plan.policyVersion !== FLEET_POLICY_VERSION) throw new Error('Fleet Stage 1 rollback policyVersion must match the reviewed fleet policy.');
  const targetRegistryRevision = requiredString(plan.targetRegistryRevision, 'Fleet Stage 1 rollback targetRegistryRevision', /^[a-zA-Z0-9._-]{3,64}$/);
  if (plan.automaticReenable !== false) throw new Error('Fleet Stage 1 rollback must never automatically re-enable measurement work.');
  if (plan.remoteShellAllowed !== false) throw new Error('Fleet Stage 1 rollback must not enable a remote shell.');
  if (plan.requiresFreshConsent !== true) throw new Error('Fleet Stage 1 rollback requires fresh local consent before re-enable.');
  if (plan.requiresFreshLocalEnable !== true) throw new Error('Fleet Stage 1 rollback requires a fresh local enable action before re-enable.');
  const steps = exactStepList(plan.steps);

  return Object.freeze({
    rollbackVersion: FLEET_STAGE1_ROLLBACK_VERSION,
    softwareCommit,
    policyVersion: FLEET_POLICY_VERSION,
    targetRegistryRevision,
    automaticReenable: false,
    remoteShellAllowed: false,
    requiresFreshConsent: true,
    requiresFreshLocalEnable: true,
    steps,
  });
}

export function assessFleetStage1RollbackReadiness({ plan, checks } = {}) {
  const normalizedPlan = validateFleetStage1RollbackPlan(plan);
  exactKeys(checks, new Set(FLEET_STAGE1_ROLLBACK_CHECKS), 'Fleet Stage 1 rollback checks');
  const missing = [];
  for (const check of FLEET_STAGE1_ROLLBACK_CHECKS) {
    if (checks[check] !== true) missing.push(check);
  }
  return Object.freeze({
    rollbackGateReady: missing.length === 0,
    missing: Object.freeze(missing),
    softwareCommit: normalizedPlan.softwareCommit,
    targetRegistryRevision: normalizedPlan.targetRegistryRevision,
    deploymentAuthorized: false,
    evidenceRole: 'fleet-stage1-rollback-readiness',
    independentCensorshipVote: false,
  });
}
