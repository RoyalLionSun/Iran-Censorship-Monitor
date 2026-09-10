import assert from 'node:assert/strict';
import test from 'node:test';
import { buildV16ShutdownContextExportRows } from '../public/v16-context-export.js';

test('v1.6 context export preserves Pulse provenance and STOP/Pulse zero-vote correlation semantics', () => {
  const rows = buildV16ShutdownContextExportRows({
    pulse: {
      ok: true,
      status: 'observed',
      totalMatched: 1,
      events: [{
        id: 'pulse-1',
        startTime: '2026-09-05T12:00:00.000Z',
        endTime: null,
        type: 'National shutdown',
        affectedRegions: 'Nationwide',
        verificationLevel: 'Confirmed',
        cause: 'Fixture cause',
      }],
    },
    shutdownContext: {
      ok: true,
      status: 'complete_context',
      possibleSameIncidentCount: 1,
      automaticMergedCount: 0,
      correlations: [{
        stopId: 'stop-1',
        pulseId: 'pulse-1',
        scopeClass: 'national',
        relation: 'temporal_scope_overlap',
        possibleSameIncident: true,
        automaticMerge: false,
      }],
    },
  });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0].slice(0, 5), ['Internet Society Pulse', 'IR', 'shutdown_context_status', '', 'observed']);
  assert.equal(rows[1][2], 'shutdown_incident');
  assert.match(rows[1][6], /verification=Confirmed/);
  assert.match(rows[1][6], /independentTechnicalVote=false/);
  assert.equal(rows[3][2], 'possible_same_incident');
  assert.match(rows[3][6], /possibleSameIncident=true/);
  assert.match(rows[3][6], /automaticMerge=false/);
  assert.match(rows[3][6], /independentTechnicalVote=false/);
});

test('v1.6 context export keeps Pulse token_required distinct from zero incidents', () => {
  const rows = buildV16ShutdownContextExportRows({
    pulse: { ok: true, status: 'token_required', totalMatched: 0, events: [] },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0][2], 'shutdown_context_status');
  assert.equal(rows[0][4], 'token_required');
  assert.match(rows[0][6], /matched=not_inferred/);
  assert.doesNotMatch(rows[0][6], /matched=0/);
});
