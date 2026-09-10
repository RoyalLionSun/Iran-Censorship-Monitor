import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildIranAsnCandidateQueue,
  enrichIranAsnInventory,
  getIpverseAsMetadata,
  parseIpverseAsMetadata
} from '../lib/ipverse-as-metadata.mjs';

function raw(asn, {
  countryCode = 'IR',
  category = null,
  networkRole = null,
  lastAnnounced = null,
  reach = 0,
  customers = 0,
  degree = 0,
  ipv4Prefixes = 0,
  ipv6Prefixes = 0,
  origin = 'authoritative'
} = {}) {
  return {
    asn,
    metadata: {
      handle: `AS-${asn}`,
      description: `Network ${asn}`,
      countryCode,
      country: countryCode === 'IR' ? 'Iran' : 'Example',
      origin,
      category,
      networkRole,
      registered: '2020-01-01',
      lastModified: '2026-09-01'
    },
    stats: {
      ipv4: { prefixes: ipv4Prefixes, prefixesAggregated: ipv4Prefixes },
      ipv6: { prefixes: ipv6Prefixes, prefixesAggregated: ipv6Prefixes },
      connectivity: { providers: 1, providerAsns: [1299], customers, peers: 2, degree, reach },
      prefixesLastModified: '2026-09-02'
    },
    lastAnnounced
  };
}

test('ipverse parser filters before validating unrelated world entries and normalizes selected metadata', () => {
  const entries = parseIpverseAsMetadata([
    { asn: 'broken', metadata: null },
    raw(58224, { category: 'isp', networkRole: 'access_provider', lastAnnounced: '2026-09-09', reach: 7, customers: 2, degree: 8, ipv4Prefixes: 4 })
  ], { asnFilter: ['AS58224'] });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].asn, 'AS58224');
  assert.equal(entries[0].countryCode, 'IR');
  assert.equal(entries[0].providerAsns[0], 'AS1299');
  assert.equal(entries[0].ipv4Prefixes, 4);
  assert.equal(entries[0].reach, 7);
});

test('ipverse parser fails closed when a selected ASN has malformed metadata', () => {
  assert.throws(
    () => parseIpverseAsMetadata([{ asn: 58224, metadata: null }], { asnFilter: ['AS58224'] }),
    /missing metadata object/
  );
  assert.throws(
    () => parseIpverseAsMetadata([raw(58224, { lastAnnounced: '2026-99-99' })], { asnFilter: ['AS58224'] }),
    /invalid lastAnnounced/
  );
  const invalidBoolean = raw(58224);
  invalidBoolean.stats.connectivity.degree = false;
  assert.throws(
    () => parseIpverseAsMetadata([invalidBoolean], { asnFilter: ['AS58224'] }),
    /invalid degree/
  );
});

test('ipverse parser rejects duplicate selected ASNs', () => {
  assert.throws(
    () => parseIpverseAsMetadata([raw(58224), raw(58224)], { asnFilter: ['AS58224'] }),
    /duplicate AS58224/
  );
});

test('enrichment keeps RIPE inventory authoritative and exposes secondary quality disagreements', () => {
  const inventory = { asns: ['AS1', 'AS2', 'AS3', 'AS4'] };
  const secondary = parseIpverseAsMetadata([
    raw(1, { countryCode: 'DE', networkRole: 'major_transit' }),
    raw(2, { category: 'isp', networkRole: 'access_provider' }),
    raw(3, { category: 'hosting', networkRole: 'content_network' }),
    raw(999, { countryCode: 'IR' })
  ]);
  const enrichment = enrichIranAsnInventory(inventory, [{ asn: 'AS2', name: 'Reviewed ISP', operatorFamily: 'reviewed' }], secondary);
  assert.equal(enrichment.inventoryCount, 4);
  assert.equal(enrichment.curatedCount, 1);
  assert.equal(enrichment.secondaryCoverageCount, 3);
  assert.equal(enrichment.secondaryMissingCount, 1);
  assert.equal(enrichment.secondaryCountryMismatchCount, 1);
  assert.deepEqual(enrichment.secondaryOutsideInventoryAsns, ['AS999']);
  assert.equal(enrichment.records.find((record) => record.asn === 'AS1').candidateClass, 'transit_core_review');
  assert.equal(enrichment.records.find((record) => record.asn === 'AS2').candidateClass, 'curated');
  assert.equal(enrichment.records.find((record) => record.asn === 'AS3').candidateClass, 'strategic_service_review');
  assert.equal(enrichment.records.find((record) => record.asn === 'AS4').candidateClass, 'long_tail_review');
  assert.equal(enrichment.independentCensorshipVote, false);
});

test('candidate queue excludes curated ASNs and sorts by transparent class then topology metadata', () => {
  const inventory = { asns: ['AS1', 'AS2', 'AS3', 'AS4', 'AS5', 'AS6'] };
  const secondary = parseIpverseAsMetadata([
    raw(1, { networkRole: 'major_transit', lastAnnounced: '2026-09-01', reach: 10 }),
    raw(2, { networkRole: 'access_provider', lastAnnounced: '2026-09-09', reach: 100 }),
    raw(3, { category: 'hosting', lastAnnounced: '2026-09-09', reach: 500 }),
    raw(4, { lastAnnounced: '2026-09-08', reach: 2 }),
    raw(5, { lastAnnounced: '2026-09-09', reach: 1 }),
    raw(6, { networkRole: 'major_transit', lastAnnounced: '2026-09-09', reach: 1 })
  ]);
  const enrichment = enrichIranAsnInventory(inventory, [{ asn: 'AS6', name: 'Already reviewed' }], secondary);
  const queue = buildIranAsnCandidateQueue(enrichment, { limit: 5 });
  assert.deepEqual(queue.map((record) => record.asn), ['AS1', 'AS2', 'AS3', 'AS5', 'AS4']);
  assert.ok(queue[0].priorityReasons.includes('class:transit_core_review'));
  assert.equal(queue.every((record) => record.curated === false), true);
});

test('ipverse live fetch is byte bounded, hash anchored and filtered to the requested inventory', async () => {
  const text = JSON.stringify([raw(58224), raw(999)]);
  const result = await getIpverseAsMetadata({
    asnFilter: ['AS58224'],
    maxBytes: 10_000,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      text: async () => text
    })
  });
  assert.equal(result.source, 'ipverse/as-metadata');
  assert.equal(result.sourceLicense, 'CC0-1.0');
  assert.equal(result.sha256, createHash('sha256').update(text).digest('hex'));
  assert.deepEqual(result.entries.map((entry) => entry.asn), ['AS58224']);
  assert.equal(result.independentCensorshipVote, false);

  await assert.rejects(
    () => getIpverseAsMetadata({
      maxBytes: 5,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => String(text.length) },
        body: null,
        text: async () => text
      })
    }),
    /safety cap/
  );
});
