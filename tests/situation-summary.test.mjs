import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSituationSummary } from '../lib/situation-summary.mjs';
import { buildAssessment } from '../lib/assessment.mjs';

test('insufficient data remains explicitly unknown and does not imply normal Internet', () => {
  const result = buildSituationSummary({ status: 'insufficient-data', confidence: 'none', scope: 'Iran', availableSources: [], signals: [] });
  assert.equal(result.state, 'insufficient-data');
  assert.equal(result.severity, 'neutral');
  assert.equal(result.sourceCount, 0);
  assert.equal(result.completeShutdownVerdict, 'not-established');
  assert.equal(result.nationwideImpactVerdict, 'not-established');
});

test('observed state means no major disruption corroborated, not proof of full availability', () => {
  const result = buildSituationSummary({ status: 'observed', confidence: 'medium', scope: 'AS58224 / Iran', availableSources: ['OONI', 'RIPE Atlas'], signals: [] });
  assert.equal(result.state, 'no-major-disruption-detected');
  assert.equal(result.headlineKey, 'situation.headline.observed');
  assert.equal(result.completeShutdownVerdict, 'not-established');
});

test('corroborated disruption exposes only elevated drivers and preserves raw source identity', () => {
  const result = buildSituationSummary({
    status: 'corroborated', confidence: 'high', scope: 'Iran', availableSources: ['OONI', 'RIPE Atlas', 'IODA'],
    signals: [
      { source: 'OONI', elevated: true, strong: false, value: 42.5, unit: '% anomalies', sample: 120 },
      { source: 'RIPE Atlas', elevated: true, strong: true, value: 55, unit: '% missing ping packets', sample: 30 },
      { source: 'IODA', elevated: false, strong: false, value: 0, unit: 'outage events', sample: 12 },
    ],
  });
  assert.equal(result.state, 'significant-disruption-signals');
  assert.deepEqual(result.drivers.map((row) => row.source), ['OONI', 'RIPE Atlas']);
  assert.deepEqual(result.drivers.map((row) => row.state), ['elevated', 'strong']);
  assert.equal(result.sourceCount, 3);
});

test('control/data-plane divergence is surfaced without changing shutdown verdict', () => {
  const result = buildSituationSummary({
    status: 'strongly-corroborated', confidence: 'high', scope: 'AS58224 / Iran', availableSources: ['OONI', 'RIPE Atlas', 'IODA'], signals: [],
    controlDataPlane: { classification: 'control-data-plane-divergence' },
  });
  assert.equal(result.state, 'strong-multisource-disruption-signals');
  assert.equal(result.controlDataPlane.messageKey, 'situation.controlDataPlane.divergence');
  assert.equal(result.completeShutdownVerdict, 'not-established');
});

test('unknown assessment status fails safe to insufficient-data presentation', () => {
  const result = buildSituationSummary({ status: 'future-status', availableSources: ['OONI'] });
  assert.equal(result.state, 'insufficient-data');
  assert.equal(result.severity, 'neutral');
});

test('buildAssessment exposes the plain-language summary without changing assessment status', () => {
  const result = buildAssessment({
    ooni: { ok: true, totalMeasurements: 40, truncatedAtApiLimit: false, points: [
      { date: '2026-09-09', measurements: 20, anomalyRate: 45 },
      { date: '2026-09-10', measurements: 20, anomalyRate: 45 },
    ] },
    ripe: { ok: true, status: 'observed', overall: { samples: 20, packetLossPercent: 30 }, series: [
      { date: '2026-09-09', packetLossPercent: 30, samples: 10 },
      { date: '2026-09-10', packetLossPercent: 30, samples: 10 },
    ] },
    radar: { status: 'token_required' },
    ioda: null,
    ripestat: null,
    scopeLabel: 'AS58224 / Iran',
  });
  assert.equal(result.status, 'corroborated');
  assert.equal(result.publicSummary.state, 'significant-disruption-signals');
  assert.equal(result.publicSummary.completeShutdownVerdict, 'not-established');
});
