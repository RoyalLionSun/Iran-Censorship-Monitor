import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRpkiUrls, buildRpkiValidationUrl, parseRpkiHistory, parseRpkiValidation, RPKI_MAX_PREFIXES } from '../lib/rpki.mjs';

test('RPKI URLs are selected-ASN scoped and use bounded monthly history', () => {
  const urls = buildRpkiUrls('AS58224');
  assert.match(urls.announcedPrefixes, /resource=AS58224/);
  assert.match(urls.history4, /family=4/);
  assert.match(urls.history4, /resolution=m/);
  assert.match(urls.history6, /family=6/);
  assert.equal(RPKI_MAX_PREFIXES, 16);
  assert.throws(() => buildRpkiUrls('ALL'), /selected ASN/);
});

test('RPKI validation URL rejects malformed CIDR input', () => {
  assert.match(buildRpkiValidationUrl('AS58224', '2.144.0.0/13'), /prefix=2.144.0.0%2F13/);
  assert.throws(() => buildRpkiValidationUrl('AS58224', 'not-a-prefix'));
});

test('RPKI validation preserves validity state and ROA evidence without censorship interpretation', () => {
  const parsed = parseRpkiValidation({ data: {
    status: 'invalid_length', description: 'Fixture', prefix: '2.144.0.0/13', resource: 'AS58224',
    validating_roas: [{ prefix: '2.144.0.0/12', max_length: 12, origin: 'AS58224' }],
  } });
  assert.equal(parsed.status, 'invalid_length');
  assert.equal(parsed.resource, 'AS58224');
  assert.equal(parsed.validatingRoas[0].origin, 'AS58224');
  assert.equal(parsed.validatingRoas[0].maxLength, 12);
});

test('unknown or unexpected RPKI states fail conservatively to unknown', () => {
  assert.equal(parseRpkiValidation({ data: { status: 'mystery' } }).status, 'unknown');
});

test('RPKI history parser keeps only the bounded newest time bins', () => {
  const timeseries = Array.from({ length: 25 }, (_, index) => ({
    time: `2024-${String((index % 12) + 1).padStart(2, '0')}-01T00:00:00`,
    family: 4,
    rpki: { min: index, max: index + 2, avg: index + 1, first: index, last: index + 2, samples: 30 },
  }));
  const parsed = parseRpkiHistory({ data: { timeseries } }, 18);
  assert.equal(parsed.length, 18);
  assert.equal(parsed.at(-1).last, 26);
  assert.equal(parsed.at(-1).samples, 30);
});
