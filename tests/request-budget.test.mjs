import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { clientAddress, createRequestBudget, createSelfRequestKey, publicBase, selfOrigin } from '../lib/request-budget.mjs';

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

test("only the server's own requests carry its self-request key", () => {
  const key = createSelfRequestKey('k'.repeat(32));
  assert.equal(key.matches({ headers: key.headers }), true);
  assert.equal(key.matches({ headers: { 'x-self-request': 'k'.repeat(31) } }), false);
  assert.equal(key.matches({ headers: {} }), false);
  assert.notDeepEqual(createSelfRequestKey().headers, createSelfRequestKey().headers, 'a new key per start');
});

test('the server reaches itself over loopback when bound to a wildcard address', () => {
  assert.equal(selfOrigin('127.0.0.1', 4173), 'http://127.0.0.1:4173');
  assert.equal(selfOrigin('0.0.0.0', 4173), 'http://127.0.0.1:4173');
  assert.equal(selfOrigin('::', 4173), 'http://[::1]:4173');
  assert.equal(selfOrigin('::1', 80), 'http://[::1]:80');
});

test("stored and shared links never take the visitor's Host header", async () => {
  assert.equal(publicBase('https://example.org/', 'http://127.0.0.1:4173'), 'https://example.org');
  assert.equal(publicBase('', 'http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
  assert.equal(publicBase(undefined, 'http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /headers\.host/);
  assert.doesNotMatch(server, /fetch\(`http:\/\/\$\{HOST\}/, 'self requests go through selfFetch');
});
