import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildIranAsnInventoryUrl,
  buildIranAsnRoutingSummaryUrl,
  compareCuratedAsnCoverage,
  parseIranAsnInventory,
  parseIranAsnRoutingSummary
} from '../lib/iran-asn-inventory.mjs';

const profiles = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
const byAsn = new Map(profiles.map((profile) => [profile.asn, profile]));

function profile(asn) {
  const value = byAsn.get(asn);
  assert.ok(value, `${asn} must exist in curated profiles`);
  return value;
}

test('Fanap Telecom ASNs are grouped as one operator family', () => {
  assert.equal(profile('AS206065').asName, 'FDI');
  assert.equal(profile('AS24631').asName, 'FANAPTELECOM-FCP');
  assert.equal(profile('AS206065').orgId, 'ORG-PNEV1-RIPE');
  assert.equal(profile('AS24631').orgId, 'ORG-PNEV1-RIPE');
  assert.equal(profile('AS206065').operatorFamily, 'fanap-telecom');
  assert.equal(profile('AS24631').operatorFamily, 'fanap-telecom');
  assert.ok(profile('AS206065').aliases.includes('ZiTEL'));
  assert.equal(profile('AS206065').providerComparison, true);
  assert.equal(profile('AS24631').providerComparison, false);
  assert.equal(profile('AS206065').independentCensorshipVote, false);
  assert.equal(profile('AS24631').independentCensorshipVote, false);
});

test('Iran inventory parser normalizes, deduplicates and numerically sorts RIR ASNs', () => {
  const inventory = parseIranAsnInventory({ data: { resource: 'IR', query_time: '2026-09-09T00:00:00', resources: { asn: ['206065', 24631, 'AS24631', 58224] } } });
  assert.deepEqual(inventory.asns, ['AS24631', 'AS58224', 'AS206065']);
  assert.equal(inventory.total, 3);
  assert.equal(inventory.sourceBasis, 'RIR Statistics files');
  assert.equal(inventory.independentCensorshipVote, false);
});

test('Iran inventory parser accepts live RIPEstat 0.2 shape when resource echo is omitted', () => {
  const inventory = parseIranAsnInventory({ data: { query_time: '2026-09-09T00:00:00', resources: { asn: ['1756', '58224'] } } });
  assert.deepEqual(inventory.asns, ['AS1756', 'AS58224']);
  assert.equal(inventory.country, 'IR');
  assert.equal(inventory.queryTime, '2026-09-09T00:00:00');
  assert.equal(inventory.independentCensorshipVote, false);
});

test('Iran inventory parser fails closed on wrong explicit country or missing ASN list', () => {
  assert.throws(() => parseIranAsnInventory({ data: { resource: 'DE', resources: { asn: [] } } }), /not scoped to IR/);
  assert.throws(() => parseIranAsnInventory({ data: { resource: 'IR', resources: {} } }), /resources\.asn/);
  assert.throws(() => parseIranAsnInventory({}), /missing data/);
});

test('curated coverage remains distinct from the complete RIR-associated inventory', () => {
  const coverage = compareCuratedAsnCoverage({ asns: ['AS24631', 'AS58224', 'AS202798', 'AS206065'] }, [{ asn: 'AS58224' }, { asn: 'AS206065' }]);
  assert.equal(coverage.inventoryCount, 4);
  assert.equal(coverage.curatedCount, 2);
  assert.deepEqual(coverage.curatedOutsideInventory, []);
  assert.deepEqual(coverage.uncuratedAsns, ['AS24631', 'AS202798']);
});

test('coverage exposes curated ASNs that drift outside the current RIR country inventory', () => {
  const coverage = compareCuratedAsnCoverage({ asns: ['AS58224'] }, [{ asn: 'AS58224' }, { asn: 'AS35718' }]);
  assert.deepEqual(coverage.curatedOutsideInventory, ['AS35718']);
});

test('inventory URL is explicitly IR-scoped and identifies the application', () => {
  const url = new URL(buildIranAsnInventoryUrl());
  assert.equal(url.origin, 'https://stat.ripe.net');
  assert.equal(url.pathname, '/data/country-resource-list/data.json');
  assert.equal(url.searchParams.get('resource'), 'IR');
  assert.equal(url.searchParams.get('sourceapp'), 'iran-censorship-monitor');
});

test('Country ASNs parser preserves registered-vs-routed count semantics', () => {
  const summary = parseIranAsnRoutingSummary({
    data: {
      countries: [{ resource: 'IR', stats: { registered: 100, routed: 80 } }],
      resource: ['IR'],
      query_time: '2026-09-09T16:00:00',
      latest_time: '2026-09-09T16:00:00',
      lod: ['0']
    }
  });
  assert.deepEqual(summary, {
    country: 'IR',
    queryTime: '2026-09-09T16:00:00',
    latestTime: '2026-09-09T16:00:00',
    registeredCount: 100,
    routedCount: 80,
    registeredMinusRouted: 20,
    detailLevel: ['0'],
    source: 'RIPEstat Country ASNs',
    registrationBasis: 'public RIR registration information',
    routingBasis: 'RIPE RIS',
    evidenceRole: 'scope-routing-summary',
    independentCensorshipVote: false,
    note: 'These are country-level counts, not an ASN-by-ASN classification. A routed count is control-plane visibility in RIPE RIS and is not proof of end-user reachability.'
  });
});

test('Country ASNs parser fails closed on wrong scope, missing stats or invalid counts', () => {
  assert.throws(() => parseIranAsnRoutingSummary({ data: { countries: [{ resource: 'DE', stats: { registered: 1, routed: 1 } }] } }), /not scoped to IR/);
  assert.throws(() => parseIranAsnRoutingSummary({ data: { countries: [{ resource: 'IR' }] } }), /missing country stats/);
  assert.throws(() => parseIranAsnRoutingSummary({ data: { countries: [{ resource: 'IR', stats: { registered: -1, routed: 1 } }] } }), /invalid registered ASN count/);
  assert.throws(() => parseIranAsnRoutingSummary({ data: { countries: [{ resource: 'IR', stats: { registered: 1, routed: 'many' } }] } }), /invalid routed ASN count/);
  for (const invalid of [null, undefined, '', '   ', false]) {
    assert.throws(() => parseIranAsnRoutingSummary({ data: { countries: [{ resource: 'IR', stats: { registered: invalid, routed: 1 } }] } }), /invalid registered ASN count/);
  }
});

test('Country ASNs URL requests only documented count detail and is IR-scoped', () => {
  const url = new URL(buildIranAsnRoutingSummaryUrl({ queryTime: '2026-09-09T16:00:00Z' }));
  assert.equal(url.origin, 'https://stat.ripe.net');
  assert.equal(url.pathname, '/data/country-asns/data.json');
  assert.equal(url.searchParams.get('resource'), 'IR');
  assert.equal(url.searchParams.get('lod'), '0');
  assert.equal(url.searchParams.get('sourceapp'), 'iran-censorship-monitor');
  assert.equal(url.searchParams.get('query_time'), '2026-09-09T16:00:00Z');
});
