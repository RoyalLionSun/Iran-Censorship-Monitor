import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCircumventionIncidentContext, CIRCUMVENTION_CONTEXT_POLICY } from '../lib/circumvention-context.mjs';

function tor({ status = 'observed', rows = [] } = {}) {
  return {
    ok: true,
    status,
    sourceFamily: 'tor',
    evidenceRole: 'circumvention-context',
    independentCensorshipVote: false,
    transports: [{ transport: 'obfs4', rows }],
    bridgeDemandGlobal: { geographicScope: 'global', iranSpecific: false },
  };
}

function stop({ status = 'observed', incidents = [], coverageWarning = null } = {}) {
  return { ok: true, status, incidents, coverageWarning };
}

const incident = {
  id: 'stop-test',
  startDate: '2026-09-02',
  endDate: '2026-09-04',
  status: 'Ended',
  shutdownType: 'Internet shutdown',
  shutdownExtent: 'Localized',
  independentTechnicalVote: false,
};

test('Iran Tor transport observation overlapping a STOP incident becomes temporal context only', () => {
  const result = buildCircumventionIncidentContext({
    tor: tor({ rows: [{ date:'2026-09-03', low:100, high:140, frac:80 }] }),
    accessNow: stop({ incidents:[incident] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(result.status, 'observed');
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].relationship, 'temporal_overlap_only');
  assert.equal(result.links[0].causalInference, false);
  assert.equal(result.links[0].censorshipVerdict, null);
  assert.equal(result.links[0].low, 100);
  assert.equal(result.links[0].high, 140);
  assert.equal(result.links[0].exactUsers, null);
});

test('non-overlapping Tor transport observations create no incident link', () => {
  const result = buildCircumventionIncidentContext({
    tor: tor({ rows: [{ date:'2026-09-06', low:100, high:140, frac:80 }] }),
    accessNow: stop({ incidents:[incident] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(result.transportObservationCount, 1);
  assert.equal(result.temporalOverlapCount, 0);
  assert.deepEqual(result.links, []);
  assert.equal(result.linkedIncidentCount, 0);
});

test('ongoing incident without end date is bounded by the selected analysis window', () => {
  const result = buildCircumventionIncidentContext({
    tor: tor({ rows: [{ date:'2026-09-07', low:50, high:70, frac:70 }] }),
    accessNow: stop({ incidents:[{ ...incident, endDate:null, status:'ongoing', startDate:'2026-09-05' }] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].incidentEndDate, '2026-09-07');
});

test('BridgeDB global demand is explicitly excluded from Iran incident correlation', () => {
  const result = buildCircumventionIncidentContext({
    tor: tor({ rows: [{ date:'2026-09-03', low:10, high:20 }] }),
    accessNow: stop({ incidents:[incident] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(result.excludedContext.bridgeDbGlobal.excluded, true);
  assert.match(result.excludedContext.bridgeDbGlobal.reason, /global aggregates/i);
  assert.equal(result.sourceFamilies.includes('bridgedb'), false);
});

test('correlation policy can never add an independent vote, causal claim or national verdict', () => {
  const result = buildCircumventionIncidentContext({
    tor: tor({ rows: [{ date:'2026-09-03', low:10, high:20 }] }),
    accessNow: stop({ incidents:[incident] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(CIRCUMVENTION_CONTEXT_POLICY.independentCensorshipVote, false);
  assert.equal(result.independentCensorshipVote, false);
  assert.equal(result.technicalSourceFamiliesAdded, 0);
  assert.equal(result.causalInferenceAllowed, false);
  assert.equal(result.automatedCensorshipVerdict, null);
  assert.equal(result.nationalVerdict, null);
});

test('partial and no-data states are preserved instead of becoming evidence by correlation', () => {
  const partial = buildCircumventionIncidentContext({
    tor: tor({ status:'partial', rows:[{ date:'2026-09-03', low:10, high:20 }] }),
    accessNow: stop({ incidents:[incident] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(partial.status, 'partial');

  const noData = buildCircumventionIncidentContext({
    tor: tor({ status:'no_data', rows:[] }),
    accessNow: stop({ incidents:[incident] }),
    since: '2026-09-01',
    until: '2026-09-07',
  });
  assert.equal(noData.status, 'no_data');
  assert.equal(noData.links.length, 0);
});

test('source semantics fail closed if Tor or STOP is promoted to a technical censorship vote', () => {
  assert.throws(() => buildCircumventionIncidentContext({
    tor: { ...tor(), independentCensorshipVote:true },
    accessNow: stop(), since:'2026-09-01', until:'2026-09-07',
  }), /must not be an independent censorship vote/);

  assert.throws(() => buildCircumventionIncidentContext({
    tor: tor(),
    accessNow: stop({ incidents:[{ ...incident, independentTechnicalVote:true }] }),
    since:'2026-09-01', until:'2026-09-07',
  }), /must not be independent technical votes/);
});
