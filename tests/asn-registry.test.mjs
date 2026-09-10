import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRipeDatabaseAutNumUrl, compareAsnIdentity, getAsnRegistryIdentity, parseRipeDatabaseAutNum } from '../lib/asn-registry.mjs';

const profiles = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
const byAsn = new Map(profiles.map((profile) => [profile.asn, profile]));

function profile(asn) {
  const value = byAsn.get(asn);
  assert.ok(value, `${asn} must exist in curated profiles`);
  return value;
}

function ripeAutNumPayload({ asn = 'AS31549', asName = 'RASANA', orgId = 'ORG-ART1-RIPE', status = 'ASSIGNED' } = {}) {
  return {
    objects: {
      object: [{
        type: 'aut-num',
        source: { id: 'ripe' },
        'primary-key': { attribute: [{ name: 'aut-num', value: asn }] },
        attributes: {
          attribute: [
            { name: 'aut-num', value: asn },
            { name: 'as-name', value: asName },
            { name: 'org', value: orgId },
            { name: 'status', value: status },
            { name: 'created', value: '2002-09-19T00:00:00Z' },
            { name: 'last-modified', value: '2026-09-01T00:00:00Z' },
            { name: 'source', value: 'RIPE' }
          ]
        }
      }]
    }
  };
}

test('known non-Iran AS35718 is excluded from curated Iran scope', () => {
  assert.equal(byAsn.has('AS35718'), false);
});

test('known stale labels are corrected against registry identities', () => {
  assert.equal(profile('AS31549').name, 'Shatel');
  assert.equal(profile('AS31549').asName, 'RASANA');
  assert.equal(profile('AS43754').name, 'Asiatech');
  assert.equal(profile('AS43754').asName, 'ASIATECH');
  assert.equal(profile('AS12880').asName, 'DCI-AS');
  assert.equal(profile('AS12880').registryName, 'Iran Information Technology Company PJSC');
});

test('TCI and TIC naming collision is explicit rather than collapsed', () => {
  assert.equal(profile('AS58224').orgId, 'ORG-ITCP1-RIPE');
  assert.equal(profile('AS49666').orgId, 'ORG-TIC4-RIPE');
  assert.equal(profile('AS48159').orgId, 'ORG-TIC4-RIPE');
  assert.notEqual(profile('AS58224').operatorFamily, profile('AS49666').operatorFamily);
});

test('related gateway and operator ASNs stay in one family and zero-vote', () => {
  assert.equal(profile('AS49666').operatorFamily, 'tic-zirsakht');
  assert.equal(profile('AS48159').operatorFamily, 'tic-zirsakht');
  assert.equal(profile('AS31549').operatorFamily, profile('AS34369').operatorFamily);
  assert.equal(profile('AS43754').operatorFamily, profile('AS41689').operatorFamily);
  assert.equal(profile('AS43754').operatorFamily, profile('AS60077').operatorFamily);
  assert.equal(profile('AS206065').operatorFamily, profile('AS24631').operatorFamily);
  for (const item of profiles) assert.equal(item.independentCensorshipVote, false, item.asn);
});

test('current legal registry names and operational aliases are both preserved', () => {
  assert.equal(profile('AS16322').registryName, 'Parsan Lin Co. PJS');
  assert.ok(profile('AS16322').aliases.includes('Pars Online'));
  assert.equal(profile('AS39501').registryName, 'Parvaresh Dadeha Co. Private Joint Stock');
  assert.ok(profile('AS39501').aliases.includes('Sabanet'));
  assert.ok(profile('AS39501').aliases.includes('Neda Gostar Saba'));
  assert.ok(profile('AS206065').aliases.includes('ZiTEL'));
});

test('provider comparison is an explicit reviewed ASN set', () => {
  const selected = profiles
    .filter((item) => item.providerComparison === true)
    .map((item) => item.asn)
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  assert.deepEqual(selected, [
    'AS16322',
    'AS31549',
    'AS39501',
    'AS43754',
    'AS44244',
    'AS49100',
    'AS50810',
    'AS57218',
    'AS58224',
    'AS197207',
    'AS206065'
  ]);
  assert.equal(profile('AS24631').providerComparison, false);
  for (const asn of ['AS12880', 'AS49666', 'AS48159', 'AS6736', 'AS60077', 'AS202468']) {
    assert.equal(profile(asn).providerComparison, false, asn);
  }
});

