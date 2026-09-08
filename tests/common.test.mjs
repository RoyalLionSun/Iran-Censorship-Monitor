import test from 'node:test';
import assert from 'node:assert/strict';
import { inclusiveDays, normalizeAsn, validateRange } from '../lib/common.mjs';

test('ASN normalization', () => {
  assert.equal(normalizeAsn('58224'), 'AS58224');
  assert.equal(normalizeAsn('as197207'), 'AS197207');
  assert.equal(normalizeAsn('ALL'), '');
});

test('date range is inclusive', () => {
  assert.equal(inclusiveDays('2026-09-01','2026-09-07'), 7);
});

test('invalid or excessive range is rejected', () => {
  assert.throws(()=>validateRange('2026-09-08','2026-09-01'));
  assert.throws(()=>validateRange('2026-01-01','2026-09-01',120));
});
