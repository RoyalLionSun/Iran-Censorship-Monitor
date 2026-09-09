import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OOKLA_OPEN_DATA_POLICY,
  buildOoklaQuarterObject,
  isCompletedOoklaQuarter,
  latestCompletedOoklaQuarter,
  ooklaIranAggregationReadiness,
} from '../lib/ookla.mjs';

test('Ookla object builder uses only the official public S3 naming contract', () => {
  const object = buildOoklaQuarterObject({
    year: 2024,
    quarter: 4,
    type: 'fixed',
    format: 'parquet',
    now: new Date('2026-09-09T00:00:00Z'),
  });
  assert.equal(object.periodStart, '2024-10-01');
  assert.equal(object.objectKey, 'parquet/performance/type=fixed/year=2024/quarter=4/2024-10-01_performance_fixed_tiles.parquet');
  assert.equal(object.s3Uri, 's3://ookla-open-data/parquet/performance/type=fixed/year=2024/quarter=4/2024-10-01_performance_fixed_tiles.parquet');
  assert.equal(object.httpsUrl, 'https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=fixed/year=2024/quarter=4/2024-10-01_performance_fixed_tiles.parquet');
});

test('Ookla object builder supports fixed/mobile and parquet/shapefiles but rejects arbitrary scope', () => {
  const mobile = buildOoklaQuarterObject({ year:2025, quarter:1, type:'mobile', format:'shapefiles', now:'2026-09-09T00:00:00Z' });
  assert.equal(mobile.httpsUrl.endsWith('/2025-01-01_performance_mobile_tiles.zip'), true);
  assert.throws(() => buildOoklaQuarterObject({ year:2025, quarter:5, type:'fixed', now:'2026-09-09T00:00:00Z' }), /quarter/);
  assert.throws(() => buildOoklaQuarterObject({ year:2025, quarter:1, type:'vpn', now:'2026-09-09T00:00:00Z' }), /fixed or mobile/);
  assert.throws(() => buildOoklaQuarterObject({ year:2025, quarter:1, type:'fixed', format:'json', now:'2026-09-09T00:00:00Z' }), /parquet or shapefiles/);
});

test('Ookla contract refuses incomplete-quarter publication and resolves latest completed quarter', () => {
  const now = new Date('2026-09-09T12:00:00Z');
  assert.equal(isCompletedOoklaQuarter({ year:2026, quarter:2, now }), true);
  assert.equal(isCompletedOoklaQuarter({ year:2026, quarter:3, now }), false);
  assert.deepEqual(latestCompletedOoklaQuarter(now), { year:2026, quarter:2 });
  assert.throws(() => buildOoklaQuarterObject({ year:2026, quarter:3, type:'mobile', now }), /not complete/);
});

test('Ookla Open Data is performance context and cannot become censorship or throttling proof', () => {
  assert.equal(OOKLA_OPEN_DATA_POLICY.evidenceRole, 'performance-context');
  assert.equal(OOKLA_OPEN_DATA_POLICY.independentCensorshipVote, false);
  assert.equal(OOKLA_OPEN_DATA_POLICY.intentionalThrottlingInference, false);
  assert.equal(OOKLA_OPEN_DATA_POLICY.rawTilePublicationAllowed, false);
  assert.equal(OOKLA_OPEN_DATA_POLICY.provincePublicationAllowed, false);
  assert.equal(OOKLA_OPEN_DATA_POLICY.individualLocationPublicationAllowed, false);
  assert.equal(OOKLA_OPEN_DATA_POLICY.dashboardPublicationAllowed, false);
});

test('Ookla Iran readiness never fabricates ingestion or dashboard publication', () => {
  const missing = ooklaIranAggregationReadiness();
  assert.equal(missing.repositoryContractReady, false);
  assert.deepEqual(missing.missing, ['deterministic_country_filter', 'bounded_processing', 'aggregate_only_output']);

  const contract = ooklaIranAggregationReadiness({ deterministicCountryFilter:true, boundedProcessing:true, aggregateOnly:true });
  assert.equal(contract.repositoryContractReady, true);
  assert.equal(contract.ingestionImplemented, false);
  assert.equal(contract.dashboardPublicationAllowed, false);
  assert.equal(contract.independentCensorshipVote, false);
  assert.equal(contract.intentionalThrottlingInference, false);
});
