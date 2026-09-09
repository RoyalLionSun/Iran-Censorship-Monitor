import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FLEET_POLICY_VERSION,
  signFleetManifest,
  validateFleetManifest,
} from '../lib/fleet.mjs';
import {
  createFleetRateGuard,
  createFleetReplayGuard,
  ingestFleetResultEnvelope,
  normalizeFleetProbeRegistry,
} from '../lib/fleet-ingest.mjs';
import {
  FLEET_STAGE0_ENABLE_MARKER,
  runFleetStage0Probe,
} from '../lib/fleet-probe-runner.mjs';

const PROBE_ID = 'p_1234567890abcdef';
const PROBE_SECRET = Buffer.alloc(32, 31);
const NOW = new Date('2026-09-09T12:10:00.000Z');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function localGate(content) {
  const dir = mkdtempSync(join(tmpdir(), 'iran-monitor-gate-'));
  const path = join(dir, 'stage0.enabled');
  if (content != null) writeFileSync(path, content, 'utf8');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function targets(port) {
  return [{
    targetId: 'lab-loopback-tcp',
    safetyClass: 'A',
    owner: 'project',
    host: '127.0.0.1',
    port,
    families: ['tcp'],
    approved: true,
    enabled: true,
  }];
}

function manifest() {
  return {
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:30:00.000Z',
    nonce: 'nonce_1234567890abcdef',
    tests: [{
      testId: 'tcp1',
      targetId: 'lab-loopback-tcp',
      family: 'tcp',
      af: 4,
      timeoutMs: 1000,
      maxAttempts: 1,
    }],
  };
}

function signedManifest(raw, privateKey) {
  return { manifest: raw, signature: signFleetManifest(raw, privateKey) };
}

test('Stage 0 missing local enable marker disables before scheduler inputs are required', async () => {
  const gate = localGate(null);
  try {
    const run = await runFleetStage0Probe({ probeId: PROBE_ID, localEnableFile: gate.path });
    assert.equal(run.status, 'disabled');
    assert.equal(run.reason, 'local_marker_unavailable');
    assert.equal(run.measurements, 0);
    assert.deepEqual(run.envelopes, []);
  } finally {
    gate.cleanup();
  }
});

test('Stage 0 non-matching local marker remains disabled and performs no adapter work', async () => {
  const gate = localGate('disabled\n');
  let calls = 0;
  try {
    const run = await runFleetStage0Probe({
      probeId: PROBE_ID,
      localEnableFile: gate.path,
      adapters: { tcp: async () => { calls += 1; throw new Error('must not run'); } },
    });
    assert.equal(run.status, 'disabled');
    assert.equal(run.reason, 'local_marker_disabled');
    assert.equal(calls, 0);
  } finally {
    gate.cleanup();
  }
});

test('Stage 0 signed manifest executes loopback TCP and produces an ingestible host-free result envelope', async () => {
  const gate = localGate(FLEET_STAGE0_ENABLE_MARKER);
  const server = net.createServer((socket) => socket.end());
  const port = await listen(server);
  const registry = targets(port);
  const rawManifest = manifest();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  try {
    const run = await runFleetStage0Probe({
      probeId: PROBE_ID,
      probeSecret: PROBE_SECRET,
      manifestEnvelope: signedManifest(rawManifest, privateKey),
      schedulerPublicKey: publicKey,
      targets: registry,
      localEnableFile: gate.path,
      now: () => NOW,
    });
    assert.equal(run.status, 'completed');
    assert.equal(run.measurements, 1);
    assert.equal(run.envelopes.length, 1);
    const envelope = run.envelopes[0];
    assert.equal(envelope.result.outcome, 'observed');
    assert.equal(envelope.result.stages.tcp, 'ok');
    assert.equal(Object.hasOwn(envelope.result, 'host'), false);
    assert.equal(Object.hasOwn(envelope.result, 'port'), false);
    assert.equal(Object.hasOwn(envelope.result, 'url'), false);

    const validatedManifest = validateFleetManifest(rawManifest, registry, { now: NOW });
    const accepted = await ingestFleetResultEnvelope(envelope, {
      probeRegistry: normalizeFleetProbeRegistry([{ probeId: PROBE_ID, enabled: true, policyVersion: FLEET_POLICY_VERSION }]),
      resolveSecret: async () => PROBE_SECRET,
      manifest: validatedManifest,
      replayGuard: createFleetReplayGuard(),
      rateGuard: createFleetRateGuard(),
      now: NOW,
    });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.result.independentCensorshipVote, false);
  } finally {
    await close(server);
    gate.cleanup();
  }
});

test('Stage 0 enabled runner rejects a tampered scheduler manifest before any adapter call', async () => {
  const gate = localGate(FLEET_STAGE0_ENABLE_MARKER);
  const registry = targets(443);
  const rawManifest = manifest();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signedManifest(rawManifest, privateKey);
  envelope.manifest = structuredClone(envelope.manifest);
  envelope.manifest.tests[0].maxAttempts = 2;
  let calls = 0;
  try {
    await assert.rejects(() => runFleetStage0Probe({
      probeId: PROBE_ID,
      probeSecret: PROBE_SECRET,
      manifestEnvelope: envelope,
      schedulerPublicKey: publicKey,
      targets: registry,
      localEnableFile: gate.path,
      adapters: { tcp: async () => { calls += 1; return {}; } },
      now: () => NOW,
    }), /signature verification failed/);
    assert.equal(calls, 0);
  } finally {
    gate.cleanup();
  }
});

test('Stage 0 discards a measurement that finishes after signed manifest expiry', async () => {
  const gate = localGate(FLEET_STAGE0_ENABLE_MARKER);
  const registry = targets(443);
  const rawManifest = {
    ...manifest(),
    expiresAt: '2026-09-09T12:00:02.000Z',
  };
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const times = [new Date('2026-09-09T12:00:01.000Z'), new Date('2026-09-09T12:00:03.000Z')];
  try {
    await assert.rejects(() => runFleetStage0Probe({
      probeId: PROBE_ID,
      probeSecret: PROBE_SECRET,
      manifestEnvelope: signedManifest(rawManifest, privateKey),
      schedulerPublicKey: publicKey,
      targets: registry,
      localEnableFile: gate.path,
      adapters: {
        tcp: async () => ({
          outcome: 'observed',
          stages: { dns: 'not_run', tcp: 'ok', tls: 'not_run', http: 'not_run' },
          timingsMs: { tcp: 1, total: 1 },
          errorCode: null,
        }),
      },
      now: () => times.shift(),
    }), /outside the signed manifest window; result discarded/);
  } finally {
    gate.cleanup();
  }
});

test('Stage 0 rejects an invalid local probe secret before adapter execution', async () => {
  const gate = localGate(FLEET_STAGE0_ENABLE_MARKER);
  const registry = targets(443);
  const rawManifest = manifest();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  let calls = 0;
  try {
    await assert.rejects(() => runFleetStage0Probe({
      probeId: PROBE_ID,
      probeSecret: 'too-short',
      manifestEnvelope: signedManifest(rawManifest, privateKey),
      schedulerPublicKey: publicKey,
      targets: registry,
      localEnableFile: gate.path,
      adapters: { tcp: async () => { calls += 1; return {}; } },
      now: () => NOW,
    }), /at least 32 bytes/);
    assert.equal(calls, 0);
  } finally {
    gate.cleanup();
  }
});
