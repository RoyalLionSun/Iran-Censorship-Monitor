import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateShutdownContext } from '../lib/shutdown-context.mjs';

const range = { since: '2026-01-01', until: '2026-01-31' };
const stop = { ok: true, datasetThroughYear: 2025, incidents: [{ id: 'stop-1', startDate: '2026-01-08', endDate: null, shutdownExtent: 'National' }] };
const pulse = { ok: true, status: 'observed', events: [{ id: 'pulse-1', startDate: '2026-01-08', endDate: null, type: 'National shutdown' }] };

test('same temporal interval and scope is an analyst candidate, never an auto-merge', () => {
  const result = correlateShutdownContext({ accessNow: stop, pulse, ...range });
  assert.equal(result.status, 'complete_context');
  assert.equal(result.possibleSameIncidentCount, 1);
  assert.equal(result.correlations[0].possibleSameIncident, true);
  assert.equal(result.correlations[0].automaticMerge, false);
  assert.equal(result.automaticMergedCount, 0);
  assert.equal(result.independentTechnicalVote, false);
});

test('overlap with conflicting scope does not create a candidate', () => {
  const regionalPulse = { ...pulse, events: [{ ...pulse.events[0], type: 'Regional shutdown', affectedRegions: 'Tehran province' }] };
  assert.equal(correlateShutdownContext({ accessNow: stop, pulse: regionalPulse, ...range }).possibleSameIncidentCount, 0);
});

test('same scope without temporal overlap does not correlate', () => {
  const laterPulse = { ...pulse, events: [{ ...pulse.events[0], startDate: '2026-01-20', endDate: '2026-01-21' }] };
  const endedStop = { ...stop, incidents: [{ ...stop.incidents[0], endDate: '2026-01-10' }] };
  assert.equal(correlateShutdownContext({ accessNow: endedStop, pulse: laterPulse, ...range }).possibleSameIncidentCount, 0);
});

test('token-required Pulse produces partial context rather than a false zero', () => {
  const result = correlateShutdownContext({ accessNow: stop, pulse: { ok: true, status: 'token_required', events: [] }, ...range });
  assert.equal(result.status, 'partial_context');
  assert.equal(result.pulse.available, false);
  assert.equal(result.pulse.configured, false);
});