test('RIPE Database REST parser extracts authoritative aut-num hard keys', () => {
  const parsed = parseRipeDatabaseAutNum(ripeAutNumPayload(), 'AS31549');
  assert.deepEqual(parsed, {
    asn: 'AS31549',
    asName: 'RASANA',
    orgId: 'ORG-ART1-RIPE',
    registryName: null,
    country: null,
    authority: 'ripe',
    registrySource: 'RIPE',
    recordScope: 'ripe-database-aut-num',
    registryStatus: 'ASSIGNED',
    created: '2002-09-19T00:00:00Z',
    lastModified: '2026-09-01T00:00:00Z',
    found: true
  });
  assert.equal(compareAsnIdentity(profile('AS31549'), parsed).ok, true);
});

test('RIPE Database REST parser fails closed when requested aut-num is absent', () => {
  const parsed = parseRipeDatabaseAutNum(ripeAutNumPayload({ asn: 'AS43754', asName: 'ASIATECH', orgId: 'ORG-AI34-RIPE' }), 'AS31549');
  assert.equal(parsed.found, false);
  assert.equal(parsed.asn, 'AS31549');
});

test('registry comparator rejects reassignment and non-authoritative status', () => {
  const reassigned = compareAsnIdentity(profile('AS43754'), {
    found: true,
    asn: 'AS43754',
    asName: 'SABANET',
    orgId: 'ORG-WRONG-RIPE',
    country: null,
    registryStatus: 'ASSIGNED'
  });
  assert.equal(reassigned.ok, false);
  assert.ok(reassigned.mismatches.some((item) => item.startsWith('as-name:')));
  assert.ok(reassigned.mismatches.some((item) => item.startsWith('org:')));

  const nonAuthoritative = compareAsnIdentity(profile('AS31549'), parseRipeDatabaseAutNum(ripeAutNumPayload({ status: 'OTHER' }), 'AS31549'));
  assert.equal(nonAuthoritative.ok, false);
  assert.ok(nonAuthoritative.mismatches.includes('registry-status:OTHER'));

  const missingStatus = compareAsnIdentity(profile('AS31549'), { ...parseRipeDatabaseAutNum(ripeAutNumPayload(), 'AS31549'), registryStatus: null });
  assert.equal(missingStatus.ok, false);
  assert.ok(missingStatus.mismatches.includes('registry-status:missing'));
});

test('RIPE Database REST URL is direct, ASN-scoped and JSON-formatted', () => {
  const url = new URL(buildRipeDatabaseAutNumUrl('31549'));
  assert.equal(url.origin, 'https://rest.db.ripe.net');
  assert.equal(url.pathname, '/ripe/aut-num/AS31549.json');
});

test('registry fetch uses one direct aut-num request and preserves provenance', async () => {
  const requests = [];
  const identity = await getAsnRegistryIdentity('AS31549', {
    fetchImpl: async (url, options) => {
      requests.push({ url, accept: options?.headers?.accept });
      return { ok: true, status: 200, json: async () => ripeAutNumPayload() };
    }
  });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, '/ripe/aut-num/AS31549.json');
  assert.equal(requests[0].accept, 'application/json');
  assert.equal(identity.source, 'RIPE Database REST');
  assert.equal(identity.registrySource, 'RIPE');
  assert.equal(identity.registryStatus, 'ASSIGNED');
  assert.equal(identity.recordScope, 'ripe-database-aut-num');
  assert.equal(identity.independentCensorshipVote, false);
});

test('server provider selection no longer depends on static array position', async () => {
  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(source, /asns\.filter\(\(network\) => network\.providerComparison === true\)/);
  assert.doesNotMatch(source, /asns\.slice\(0,\s*10\)/);
});
