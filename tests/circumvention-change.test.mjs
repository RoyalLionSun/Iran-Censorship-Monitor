import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTorIncidentBoundChanges, classifyTorBoundChange, TOR_BOUND_CHANGE_POLICY } from '../lib/circumvention-change.mjs';

function tor(rows, status = 'observed') {
  return {
    ok: true,
    status,
    sourceFamily: 'tor',
    evidenceRole: 'circumvention-context',
    independentCensorshipVote: false,
    transports: [{ transport:'obfs4', rows }],
    bridgeDemandGlobal: { geographicScope:'global', iranSpecific:false },
  };
}

function stop(incidents, coverageWarning = null) {
  return { ok:true, status:incidents.length ? 'observed' : 'no_data', incidents, coverageWarning };
}

const incident = {
  id:'stop-1', startDate:'2026-09-05', endDate:'2026-09-06', status:'Ended',
  independentTechnicalVote:false,
};

test('non-overlapping Tor estimate bounds support increase direction without exact change', () => {
  const result = classifyTorBoundChange({ beforeLow:100, beforeHigh:120, afterLow:140, afterHigh:170 });
  assert.equal(result.state, 'increase_supported_by_nonoverlapping_bounds');
  assert.equal(result.exactChange, null);
  assert.equal(result.causalInference, false);
  assert.equal(result.censorshipVerdict, null);
});

test('non-overlapping Tor estimate bounds support decrease direction without exact change', () => {
  const result = classifyTorBoundChange({ beforeLow:140, beforeHigh:170, afterLow:100, afterHigh:120 });
  assert.equal(result.state, 'decrease_supported_by_nonoverlapping_bounds');
  assert.equal(result.exactChange, null);
});

test('overlapping or touching bounds remain indeterminate', () => {
  assert.equal(classifyTorBoundChange({ beforeLow:100, beforeHigh:140, afterLow:130, afterHigh:170 }).state, 'indeterminate_overlapping_bounds');
  assert.equal(classifyTorBoundChange({ beforeLow:100, beforeHigh:140, afterLow:140, afterHigh:170 }).state, 'indeterminate_overlapping_bounds');
});

test('incident comparison uses nearest bounded baseline and first bounded incident-window observation', () => {
  const result = buildTorIncidentBoundChanges({
    tor: tor([
      { date:'2026-09-01', low:80, high:100 },
      { date:'2026-09-04', low:100, high:120 },
      { date:'2026-09-05', low:140, high:160 },
      { date:'2026-09-06', low:150, high:170 },
    ]),
    accessNow: stop([incident]),
    since:'2026-09-01', until:'2026-09-07', baselineDays:7,
  });
  assert.equal(result.status, 'observed');
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].beforeDate, '2026-09-04');
  assert.equal(result.comparisons[0].duringDate, '2026-09-05');
  assert.equal(result.comparisons[0].changeState, 'increase_supported_by_nonoverlapping_bounds');
  assert.equal(result.comparisons[0].exactChange, null);
});

test('missing paired observation remains no_data rather than inventing a direction', () => {
  const result = buildTorIncidentBoundChanges({
    tor: tor([{ date:'2026-09-05', low:140, high:160 }]),
    accessNow: stop([incident]),
    since:'2026-09-01', until:'2026-09-07', baselineDays:3,
  });
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].beforeDate, null);
  assert.equal(result.comparisons[0].changeState, 'no_data');
  assert.equal(result.comparisons[0].exactChange, null);
});

test('bound-change policy excludes BridgeDB and cannot infer blocking, causality or a national verdict', () => {
  const result = buildTorIncidentBoundChanges({
    tor: tor([{ date:'2026-09-04', low:100, high:120 }, { date:'2026-09-05', low:140, high:160 }]),
    accessNow: stop([incident]),
    since:'2026-09-01', until:'2026-09-07',
  });
  assert.equal(result.excludedContext.bridgeDbGlobal, true);
  assert.equal(TOR_BOUND_CHANGE_POLICY.independentCensorshipVote, false);
  assert.equal(result.independentCensorshipVote, false);
  assert.equal(result.causalInferenceAllowed, false);
  assert.equal(result.intentionalBlockingInference, false);
  assert.equal(result.nationalVerdict, null);
});

test('partial upstream coverage stays partial and invalid source semantics fail closed', () => {
  const partial = buildTorIncidentBoundChanges({
    tor: tor([{ date:'2026-09-04', low:100, high:120 }, { date:'2026-09-05', low:140, high:160 }], 'partial'),
    accessNow: stop([incident]),
    since:'2026-09-01', until:'2026-09-07',
  });
  assert.equal(partial.status, 'partial');

  assert.throws(() => buildTorIncidentBoundChanges({
    tor: { ...tor([]), independentCensorshipVote:true }, accessNow: stop([]),
    since:'2026-09-01', until:'2026-09-07',
  }), /incompatible evidence semantics/);
});
