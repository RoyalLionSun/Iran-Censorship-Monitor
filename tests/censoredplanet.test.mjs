import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCensoredPlanetRequest, parseCensoredPlanet } from '../lib/censoredplanet.mjs';

test('Censored Planet GraphQL request uses the IR country code and selected date range', () => {
  const body = buildCensoredPlanetRequest({ since:'2026-09-01', until:'2026-09-08' });
  assert.equal(body.variables.country, 'IR');
  assert.deepEqual(body.variables.range, { startDate:'2026-09-01', endDate:'2026-09-08' });
  assert.match(body.query, /cenalertEvents/);
  assert.match(body.query, /interferenceRateByCountry/);
});

test('Censored Planet parser keeps partial GraphQL errors visible', () => {
  const parsed = parseCensoredPlanet({
    data:{ interferenceRateByCountry:[{country:'Iran',unexpectedRate:12.5}], cenalertTimeseries:[{country:'Iran',date:'2026-09-08',value:0.7}], cenalertEvents:[] },
    errors:[{message:'partial field failure'}],
  });
  assert.equal(parsed.iranUnexpectedRate, 12.5);
  assert.equal(parsed.timeseries.length, 1);
  assert.deepEqual(parsed.partialErrors, ['partial field failure']);
});
