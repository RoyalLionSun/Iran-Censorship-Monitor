import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFleetStage0LabAdapters } from '../lib/fleet-lab-adapters.mjs';

function request(family, overrides = {}) {
  return {
    testId: 'lab-test',
    targetId: 'lab-loopback',
    family,
    af: 4,
    timeoutMs: 1000,
    maxAttempts: 1,
    host: 'localhost',
    port: 443,
    ...overrides,
  };
}

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function tlsMaterial() {
  const dir = mkdtempSync(join(tmpdir(), 'iran-monitor-stage0-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const generated = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '1',
    '-subj', '/CN=localhost',
  ], { encoding: 'utf8' });
  if (generated.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`OpenSSL is required for the Stage 0 TLS fixture: ${generated.stderr || generated.error || 'unknown error'}`);
  }
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('Stage 0 lab adapters refuse non-loopback hosts before DNS or socket activity', async () => {
  let lookups = 0;
  let connects = 0;
  const adapters = createFleetStage0LabAdapters({
    lookup: async () => { lookups += 1; return [{ address: '127.0.0.1', family: 4 }]; },
    connect: () => { connects += 1; throw new Error('must not connect'); },
  });
  await assert.rejects(() => adapters.tcp(request('tcp', { host: 'example.com', port: 443 })), /refuses non-loopback host/);
  assert.equal(lookups, 0);
  assert.equal(connects, 0);
});

test('Stage 0 DNS adapter resolves localhost only and reports one bounded observation', async () => {
  const result = await createFleetStage0LabAdapters().dns(request('dns', { port: 53 }));
  assert.equal(result.outcome, 'observed');
  assert.equal(result.stages.dns, 'ok');
  assert.equal(result.stages.tcp, 'not_run');
  assert.equal(result.errorCode, null);
  assert.ok(result.timingsMs.dns >= 0);
  assert.ok(result.timingsMs.total >= 0);
});

test('Stage 0 TCP adapter opens only an outbound loopback connection', async () => {
  const server = net.createServer((socket) => socket.end());
  const port = await listen(server);
  try {
    const result = await createFleetStage0LabAdapters().tcp(request('tcp', { host: '127.0.0.1', port }));
    assert.equal(result.outcome, 'observed');
    assert.equal(result.stages.dns, 'not_run');
    assert.equal(result.stages.tcp, 'ok');
    assert.equal(result.stages.tls, 'not_run');
    assert.equal(result.errorCode, null);
  } finally {
    await close(server);
  }
});

test('Stage 0 TCP refusal is connect_error, never a censorship/blocking verdict', async () => {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);
  const result = await createFleetStage0LabAdapters().tcp(request('tcp', { host: '127.0.0.1', port }));
  assert.equal(result.outcome, 'error');
  assert.equal(result.stages.tcp, 'error');
  assert.equal(result.errorCode, 'connect_error');
  assert.equal(Object.hasOwn(result, 'blocked'), false);
});

test('Stage 0 TLS adapter completes a real outbound loopback TLS handshake', async () => {
  const material = tlsMaterial();
  const server = tls.createServer({ key: material.key, cert: material.cert }, (socket) => socket.end());
  const port = await listen(server);
  try {
    const result = await createFleetStage0LabAdapters().tls(request('tls', { port }));
    assert.equal(result.outcome, 'observed');
    assert.equal(result.stages.dns, 'ok');
    assert.equal(result.stages.tcp, 'ok');
    assert.equal(result.stages.tls, 'ok');
    assert.equal(result.stages.http, 'not_run');
    assert.equal(result.errorCode, null);
  } finally {
    await close(server);
    material.cleanup();
  }
});

test('Stage 0 HTTPS adapter sends HEAD only to a loopback TLS fixture', async () => {
  const material = tlsMaterial();
  let method = null;
  let path = null;
  const server = https.createServer({ key: material.key, cert: material.cert }, (req, res) => {
    method = req.method;
    path = req.url;
    res.writeHead(204);
    res.end();
  });
  const port = await listen(server);
  try {
    const result = await createFleetStage0LabAdapters().https(request('https', { port }));
    assert.equal(result.outcome, 'observed');
    assert.equal(result.stages.dns, 'ok');
    assert.equal(result.stages.tcp, 'ok');
    assert.equal(result.stages.tls, 'ok');
    assert.equal(result.stages.http, 'ok');
    assert.equal(result.errorCode, null);
    assert.equal(method, 'HEAD');
    assert.equal(path, '/');
  } finally {
    await close(server);
    material.cleanup();
  }
});

test('Stage 0 HTTPS 5xx response remains http_error and never becomes blocked', async () => {
  const material = tlsMaterial();
  const server = https.createServer({ key: material.key, cert: material.cert }, (_req, res) => {
    res.writeHead(503);
    res.end();
  });
  const port = await listen(server);
  try {
    const result = await createFleetStage0LabAdapters().https(request('https', { port }));
    assert.equal(result.outcome, 'error');
    assert.equal(result.stages.tcp, 'ok');
    assert.equal(result.stages.tls, 'ok');
    assert.equal(result.stages.http, 'error');
    assert.equal(result.errorCode, 'http_error');
    assert.equal(Object.hasOwn(result, 'blocked'), false);
  } finally {
    await close(server);
    material.cleanup();
  }
});

test('Stage 0 TLS handshake stall is a bounded timeout, not a fabricated failure cause', async () => {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  try {
    const result = await createFleetStage0LabAdapters().tls(request('tls', { port, timeoutMs: 500 }));
    assert.equal(result.outcome, 'timeout');
    assert.equal(result.errorCode, 'timeout');
    assert.equal(Object.hasOwn(result, 'blocked'), false);
  } finally {
    for (const socket of sockets) socket.destroy();
    await close(server);
  }
});
