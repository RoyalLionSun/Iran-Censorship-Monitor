import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEET_POLICY_VERSION } from '../lib/fleet.mjs';
import { buildFleetStage1PilotDashboardModel } from '../lib/fleet-stage1-publication.mjs';

const PROBES = [
  { probeId: 'p_1111111111111111', enabled: true, policyVersion: FLEET_POLICY_VERSION },
  { probeId: 'p_2222222222222222', enabled: true, policyVersion: FLEET_POLICY_VERSION },
];

function accepted(probeId, measuredAt, testId = 't1') {
  return {
    accepted: true,
    status: 'accepted',
    result: {
      probeId,
      policyVersion: FLEET_POLICY_VERSION,
      manifestNonce: 'nonce_1234567890abcdef',
      testId,
      measuredAt,
      outcome: 'timeout',
    },
  };
}

test('pilot dashboard model remains per-probe and cannot publish national province network or blocked status', () => {
  const model = buildFleetStage1PilotDashboardModel({
    probeRegistry: PROBES,
    ingestedResults: [
      accepted(PROBES[0].probeId, '2026-09-09T12:10:00.000Z'),
      accepted(PROBES[1].probeId, '2026-09-09T12:11:00.000Z'),
    ],
    from: '2026-09-09T12:00:00.000Z',
    to: '2026-09-09T13:00:00.000Z',
  });

  assert.equal(model.status, 'observed');
  assert.equal(model.publicationMode, 'per-probe-only');
  assert.equal(model.aggregatePublicationAllowed, false);
  assert.equal(model.independentCensorshipVote, false);
  assert.equal(model.nationalStatus, null);
  assert.equal(model.provinceStatus, null);
  assert.equal(model.networkStatus, null);
  assert.equal(model.blockedStatus, null);
  assert.equal(model.networkSegmentationAvailable, false);
  assert.equal(model.probes.length, 2);
  assert.deepEqual(Object.keys(model.probes[0]).sort(), ['lastMeasuredAt', 'observations', 'probeId', 'status']);
});

test('multiple fleet probes remain one source family and cannot inflate independent evidence', () => {
  const model = buildFleetStage1PilotDashboardModel({
    probeRegistry: PROBES,
    ingestedResults: [
      accepted(PROBES[0].probeId, '2026-09-09T12:10:00.000Z', 't1'),
      accepted(PROBES[0].probeId, '2026-09-09T12:12:00.000Z', 't2'),
      accepted(PROBES[1].probeId, '2026-09-09T12:14:00.000Z', 't3'),
    ],
    from: '2026-09-09T12:00:00.000Z',
    to: '2026-09-09T13:00:00.000Z',
  });

  assert.equal(model.sourceFamily, 'owned-probe-fleet');
  assert.equal(model.acceptedObservations, 3);
  assert.equal(model.observedProbes, 2);
  assert.equal(model.independentCensorshipVote, false);
});

test('missing pilot data remains no_data with no offline inference', () => {
  const model = buildFleetStage1PilotDashboardModel({
    probeRegistry: PROBES,
    ingestedResults: [],
    from: '2026-09-09T12:00:00.000Z',
    to: '2026-09-09T13:00:00.000Z',
  });

  assert.equal(model.status, 'no_data');
  assert.equal(model.offlineInferenceAllowed, false);
  assert.equal(model.observedProbes, 0);
  assert.equal(model.probes.every((probe) => probe.status === 'no_data'), true);
});
