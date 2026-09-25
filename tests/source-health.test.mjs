import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceHealth, PUBLIC_SOURCE_CONTRACT } from '../lib/source-health.mjs';

function completePayloads() {
  return Object.fromEntries(PUBLIC_SOURCE_CONTRACT.map(({ id }) => [id, { ok: true, status: 'observed' }]));
}

test('public source-health contract contains the 16 live adapters the Overview asks', () => {
  assert.equal(PUBLIC_SOURCE_CONTRACT.length, 16);
  assert.deepEqual(PUBLIC_SOURCE_CONTRACT.map((row) => row.id), [
    'ooni', 'ripe', 'radar', 'ioda', 'tor', 'mlab', 'apnic', 'ripestat', 'globalping', 'censoredPlanet', 'peeringdb', 'ihr', 'asrank', 'rpki', 'pulse', 'psiphon',
  ]);
});

test('no_data and partial are reachable adapter states, not source failures', () => {
  const payloads = completePayloads();
  payloads.ooni = { ok: true, totalMeasurements: 0 };
  payloads.ripe = { ok: true, status: 'no_data' };
  payloads.censoredPlanet = { ok: true, status: 'partial' };
  const health = buildSourceHealth(payloads);
  assert.equal(health.summary.totalContract, 16);
  assert.equal(health.summary.queried, 16);
  assert.equal(health.summary.reachable, 16);
  assert.equal(health.summary.errors, 0);
  assert.equal(health.summary.noData, 2);
  assert.equal(health.summary.partial, 1);
});

test('scope_required is not queried and does not reduce adapter reachability', () => {
  const payloads = completePayloads();
  for (const id of ['ripestat', 'peeringdb', 'ihr', 'asrank', 'rpki']) payloads[id] = { ok: true, status: 'scope_required' };
  const health = buildSourceHealth(payloads);
  assert.equal(health.summary.totalContract, 16);
  assert.equal(health.summary.scopeRequired, 5);
  assert.equal(health.summary.queried, 11);
  assert.equal(health.summary.reachable, 11);
  assert.equal(health.summary.errors, 0);
});

test('real adapter errors are counted separately and preserve detail', () => {
  const payloads = completePayloads();
  payloads.ioda = { ok: false, status: 'error', error: 'upstream timeout' };
  const health = buildSourceHealth(payloads);
  assert.equal(health.summary.queried, 16);
  assert.equal(health.summary.reachable, 15);
  assert.equal(health.summary.errors, 1);
  const ioda = health.families.find((row) => row.id === 'ioda');
  assert.equal(ioda.state, 'error');
  assert.equal(ioda.error, 'upstream timeout');
});

test('the register counts entries the way the source register shows them', async () => {
  const { readFile } = await import('node:fs/promises');
  const payloads = completePayloads();
  for (const id of ['ripestat', 'peeringdb', 'ihr', 'asrank', 'rpki']) payloads[id] = { ok: true, status: 'scope_required' };
  payloads.ioda = { ok: true, status: 'stale', staleSince: '2026-09-25T08:00:00Z' };
  const health = buildSourceHealth(payloads);
  // RIPEstat and its RPKI check are one entry in the register.
  assert.equal(health.register.entries.length, 15);
  assert.equal(health.register.scopeRequired, 4);
  assert.equal(health.register.queried, 11);
  assert.equal(health.register.reachable, 10);
  assert.equal(health.register.errors, 1);
  assert.match(health.register.entries.find((row) => row.id === 'ioda').error, /2026-09-25/);
  // A missing Radar token is not a failure and not a query.
  const noToken = buildSourceHealth({ ...completePayloads(), radar: { ok: true, status: 'token_required' } });
  assert.equal(noToken.register.notConfigured, 1);
  assert.equal(noToken.register.errors, 0);
  // Every register id used here exists in the source register the page shows.
  const register = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8')).map((row) => row.id);
  for (const id of new Set(PUBLIC_SOURCE_CONTRACT.map((row) => row.register))) assert.ok(register.includes(id), `register entry ${id}`);
});
