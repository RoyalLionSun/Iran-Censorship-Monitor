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

const PROBE_ID = 'p_1234567890abcdef';
const SECRET = Buffer.alloc(32, 44);
const NOW = new Date('2026-09-09T12:10:00.000Z');

function targets() {
  return [{
    targetId: 'lab-target',
    safetyClass: 'A',
    owner: 'project',
    host: '127.0.0.1',
    port: 443,
    families: ['tcp'],
    approved: true,
    enabled: true,
  }];
}

test('ingestion rejects a cryptographically valid result measured outside its signed manifest window', async () => {
  const manifest = validateFleetManifest({
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:30:00.000Z',
    nonce: 'nonce_1234567890abcdef',
    tests: [{ testId: 't1', targetId: 'lab-target', family: 'tcp', af: 4, timeoutMs: 1000, maxAttempts: 1 }],
  }, targets(), { now: NOW });

  const result = {
    probeId: PROBE_ID,
    policyVersion: FLEET_POLICY_VERSION,
    manifestNonce: manifest.nonce,
    testId: 't1',
    targetId: 'lab-target',
    family: 'tcp',
    af: 4,
    measuredAt: '2026-09-09T11:59:59.000Z',
    outcome: 'observed',
    stages: { dns: 'not_run', tcp: 'ok', tls: 'not_run', http: 'not_run' },
    timingsMs: { tcp: 5, total: 5 },
    errorCode: null,
  };
  const envelope = { result, mac: signFleetResult(result, SECRET) };

  await assert.rejects(() => ingestFleetResultEnvelope(envelope, {
    probeRegistry: normalizeFleetProbeRegistry([{ probeId: PROBE_ID, enabled: true, policyVersion: FLEET_POLICY_VERSION }]),
    resolveSecret: async () => SECRET,
    manifest,
    replayGuard: createFleetReplayGuard(),
    rateGuard: createFleetRateGuard(),
    now: NOW,
  }), /outside the signed manifest window/);
});
