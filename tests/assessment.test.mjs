import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessment } from '../lib/assessment.mjs';

function ooni({ rate=10, count=30, truncated=false }={}) {
  return { ok:true, totalMeasurements:count, truncatedAtApiLimit:truncated, points:[{date:'2026-09-06', measurements:count/2, anomalyRate:rate},{date:'2026-09-07', measurements:count/2, anomalyRate:rate}] };
}
function ripe({ loss=1, samples=20, status='observed' }={}) {
  return { ok:true, status, overall:{samples,packetLossPercent:loss}, series:[{date:'2026-09-06',packetLossPercent:loss,samples:samples/2},{date:'2026-09-07',packetLossPercent:loss,samples:samples/2}] };
}
function cp({ status='observed', rate=12.5, events=[] }={}) {
  return { ok:true, status, iranUnexpectedRate:rate, timeseries:[{date:'2026-09-07',value:.5}], events };
}
function radar({ eligible=true, outages=[], anomalies=[], outageStatus='no_data', anomalyStatus='no_data', status='observed' }={}) {
  return {
    ok:true,
    status,
    assessmentEligible:eligible,
    outages:{status:outages.length ? 'observed' : outageStatus,annotations:outages},
    trafficAnomalies:{status:anomalies.length ? 'observed' : anomalyStatus,events:anomalies},
  };
}

test('one elevated source is not called corroborated', () => {
  const result = buildAssessment({ ooni:ooni({rate:45}), ripe:ripe({loss:1}), radar:{status:'token_required'}, scopeLabel:'AS58224 / Iran' });
  assert.equal(result.status, 'elevated');
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.supportingSources, ['OONI']);
});

test('two independent elevated sources produce corroborated signal', () => {
  const result = buildAssessment({ ooni:ooni({rate:45}), ripe:ripe({loss:30}), radar:{status:'token_required'}, scopeLabel:'AS58224 / Iran' });
  assert.equal(result.status, 'corroborated');
  assert.equal(result.severity, 'critical');
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.supportingSources, ['OONI','RIPE Atlas']);
});

test('truncated OONI response is excluded from automated anomaly classification', () => {
  const result = buildAssessment({ ooni:ooni({rate:90,truncated:true}), ripe:ripe({loss:1}), radar:{status:'token_required'}, scopeLabel:'Iran' });
  const signal = result.signals.find((item)=>item.source==='OONI');
  assert.equal(signal.usableForAssessment, false);
  assert.equal(signal.elevated, false);
  assert.equal(result.status, 'observed');
});

test('partial RIPE Atlas coverage remains visible but is excluded from corroboration', () => {
  const result = buildAssessment({ ooni:ooni({rate:45}), ripe:ripe({loss:80,status:'partial'}), radar:{status:'token_required'}, scopeLabel:'AS58224 / Iran' });
  const signal = result.signals.find((item)=>item.source==='RIPE Atlas');
  assert.equal(signal.usableForAssessment, false);
  assert.equal(signal.elevated, false);
  assert.equal(result.status, 'elevated');
  assert.deepEqual(result.availableSources, ['OONI']);
});

test('partial RIPE Atlas loss cannot create control/data-plane divergence', () => {
  const result = buildAssessment({
    ooni:null,
    ripe:ripe({loss:90,samples:20,status:'partial'}),
    radar:{status:'token_required'},
    ioda:null,
    ripestat:{routing:{visibility:{percent:95}}},
    scopeLabel:'AS58224 / Iran',
  });
  assert.equal(result.controlDataPlane.ripeUsableForAssessment, false);
  assert.equal(result.controlDataPlane.ripePacketLossPercent, null);
  assert.equal(result.controlDataPlane.classification, 'no-divergence-established');
});

test('Radar outage plus OONI elevation can corroborate disruption without making connectivity a censorship claim', () => {
  const result = buildAssessment({ ooni:ooni({rate:40}), ripe:null, radar:radar({outages:[{}]}), scopeLabel:'Iran' });
  assert.equal(result.status, 'corroborated');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.channels.interference.status, 'elevated');
  assert.equal(result.channels.connectivity.status, 'elevated');
});

