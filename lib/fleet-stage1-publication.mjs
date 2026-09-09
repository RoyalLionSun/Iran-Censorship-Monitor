import { buildFleetCoverageSnapshot } from './fleet-coverage.mjs';

export const FLEET_STAGE1_PUBLICATION_VERSION = '1.2-lab1';

export function buildFleetStage1PilotDashboardModel(options = {}) {
  const coverage = buildFleetCoverageSnapshot(options);
  const probes = Object.freeze(coverage.probes.map((probe) => Object.freeze({
    probeId: probe.probeId,
    status: probe.status,
    observations: probe.observations,
    lastMeasuredAt: probe.lastMeasuredAt,
  })));

  return Object.freeze({
    source: 'Owned probe fleet',
    sourceFamily: 'owned-probe-fleet',
    evidenceRole: 'owned-probe-pilot-presentation',
    publicationVersion: FLEET_STAGE1_PUBLICATION_VERSION,
    independentCensorshipVote: false,
    publicationMode: 'per-probe-only',
    status: coverage.status,
    window: coverage.window,
    expectedEnabledProbes: coverage.expectedEnabledProbes,
    observedProbes: coverage.observedProbes,
    acceptedObservations: coverage.acceptedObservations,
    aggregatePublicationAllowed: false,
    nationalStatus: null,
    provinceStatus: null,
    networkStatus: null,
    blockedStatus: null,
    networkSegmentationAvailable: false,
    offlineInferenceAllowed: false,
    probes,
    note: 'Pilot fleet presentation is coverage-only and per-probe. Missing data remains no_data; probe outcomes are not converted into national, province, network or blocking claims.',
  });
}
