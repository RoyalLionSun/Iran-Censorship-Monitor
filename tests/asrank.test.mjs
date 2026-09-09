import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAsRankUrls, parseAsRankLinks, parseAsRankOverview } from '../lib/asrank.mjs';

test('CAIDA ASRank URLs are scoped to the selected ASN only', () => {
  const urls = buildAsRankUrls('AS58224');
  assert.equal(urls.asn, 'AS58224');
  assert.match(urls.overview, /\/asns\/58224$/);
  assert.match(urls.links, /\/asns\/58224\/links\?page_size=100$/);
  assert.throws(() => buildAsRankUrls('ALL'), /selected ASN/);
});

test('ASRank overview preserves rank, cone, degree and organization context', () => {
  const parsed = parseAsRankOverview({ data: {
    id: '58224', name: 'TCI', rank: '500', country: 'IR', country_name: 'Iran', source: 'RIPE', clique: 'false',
    org: { id: 'ORG-TCI', name: 'Fixture Org' },
    cone: { asns: 12, prefixes: 34, addresses: 5678 },
    degree: { globals: '9', peers: 2, siblings: 1, customers: 5, transits: 3 },
  } });
  assert.equal(parsed.asn, 'AS58224');
  assert.equal(parsed.rank, 500);
  assert.equal(parsed.customerCone.asns, 12);
  assert.equal(parsed.degree.transits, 3);
  assert.equal(parsed.organization.name, 'Fixture Org');
  assert.equal(parsed.clique, false);
});

test('ASRank link parser preserves raw relationship labels and bounds output', () => {
  const parsed = parseAsRankLinks({ data: [
    { relationship: 'provider', asn: 12880, paths: 4, locations: ['IR'] },
    { relationship: 'peer', asn: 3491, paths: 20, locations: ['DE', 'NL'] },
    { relationship: 'customer', asn: 12345, paths: 1 },
  ] }, 2);
  assert.deepEqual(parsed.map((row) => row.asn), ['AS3491', 'AS12880']);
  assert.equal(parsed[0].relationship, 'peer');
  assert.deepEqual(parsed[0].locations, ['DE', 'NL']);
});
