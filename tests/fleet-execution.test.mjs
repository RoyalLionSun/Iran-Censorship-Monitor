import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFleetExecutionPlan, executeFleetPlanEntry } from '../lib/fleet-execution.mjs';
import { FLEET_POLICY_VERSION } from '../lib/fleet.mjs';

const NOW = new Date('2026-09-09T12:10:00.000Z');

function targets(overrides = {}) {
  return [{
    targetId: 'lab-global-https',
    safetyClass: 'A',
    owner: 'project',
    host: 'local-registry.invalid',
    port: 443,
    families: ['dns', 'tcp', 'tls', 'https'],
    approved: true,
    enabled: true,
    ...overrides,
  }];
}

function manifest(testOverrides = {}) {
  return {
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:30:00.000Z',
    nonce: 'nonce_1234567890abcdef',
    tests: [{
      testId: 't1',
      targetId: 'lab-global-https',
      family: 'https',
      af: 4,
      timeoutMs: 3000,
      maxAttempts: 1,
      ...testOverrides,
    }],
  };
}

test('execution plan resolves host and port exclusively from local target registry', () => {
  const plan = compileFleetExecutionPlan(manifest(), targets(), { now: NOW });
  assert.equal(plan.manifestNonce, 'nonce_1234567890abcdef');
  assert.equal(plan.tests.length, 1);
  assert.deepEqual(plan.tests[0], {
    testId: 't1',
    targetId: 'lab-global-https',
    family: 'https',
    af: 4,
    timeoutMs: 3000,
    maxAttempts: 1,
    host: 'local-registry.invalid',
    port: 443,
    targetSource: 'local-target-registry',
    safetyClass: 'A',
    owner: 'project',
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.tests), true);
  assert.equal(Object.isFrozen(plan.tests[0]), true);
});

test('execution compiler still rejects scheduler-supplied host URL port and command', () => {
  for (const extra of [
    { host: 'scheduler.example' },
    { url: 'https://scheduler.example/' },
    { port: 22 },
    { command: 'sh -c id' },
  ]) {
    assert.throws(() => compileFleetExecutionPlan(manifest(extra), targets(), { now: NOW }), /unsupported field/);
  }
});

test('changing local registry endpoint changes execution endpoint without changing signed manifest shape', () => {
  const first = compileFleetExecutionPlan(manifest(), targets({ host: 'probe-installed-a.invalid', port: 443 }), { now: NOW });
  const second = compileFleetExecutionPlan(manifest(), targets({ host: 'probe-installed-b.invalid', port: 8443 }), { now: NOW });
  assert.equal(first.tests[0].host, 'probe-installed-a.invalid');
  assert.equal(first.tests[0].port, 443);
  assert.equal(second.tests[0].host, 'probe-installed-b.invalid');
  assert.equal(second.tests[0].port, 8443);
  assert.equal(first.tests[0].targetId, second.tests[0].targetId);
});

test('local adapter receives only the compiled registry endpoint and bounded test parameters', async () => {
  const plan = compileFleetExecutionPlan(manifest(), targets(), { now: NOW });
  let received;
  const output = await executeFleetPlanEntry(plan.tests[0], {
    https: async (request) => {
      received = request;
      return { outcome: 'fixture-ok', marker: 7 };
    },
  });

  assert.deepEqual(received, {
    testId: 't1',
    targetId: 'lab-global-https',
    family: 'https',
    af: 4,
    timeoutMs: 3000,
    maxAttempts: 1,
    host: 'local-registry.invalid',
    port: 443,
  });
  assert.equal(Object.isFrozen(received), true);
  assert.deepEqual(output, {
    testId: 't1', targetId: 'lab-global-https', family: 'https', af: 4,
    adapterResult: { outcome: 'fixture-ok', marker: 7 },
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.adapterResult), true);
});

test('execution boundary fails closed when local family adapter is absent', async () => {
  const plan = compileFleetExecutionPlan(manifest(), targets(), { now: NOW });
  await assert.rejects(() => executeFleetPlanEntry(plan.tests[0], {}), /No local fleet adapter installed/);
});

test('execution boundary refuses entries not marked as local project-controlled Class A registry targets', async () => {
  const plan = compileFleetExecutionPlan(manifest(), targets(), { now: NOW });
  const entry = plan.tests[0];
  await assert.rejects(() => executeFleetPlanEntry({ ...entry, targetSource: 'scheduler' }, { https: async () => ({}) }), /not bound to the local target registry/);
  await assert.rejects(() => executeFleetPlanEntry({ ...entry, safetyClass: 'C' }, { https: async () => ({}) }), /not an approved project-controlled Class A target/);
  await assert.rejects(() => executeFleetPlanEntry({ ...entry, owner: 'third-party' }, { https: async () => ({}) }), /not an approved project-controlled Class A target/);
});

test('execution boundary rejects malformed adapter outputs instead of fabricating a result', async () => {
  const plan = compileFleetExecutionPlan(manifest(), targets(), { now: NOW });
  await assert.rejects(() => executeFleetPlanEntry(plan.tests[0], { https: async () => null }), /invalid result/);
  await assert.rejects(() => executeFleetPlanEntry(plan.tests[0], { https: async () => 'ok' }), /invalid result/);
});
