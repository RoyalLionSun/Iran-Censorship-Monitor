import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRipeStatWhoisUrl, compareAsnIdentity, parseRipeStatWhois } from '../lib/asn-registry.mjs';

const profiles = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
const byAsn = new Map(profiles.map((profile) => [profile.asn, profile]));

function profile(asn) {
  const value = byAsn.get(asn);
  assert.ok(value, `${asn} must exist in curated profiles`);
  return value;
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
  for (const item of profiles) assert.equal(item.independentCensorshipVote, false, item.asn);
});

test('current legal registry names and operational aliases are both preserved', () => {
  assert.equal(profile('AS16322').registryName, 'Parsan Lin Co. PJS');
  assert.ok(profile('AS16322').aliases.includes('Pars Online'));
  assert.equal(profile('AS39501').registryName, 'Parvaresh Dadeha Co. Private Joint Stock');
  assert.ok(profile('AS39501').aliases.includes('Sabanet'));
  assert.ok(profile('AS39501').aliases.includes('Neda Gostar Saba'));
});

test('provider comparison is explicit and excludes gateway/cloud-only profiles', () => {
  const selected = profiles.filter((item) => item.providerComparison === true);
  assert.equal(selected.length, 10);
  for (const asn of ['AS12880', 'AS49666', 'AS48159', 'AS6736', 'AS60077', 'AS202468']) {
    assert.equal(profile(asn).providerComparison, false, asn);
  }
});

test('RIPEstat Whois parser separates aut-num and organisation identity', () => {
  const parsed = parseRipeStatWhois({ data: {
    authorities: ['ripe'],
    records: [
      [
        { key: 'aut-num', value: 'AS31549' },
        { key: 'as-name', value: 'RASANA' },
        { key: 'org', value: 'ORG-ART1-RIPE' },
        { key: 'source', value: 'RIPE' }
      ],
      [
        { key: 'organisation', value: 'ORG-ART1-RIPE' },
        { key: 'org-name', value: 'Aria Shatel PJSC' },
        { key: 'country', value: 'IR' },
        { key: 'source', value: 'RIPE' }
      ]
    ]
  } }, 'AS31549');
  assert.deepEqual(parsed, {
    asn: 'AS31549',
    asName: 'RASANA',
    orgId: 'ORG-ART1-RIPE',
    registryName: 'Aria Shatel PJSC',
    country: 'IR',
    authority: 'ripe',
    source: 'RIPE',
    recordScope: 'rir-records',
    found: true
  });
  assert.equal(compareAsnIdentity(profile('AS31549'), parsed).ok, true);
});

test('RIPEstat Whois parser accepts aut-num in irr_records while preserving record scope', () => {
  const parsed = parseRipeStatWhois({ data: {
    authorities: ['ripe'],
    records: [],
    irr_records: [[
      { key: 'aut-num', value: 'AS43754' },
      { key: 'as-name', value: 'ASIATECH' },
      { key: 'org', value: 'ORG-AI34-RIPE' },
      { key: 'source', value: 'RIPE' }
    ]]
  } }, 'AS43754');
  assert.equal(parsed.found, true);
  assert.equal(parsed.recordScope, 'routing-registry');
  assert.equal(parsed.asName, 'ASIATECH');
  assert.equal(parsed.orgId, 'ORG-AI34-RIPE');
  assert.equal(compareAsnIdentity(profile('AS43754'), parsed).ok, true);
});

test('registry comparator flags reassignment instead of accepting an alias', () => {
  const comparison = compareAsnIdentity(profile('AS43754'), {
    found: true,
    asn: 'AS43754',
    asName: 'SABANET',
    orgId: 'ORG-WRONG-RIPE',
    country: 'IR'
  });
  assert.equal(comparison.ok, false);
  assert.ok(comparison.mismatches.some((item) => item.startsWith('as-name:')));
  assert.ok(comparison.mismatches.some((item) => item.startsWith('org:')));
});

test('RIPEstat URL is ASN-scoped and identifies this application', () => {
  const url = new URL(buildRipeStatWhoisUrl('31549'));
  assert.equal(url.origin, 'https://stat.ripe.net');
  assert.equal(url.searchParams.get('resource'), 'AS31549');
  assert.equal(url.searchParams.get('sourceapp'), 'iran-censorship-monitor');
});

test('server provider selection no longer depends on static array position', async () => {
  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(source, /asns\.filter\(\(network\) => network\.providerComparison === true\)/);
  assert.doesNotMatch(source, /asns\.slice\(0,\s*10\)/);
});
