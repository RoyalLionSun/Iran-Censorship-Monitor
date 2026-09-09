import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FLEET_POLICY_VERSION, signFleetManifest } from '../lib/fleet.mjs';
import { createFleetStage1MemoryQueue } from '../lib/fleet-stage1-transport.mjs';
import {
  FLEET_STAGE1_ENABLE_MARKER,
  runFleetStage1OfflineCycle,
} from '../lib/fleet-stage1-runner.mjs';

const NOW = new Date('2026-09-09T12:30:00.000Z');
const PROBE_ID = 'p_1234567890abcdef';
const PROBE_SECRET = Buffer.alloc(32, 61);
const CONFIG = { origin: 'https://fleet.example.invalid', pollIntervalMs: 15 * 60_000 };

function localGate(content = FLEET_STAGE1_ENABLE_MARKER) {
  const dir = mkdtempSync(join(tmpdir(), 'iran-monitor-stage1-gate-'));
  const path = join(dir, 'stage1.enabled');
  if (content != null) writeFileSync(path, content, 'utf8');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function targets() {
  return [{
    targetId: 'lab-stage1-tcp',
    safetyClass: 'A',
    owner: 'project',
    host: 'lab-target.example.invalid',
    port: 443,
    families: ['tcp'],
    approved: true,
    enabled: true,
  }];
}

function rawManifest() {
  return {
    policyVersion: FLEET_POLICY_VERSION,
    issuedAt: '2026-09-09T12:20:00.000Z',
    expiresAt: '2026-09-09T12:50:00.000Z',
    nonce: 'nonce_stage1_1234567890',
    tests: [{
      testId: 'tcp1',
      targetId: 'lab-stage1-tcp',
      family: 'tcp',
      af: 4,
      timeoutMs: 1000,
      maxAttempts: 1,
    }],
  };
}

function signedManifest(privateKey) {
  const manifest = rawManifest();
  return { manifest, signature: signFleetManifest(manifest, privateKey) };
}

function manifestResponse(envelope, extraHeaders = {}) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json', etag: '"stage1-m1"', ...extraHeaders },
    body: JSON.stringify(envelope),
  };
}

function adapterResult() {
  return {
    outcome: 'observed',
    stages: { dns: 'not_run', tcp: 'ok', tls: 'not_run', http: 'not_run' },
    timingsMs: { tcp: 12, total: 12 },
    errorCode: null,
  };
}

function common({ gate, publicKey, transport, queue, adapters } = {}) {
  return {
    probeId: PROBE_ID,
    probeSecret: PROBE_SECRET,
    schedulerPublicKey: publicKey,
    targets: targets(),
    localEnableFile: gate.path,
    config: CONFIG,
    queue: queue ?? createFleetStage1MemoryQueue(),
    transport,
    adapters: adapters ?? { tcp: async () => adapterResult() },
    now: () => new Date(NOW),
  };
}

test('Stage 1 missing local enable marker disables before transport or scheduler inputs are required', async () => {
  const gate = localGate(null);
  try {
    const result = await runFleetStage1OfflineCycle({
      probeId: PROBE_ID,
      localEnableFile: gate.path,
      now: () => new Date(NOW),
    });
    assert.equal(result.status, 'disabled');
    assert.equal(result.reason, 'local_marker_unavailable');
    assert.equal(result.measurements, 0);
    assert.equal(result.independentCensorshipVote, false);
  } finally {
    gate.cleanup();
  }
});

test('Stage 1 offline cycle performs poll verify local compile execute queue submit in order', async () => {
  const gate = localGate();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signedManifest(privateKey);
  const calls = [];
  let adapterRequest = null;
  const queue = createFleetStage1MemoryQueue();

  const transport = async (request) => {
    calls.push(request);
    if (request.method === 'GET') return manifestResponse(envelope);
    if (request.method === 'POST') {
      const payload = JSON.parse(request.body);
      assert.equal(payload.result.probeId, PROBE_ID);
      assert.equal(payload.result.targetId, 'lab-stage1-tcp');
      assert.equal('host' in payload.result, false);
      assert.equal('port' in payload.result, false);
      assert.equal(request.url, 'https://fleet.example.invalid/fleet/v1/result');
      return { status: 202, headers: {}, body: '' };
    }
    throw new Error('unexpected request');
  };

  try {
    const result = await runFleetStage1OfflineCycle(common({
      gate,
      publicKey,
      transport,
      queue,
      adapters: {
        tcp: async (request) => {
          adapterRequest = request;
          return adapterResult();
        },
      },
    }));

    assert.equal(result.status, 'completed');
    assert.equal(result.measurements, 1);
    assert.equal(result.submitted, 1);
    assert.equal(result.duplicates, 0);
    assert.equal(result.dropped, 0);
    assert.equal(result.queued, 0);
    assert.equal(result.etag, '"stage1-m1"');
    assert.equal(result.independentCensorshipVote, false);
    assert.deepEqual(calls.map(({ method }) => method), ['GET', 'POST']);
    assert.equal(calls[0].url, 'https://fleet.example.invalid/fleet/v1/manifest');
    assert.equal(calls[0].redirect, 'manual');
    assert.equal(adapterRequest.host, 'lab-target.example.invalid');
    assert.equal(adapterRequest.port, 443);
  } finally {
    gate.cleanup();
  }
});

