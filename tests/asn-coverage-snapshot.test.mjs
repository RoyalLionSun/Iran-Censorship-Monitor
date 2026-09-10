import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ASN_COVERAGE_MAX_CANDIDATES,
  buildAsnCoverageSnapshot,
  parseAsnCoverageSnapshot,
  readAsnCoverageSnapshot,
  writeAsnCoverageSnapshot,
} from '../lib/asn-coverage-snapshot.mjs';

function fixture() {
  return buildAsnCoverageSnapshot({
    generatedAt: '2026-09-10T10:00:00.000Z',
    inventory: {
      total: 854,
      queryTime: '2026-09-10T00:00:00.000Z',
      source: 'RIPEstat Country Resource List',
      sourceUrl: 'https://stat.ripe.net/data/country-resource-list/data.json?resource=IR',
      sourceBasis: 'RIR Statistics files',
    },
    routingSummary: {
      registeredCount: 854,
      routedCount: 742,
      registeredMinusRouted: 112,
      queryTime: '2026-09-10T00:00:00.000Z',
      latestTime: '2026-09-10T08:00:00.000Z',
      source: 'RIPEstat Country ASNs',
      sourceUrl: 'https://stat.ripe.net/data/country-asns/data.json?resource=IR&lod=0',
      routingBasis: 'RIPE RIS',
    },
    curatedCoverage: {
      inventoryCount: 854,
      curatedCount: 23,
      curatedInInventoryCount: 23,
      curatedOutsideInventory: [],
      uncuratedCount: 831,
    },
    secondaryMetadata: {
      source: 'ipverse/as-metadata',
      sourceUrl: 'https://raw.githubusercontent.com/ipverse/as-metadata/master/as.json',
      sourceLicense: 'CC0-1.0',
      fetchedAt: '2026-09-10T09:59:00.000Z',
      sha256: 'a'.repeat(64),
      matchedInventoryAsnCount: 850,
    },
    enrichment: {
      secondaryCoverageCount: 850,
      secondaryMissingCount: 4,
      secondaryCountryMismatchCount: 2,
      candidateClassCounts: { curated: 23, transit_core_review: 4, access_review: 100, topology_observed_review: 727 },
    },
    candidateQueue: [{
      asn: 'AS12345',
      displayName: 'Fixture Network',
      operatorFamily: null,
      candidateClass: 'access_review',
      priorityReasons: ['class:access_review', 'network_role:access_provider'],
      quality: { secondaryMetadataMissing: false, secondaryCountryMismatch: false, secondaryCountryCode: 'IR', secondaryOrigin: 'RIPE' },
      secondary: {
        handle: 'FIXTURE-AS', description: 'Fixture Network', countryCode: 'IR', category: 'isp', networkRole: 'access_provider',
        lastAnnounced: '2026-09-09', ipv4Prefixes: 8, ipv6Prefixes: 1, providers: 2, customers: 3, peers: 4, degree: 9, reach: 12,
      },
      independentCensorshipVote: false,
    }],
  });
}

test('builds a bounded reduced snapshot without full enrichment records', () => {
  const snapshot = fixture();
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.country, 'IR');
  assert.equal(snapshot.curatedCoverage.coveragePercent, 2.69);
  assert.equal(snapshot.candidateQueue.length, 1);
  assert.equal('records' in snapshot.enrichment, false);
  assert.equal(snapshot.independentCensorshipVote, false);
});

test('parses a fresh snapshot as observed', () => {
  const parsed = parseAsnCoverageSnapshot(fixture(), { now: '2026-09-10T11:00:00Z', maxAgeHours: 24 });
  assert.equal(parsed.status, 'observed');
  assert.equal(parsed.ageHours, 1);
  assert.equal(parsed.inventory.total, 854);
  assert.equal(parsed.routingSummary.routedCount, 742);
});

test('marks an old but valid snapshot stale instead of inventing current coverage', () => {
  const parsed = parseAsnCoverageSnapshot(fixture(), { now: '2026-09-18T11:00:00Z', maxAgeHours: 168 });
  assert.equal(parsed.status, 'stale');
  assert.equal(parsed.independentCensorshipVote, false);
});

test('fails closed on inconsistent coverage counts and non-zero-vote semantics', () => {
  const badCounts = fixture();
  badCounts.curatedCoverage.uncuratedCount = 1;
  assert.throws(() => parseAsnCoverageSnapshot(badCounts), /uncuratedCount is inconsistent/);
  const badVote = fixture();
  badVote.independentCensorshipVote = true;
  assert.throws(() => parseAsnCoverageSnapshot(badVote), /independentCensorshipVote must be false/);
});

test('rejects unsupported country, schema and future timestamps', () => {
  const wrongCountry = fixture();
  wrongCountry.country = 'US';
  assert.throws(() => parseAsnCoverageSnapshot(wrongCountry), /country must be IR/);
  const wrongSchema = fixture();
  wrongSchema.schemaVersion = 2;
  assert.throws(() => parseAsnCoverageSnapshot(wrongSchema), /Unsupported ASN coverage snapshot schemaVersion/);
  assert.throws(() => parseAsnCoverageSnapshot(fixture(), { now: '2026-09-10T09:00:00Z' }), /unexpectedly in the future/);
});

test('rejects oversized or duplicate candidate queues', () => {
  const oversized = fixture();
  oversized.candidateQueue = Array.from({ length: ASN_COVERAGE_MAX_CANDIDATES + 1 }, (_, i) => ({ ...oversized.candidateQueue[0], asn: `AS${10000 + i}` }));
  assert.throws(() => parseAsnCoverageSnapshot(oversized), /candidateQueue exceeds/);
  const duplicate = fixture();
  duplicate.candidateQueue.push(structuredClone(duplicate.candidateQueue[0]));
  assert.throws(() => parseAsnCoverageSnapshot(duplicate), /duplicate AS12345/);
});

test('missing snapshot is explicit no_data, not zero Iran ASNs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asn-coverage-'));
  try {
    const result = await readAsnCoverageSnapshot({ path: join(dir, 'missing.json') });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'no_data');
    assert.equal(result.inventory, undefined);
    assert.deepEqual(result.candidateQueue, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('malformed persisted snapshot becomes explicit error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asn-coverage-'));
  try {
    const path = join(dir, 'latest.json');
    await writeFile(path, '{broken', 'utf8');
    const result = await readAsnCoverageSnapshot({ path });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'error');
    assert.match(result.error, /invalid JSON/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('writer persists a normalized snapshot atomically enough for a clean round trip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asn-coverage-'));
  try {
    const path = join(dir, 'latest.json');
    await writeAsnCoverageSnapshot(path, fixture());
    const raw = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(raw.schemaVersion, 1);
    assert.equal(raw.candidateQueue[0].asn, 'AS12345');
    const result = await readAsnCoverageSnapshot({ path, now: '2026-09-10T11:00:00Z' });
    assert.equal(result.status, 'observed');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
