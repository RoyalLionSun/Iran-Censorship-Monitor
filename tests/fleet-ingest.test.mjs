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
const SECRET = Buffer.alloc(32, 11);

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

function result(overrides = {}) {
  return {
    probeId: PROBE_ID,
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

function probes(overrides = {}) {
  return [{ probeId: PROBE_ID, enabled: true, policyVersion: FLEET_POLICY_VERSION, ...overrides }];
}

function envelope(payload = result(), secret = SECRET) {
  return { result: payload, mac: signFleetResult(payload, secret) };
}

function controls(options = {}) {
  return {
    probeRegistry: normalizeFleetProbeRegistry(probes()),
    resolveSecret: async (probeId) => probeId === PROBE_ID ? SECRET : null,
    manifest: manifest(),
    replayGuard: createFleetReplayGuard(options.replay),
    rateGuard: createFleetRateGuard(options.rate),
    now: NOW,
  };
}

test('probe registry carries status/policy only and rejects embedded secrets or duplicates', () => {
  const registry = normalizeFleetProbeRegistry(probes());
  assert.deepEqual(registry.get(PROBE_ID), { probeId: PROBE_ID, enabled: true, policyVersion: FLEET_POLICY_VERSION });
  assert.equal('secret' in registry.get(PROBE_ID), false);
  assert.throws(() => normalizeFleetProbeRegistry([{ ...probes()[0], secret: 'must-not-live-here' }]), /unsupported field secret/);
  assert.throws(() => normalizeFleetProbeRegistry([...probes(), ...probes()]), /Duplicate fleet probeId/);
});

test('offline ingestion accepts an authenticated registered result bound to the validated manifest', async () => {
  let resolvedFor = null;
  const opts = controls();
  opts.resolveSecret = async (probeId) => { resolvedFor = probeId; return SECRET; };
  const accepted = await ingestFleetResultEnvelope(envelope(), opts);
  assert.equal(resolvedFor, PROBE_ID);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.ingestedAt, NOW.toISOString());
  assert.equal(accepted.result.evidenceRole, 'owned-probe-observation');
  assert.equal(accepted.result.independentCensorshipVote, false);
});

test('unknown or disabled probes fail before becoming accepted observations', async () => {
  let secretLookups = 0;
  const unknown = controls();
  unknown.probeRegistry = normalizeFleetProbeRegistry([]);
  unknown.resolveSecret = async () => { secretLookups += 1; return SECRET; };
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(), unknown), /not registered/);
  assert.equal(secretLookups, 0);

  const disabled = controls();
  disabled.probeRegistry = normalizeFleetProbeRegistry(probes({ enabled: false }));
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(), disabled), /disabled/);
});

test('MAC tampering and unavailable probe secret fail closed', async () => {
  const wrongMac = controls();
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(result(), Buffer.alloc(32, 12)), wrongMac), /MAC verification failed/);

  const missingSecret = controls();
  missingSecret.resolveSecret = async () => null;
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(), missingSecret), /no available secret/);
});

test('replayed result is recognized as duplicate and cannot become a second observation', async () => {
  const opts = controls();
  const first = await ingestFleetResultEnvelope(envelope(), opts);
  const second = await ingestFleetResultEnvelope(envelope(), opts);
  assert.equal(first.status, 'accepted');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.accepted, false);
  assert.equal(second.result.testId, 't1');
});

test('per-probe ingestion rate gate rejects excess authenticated results', async () => {
  const opts = controls({ rate: { windowMs: 60_000, maxPerWindow: 2 } });
  for (const measuredAt of ['2026-09-09T12:05:00.000Z', '2026-09-09T12:06:00.000Z']) {
    const payload = result({ measuredAt });
    assert.equal((await ingestFleetResultEnvelope(envelope(payload), opts)).status, 'accepted');
  }
  const third = result({ measuredAt: '2026-09-09T12:07:00.000Z' });
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(third), opts), /exceeded the ingestion rate limit/);
});

test('oversized envelope is rejected before secret resolution or schema processing', async () => {
  let secretLookups = 0;
  const opts = controls();
  opts.maxBytes = 1024;
  opts.resolveSecret = async () => { secretLookups += 1; return SECRET; };
  const huge = envelope();
  huge.padding = 'x'.repeat(5000);
  await assert.rejects(() => ingestFleetResultEnvelope(huge, opts), /exceeds 1024 bytes/);
  assert.equal(secretLookups, 0);
});

test('ingestion requires replay/rate controls and a validated manifest definition', async () => {
  const noManifest = controls();
  noManifest.manifest = null;
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(), noManifest), /requires the validated signed-manifest definition/);

  const noReplay = controls();
  noReplay.replayGuard = null;
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(), noReplay), /requires a replay guard/);

  const noRate = controls();
  noRate.rateGuard = null;
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(), noRate), /requires a rate guard/);
});

test('replay guard is bounded, expires old keys and fails closed at capacity', () => {
  const guard = createFleetReplayGuard({ ttlMs: 60_000, maxEntries: 1 });
  assert.equal(guard.checkAndRemember('a', '2026-09-09T12:00:00.000Z'), true);
  assert.equal(guard.checkAndRemember('a', '2026-09-09T12:00:30.000Z'), false);
  assert.throws(() => guard.checkAndRemember('b', '2026-09-09T12:00:30.000Z'), /capacity exhausted/);
  assert.equal(guard.checkAndRemember('b', '2026-09-09T12:01:01.000Z'), true);
  assert.equal(guard.size('2026-09-09T12:01:01.000Z'), 1);
});

test('malformed or stale result envelopes remain errors rather than no-data/zero observations', async () => {
  const opts = controls();
  await assert.rejects(() => ingestFleetResultEnvelope(null, opts), /envelope is invalid/);

  const stale = result({ measuredAt: '2026-09-08T12:09:59.000Z' });
  await assert.rejects(() => ingestFleetResultEnvelope(envelope(stale), controls()), /outside the accepted ingestion window/);
});
