import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  FLEET_POLICY_VERSION,
  assertFleetResultMatchesManifest,
  canonicalFleetJson,
  normalizeFleetTargetRegistry,
  signFleetManifest,
  signFleetResult,
  validateFleetManifest,
  validateFleetResult,
  verifyFleetManifestEnvelope,
  verifyFleetResultEnvelope,
} from '../lib/fleet.mjs';

const NOW = new Date('2026-09-09T12:10:00.000Z');

function targets() {
  return [{
    targetId: 'lab-global-https',
    safetyClass: 'A',
    owner: 'project',
    host: 'example.invalid',
    port: 443,
    families: ['dns', 'tcp', 'tls', 'https'],
    approved: true,
    enabled: true,
  }];
}

function manifest(overrides = {}) {
  return {
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:30:00.000Z',
    nonce: 'nonce_1234567890abcdef',
    tests: [{
      testId: 't1',
      targetId: 'lab-global-https',
      family: 'https',
      af: 4,
      timeoutMs: 3000,
      maxAttempts: 1,
    }],
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    probeId: 'p_1234567890abcdef',
    policyVersion: FLEET_POLICY_VERSION,
    manifestNonce: 'nonce_1234567890abcdef',
    testId: 't1',
    targetId: 'lab-global-https',
    family: 'https',
    af: 4,
    measuredAt: '2026-09-09T12:05:00.000Z',
    outcome: 'observed',
    stages: { dns: 'ok', tcp: 'ok', tls: 'ok', http: 'ok' },
    timingsMs: { dns: 10, tcp: 20, tls: 30, http: 40, total: 100 },
    errorCode: null,
    ...overrides,
  };
}

test('fleet target registry accepts only explicit approved project-controlled Class A targets', () => {
  const registry = normalizeFleetTargetRegistry(targets());
  assert.equal(registry.size, 1);
  assert.deepEqual(registry.get('lab-global-https'), {
    targetId: 'lab-global-https',
    safetyClass: 'A',
    owner: 'project',
    host: 'example.invalid',
    port: 443,
    families: ['dns', 'https', 'tcp', 'tls'],
    approved: true,
    enabled: true,
  });
});

test('fleet target registry rejects unsafe classes, ownership, approval, families and duplicates', () => {
  assert.throws(() => normalizeFleetTargetRegistry([{ ...targets()[0], safetyClass: 'C' }]), /not Class A/);
  assert.throws(() => normalizeFleetTargetRegistry([{ ...targets()[0], owner: 'third-party' }]), /project-controlled/);
  assert.throws(() => normalizeFleetTargetRegistry([{ ...targets()[0], approved: false }]), /approved and enabled/);
  assert.throws(() => normalizeFleetTargetRegistry([{ ...targets()[0], families: ['wireguard'] }]), /non-Class-A family/);
  assert.throws(() => normalizeFleetTargetRegistry([...targets(), ...targets()]), /Duplicate fleet targetId/);
});

test('signed manifest contains target IDs only and rejects arbitrary host URL port or command fields', () => {
  const valid = validateFleetManifest(manifest(), targets(), { now: NOW });
  assert.deepEqual(valid.tests[0], {
    testId: 't1', targetId: 'lab-global-https', family: 'https', af: 4, timeoutMs: 3000, maxAttempts: 1,
  });
  for (const extra of [
    { host: 'attacker.example' },
    { url: 'https://attacker.example/' },
    { port: 22 },
    { command: 'sh -c id' },
  ]) {
    const unsafe = manifest({ tests: [{ ...manifest().tests[0], ...extra }] });
    assert.throws(() => validateFleetManifest(unsafe, targets(), { now: NOW }), /unsupported field/);
  }
});

test('manifest rejects unknown targets, unsupported families, expiry, excessive lifetime and duplicate test IDs', () => {
  assert.throws(() => validateFleetManifest(manifest({ tests: [{ ...manifest().tests[0], targetId: 'unknown-target' }] }), targets(), { now: NOW }), /unknown targetId/);
  assert.throws(() => validateFleetManifest(manifest({ tests: [{ ...manifest().tests[0], family: 'wireguard' }] }), targets(), { now: NOW }), /not approved|family/);
  assert.throws(() => validateFleetManifest(manifest({ expiresAt: '2026-09-09T12:09:59.000Z' }), targets(), { now: NOW }), /expired/);
  assert.throws(() => validateFleetManifest(manifest({ expiresAt: '2026-09-09T13:00:01.000Z' }), targets(), { now: NOW }), /lifetime/);
  assert.throws(() => validateFleetManifest(manifest({ tests: [manifest().tests[0], { ...manifest().tests[0] }] }), targets(), { now: NOW }), /Duplicate fleet testId/);
});

test('Ed25519 manifest signature verifies and tampering fails closed', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const payload = manifest();
  const signature = signFleetManifest(payload, privateKey);
  const verified = verifyFleetManifestEnvelope({ manifest: payload, signature }, publicKey, targets(), { now: NOW });
  assert.equal(verified.tests[0].targetId, 'lab-global-https');

  const tampered = structuredClone(payload);
  tampered.tests[0].timeoutMs = 9999;
  assert.throws(() => verifyFleetManifestEnvelope({ manifest: tampered, signature }, publicKey, targets(), { now: NOW }), /signature verification failed/);
});

