import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEET_POLICY_VERSION } from '../lib/fleet.mjs';
import {
  evaluateFleetStage1RepositoryPredeployment,
  validateFleetStage1KeyPolicy,
  validateFleetStage1TargetProvenance,
} from '../lib/fleet-stage1-predeployment.mjs';

function keyPolicy(overrides = {}) {
  return {
    policyVersion: FLEET_POLICY_VERSION,
    schedulerSigningKeyStorage: 'offline-encrypted',
    schedulerPrivateKeyCommitted: false,
    probePublicKeyProvisioning: 'out-of-band-pinned',
    probeSecretStorage: 'os-credential-store',
    probeSecretInCommandLine: false,
    probeSecretCommitted: false,
    rotationDays: 30,
    emergencyRevocation: true,
    replacementRequiresLocalOperator: true,
    ...overrides,
  };
}

function target(id, hostingGroup, overrides = {}) {
  return {
    targetId: id,
    safetyClass: 'A',
    owner: 'project',
    purpose: 'benign-control',
    scope: 'global-control',
    host: `${id}.example.invalid`,
    port: 443,
    families: ['tcp', 'tls', 'https'],
    approved: true,
    enabled: true,
    hostingGroup,
    controlEvidence: 'owned-account',
    ninClassification: null,
    provinceClassification: null,
    ...overrides,
  };
}

test('Stage 1 key policy requires out-of-band pinning, bounded rotation and no committed or command-line secrets', () => {
  const valid = validateFleetStage1KeyPolicy(keyPolicy());
  assert.equal(valid.repositoryKeyPolicyReady, true);
  assert.equal(valid.deploymentAuthorized, false);

  assert.throws(() => validateFleetStage1KeyPolicy(keyPolicy({ schedulerPrivateKeyCommitted: true })), /never be committed/);
  assert.throws(() => validateFleetStage1KeyPolicy(keyPolicy({ probeSecretCommitted: true })), /never be committed/);
  assert.throws(() => validateFleetStage1KeyPolicy(keyPolicy({ probeSecretInCommandLine: true })), /command line/);
  assert.throws(() => validateFleetStage1KeyPolicy(keyPolicy({ probePublicKeyProvisioning: 'download-on-first-use' })), /out of band/);
  assert.throws(() => validateFleetStage1KeyPolicy(keyPolicy({ rotationDays: 365 })), /between 1 and 90/);
});

test('production target provenance permits only project-controlled benign Class A targets without inferred NIN or province labels', () => {
  const result = validateFleetStage1TargetProvenance([
    target('control-a', 'hoster-a'),
    target('control-b', 'hoster-b'),
  ]);

  assert.equal(result.totalTargets, 2);
  assert.equal(result.globalControls, 2);
  assert.equal(result.independentGlobalHostingGroups, 2);
  assert.equal(result.globalReachabilityEligible, true);
  assert.equal(result.ninClassificationEligible, false);
  assert.equal(result.provinceClassificationEligible, false);
  assert.equal(result.deploymentAuthorized, false);

  assert.throws(() => validateFleetStage1TargetProvenance([target('bad-owner', 'hoster-a', { owner: 'third-party' })]), /project-controlled/);
  assert.throws(() => validateFleetStage1TargetProvenance([target('bad-class', 'hoster-a', { safetyClass: 'B' })]), /Class A/);
  assert.throws(() => validateFleetStage1TargetProvenance([target('bad-nin', 'hoster-a', { ninClassification: 'nin' })]), /must not carry inferred NIN/);
  assert.throws(() => validateFleetStage1TargetProvenance([target('bad-province', 'hoster-a', { provinceClassification: 'Tehran' })]), /must not carry inferred NIN/);
});

test('global reachability interpretation requires at least two independently hosted global controls', () => {
  assert.equal(validateFleetStage1TargetProvenance([target('control-a', 'same-hoster')]).globalReachabilityEligible, false);
  assert.equal(validateFleetStage1TargetProvenance([
    target('control-a', 'same-hoster'),
    target('control-b', 'same-hoster'),
  ]).globalReachabilityEligible, false);
  assert.equal(validateFleetStage1TargetProvenance([
    target('control-a', 'hoster-a'),
    target('control-b', 'hoster-b'),
  ]).globalReachabilityEligible, true);
});

test('repository predeployment gate never authorizes a pilot and keeps external gates explicit', () => {
  const gate = evaluateFleetStage1RepositoryPredeployment({
    keyPolicy: keyPolicy(),
    targets: [target('control-a', 'hoster-a'), target('control-b', 'hoster-b')],
  });

  assert.equal(gate.repositoryKeyPolicyReady, true);
  assert.equal(gate.productionTargetPolicyValidated, true);
  assert.equal(gate.globalReachabilityEligible, true);
  assert.equal(gate.deploymentAuthorized, false);
  assert.ok(gate.remainingExternalGates.includes('real-consenting-pilot-operator'));
  assert.ok(gate.remainingExternalGates.includes('explicit-pilot-authorization'));
});
