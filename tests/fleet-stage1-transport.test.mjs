import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { FLEET_POLICY_VERSION, signFleetManifest, signFleetResult } from '../lib/fleet.mjs';
import {
  FLEET_STAGE1_DEFAULT_POLL_MS,
  FLEET_STAGE1_MANIFEST_PATH,
  FLEET_STAGE1_RESULT_PATH,
  buildFleetStage1ManifestRequest,
  buildFleetStage1ResultRequest,
  computeFleetStage1Backoff,
  createFleetStage1MemoryQueue,
  normalizeFleetStage1Config,
  processFleetStage1ManifestResponse,
  processFleetStage1ResultResponse,
} from '../lib/fleet-stage1-transport.mjs';

const PROBE_ID = 'p_1234567890abcdef';
const NOW = new Date('2026-09-09T12:10:00.000Z');
const SECRET = Buffer.alloc(32, 7);
const TARGETS = [{ targetId: 'lab-target', safetyClass: 'A', owner: 'project', host: 'lab.example.invalid', port: 443, families: ['https'], approved: true, enabled: true }];

function rawManifest() {
  return {
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:30:00.000Z',
    nonce: 'nonce_1234567890abcdef',
    tests: [{ testId: 't1', targetId: 'lab-target', family: 'https', af: 4, timeoutMs: 1000, maxAttempts: 1 }],
  };
}

function result() {
  return {
    probeId: PROBE_ID,
    policyVersion: FLEET_POLICY_VERSION,
    manifestNonce: 'nonce_1234567890abcdef',
    testId: 't1',
    targetId: 'lab-target',
    family: 'https',
    af: 4,
    measuredAt: '2026-09-09T12:05:00.000Z',
    outcome: 'observed',
    stages: { dns: 'ok', tcp: 'ok', tls: 'ok', http: 'ok' },
    timingsMs: { dns: 1, tcp: 2, tls: 3, http: 4, total: 10 },
    errorCode: null,
  };
}

function envelope() {
  const payload = result();
  return { result: payload, mac: signFleetResult(payload, SECRET) };
}

test('Stage 1 config is fixed to a root HTTPS origin on 443', () => {
  assert.deepEqual(normalizeFleetStage1Config({ origin: 'https://fleet.example.invalid' }), {
    origin: 'https://fleet.example.invalid', pollIntervalMs: FLEET_STAGE1_DEFAULT_POLL_MS,
  });
  for (const origin of ['http://fleet.example.invalid', 'https://user@fleet.example.invalid', 'https://fleet.example.invalid/path', 'https://fleet.example.invalid?x=1', 'https://fleet.example.invalid:8443']) {
    assert.throws(() => normalizeFleetStage1Config({ origin }), /Stage 1 origin/);
  }
  assert.throws(() => normalizeFleetStage1Config({ origin: 'https://fleet.example.invalid', pollIntervalMs: 30_000 }), /pollIntervalMs/);
});

test('manifest poll request has fixed method path identity and manual redirect policy', () => {
  const request = buildFleetStage1ManifestRequest({ origin: 'https://fleet.example.invalid' }, PROBE_ID, { etag: '"abc"' });
  assert.equal(request.method, 'GET');
  assert.equal(request.url, `https://fleet.example.invalid${FLEET_STAGE1_MANIFEST_PATH}`);
  assert.equal(request.redirect, 'manual');
  assert.equal(request.headers['x-fleet-probe-id'], PROBE_ID);
  assert.equal(request.headers['if-none-match'], '"abc"');
  assert.equal(request.body, null);
  assert.equal('authorization' in request.headers, false);
  assert.throws(() => buildFleetStage1ManifestRequest({ origin: 'https://fleet.example.invalid' }, PROBE_ID, { etag: 'x\r\ny' }), /ETag/);
});

test('result request is fixed POST JSON and identity-bound to probe envelope', () => {
  const request = buildFleetStage1ResultRequest({ origin: 'https://fleet.example.invalid' }, PROBE_ID, envelope());
  assert.equal(request.method, 'POST');
  assert.equal(request.url, `https://fleet.example.invalid${FLEET_STAGE1_RESULT_PATH}`);
  assert.equal(request.redirect, 'manual');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(request.body).result.probeId, PROBE_ID);
  assert.throws(() => buildFleetStage1ResultRequest({ origin: 'https://fleet.example.invalid' }, 'p_aaaaaaaaaaaaaaaa', envelope()), /does not match/);
});

test('valid signed manifest response is verified locally before being accepted as work', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const manifest = rawManifest();
  const body = JSON.stringify({ manifest, signature: signFleetManifest(manifest, privateKey) });
  const parsed = processFleetStage1ManifestResponse({ status: 200, headers: { 'content-type': 'application/json', etag: '"m1"' }, body }, {
    schedulerPublicKey: publicKey, targets: TARGETS, now: NOW,
  });
  assert.equal(parsed.status, 'manifest');
  assert.equal(parsed.manifest.nonce, manifest.nonce);
  assert.equal(parsed.etag, '"m1"');
});