test('canonical fleet JSON is stable across object key order', () => {
  assert.equal(canonicalFleetJson({ b: 2, a: { y: 2, x: 1 } }), canonicalFleetJson({ a: { x: 1, y: 2 }, b: 2 }));
});

test('Class A result validates as one owned-probe observation without censorship vote', () => {
  const normalized = validateFleetResult(result(), { now: NOW });
  assert.equal(normalized.outcome, 'observed');
  assert.equal(normalized.evidenceRole, 'owned-probe-observation');
  assert.equal(normalized.independentCensorshipVote, false);
  assert.deepEqual(normalized.stages, { dns: 'ok', tcp: 'ok', tls: 'ok', http: 'ok' });
});

test('fleet result rejects sensitive and arbitrary-network/command metadata', () => {
  for (const extra of [
    { sourceIp: '198.51.100.1' },
    { imsi: '001010123456789' },
    { hostname: 'secret-host' },
    { url: 'https://attacker.example/' },
    { port: 22 },
    { command: 'cat /etc/passwd' },
  ]) {
    assert.throws(() => validateFleetResult({ ...result(), ...extra }, { now: NOW }), /forbidden sensitive\/free-form field/);
  }
});

test('fleet result preserves timeout/error semantics and rejects free-form errors or stale/future timestamps', () => {
  const timeout = validateFleetResult(result({
    outcome: 'timeout',
    stages: { dns: 'ok', tcp: 'timeout', tls: 'not_run', http: 'not_run' },
    timingsMs: { dns: 10, tcp: 3000, total: 3010 },
    errorCode: 'timeout',
  }), { now: NOW });
  assert.equal(timeout.outcome, 'timeout');
  assert.equal(timeout.errorCode, 'timeout');

  assert.throws(() => validateFleetResult(result({ errorCode: 'blocked_by_iran' }), { now: NOW }), /errorCode/);
  assert.throws(() => validateFleetResult(result({ measuredAt: '2026-09-08T12:09:59.000Z' }), { now: NOW }), /outside the accepted ingestion window/);
  assert.throws(() => validateFleetResult(result({ measuredAt: '2026-09-09T12:11:01.000Z' }), { now: NOW }), /outside the accepted ingestion window/);
  assert.throws(() => validateFleetResult(result({ outcome: 'observed', errorCode: 'timeout' }), { now: NOW }), /must not carry an errorCode/);
});

test('HMAC-authenticated fleet result verifies and tampering or wrong secret fails', () => {
  const secret = Buffer.alloc(32, 7);
  const payload = result();
  const mac = signFleetResult(payload, secret);
  const verified = verifyFleetResultEnvelope({ result: payload, mac }, secret, { now: NOW });
  assert.equal(verified.testId, 't1');

  const tampered = structuredClone(payload);
  tampered.outcome = 'timeout';
  assert.throws(() => verifyFleetResultEnvelope({ result: tampered, mac }, secret, { now: NOW }), /MAC verification failed/);
  assert.throws(() => verifyFleetResultEnvelope({ result: payload, mac }, Buffer.alloc(32, 8), { now: NOW }), /MAC verification failed/);
  assert.throws(() => signFleetResult(payload, 'short-secret'), /at least 32 bytes/);
});

test('fleet result is cryptographically and semantically bound to signed manifest test definition', () => {
  const validatedManifest = validateFleetManifest(manifest(), targets(), { now: NOW });
  const normalized = validateFleetResult(result(), { now: NOW });
  assert.equal(assertFleetResultMatchesManifest(normalized, validatedManifest).testId, 't1');

  assert.throws(() => assertFleetResultMatchesManifest(validateFleetResult(result({ manifestNonce: 'nonce_abcdefghijklmnop' }), { now: NOW }), validatedManifest), /manifest identity/);
  assert.throws(() => assertFleetResultMatchesManifest(validateFleetResult(result({ targetId: 'other-target' }), { now: NOW }), validatedManifest), /does not match the signed manifest definition/);
  assert.throws(() => assertFleetResultMatchesManifest(validateFleetResult(result({ family: 'tcp' }), { now: NOW }), validatedManifest), /does not match the signed manifest definition/);
  assert.throws(() => assertFleetResultMatchesManifest(validateFleetResult(result({ af: 6 }), { now: NOW }), validatedManifest), /does not match the signed manifest definition/);
});

test('result envelope can require both MAC validity and manifest binding', () => {
  const secret = Buffer.alloc(32, 9);
  const validatedManifest = validateFleetManifest(manifest(), targets(), { now: NOW });
  const payload = result();
  const mac = signFleetResult(payload, secret);
  assert.equal(verifyFleetResultEnvelope({ result: payload, mac }, secret, { manifest: validatedManifest, now: NOW }).targetId, 'lab-global-https');

  const mismatched = result({ testId: 'other-test' });
  const mismatchedMac = signFleetResult(mismatched, secret);
  assert.throws(() => verifyFleetResultEnvelope({ result: mismatched, mac: mismatchedMac }, secret, { manifest: validatedManifest, now: NOW }), /unknown manifest testId/);
});
