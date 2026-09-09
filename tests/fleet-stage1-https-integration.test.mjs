import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { createServer as createHttpsServer, request as realHttpsRequest } from 'node:https';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFleetStage1ManifestRequest } from '../lib/fleet-stage1-transport.mjs';
import {
  createFleetStage1HttpsTransport,
  fleetStage1SpkiPinFromCertificate,
} from '../lib/fleet-stage1-https.mjs';

const PROBE_ID = 'p_1234567890abcdef';
const CONFIG = { origin: 'https://fleet.example.invalid', pollIntervalMs: 15 * 60_000 };

function tlsMaterial() {
  const dir = mkdtempSync(join(tmpdir(), 'iran-monitor-stage1-real-tls-'));
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
    throw new Error(`OpenSSL is required for the Stage 1 real TLS fixture: ${generated.stderr || generated.error || 'unknown error'}`);
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

function loopbackRealHttpsRequest(port) {
  return (options, callback) => realHttpsRequest({
    ...options,
    // Laboratory socket redirection only. The production transport still generated
    // HTTPS/443 with servername=fleet.example.invalid; TLS identity checks retain
    // that servername while the test socket is forced to a local ephemeral port.
    port,
    lookup: (_hostname, lookupOptions, done) => {
      if (lookupOptions?.all) {
        done(null, [{ address: '127.0.0.1', family: 4 }]);
        return;
      }
      done(null, '127.0.0.1', 4);
    },
  }, callback);
}

test('Stage 1 production TLS policy completes a real Node HTTPS handshake against a loopback laboratory server', async () => {
  const material = tlsMaterial();
  let method = null;
  let path = null;
  let host = null;
  const server = createHttpsServer({ key: material.key, cert: material.cert }, (req, res) => {
    method = req.method;
    path = req.url;
    host = req.headers.host;
    res.writeHead(204);
    res.end();
  });
  const port = await listen(server);

  try {
    const actualPin = fleetStage1SpkiPinFromCertificate(legacyCertificate(material.cert));
    const nextPin = Buffer.alloc(32, 91).toString('base64');
    const transport = createFleetStage1HttpsTransport({
      spkiPins: [actualPin, nextPin],
      ca: material.cert,
      requestImpl: loopbackRealHttpsRequest(port),
    });

    const response = await transport(buildFleetStage1ManifestRequest(CONFIG, PROBE_ID));
    assert.equal(response.status, 204);
    assert.equal(method, 'GET');
    assert.equal(path, '/fleet/v1/manifest');
    assert.ok(typeof host === 'string' && host.startsWith('fleet.example.invalid'));
  } finally {
    await close(server);
    material.cleanup();
  }
});

test('Stage 1 real Node HTTPS handshake fails closed when the local SPKI pin set does not contain the server key', async () => {
  const material = tlsMaterial();
  let requests = 0;
  const server = createHttpsServer({ key: material.key, cert: material.cert }, (_req, res) => {
    requests += 1;
    res.writeHead(204);
    res.end();
  });
  const port = await listen(server);

  try {
    const wrongPinA = Buffer.alloc(32, 71).toString('base64');
    const wrongPinB = Buffer.alloc(32, 72).toString('base64');
    const transport = createFleetStage1HttpsTransport({
      spkiPins: [wrongPinA, wrongPinB],
      ca: material.cert,
      requestImpl: loopbackRealHttpsRequest(port),
    });

    await assert.rejects(
      () => transport(buildFleetStage1ManifestRequest(CONFIG, PROBE_ID)),
      /SPKI pin verification failed/,
    );
    assert.equal(requests, 0);
  } finally {
    await close(server);
    material.cleanup();
  }
});
