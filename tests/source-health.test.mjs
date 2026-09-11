import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceHealth, PUBLIC_SOURCE_CONTRACT } from '../lib/source-health.mjs';

function completePayloads() {
  return Object.fromEntries(PUBLIC_SOURCE_CONTRACT.map(({ id }) => [id, { ok: true, status: 'observed' }]));
}

test('public source-health contract contains the 13 reviewed live adapters', () => {
  assert.equal(PUBLIC_SOURCE_CONTRACT.length, 13);
  assert.deepEqual(PUBLIC_SOURCE_CONTRACT.map((row) => row.id), [
    'ooni', 'ripe', 'ioda', 'tor', 'mlab', 'apnic', 'ripestat', 'globalping', 'censoredPlanet', 'peeringdb', 'ihr', 'asrank', 'rpki',
  ]);
});

test('no_data and partial are reachable adapter states, not source failures', () => {
  const payloads = completePayloads();
  payloads.ooni = { ok: true, totalMeasurements: 0 };
  payloads.ripe = { ok: true, status: 'no_data' };
  payloads.censoredPlanet = { ok: true, status: 'partial' };
  const health = buildSourceHealth(payloads);
  assert.equal(health.summary.totalContract, 13);
  assert.equal(health.summary.queried, 13);
  assert.equal(health.summary.reachable, 13);
  assert.equal(health.summary.errors, 0);
  assert.equal(health.summary.noData, 2);
  assert.equal(health.summary.partial, 1);
});

test('scope_required is not queried and does not reduce adapter reachability', () => {
  const payloads = completePayloads();
  for (const id of ['ripestat', 'peeringdb', 'ihr', 'asrank', 'rpki']) payloads[id] = { ok: true, status: 'scope_required' };
  const health = buildSourceHealth(payloads);
  assert.equal(health.summary.totalContract, 13);
  assert.equal(health.summary.scopeRequired, 5);
  assert.equal(health.summary.queried, 8);
  assert.equal(health.summary.reachable, 8);
  assert.equal(health.summary.errors, 0);
});

test('real adapter errors are counted separately and preserve detail', () => {
  const payloads = completePayloads();
  payloads.ioda = { ok: false, status: 'error', error: 'upstream timeout' };
  const health = buildSourceHealth(payloads);
  assert.equal(health.summary.queried, 13);
  assert.equal(health.summary.reachable, 12);
  assert.equal(health.summary.errors, 1);
  const ioda = health.families.find((row) => row.id === 'ioda');
  assert.equal(ioda.state, 'error');
  assert.equal(ioda.error, 'upstream timeout');
});
