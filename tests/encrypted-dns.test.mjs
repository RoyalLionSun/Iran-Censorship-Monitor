import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDnscheck, getEncryptedDns, resolverGroup, summarizeEncryptedDns } from '../lib/encrypted-dns.mjs';

test('resolvers asked by name and by address are kept apart', () => {
  assert.equal(resolverGroup('https://dns.google/dns-query'), 'byName');
  assert.equal(resolverGroup('dot://dns.quad9.net/'), 'byName');
  assert.equal(resolverGroup('https://1.1.1.1/dns-query'), 'byAddress');
  assert.equal(resolverGroup('dot://8.8.8.8:853/'), 'byAddress');
  assert.equal(resolverGroup('not a url'), null);
});

test('a dnscheck run works only when the resolver was found and every lookup answered', () => {
  assert.deepEqual(classifyDnscheck({ bootstrap_failure: 'dns_bogon_error' }), { ok: false, reason: 'dns_bogon_error' });
  assert.deepEqual(classifyDnscheck({ lookups: { a: { failure: null }, b: { failure: 'generic_timeout_error' } } }), { ok: false, reason: 'generic_timeout_error' });
  assert.deepEqual(classifyDnscheck({ lookups: { a: { failure: null } } }), { ok: true, reason: null });
  assert.deepEqual(classifyDnscheck({ lookups: {} }), { ok: false, reason: 'no_lookup' });
});

test('the summary gives a status per group, with the most frequent reason', () => {
  const rows = [
    ...Array.from({ length: 10 }, () => ({ group: 'byName', input: 'https://dns.google/dns-query', ok: false, reason: 'dns_bogon_error' })),
    ...Array.from({ length: 6 }, () => ({ group: 'byAddress', input: 'https://1.1.1.1/dns-query', ok: true, reason: null })),
    ...Array.from({ length: 4 }, () => ({ group: 'byAddress', input: 'dot://8.8.8.8:853/', ok: false, reason: 'generic_timeout_error' })),
  ];
  const summary = summarizeEncryptedDns(rows);
  assert.equal(summary.byName.status, 'fails');
  assert.equal(summary.byName.reason, 'dns_bogon_error');
  assert.equal(summary.byAddress.status, 'partly');
  assert.equal(summary.byAddress.ok, 6);
  assert.equal(summarizeEncryptedDns(rows.slice(0, 3)).byName.status, 'thin');
});

test('only runs from networks registered in Iran are sampled', async () => {
  const listing = { results: [
    { measurement_uid: 'u1', probe_asn: 58224, input: 'https://dns.google/dns-query' },
    { measurement_uid: 'u2', probe_asn: 9009, input: 'https://dns.google/dns-query' },
    { measurement_uid: 'u3', probe_asn: 44244, input: 'https://1.1.1.1/dns-query' },
  ] };
  const read = [];
  const fetch = async (url) => {
    if (url.includes('/measurements?')) return url.includes('input=') ? { results: [] } : listing;
    const uid = new URL(url).searchParams.get('measurement_uid');
    read.push(uid);
    return { raw_measurement: JSON.stringify({ test_keys: uid === 'u3' ? { lookups: { a: { failure: null } } } : { bootstrap_failure: 'dns_bogon_error' } }) };
  };
  const result = await getEncryptedDns({ since: '2026-09-18', until: '2026-09-24', fetch, iranAsns: new Set(['AS58224', 'AS44244']) });
  assert.deepEqual(read.sort(), ['u1', 'u3'], 'AS9009 (a foreign VPN network) is left out');
  assert.equal(result.byName.failed, 1);
  assert.equal(result.byAddress.ok, 1);
  assert.equal(result.networks, 2);
});
