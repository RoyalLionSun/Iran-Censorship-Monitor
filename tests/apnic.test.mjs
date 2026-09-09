import test from 'node:test';
import assert from 'node:assert/strict';
import { APNIC_IPV6_DOCS, buildApnicIpv6Urls, parseApnicIpv6 } from '../lib/apnic.mjs';

test('APNIC IPv6 URLs are fixed to Iran and preserve selected ASN scope', () => {
  const country = buildApnicIpv6Urls({});
  assert.equal(country.primary, 'https://data1.labs.apnic.net/v6stats/v6economy/IR.json');
  assert.equal(country.scope, 'country');
  assert.equal(country.asn, null);
  assert.equal(country.fallback, null);

  const asn = buildApnicIpv6Urls({ asn: '58224' });
  assert.equal(asn.primary, 'https://data1.labs.apnic.net/v6stats/v6economyas/IR/AS58224.json');
  assert.equal(asn.fallback, 'https://stats.labs.apnic.net/cgi-bin/json-table-v6.pl?x=IR58224');
  assert.equal(asn.asn, 'AS58224');
  assert.match(APNIC_IPV6_DOCS, /ipv6-data-format\.html$/);
});

test('APNIC parser keeps raw samples and 30-day context while filtering dates and country', () => {
  const payload = {
    copyright: '(C) APNIC Pty/Ltd. re-use with attribution permitted',
    description: 'IPv6 time series',
    data: [
      { date:'2026-09-01', cc:'IR', raw:{seen:100, capable:12, capable_pc:12, preferred:10, preferred_pc:10}, '30':{seen:90.5, capable:11, capable_pc:12.2, preferred:9.5, preferred_pc:10.5}, updated:'2026-09-02:00:00:00' },
      { date:'2026-09-02', cc:'IR', raw:{seen:80, capable:16, capable_pc:20, preferred:14, preferred_pc:17.5}, '30':{seen:89, capable:12, capable_pc:13.4, preferred:10, preferred_pc:11.2}, updated:'2026-09-03:00:00:00' },
      { date:'2026-08-31', cc:'IR', raw:{seen:999, capable:1, capable_pc:0.1, preferred:1, preferred_pc:0.1} },
      { date:'2026-09-02', cc:'FR', raw:{seen:999, capable:999, capable_pc:100, preferred:999, preferred_pc:100} },
    ],
  };
  const parsed = parseApnicIpv6(payload, { since:'2026-09-01', until:'2026-09-02' });
  assert.equal(parsed.points.length, 2);
  assert.equal(parsed.points[0].raw.seen, 100);
  assert.equal(parsed.points[1].raw.capablePercent, 20);
  assert.equal(parsed.points[1].smoothed30.preferredPercent, 11.2);
  assert.equal(parsed.coverage.totalRawSamples, 180);
  assert.equal(parsed.coverage.dailySamplesMedian, 90);
  assert.equal(parsed.providerUpdated, '2026-09-03:00:00:00');
});

test('APNIC ASN parser rejects rows from a different ASN and accepts numeric/string ASN formats', () => {
  const payload = { data: [
    { date:'2026-09-01', cc:'IR', as:'AS58224', raw:{seen:20, capable:2, capable_pc:10, preferred:2, preferred_pc:10}, '30':{} },
    { date:'2026-09-02', cc:'IR', as:58224, raw:{seen:30, capable:6, capable_pc:20, preferred:5, preferred_pc:16.7}, '30':{} },
    { date:'2026-09-03', cc:'IR', as:'AS197207', raw:{seen:1000, capable:800, capable_pc:80, preferred:700, preferred_pc:70}, '30':{} },
  ]};
  const parsed = parseApnicIpv6(payload, { asn:'AS58224', since:'2026-09-01', until:'2026-09-03' });
  assert.equal(parsed.points.length, 2);
  assert.equal(parsed.coverage.totalRawSamples, 50);
  assert.equal(parsed.latest.date, '2026-09-02');
});

test('APNIC parser returns explicit no-data shape rather than fabricating zero observations', () => {
  const parsed = parseApnicIpv6({ data: [] }, { since:'2026-09-01', until:'2026-09-03' });
  assert.deepEqual(parsed.points, []);
  assert.equal(parsed.latest, null);
  assert.equal(parsed.coverage.observedDays, 0);
  assert.equal(parsed.coverage.totalRawSamples, 0);
  assert.equal(parsed.coverage.dailySamplesMedian, null);
});
