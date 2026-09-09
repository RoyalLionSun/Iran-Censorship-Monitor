import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLEET_EDGE_MAX_CONCURRENCY,
  FLEET_RESULT_PATH,
  admitFleetCollectionRequest,
  createFleetEdgeConcurrencyGate,
} from '../lib/fleet-edge.mjs';

const PROBE_ID = 'p_1234567890abcdef';

function envelope() {
  return {
    result: {
      probeId: PROBE_ID,
      policyVersion: '1.2-lab1',
      manifestNonce: 'nonce_1234567890abcdef',
      testId: 't1',
      targetId: 'lab-target',
      family: 'tcp',
      af: 4,
      measuredAt: '2026-09-09T12:05:00.000Z',
      outcome: 'observed',
      stages: { dns: 'not_run', tcp: 'ok', tls: 'not_run', http: 'not_run' },
      timingsMs: { tcp: 5, total: 5 },
      errorCode: null,
    },
    mac: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  };
}

function request(overrides = {}) {
  const body = JSON.stringify(envelope());
  return {
    method: 'POST',
    path: FLEET_RESULT_PATH,
    headers: {
      'Content-Type': 'application/json',
      'X-Fleet-Probe-Id': PROBE_ID,
      'Content-Length': String(Buffer.byteLength(body)),
      'X-Forwarded-For': '203.0.113.44',
      'Forwarded': 'for=203.0.113.44',
    },
    body,
    sourceIp: '203.0.113.44',
    sourcePort: 54321,
    ...overrides,
  };
}

test('collection admission keeps only pseudonymous identity, bounded body and envelope', () => {
  const admitted = admitFleetCollectionRequest(request());
  assert.equal(admitted.probeId, PROBE_ID);
  assert.equal(admitted.envelope.result.probeId, PROBE_ID);
  assert.equal(admitted.sourceMetadataRetained, false);
  assert.equal(admitted.independentCensorshipVote, false);
  assert.equal('sourceIp' in admitted, false);
  assert.equal('sourcePort' in admitted, false);
  assert.equal('headers' in admitted, false);
  assert.equal(JSON.stringify(admitted).includes('203.0.113.44'), false);
});

test('collection admission rejects unexpected method path and content type before ingestion', () => {
  assert.throws(() => admitFleetCollectionRequest(request({ method: 'GET' })), /POST only/);
  assert.throws(() => admitFleetCollectionRequest(request({ path: '/other' })), /path is invalid/);
  assert.throws(() => admitFleetCollectionRequest(request({ headers: { 'Content-Type': 'text/plain', 'X-Fleet-Probe-Id': PROBE_ID } })), /Content-Type/);
});

test('collection admission rejects invalid or mismatched probe identity', () => {
  const body = JSON.stringify(envelope());
  assert.throws(() => admitFleetCollectionRequest(request({ headers: { 'Content-Type': 'application/json', 'X-Fleet-Probe-Id': 'bad', 'Content-Length': String(Buffer.byteLength(body)) } })), /X-Fleet-Probe-Id/);

  const other = envelope();
  other.result.probeId = 'p_abcdef1234567890';
  const otherBody = JSON.stringify(other);
  assert.throws(() => admitFleetCollectionRequest(request({ body: otherBody, headers: { 'Content-Type': 'application/json', 'X-Fleet-Probe-Id': PROBE_ID, 'Content-Length': String(Buffer.byteLength(otherBody)) } })), /does not match/);
});

test('collection admission enforces body and declared-length bounds before accepting JSON', () => {
  const body = JSON.stringify(envelope());
  assert.throws(() => admitFleetCollectionRequest(request({ headers: { 'Content-Type': 'application/json', 'X-Fleet-Probe-Id': PROBE_ID, 'Content-Length': String(Buffer.byteLength(body) + 1) } })), /does not match body size/);
  assert.throws(() => admitFleetCollectionRequest(request({ body: 'x'.repeat(2048), headers: { 'Content-Type': 'application/json', 'X-Fleet-Probe-Id': PROBE_ID } }), { maxBytes: 1024 }), /exceeds 1024 bytes/);
  assert.throws(() => admitFleetCollectionRequest(request({ body: '{not-json', headers: { 'Content-Type': 'application/json', 'X-Fleet-Probe-Id': PROBE_ID } })), /not valid JSON/);
});

test('collection admission ignores forwarding/source metadata rather than using it for rate or evidence semantics', () => {
  const a = admitFleetCollectionRequest(request());
  const b = admitFleetCollectionRequest(request({ sourceIp: '198.51.100.9', headers: { ...request().headers, 'X-Forwarded-For': '198.51.100.9' } }));
  assert.equal(a.probeId, b.probeId);
  assert.equal(a.sourceMetadataRetained, false);
  assert.equal(b.sourceMetadataRetained, false);
});

test('global concurrency gate is bounded, releases exactly once and keeps no network identity', () => {
  const gate = createFleetEdgeConcurrencyGate({ maxConcurrent: 2 });
  const first = gate.acquire();
  const second = gate.acquire();
  assert.equal(gate.active(), 2);
  assert.throws(() => gate.acquire(), /concurrency limit reached/);
  assert.equal(first.release(), true);
  assert.equal(first.release(), false);
  assert.equal(gate.active(), 1);
  const third = gate.acquire();
  assert.equal(gate.active(), 2);
  second.release();
  third.release();
  assert.equal(gate.active(), 0);
  assert.equal(gate.capacity(), 2);
  assert.equal(FLEET_EDGE_MAX_CONCURRENCY, 32);
});
