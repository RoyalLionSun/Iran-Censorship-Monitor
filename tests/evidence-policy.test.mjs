import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVpnProtocolEvidence, evaluateNinGlobalEvidence, evaluateSegmentationFeasibility } from '../lib/evidence-policy.mjs';

const vpnBase = {
  protocol: 'wireguard', scope: 'asn', protocolTransportMeasured: true, circumventionWebsiteOnly: false,
  controlledEndpoint: true, neutralControl: true, sameProbePaired: true, repeatedWindows: 2,
  distinctProbes: 2, distinctNetworks: 1, coverageDocumented: true, designReviewed: true, analystReviewed: true,
};

test('VPN website reachability alone can never satisfy a transport-protocol evidence gate', () => {
  const gate = evaluateVpnProtocolEvidence({ ...vpnBase, protocolTransportMeasured: false, circumventionWebsiteOnly: true });
  assert.equal(gate.status, 'not_ready');
  assert.ok(gate.missing.includes('protocol_transport_measurement'));
});

test('complete protocol evidence reaches analyst review only and never becomes an automatic verdict', () => {
  const gate = evaluateVpnProtocolEvidence(vpnBase);
  assert.equal(gate.status, 'analyst_review_ready');
  assert.equal(gate.automaticBlockedVerdictAllowed, false);
  assert.equal(gate.automaticAvailabilityVerdictAllowed, false);
  assert.equal(gate.independentCensorshipVote, false);
});

test('country protocol claims require multi-network coverage but still remain manual-review evidence', () => {
  const weak = evaluateVpnProtocolEvidence({ ...vpnBase, scope: 'country', distinctNetworks: 1 });
  assert.ok(weak.missing.includes('multi_network_country_coverage'));
  const stronger = evaluateVpnProtocolEvidence({ ...vpnBase, scope: 'country', distinctNetworks: 2 });
  assert.equal(stronger.status, 'analyst_review_ready');
  assert.equal(stronger.automaticBlockedVerdictAllowed, false);
});

test('province VPN claims remain disabled even with otherwise complete evidence inputs', () => {
  const gate = evaluateVpnProtocolEvidence({ ...vpnBase, scope: 'province' });
  assert.equal(gate.status, 'not_ready');
  assert.ok(gate.missing.includes('province_scope_disabled'));
});

const ninBase = {
  scope: 'asn', domesticTargetClassificationReviewed: true, globalTargetClassificationReviewed: true,
  independentlyHostedGlobalControls: 2, sameProbePaired: true, boundedTimePair: true,
  coverageDocumented: true, designReviewed: true, analystReviewed: true,
};

test('NIN/global evidence requires at least two independently hosted global controls', () => {
  const gate = evaluateNinGlobalEvidence({ ...ninBase, independentlyHostedGlobalControls: 1 });
  assert.equal(gate.status, 'not_ready');
  assert.ok(gate.missing.includes('two_independently_hosted_global_controls'));
});

test('complete paired NIN/global evidence is analyst-review readiness, not an automatic availability claim', () => {
  const gate = evaluateNinGlobalEvidence(ninBase);
  assert.equal(gate.status, 'analyst_review_ready');
  assert.equal(gate.automaticAvailabilityVerdictAllowed, false);
  assert.equal(gate.deploymentAuthorized, false);
});

test('province NIN/global publication remains disabled', () => {
  const gate = evaluateNinGlobalEvidence({ ...ninBase, scope: 'province' });
  assert.equal(gate.status, 'not_ready');
  assert.ok(gate.missing.includes('province_scope_disabled'));
});

test('province segmentation forbids source-IP inference', () => {
  const gate = evaluateSegmentationFeasibility({ dimension: 'province', sourceIpInference: true, selfDeclaredCoarseLocation: false, subscriberEntitlementData: false });
  assert.equal(gate.status, 'deferred_no_go');
  assert.equal(gate.publicationAllowed, false);
  assert.equal(gate.sourceIpInferenceAllowed, false);
});

test('even coarse self-declared province data is only a future-review candidate under current policy', () => {
  const gate = evaluateSegmentationFeasibility({ dimension: 'province', sourceIpInference: false, selfDeclaredCoarseLocation: true, subscriberEntitlementData: false });
  assert.equal(gate.futureReviewPossible, true);
  assert.equal(gate.publicationAllowed, false);
});

test('white-SIM/ordinary-SIM segmentation is no-go and rejects sensitive entitlement collection', () => {
  const gate = evaluateSegmentationFeasibility({ dimension: 'sim_class', sourceIpInference: false, selfDeclaredCoarseLocation: false, subscriberEntitlementData: true });
  assert.equal(gate.status, 'no_go');
  assert.equal(gate.sensitiveSubscriberDataAllowed, false);
  assert.equal(gate.publicationAllowed, false);
});
