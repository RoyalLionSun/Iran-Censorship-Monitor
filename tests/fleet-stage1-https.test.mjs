import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildFleetStage1ManifestRequest,
  buildFleetStage1ResultRequest,
} from '../lib/fleet-stage1-transport.mjs';
import {
  createFleetStage1CheckServerIdentity,
  createFleetStage1HttpsTransport,
  fleetStage1SpkiPinFromCertificate,
  normalizeFleetStage1SpkiPins,
} from '../lib/fleet-stage1-https.mjs';

const PROBE_ID = 'p_1234567890abcdef';
const CONFIG = { origin: 'https://fleet.example.invalid', pollIntervalMs: 15 * 60_000 };
const PIN_A = Buffer.alloc(32, 1).toString('base64');
const PIN_B = Buffer.alloc(32, 2).toString('base64');

function tlsMaterial() {
  const dir = mkdtempSync(join(tmpdir(), 'iran-monitor-stage1-tls-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const generated = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '1',
    '-subj', '/CN=fleet.example.invalid',
    '-addext', 'subjectAltName=DNS:fleet.example.invalid',
  ], { encoding: 'utf8' });
  if (generated.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`OpenSSL is required for the Stage 1 TLS fixture: ${generated.stderr || generated.error || 'unknown error'}`);
  }
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function legacyCertificate(certPem) {
  const x509 = new X509Certificate(certPem);
  return {
    ...x509.toLegacyObject(),
    pubkey: x509.publicKey.export({ type: 'spki', format: 'der' }),
  };
}

function fakeRequestImpl({ status = 204, headers = {}, body = '', onRequest = null } = {}) {
  return (options, callback) => {
    const request = new EventEmitter();
    let written = '';
    request.setTimeout = () => request;
    request.write = (chunk) => { written += String(chunk); return true; };
    request.destroy = (error) => queueMicrotask(() => request.emit('error', error));
    request.end = () => {
      queueMicrotask(() => {
        onRequest?.({ options, body: written });
        const response = Readable.from([body]);
        response.statusCode = status;
        response.headers = headers;
        callback(response);
      });
    };
    return request;
  };
}

test('Stage 1 SPKI pin set requires at least two distinct SHA-256 pins for rotation', () => {
  assert.deepEqual(normalizeFleetStage1SpkiPins([PIN_A, `sha256/${PIN_B}`]), [PIN_A, PIN_B]);
  assert.throws(() => normalizeFleetStage1SpkiPins([PIN_A]), /at least 2/);
  assert.throws(() => normalizeFleetStage1SpkiPins([PIN_A, PIN_A]), /distinct/);
  assert.throws(() => normalizeFleetStage1SpkiPins(['not-a-pin', PIN_B]), /base64 SHA-256/);
});

test('Stage 1 server identity requires both hostname validation and a locally provisioned SPKI pin', () => {
  const material = tlsMaterial();
  try {
    const cert = legacyCertificate(material.cert);
    const actualPin = fleetStage1SpkiPinFromCertificate(cert);
    const nextPin = Buffer.alloc(32, 9).toString('base64');
    const check = createFleetStage1CheckServerIdentity([actualPin, nextPin]);
    assert.equal(check('fleet.example.invalid', cert), undefined);
    assert.ok(check('wrong.example.invalid', cert) instanceof Error);

    const wrongPins = createFleetStage1CheckServerIdentity([PIN_A, PIN_B]);
    assert.match(wrongPins('fleet.example.invalid', cert).message, /SPKI pin verification failed/);
  } finally {
    material.cleanup();
  }
});

test('Stage 1 HTTPS transport fixes TLS hostname port method path and certificate verification options', async () => {
  const material = tlsMaterial();
  let captured = null;
  try {
    const transport = createFleetStage1HttpsTransport({
      spkiPins: [PIN_A, PIN_B],
      ca: material.cert,
      requestImpl: fakeRequestImpl({
        status: 204,
        onRequest: (request) => { captured = request; },
      }),
    });
    const response = await transport(buildFleetStage1ManifestRequest(CONFIG, PROBE_ID));
    assert.equal(response.status, 204);
    assert.ok(Buffer.isBuffer(response.body));
    assert.equal(captured.options.protocol, 'https:');
    assert.equal(captured.options.hostname, 'fleet.example.invalid');
    assert.equal(captured.options.servername, 'fleet.example.invalid');
    assert.equal(captured.options.port, 443);
    assert.equal(captured.options.path, '/fleet/v1/manifest');
    assert.equal(captured.options.method, 'GET');
    assert.equal(captured.options.rejectUnauthorized, true);
    assert.equal(captured.options.minVersion, 'TLSv1.2');
    assert.equal(captured.options.agent, false);
    assert.equal(typeof captured.options.checkServerIdentity, 'function');
    assert.equal(captured.options.ca, material.cert);
    assert.equal(captured.body, '');
  } finally {
    material.cleanup();
  }
});

test('Stage 1 HTTPS transport forwards only the bounded JSON result body to the fixed result path', async () => {
  let captured = null;
  const envelope = {
    result: { probeId: PROBE_ID, targetId: 'lab-stage1', testId: 't1' },
    mac: 'example-mac',
  };
  const transport = createFleetStage1HttpsTransport({
    spkiPins: [PIN_A, PIN_B],
    requestImpl: fakeRequestImpl({
      status: 202,
      onRequest: (request) => { captured = request; },
    }),
  });
  const response = await transport(buildFleetStage1ResultRequest(CONFIG, PROBE_ID, envelope));
  assert.equal(response.status, 202);
  assert.equal(captured.options.path, '/fleet/v1/result');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(captured.body).result.probeId, PROBE_ID);
});

test('Stage 1 HTTPS transport refuses unexpected paths before invoking the network implementation', async () => {
  let calls = 0;
  const transport = createFleetStage1HttpsTransport({
    spkiPins: [PIN_A, PIN_B],
    requestImpl: () => { calls += 1; throw new Error('must not run'); },
  });
  await assert.rejects(() => transport({
    method: 'GET',
    url: 'https://fleet.example.invalid/anything-else',
    headers: {},
    redirect: 'manual',
    body: null,
    maxResponseBytes: 32,
  }), /unexpected method\/path/);
  assert.equal(calls, 0);
});

test('Stage 1 HTTPS transport enforces response byte ceilings before returning upstream data', async () => {
  const transport = createFleetStage1HttpsTransport({
    spkiPins: [PIN_A, PIN_B],
    requestImpl: fakeRequestImpl({ status: 200, headers: { 'content-type': 'application/json' }, body: '12345' }),
  });
  const request = { ...buildFleetStage1ManifestRequest(CONFIG, PROBE_ID), maxResponseBytes: 4 };
  await assert.rejects(() => transport(request), /response exceeds 4 bytes/);
});
