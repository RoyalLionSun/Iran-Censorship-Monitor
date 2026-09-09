const PROTOCOLS = new Set(['wireguard', 'openvpn', 'v2ray', 'outline']);
const SCOPES = new Set(['probe', 'network', 'asn', 'country', 'province']);

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

function bool(value, name) {
  if (typeof value !== 'boolean') throw new Error(`${name} must be boolean.`);
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function result(kind, missing, extra = {}) {
  return Object.freeze({
    kind,
    status: missing.length === 0 ? 'analyst_review_ready' : 'not_ready',
    missing: Object.freeze([...missing]),
    automaticBlockedVerdictAllowed: false,
    automaticAvailabilityVerdictAllowed: false,
    independentCensorshipVote: false,
    deploymentAuthorized: false,
    ...extra,
  });
}

export function evaluateVpnProtocolEvidence(input) {
  exactKeys(input, new Set([
    'protocol', 'scope', 'protocolTransportMeasured', 'circumventionWebsiteOnly',
    'controlledEndpoint', 'neutralControl', 'sameProbePaired', 'repeatedWindows',
    'distinctProbes', 'distinctNetworks', 'coverageDocumented', 'designReviewed', 'analystReviewed',
  ]), 'VPN protocol evidence');

  if (!PROTOCOLS.has(input.protocol)) throw new Error(`Unsupported VPN/circumvention protocol ${input.protocol}.`);
  if (!SCOPES.has(input.scope)) throw new Error(`Unsupported evidence scope ${input.scope}.`);
  const repeatedWindows = nonNegativeInteger(input.repeatedWindows, 'repeatedWindows');
  const distinctProbes = nonNegativeInteger(input.distinctProbes, 'distinctProbes');
  const distinctNetworks = nonNegativeInteger(input.distinctNetworks, 'distinctNetworks');
  const missing = [];

  if (!bool(input.protocolTransportMeasured, 'protocolTransportMeasured')) missing.push('protocol_transport_measurement');
  if (bool(input.circumventionWebsiteOnly, 'circumventionWebsiteOnly') && !input.protocolTransportMeasured) {
    if (!missing.includes('protocol_transport_measurement')) missing.push('protocol_transport_measurement');
  }
  if (!bool(input.controlledEndpoint, 'controlledEndpoint')) missing.push('controlled_endpoint');
  if (!bool(input.neutralControl, 'neutralControl')) missing.push('neutral_control');
  if (!bool(input.sameProbePaired, 'sameProbePaired')) missing.push('same_probe_pair');
  if (repeatedWindows < 1) missing.push('repeated_observation_window');
  if (distinctProbes < 1) missing.push('probe_coverage');
  if (distinctNetworks < 1) missing.push('network_coverage');
  if (!bool(input.coverageDocumented, 'coverageDocumented')) missing.push('coverage_documentation');
  if (!bool(input.designReviewed, 'designReviewed')) missing.push('reviewed_measurement_design');
  if (!bool(input.analystReviewed, 'analystReviewed')) missing.push('analyst_review');

  if (input.scope === 'province') missing.push('province_scope_disabled');
  if (input.scope === 'country' && distinctNetworks < 2) missing.push('multi_network_country_coverage');

  return result('vpn_protocol', [...new Set(missing)], {
    protocol: input.protocol,
    scope: input.scope,
    evidenceRole: 'owned-probe-protocol-observation',
    sourceFamily: 'owned-probe-fleet',
    note: 'Website reachability to a VPN provider is not a transport-protocol measurement. Even a complete gate is analyst-review readiness, not an automatic blocked/available verdict.',
  });
}

export function evaluateNinGlobalEvidence(input) {
  exactKeys(input, new Set([
    'scope', 'domesticTargetClassificationReviewed', 'globalTargetClassificationReviewed',
    'independentlyHostedGlobalControls', 'sameProbePaired', 'boundedTimePair',
    'coverageDocumented', 'designReviewed', 'analystReviewed',
  ]), 'NIN/global evidence');

  if (!SCOPES.has(input.scope)) throw new Error(`Unsupported evidence scope ${input.scope}.`);
  const globalControls = nonNegativeInteger(input.independentlyHostedGlobalControls, 'independentlyHostedGlobalControls');
  const missing = [];
  if (!bool(input.domesticTargetClassificationReviewed, 'domesticTargetClassificationReviewed')) missing.push('reviewed_domestic_target_classification');
  if (!bool(input.globalTargetClassificationReviewed, 'globalTargetClassificationReviewed')) missing.push('reviewed_global_target_classification');
  if (globalControls < 2) missing.push('two_independently_hosted_global_controls');
  if (!bool(input.sameProbePaired, 'sameProbePaired')) missing.push('same_probe_pair');
  if (!bool(input.boundedTimePair, 'boundedTimePair')) missing.push('bounded_time_pair');
  if (!bool(input.coverageDocumented, 'coverageDocumented')) missing.push('coverage_documentation');
  if (!bool(input.designReviewed, 'designReviewed')) missing.push('reviewed_measurement_design');
  if (!bool(input.analystReviewed, 'analystReviewed')) missing.push('analyst_review');
  if (input.scope === 'province') missing.push('province_scope_disabled');

  return result('nin_vs_global', [...new Set(missing)], {
    scope: input.scope,
    evidenceRole: 'owned-probe-paired-reachability-context',
    sourceFamily: 'owned-probe-fleet',
    note: 'A NIN-vs-global statement requires separately reviewed target classes and paired observations. It never follows from BGP visibility, source-IP geography, or missing data.',
  });
}

export function evaluateSegmentationFeasibility(input) {
  exactKeys(input, new Set(['dimension', 'sourceIpInference', 'selfDeclaredCoarseLocation', 'subscriberEntitlementData']), 'Segmentation feasibility');
  if (!['province', 'sim_class'].includes(input.dimension)) throw new Error(`Unsupported segmentation dimension ${input.dimension}.`);
  const sourceIpInference = bool(input.sourceIpInference, 'sourceIpInference');
  const selfDeclaredCoarseLocation = bool(input.selfDeclaredCoarseLocation, 'selfDeclaredCoarseLocation');
  const subscriberEntitlementData = bool(input.subscriberEntitlementData, 'subscriberEntitlementData');

  if (input.dimension === 'province') {
    return Object.freeze({
      dimension: 'province',
      status: 'deferred_no_go',
      publicationAllowed: false,
      sourceIpInferenceAllowed: false,
      sensitiveSubscriberDataAllowed: false,
      futureReviewPossible: selfDeclaredCoarseLocation && !sourceIpInference && !subscriberEntitlementData,
      reason: sourceIpInference
        ? 'Source-IP geolocation is explicitly forbidden as province evidence.'
        : 'Current fleet policy has no privacy-reviewed province cohort or publication threshold.',
    });
  }

  return Object.freeze({
    dimension: 'sim_class',
    status: 'no_go',
    publicationAllowed: false,
    sourceIpInferenceAllowed: false,
    sensitiveSubscriberDataAllowed: false,
    futureReviewPossible: false,
    reason: subscriberEntitlementData
      ? 'White-SIM/ordinary-SIM verification would require sensitive subscriber/entitlement data that the fleet deliberately does not collect.'
      : 'No defensible non-sensitive mechanism exists in the current design to establish SIM entitlement class.',
  });
}