test('manifest response fails closed on redirect content type size JSON or signature errors', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const manifest = rawManifest();
  const validBody = JSON.stringify({ manifest, signature: signFleetManifest(manifest, privateKey) });
  assert.throws(() => processFleetStage1ManifestResponse({ status: 302, headers: { location: 'https://other.invalid' }, body: '' }), /redirect/);
  assert.throws(() => processFleetStage1ManifestResponse({ status: 200, headers: { 'content-type': 'text/html' }, body: validBody }, { schedulerPublicKey: publicKey, targets: TARGETS, now: NOW }), /application\/json/);
  assert.throws(() => processFleetStage1ManifestResponse({ status: 200, headers: { 'content-type': 'application/json', 'content-length': '999999' }, body: '{}' }, { schedulerPublicKey: publicKey, targets: TARGETS, now: NOW }), /Content-Length/);
  assert.throws(() => processFleetStage1ManifestResponse({ status: 200, headers: { 'content-type': 'application/json' }, body: '{' }, { schedulerPublicKey: publicKey, targets: TARGETS, now: NOW }), /invalid JSON/);
  const tampered = JSON.stringify({ manifest: { ...manifest, nonce: 'nonce_tampered_1234' }, signature: signFleetManifest(manifest, privateKey) });
  assert.throws(() => processFleetStage1ManifestResponse({ status: 200, headers: { 'content-type': 'application/json' }, body: tampered }, { schedulerPublicKey: publicKey, targets: TARGETS, now: NOW }), /signature verification failed/);
});

test('manifest transport statuses remain separate from measurement evidence', () => {
  assert.deepEqual(processFleetStage1ManifestResponse({ status: 204, headers: {}, body: '' }), { status: 'no_work', manifest: null, retryAfterMs: 0 });
  assert.equal(processFleetStage1ManifestResponse({ status: 403, headers: {}, body: '' }).status, 'unauthorized');
  assert.equal(processFleetStage1ManifestResponse({ status: 429, headers: { 'retry-after': '120' }, body: '' }, { now: NOW }).retryAfterMs, 120_000);
  assert.equal(processFleetStage1ManifestResponse({ status: 503, headers: {}, body: '' }).status, 'unavailable');
  assert.throws(() => processFleetStage1ManifestResponse({ status: 404, headers: {}, body: '' }), /not permitted/);
});

test('result response contract never interprets server body as commands', () => {
  assert.equal(processFleetStage1ResultResponse({ status: 202, headers: {}, body: '{"command":"rm -rf"}' }).status, 'accepted');
  assert.equal(processFleetStage1ResultResponse({ status: 409, headers: {}, body: 'duplicate' }).status, 'duplicate');
  assert.equal(processFleetStage1ResultResponse({ status: 413, headers: {}, body: '' }).status, 'contract_error');
  assert.equal(processFleetStage1ResultResponse({ status: 429, headers: { 'retry-after': '600' }, body: '' }, { now: NOW }).retryAfterMs, 600_000);
  assert.equal(processFleetStage1ResultResponse({ status: 503, headers: {}, body: '' }).status, 'unavailable');
  assert.throws(() => processFleetStage1ResultResponse({ status: 307, headers: { location: 'https://other.invalid' }, body: '' }), /redirect/);
});

test('bounded backoff never undercuts local floor or exceeds one hour', () => {
  assert.equal(computeFleetStage1Backoff({ attempt: 0 }), 60_000);
  assert.equal(computeFleetStage1Backoff({ attempt: 2 }), 240_000);
  assert.equal(computeFleetStage1Backoff({ attempt: 0, serverRetryAfterMs: 600_000 }), 600_000);
  assert.equal(computeFleetStage1Backoff({ attempt: 16, serverRetryAfterMs: 99_000_000 }), 3_600_000);
  assert.equal(computeFleetStage1Backoff({ attempt: 0, jitter: 0.25 }), 75_000);
});

test('memory-only queue is bounded, locally purgeable, expires entries and has no persistence API', () => {
  const queue = createFleetStage1MemoryQueue({ maxEntries: 2, ttlMs: 60_000 });
  const first = envelope();
  const second = { ...envelope(), mac: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
  assert.equal(queue.enqueue(first, NOW).accepted, true);
  assert.equal(queue.enqueue(second, NOW).accepted, true);
  assert.deepEqual(queue.enqueue(envelope(), NOW), { accepted: false, reason: 'queue_full' });
  assert.equal(queue.size(NOW), 2);
  assert.equal(queue.peek(NOW), first);
  assert.equal(queue.clear(NOW), 2);
  assert.equal(queue.size(NOW), 0);
  assert.equal(queue.clear(NOW), 0);
  assert.equal('save' in queue, false);
  assert.equal('load' in queue, false);
  assert.equal(queue.enqueue(first, NOW).accepted, true);
  assert.equal(queue.size(new Date(NOW.getTime() + 60_001)), 0);
  assert.equal(queue.peek(new Date(NOW.getTime() + 60_001)), null);
});