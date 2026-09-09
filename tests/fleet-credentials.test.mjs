import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLEET_POLICY_VERSION,
  signFleetResult,
  validateFleetManifest,
} from '../lib/fleet.mjs';
import {
  createFleetRateGuard,
  createFleetReplayGuard,
  ingestFleetResultEnvelope,
  normalizeFleetProbeRegistry,
} from '../lib/fleet-ingest.mjs';

const NOW = new Date('2026-09-09T12:10:00.000Z');
const PROBE_ID = 'p_1234567890abcdef';
const OLD_SECRET = Buffer.alloc(32, 21);
const NEW_SECRET = Buffer.alloc(32, 22);

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

function manifest() {
  return validateFleetManifest({
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
  }, targets(), { now: NOW });
}

function result(measuredAt) {
  return {
    probeId: PROBE_ID,
    policyVersion: FLEET_POLICY_VERSION,
    manifestNonce: 'nonce_1234567890abcdef',
    testId: 't1',
    targetId: 'lab-global-https',
    family: 'https',
    af: 4,
    measuredAt,
    outcome: 'observed',
    stages: { dns: 'ok', tcp: 'ok', tls: 'ok', http: 'ok' },
    timingsMs: { dns: 10, tcp: 20, tls: 30, http: 40, total: 100 },
    errorCode: null,
  };
}

function envelope(payload, secret) {
  return { result: payload, mac: signFleetResult(payload, secret) };
}

function controls(resolveSecret, enabled = true) {
  return {
    probeRegistry: normalizeFleetProbeRegistry([{ probeId: PROBE_ID, enabled, policyVersion: FLEET_POLICY_VERSION }]),
    resolveSecret,
    manifest: manifest(),
    replayGuard: createFleetReplayGuard(),
    rateGuard: createFleetRateGuard(),
    now: NOW,
  };
}

test('credential rotation invalidates the old probe secret and accepts only the replacement secret', async () => {
  let activeSecret = OLD_SECRET;
  const opts = controls(async () => activeSecret);
  const first = result('2026-09-09T12:05:00.000Z');
  assert.equal((await ingestFleetResultEnvelope(envelope(first, OLD_SECRET), opts)).status, 'accepted');

  activeSecret = NEW_SECRET;
  await assert.rejects(
    () => ingestFleetResultEnvelope(envelope(first, OLD_SECRET), opts),
    /MAC verification failed/,
  );

  const afterRotation = result('2026-09-09T12:06:00.000Z');
  assert.equal((await ingestFleetResultEnvelope(envelope(afterRotation, NEW_SECRET), opts)).status, 'accepted');
});

test('credential revocation fails closed when the secret resolver withdraws the probe secret', async () => {
  let activeSecret = NEW_SECRET;
  const opts = controls(async () => activeSecret);
  const beforeRevocation = result('2026-09-09T12:05:00.000Z');
  assert.equal((await ingestFleetResultEnvelope(envelope(beforeRevocation, NEW_SECRET), opts)).status, 'accepted');

  activeSecret = null;
  const afterRevocation = result('2026-09-09T12:06:00.000Z');
  await assert.rejects(
    () => ingestFleetResultEnvelope(envelope(afterRevocation, NEW_SECRET), opts),
    /no available secret/,
  );
});

test('probe-status revocation short-circuits before any secret lookup', async () => {
  let lookups = 0;
  const opts = controls(async () => { lookups += 1; return NEW_SECRET; }, false);
  const payload = result('2026-09-09T12:05:00.000Z');
  await assert.rejects(
    () => ingestFleetResultEnvelope(envelope(payload, NEW_SECRET), opts),
    /disabled/,
  );
  assert.equal(lookups, 0);
});
