import assert from 'node:assert/strict';
import test from 'node:test';
import { clientAddress, createRequestBudget } from '../lib/request-budget.mjs';

test('a visitor gets a limited number per window, then a wait time', () => {
  const budget = createRequestBudget({ limit: 2, windowMs: 60_000 });
  assert.equal(budget.take('a', 0).ok, true);
  assert.equal(budget.take('a', 1_000).ok, true);
  const refused = budget.take('a', 2_000);
  assert.equal(refused.ok, false);
  assert.equal(refused.retryAfterSeconds, 58);
  assert.equal(budget.take('b', 2_000).ok, true, 'another address has its own budget');
  assert.equal(budget.take('a', 61_000).ok, true, 'the window moves on');
});

test('the address table stays bounded however many addresses appear', () => {
  const budget = createRequestBudget({ limit: 5, maxAddresses: 100 });
  for (let index = 0; index < 5_000; index += 1) budget.take(`10.0.${index >> 8}.${index & 255}`, 1_000);
  assert.equal(budget.size(), 100);
});

test('behind one proxy the address is the one the proxy appended, not what the visitor sent', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientAddress(req, true), '5.6.7.8');
  assert.equal(clientAddress(req, false), '127.0.0.1', 'without TRUST_PROXY the header is ignored');
  assert.equal(clientAddress({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }, true), '9.9.9.9');
});
