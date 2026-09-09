import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEET_POLICY_VERSION, validateFleetManifest } from '../lib/fleet.mjs';
import {
  FLEET_STAGE1_ROLLBACK_CHECKS,
  FLEET_STAGE1_ROLLBACK_STEPS,
  FLEET_STAGE1_ROLLBACK_VERSION,
  assessFleetStage1RollbackReadiness,
  validateFleetStage1RollbackPlan,
} from '../lib/fleet-stage1-rollback.mjs';

function plan(overrides = {}) {
  return {
    rollbackVersion: FLEET_STAGE1_ROLLBACK_VERSION,
    softwareCommit: '0123456789abcdef0123456789abcdef01234567',
    policyVersion: FLEET_POLICY_VERSION,
    targetRegistryRevision: 'targets-stage1-lab-1',
    automaticReenable: false,
    remoteShellAllowed: false,
    requiresFreshConsent: true,
    requiresFreshLocalEnable: true,
    steps: [...FLEET_STAGE1_ROLLBACK_STEPS],
    ...overrides,
  };
}

function checks(value = true) {
  return Object.fromEntries(FLEET_STAGE1_ROLLBACK_CHECKS.map((key) => [key, value]));
}

test('Stage 1 rollback plan is immutable-scope, no-shell and no-auto-reenable', () => {
  const parsed = validateFleetStage1RollbackPlan(plan());
  assert.equal(parsed.automaticReenable, false);
  assert.equal(parsed.remoteShellAllowed, false);
  assert.equal(parsed.requiresFreshConsent, true);
  assert.equal(parsed.requiresFreshLocalEnable, true);
  assert.deepEqual(parsed.steps, FLEET_STAGE1_ROLLBACK_STEPS);
});

test('rollback plan fails closed on remote shell, automatic enable, policy drift or free-form commands', () => {
  assert.throws(() => validateFleetStage1RollbackPlan(plan({ remoteShellAllowed: true })), /remote shell/);
  assert.throws(() => validateFleetStage1RollbackPlan(plan({ automaticReenable: true })), /automatically re-enable/);
  assert.throws(() => validateFleetStage1RollbackPlan(plan({ policyVersion: '1.2-wider' })), /policyVersion/);
  assert.throws(() => validateFleetStage1RollbackPlan({ ...plan(), command: 'ssh root@probe' }), /unsupported field/);
  assert.throws(() => validateFleetStage1RollbackPlan({ ...plan(), fallbackUrl: 'https://other.invalid' }), /unsupported field/);
});

test('rollback step sequence cannot omit local withdrawal or reorder central revocation', () => {
  const omitted = FLEET_STAGE1_ROLLBACK_STEPS.filter((step) => step !== 'remove_local_consent');
  assert.throws(() => validateFleetStage1RollbackPlan(plan({ steps: omitted })), /exact reviewed sequence/);
  const reordered = [...FLEET_STAGE1_ROLLBACK_STEPS];
  [reordered[4], reordered[5]] = [reordered[5], reordered[4]];
  assert.throws(() => validateFleetStage1RollbackPlan(plan({ steps: reordered })), /rollback step/);
});

test('rollback readiness exposes missing runtime gates and never authorizes deployment', () => {
  const partial = checks(true);
  partial.sandbox_runtime_tested = false;
  partial.software_artifact_verified = false;
  const result = assessFleetStage1RollbackReadiness({ plan: plan(), checks: partial });
  assert.equal(result.rollbackGateReady, false);
  assert.deepEqual(result.missing, ['sandbox_runtime_tested', 'software_artifact_verified']);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.independentCensorshipVote, false);
});

test('even a fully green rollback readiness result is not deployment authorization', () => {
  const result = assessFleetStage1RollbackReadiness({ plan: plan(), checks: checks(true) });
  assert.equal(result.rollbackGateReady, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.deploymentAuthorized, false);
});

test('retiring a target by removing it from the local registry makes an old signed definition unusable', () => {
  const manifest = {
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:30:00.000Z',
    nonce: 'rollback_nonce_123456',
    tests: [{ testId: 't1', targetId: 'retired-target', family: 'tcp', af: 4, timeoutMs: 1000, maxAttempts: 1 }],
  };
  assert.throws(() => validateFleetManifest(manifest, [], { now: new Date('2026-09-09T12:10:00.000Z') }), /unknown targetId retired-target/);
});
