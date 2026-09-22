import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessment } from '../lib/assessment.mjs';

test('public interpretation summary is claim-based and has no global severity or score', () => {
  const result = buildAssessment({
    ooni: { ok: true, status: 'observed', totalMeasurements: 40, totalAnomalies: 18, totalConfirmed: 0, anomalyRate: 45, truncatedAtApiLimit: false, points: [
      { date: '2026-09-09', measurements: 20, anomalyRate: 45 },
      { date: '2026-09-10', measurements: 20, anomalyRate: 45 },
    ] },
    ioda: { ok: true, status: 'observed', series: [{ sampleCount: 10 }], events: [{ datasource: 'ping-slash24' }] },
    radar: { status: 'token_required' },
    selection: { since: '2026-09-09', until: '2026-09-10', testName: 'web_connectivity' },
    scopeLabel: 'AS58224 / Iran',
  });
  const interpretation = result.interpretation;
  assert.equal(interpretation.summary.state, 'access-and-connectivity-signals');
  assert.equal(Object.hasOwn(interpretation.summary, 'severity'), false);
  assert.equal(Object.hasOwn(interpretation.summary, 'score'), false);
  assert.equal(interpretation.summary.evidenceMode, 'per-finding');
  assert.equal(interpretation.dimensions.interference.confidence, 'low');
  assert.equal(interpretation.dimensions.connectivity.confidence, 'low');
  assert.equal(interpretation.dimensions.shutdown.state, 'not-established');
});

test('overview findings state positive observations and explicit non-findings', () => {
  const result = buildAssessment({
    ripestat: { ok: true, status: 'observed', timeAlignment: 'aligned', routing: { visibility: { percent: 99.7, seeingPeers: 325, totalPeers: 326 } } },
    ripe: { ok: true, status: 'no_data', probeCount: 7, overall: { samples: 0, packetLossPercent: null, averageRttMs: null }, series: [] },
    radar: { status: 'token_required' },
    selection: { since: '2026-09-09', until: '2026-09-10' },
    scopeLabel: 'AS58224 / Iran',
  });
  assert.ok(result.interpretation.findings.some((item) => item.id === 'routing-visible'));
  assert.ok(result.interpretation.findings.some((item) => item.id === 'quality-unknown'));
  assert.ok(result.interpretation.findings.some((item) => item.id === 'shutdown-not-established'));
});