test('Radar with a failed required event channel is excluded from confidence and corroboration', () => {
  const result = buildAssessment({
    ooni:ooni({rate:40}),
    radar:radar({eligible:false, anomalyStatus:'error'}),
    scopeLabel:'Iran',
  });
  const signal = result.signals.find((item)=>item.source==='Cloudflare Radar');
  assert.equal(signal.usableForAssessment, false);
  assert.equal(signal.elevated, false);
  assert.equal(result.status, 'elevated');
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.availableSources, ['OONI']);
});

test('Radar with valid no-data event channels stays available but does not raise positive confidence', () => {
  const result = buildAssessment({
    ooni:ooni({rate:40}),
    radar:radar(),
    scopeLabel:'Iran',
  });
  const signal = result.signals.find((item)=>item.source==='Cloudflare Radar');
  assert.equal(signal.usableForAssessment, true);
  assert.equal(signal.elevated, false);
  assert.equal(result.status, 'elevated');
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.availableSources, ['OONI','Cloudflare Radar']);
  assert.deepEqual(result.supportingSources, ['OONI']);
  assert.equal(result.publicSummary.sourceCount, 1);
  assert.equal(result.publicSummary.availableSourceCount, 2);
});

test('non-elevated Radar does not turn two-source corroboration into high confidence', () => {
  const result = buildAssessment({
    ooni:ooni({rate:43}),
    radar:radar(),
    ioda:{ ok:true, status:'observed', series:[{sampleCount:10}], events:[{datasource:'ping-slash24'}] },
    scopeLabel:'AS58224 / Iran',
  });
  assert.equal(result.status, 'corroborated');
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.availableSources, ['OONI','Cloudflare Radar','IODA']);
  assert.deepEqual(result.supportingSources, ['OONI','IODA']);
  assert.equal(result.publicSummary.sourceCount, 2);
  assert.equal(result.publicSummary.availableSourceCount, 3);
});

test('high BGP visibility plus severe data-plane loss is flagged as divergence, not as proof of censorship', () => {
  const result = buildAssessment({
    ooni:null,
    ripe:ripe({loss:65,samples:20}),
    radar:{status:'token_required'},
    ioda:null,
    ripestat:{routing:{visibility:{percent:95}}},
    scopeLabel:'AS58224 / Iran',
  });
  assert.equal(result.controlDataPlane.classification, 'control-data-plane-divergence');
  assert.match(result.controlDataPlane.interpretation, /compatible with selective isolation/i);
  assert.equal(result.channels.interference.status, 'insufficient-data');
  assert.equal(result.channels.connectivity.status, 'elevated');
});

test('Censored Planet contributes a separate interference source when it has real measurement data', () => {
  const result = buildAssessment({
    ooni: ooni({rate:10}),
    censoredPlanet: cp({events:[]}),
    radar:{status:'token_required'},
    scopeLabel:'Iran',
  });
  assert.equal(result.status, 'observed');
  assert.deepEqual(result.channels.interference.availableSources, ['OONI', 'Censored Planet']);
  assert.equal(result.channels.interference.status, 'observed');
});

test('OONI elevation plus a Censored Planet CenAlert event corroborates the interference channel', () => {
  const result = buildAssessment({
    ooni: ooni({rate:45}),
    censoredPlanet: cp({events:[{startDate:'2026-09-07'}]}),
    radar:{status:'token_required'},
    scopeLabel:'Iran',
  });
  assert.equal(result.status, 'corroborated');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.channels.interference.status, 'corroborated');
  const cpSignal = result.signals.find((item) => item.source === 'Censored Planet');
  assert.equal(cpSignal.elevated, true);
  assert.equal(cpSignal.strong, false);
});

test('connectivity disruption alone does not create corroborated interference evidence', () => {
  const result = buildAssessment({
    ripe: ripe({loss:35}),
    ioda: { ok:true, status:'observed', series:[{sampleCount:10}], events:[{datasource:'ping-slash24'}] },
    radar:{status:'token_required'},
    scopeLabel:'Iran',
  });
  assert.equal(result.status, 'corroborated');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.channels.connectivity.status, 'corroborated');
  assert.equal(result.channels.interference.status, 'insufficient-data');
  assert.match(result.methodologicalBoundary, /connectivity degradation alone does not establish censorship intent/i);
});