test('Stage 1 rejects a tampered scheduler manifest before any local adapter or result submission', async () => {
  const gate = localGate();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signedManifest(privateKey);
  envelope.signature = 'A';
  let adapterCalls = 0;
  let transportCalls = 0;

  try {
    await assert.rejects(() => runFleetStage1OfflineCycle(common({
      gate,
      publicKey,
      transport: async () => {
        transportCalls += 1;
        return manifestResponse(envelope);
      },
      adapters: { tcp: async () => { adapterCalls += 1; return adapterResult(); } },
    })), /signature verification failed/);
    assert.equal(transportCalls, 1);
    assert.equal(adapterCalls, 0);
  } finally {
    gate.cleanup();
  }
});

test('Stage 1 no-work response performs zero measurements and remains non-evidence', async () => {
  const gate = localGate();
  const { publicKey } = generateKeyPairSync('ed25519');
  let adapterCalls = 0;
  try {
    const result = await runFleetStage1OfflineCycle(common({
      gate,
      publicKey,
      transport: async () => ({ status: 204, headers: {}, body: '' }),
      adapters: { tcp: async () => { adapterCalls += 1; return adapterResult(); } },
    }));
    assert.equal(result.status, 'no_work');
    assert.equal(result.measurements, 0);
    assert.equal(adapterCalls, 0);
    assert.equal(result.nextDelayMs, CONFIG.pollIntervalMs);
    assert.equal(result.independentCensorshipVote, false);
  } finally {
    gate.cleanup();
  }
});

test('Stage 1 result transport failure keeps one memory result and next cycle drains it without polling new work', async () => {
  const gate = localGate();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signedManifest(privateKey);
  const queue = createFleetStage1MemoryQueue();
  const firstCalls = [];
  let adapterCalls = 0;

  try {
    const first = await runFleetStage1OfflineCycle(common({
      gate,
      publicKey,
      queue,
      transport: async (request) => {
        firstCalls.push(request.method);
        if (request.method === 'GET') return manifestResponse(envelope);
        throw new Error('simulated collection outage');
      },
      adapters: { tcp: async () => { adapterCalls += 1; return adapterResult(); } },
    }));

    assert.equal(first.status, 'result_transport_unavailable');
    assert.equal(first.measurements, 1);
    assert.equal(first.queued, 1);
    assert.equal(first.submitted, 0);
    assert.ok(first.nextDelayMs >= 60_000);
    assert.deepEqual(firstCalls, ['GET', 'POST']);
    assert.equal(adapterCalls, 1);

    const secondCalls = [];
    const second = await runFleetStage1OfflineCycle(common({
      gate,
      publicKey,
      queue,
      transport: async (request) => {
        secondCalls.push(request.method);
        assert.equal(request.method, 'POST');
        return { status: 204, headers: {}, body: '' };
      },
      adapters: { tcp: async () => { throw new Error('must not execute new work'); } },
    }));

    assert.equal(second.status, 'drained_pending');
    assert.equal(second.measurements, 0);
    assert.equal(second.submitted, 1);
    assert.equal(second.queued, 0);
    assert.deepEqual(secondCalls, ['POST']);
  } finally {
    gate.cleanup();
  }
});

test('Stage 1 manifest transport failure is control transport state, never a measurement verdict', async () => {
  const gate = localGate();
  const { publicKey } = generateKeyPairSync('ed25519');
  try {
    const result = await runFleetStage1OfflineCycle(common({
      gate,
      publicKey,
      transport: async () => { throw new Error('simulated control outage'); },
    }));
    assert.equal(result.status, 'control_transport_unavailable');
    assert.equal(result.measurements, 0);
    assert.equal(result.queued, 0);
    assert.ok(result.nextDelayMs >= 60_000);
    assert.equal(result.independentCensorshipVote, false);
  } finally {
    gate.cleanup();
  }
});

test('Stage 1 offline runner contains no built-in HTTP socket DNS or fetch client', () => {
  const source = readFileSync(new URL('../lib/fleet-stage1-runner.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.match(source, /injected transport adapter/);
});
