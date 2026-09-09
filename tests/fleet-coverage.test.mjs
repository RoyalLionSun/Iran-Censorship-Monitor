import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEET_POLICY_VERSION } from '../lib/fleet.mjs';
import { buildFleetCoverageSnapshot } from '../lib/fleet-coverage.mjs';

const P1 = 'p_aaaaaaaaaaaaaaaa';
const P2 = 'p_bbbbbbbbbbbbbbbb';

function probes() {
  return [
    { probeId: P1, enabled: true, policyVersion: FLEET_POLICY_VERSION },
    { probeId: P2, enabled: true, policyVersion: FLEET_POLICY_VERSION },
  ];
}

function accepted(probeId, measuredAt, overrides = {}) {
  return {
    status: 'accepted',
    accepted: true,
    ingestedAt: measuredAt,
    result: {
      probeId,
      policyVersion: FLEET_POLICY_VERSION,
      manifestNonce: 'nonce_1234567890abcdef',
      testId: 't1',
      measuredAt,
      ...overrides,
    },
  };
}

const WINDOW = { from: '2026-09-09T12:00:00.000Z', to: '2026-09-09T12:30:00.000Z' };

test('fleet coverage with no accepted results remains no_data and never infers offline', () => {
  const snapshot = buildFleetCoverageSnapshot({ probeRegistry: probes(), ingestedResults: [], ...WINDOW });
  assert.equal(snapshot.status, 'no_data');
  assert.equal(snapshot.expectedEnabledProbes, 2);
  assert.equal(snapshot.observedProbes, 0);
  assert.equal(snapshot.acceptedObservations, 0);
  assert.equal(snapshot.coverageComplete, false);
  assert.equal(snapshot.offlineInferenceAllowed, false);
  assert.equal(snapshot.aggregatePublicationAllowed, false);
  assert.equal(snapshot.nationalStatus, null);
  assert.equal(snapshot.provinceStatus, null);
  assert.deepEqual(snapshot.probes.map((probe) => [probe.probeId, probe.status, probe.offline]), [
    [P1, 'no_data', null],
    [P2, 'no_data', null],
  ]);
});

test('one observed probe and one missing probe is partial coverage, not national availability', () => {
  const observation = accepted(P1, '2026-09-09T12:05:00.000Z');
  const duplicateCopy = structuredClone(observation);
  const rejectedDuplicate = { ...structuredClone(observation), status: 'duplicate', accepted: false };
  const snapshot = buildFleetCoverageSnapshot({
    probeRegistry: probes(),
    ingestedResults: [observation, duplicateCopy, rejectedDuplicate],
    ...WINDOW,
  });
  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.observedProbes, 1);
  assert.equal(snapshot.acceptedObservations, 1);
  assert.equal(snapshot.coverageComplete, false);
  assert.equal(snapshot.aggregatePublicationAllowed, false);
  assert.equal(snapshot.nationalStatus, null);
  assert.equal(snapshot.probes.find((probe) => probe.probeId === P1).observations, 1);
  assert.equal(snapshot.probes.find((probe) => probe.probeId === P2).status, 'no_data');
});

test('complete enabled-probe collection is observed coverage but still cannot publish an aggregate status', () => {
  const snapshot = buildFleetCoverageSnapshot({
    probeRegistry: probes(),
    ingestedResults: [
      accepted(P1, '2026-09-09T12:05:00.000Z'),
      accepted(P2, '2026-09-09T12:06:00.000Z'),
    ],
    ...WINDOW,
  });
  assert.equal(snapshot.status, 'observed');
  assert.equal(snapshot.coverageComplete, true);
  assert.equal(snapshot.observedProbes, 2);
  assert.equal(snapshot.acceptedObservations, 2);
  assert.equal(snapshot.aggregatePublicationAllowed, false);
  assert.equal(snapshot.independentCensorshipVote, false);
  assert.equal(snapshot.nationalStatus, null);
  assert.equal(snapshot.provinceStatus, null);
});

test('results outside the selected window do not become zero or successful observations', () => {
  const snapshot = buildFleetCoverageSnapshot({
    probeRegistry: probes(),
    ingestedResults: [accepted(P1, '2026-09-09T11:59:59.000Z')],
    ...WINDOW,
  });
  assert.equal(snapshot.status, 'no_data');
  assert.equal(snapshot.acceptedObservations, 0);
  assert.equal(snapshot.probes[0].status, 'no_data');
});

test('accepted results from unregistered probes or incompatible policy fail closed', () => {
  assert.throws(() => buildFleetCoverageSnapshot({
    probeRegistry: probes(),
    ingestedResults: [accepted('p_cccccccccccccccc', '2026-09-09T12:05:00.000Z')],
    ...WINDOW,
  }), /unregistered probe/);

  assert.throws(() => buildFleetCoverageSnapshot({
    probeRegistry: probes(),
    ingestedResults: [accepted(P1, '2026-09-09T12:05:00.000Z', { policyVersion: 'old-policy' })],
    ...WINDOW,
  }), /incompatible policyVersion/);
});

test('disabled probes are excluded from the expected cohort and cannot improve coverage', () => {
  const registry = [
    { probeId: P1, enabled: true, policyVersion: FLEET_POLICY_VERSION },
    { probeId: P2, enabled: false, policyVersion: FLEET_POLICY_VERSION },
  ];
  const snapshot = buildFleetCoverageSnapshot({
    probeRegistry: registry,
    ingestedResults: [accepted(P2, '2026-09-09T12:05:00.000Z')],
    ...WINDOW,
  });
  assert.equal(snapshot.expectedEnabledProbes, 1);
  assert.equal(snapshot.observedProbes, 0);
  assert.equal(snapshot.status, 'no_data');
});
