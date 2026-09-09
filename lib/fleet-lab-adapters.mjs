import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

const CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTDOWN', 'EHOSTUNREACH', 'ENETDOWN',
  'ENETUNREACH', 'EPIPE', 'ETIMEDOUT',
]);

function isLoopbackAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return address.split('.')[0] === '127';
  if (family === 6) return address === '::1' || /^0*:0*:0*:0*:0*:0*:0*:1$/i.test(address);
  return false;
}

function assertLabHost(host) {
  if (typeof host !== 'string' || !host) throw new Error('Fleet lab host is invalid.');
  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (normalized === 'localhost' || isLoopbackAddress(normalized)) return normalized;
  throw new Error(`Fleet Stage 0 lab adapter refuses non-loopback host ${host}.`);
}

function validateRequest(request, family) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Fleet lab adapter request is invalid.');
  if (request.family !== family) throw new Error(`Fleet lab ${family} adapter received family ${request.family}.`);
  if (request.af !== 4 && request.af !== 6) throw new Error('Fleet lab address family must be 4 or 6.');
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 500 || request.timeoutMs > 10_000) throw new Error('Fleet lab timeout is invalid.');
  if (!Number.isInteger(request.maxAttempts) || request.maxAttempts < 1 || request.maxAttempts > 3) throw new Error('Fleet lab attempt count is invalid.');
  if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535) throw new Error('Fleet lab port is invalid.');
  return { ...request, host: assertLabHost(request.host) };
}

function elapsed(start) {
  return Math.max(0, Math.round((performance.now() - start) * 1000) / 1000);
}

function emptyStages() {
  return { dns: 'not_run', tcp: 'not_run', tls: 'not_run', http: 'not_run' };
}

function result(outcome, stages, timingsMs, errorCode = null) {
  return Object.freeze({
    outcome,
    stages: Object.freeze({ ...stages }),
    timingsMs: Object.freeze({ ...timingsMs }),
    errorCode,
  });
}

function timeoutResult(stages, timingsMs) {
  return result('timeout', stages, timingsMs, 'timeout');
}

function errorResult(stages, timingsMs, errorCode) {
  return result('error', stages, timingsMs, errorCode);
}

async function resolveLoopback(host, af, lookup) {
  const start = performance.now();
  const literalFamily = net.isIP(host);
  if (literalFamily) {
    if (literalFamily !== af) throw Object.assign(new Error('Loopback literal does not match requested address family.'), { code: 'EAFNOSUPPORT' });
    return { address: host, dnsStage: 'not_run', dnsMs: 0 };
  }

  const answers = await lookup(host, { family: af, all: true, verbatim: true });
  if (!Array.isArray(answers) || answers.length < 1) throw new Error('Loopback DNS lookup returned no addresses.');
  const answer = answers.find((item) => item && item.family === af && isLoopbackAddress(item.address));
  if (!answer) throw new Error('Loopback DNS lookup resolved outside loopback; refusing connection.');
  if (answers.some((item) => item && item.address && !isLoopbackAddress(item.address))) {
    throw new Error('Loopback DNS lookup contained a non-loopback address; refusing connection.');
  }
  return { address: answer.address, dnsStage: 'ok', dnsMs: elapsed(start) };
}

function isConnectError(error) {
  return Boolean(error && CONNECT_ERROR_CODES.has(error.code));
}

async function runAttempts(request, operation) {
  let finalResult = null;
  let totalMs = 0;
  for (let attempt = 0; attempt < request.maxAttempts; attempt += 1) {
    const started = performance.now();
    finalResult = await operation();
    totalMs += elapsed(started);
    if (finalResult.outcome === 'observed') break;
  }
  return result(finalResult.outcome, finalResult.stages, { ...finalResult.timingsMs, total: Math.round(totalMs * 1000) / 1000 }, finalResult.errorCode);
}

function tcpAttempt(request, address, dnsStage, dnsMs, connect) {
  return new Promise((resolve) => {
    const stages = emptyStages();
    stages.dns = dnsStage;
    const timings = dnsStage === 'ok' ? { dns: dnsMs } : {};
    const start = performance.now();
    let settled = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket && !socket.destroyed) socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => {
      stages.tcp = 'timeout';
      timings.tcp = elapsed(start);
      finish(timeoutResult(stages, timings));
    }, request.timeoutMs);
    try {
      socket = connect({ host: address, port: request.port, family: request.af });
    } catch {
      stages.tcp = 'error';
      timings.tcp = elapsed(start);
      finish(errorResult(stages, timings, 'connect_error'));
      return;
    }
    socket.once('connect', () => {
      stages.tcp = 'ok';
      timings.tcp = elapsed(start);
      finish(result('observed', stages, timings));
    });
    socket.once('error', () => {
      stages.tcp = 'error';
      timings.tcp = elapsed(start);
      finish(errorResult(stages, timings, 'connect_error'));
    });
  });
}

function tlsAttempt(request, address, dnsStage, dnsMs, tlsConnect) {
  return new Promise((resolve) => {
    const stages = emptyStages();
    stages.dns = dnsStage;
    const timings = dnsStage === 'ok' ? { dns: dnsMs } : {};
    const start = performance.now();
    let settled = false;
    let tcpConnected = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket && !socket.destroyed) socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => {
      if (tcpConnected) {
        stages.tcp = 'ok';
        stages.tls = 'timeout';
        timings.tls = elapsed(start);
      } else {
        stages.tcp = 'timeout';
        timings.tcp = elapsed(start);
      }
      finish(timeoutResult(stages, timings));
    }, request.timeoutMs);
    try {
      socket = tlsConnect({
        host: address,
        port: request.port,
        family: request.af,
        servername: net.isIP(request.host) ? undefined : request.host,
        rejectUnauthorized: false,
      });
    } catch {
      stages.tcp = 'error';
      timings.tcp = elapsed(start);
      finish(errorResult(stages, timings, 'connect_error'));
      return;
    }
    socket.once('connect', () => {
      tcpConnected = true;
      stages.tcp = 'ok';
      timings.tcp = elapsed(start);
    });
    socket.once('secureConnect', () => {
      stages.tcp = 'ok';
      stages.tls = 'ok';
      timings.tls = elapsed(start);
      finish(result('observed', stages, timings));
    });
    socket.once('error', (error) => {
      if (!tcpConnected && isConnectError(error)) {
        stages.tcp = 'error';
        timings.tcp = elapsed(start);
        finish(errorResult(stages, timings, 'connect_error'));
        return;
      }
      if (tcpConnected) stages.tcp = 'ok';
      stages.tls = 'error';
      timings.tls = elapsed(start);
      finish(errorResult(stages, timings, 'tls_error'));
    });
  });
}

function httpsAttempt(request, address, dnsStage, dnsMs, httpsRequest) {
  return new Promise((resolve) => {
    const stages = emptyStages();
    stages.dns = dnsStage;
    const timings = dnsStage === 'ok' ? { dns: dnsMs } : {};
    const start = performance.now();
    let settled = false;
    let tcpConnected = false;
    let tlsConnected = false;
    let req;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (req && !req.destroyed) req.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => {
      if (!tcpConnected) {
        stages.tcp = 'timeout';
        timings.tcp = elapsed(start);
      } else if (!tlsConnected) {
        stages.tcp = 'ok';
        stages.tls = 'timeout';
        timings.tls = elapsed(start);
      } else {
        stages.tcp = 'ok';
        stages.tls = 'ok';
        stages.http = 'timeout';
        timings.http = elapsed(start);
      }
      finish(timeoutResult(stages, timings));
    }, request.timeoutMs);

    try {
      req = httpsRequest({
        host: address,
        port: request.port,
        family: request.af,
        servername: net.isIP(request.host) ? undefined : request.host,
        method: 'HEAD',
        path: '/',
        agent: false,
        rejectUnauthorized: false,
        headers: {
          host: request.host,
          connection: 'close',
          'user-agent': 'iran-censorship-monitor-stage0-lab',
        },
      }, (response) => {
        stages.tcp = 'ok';
        stages.tls = 'ok';
        stages.http = response.statusCode >= 200 && response.statusCode < 400 ? 'ok' : 'error';
        timings.http = elapsed(start);
        response.resume();
        response.once('end', () => {
          if (stages.http === 'ok') finish(result('observed', stages, timings));
          else finish(errorResult(stages, timings, 'http_error'));
        });
      });
    } catch {
      stages.tcp = 'error';
      timings.tcp = elapsed(start);
      finish(errorResult(stages, timings, 'connect_error'));
      return;
    }

    req.once('socket', (socket) => {
      socket.once('connect', () => {
        tcpConnected = true;
        stages.tcp = 'ok';
        timings.tcp = elapsed(start);
      });
      socket.once('secureConnect', () => {
        tlsConnected = true;
        stages.tcp = 'ok';
        stages.tls = 'ok';
        timings.tls = elapsed(start);
      });
    });
    req.once('error', (error) => {
      if (!tcpConnected && isConnectError(error)) {
        stages.tcp = 'error';
        timings.tcp = elapsed(start);
        finish(errorResult(stages, timings, 'connect_error'));
      } else if (!tlsConnected) {
        if (tcpConnected) stages.tcp = 'ok';
        stages.tls = 'error';
        timings.tls = elapsed(start);
        finish(errorResult(stages, timings, 'tls_error'));
      } else {
        stages.tcp = 'ok';
        stages.tls = 'ok';
        stages.http = 'error';
        timings.http = elapsed(start);
        finish(errorResult(stages, timings, 'http_error'));
      }
    });
    req.end();
  });
}

export function createFleetStage0LabAdapters({
  lookup = dns.lookup,
  connect = net.createConnection,
  tlsConnect = tls.connect,
  httpsRequest = https.request,
} = {}) {
  if (typeof lookup !== 'function' || typeof connect !== 'function' || typeof tlsConnect !== 'function' || typeof httpsRequest !== 'function') {
    throw new Error('Fleet Stage 0 lab adapter dependencies are invalid.');
  }

  return Object.freeze({
    dns: async (rawRequest) => {
      const request = validateRequest(rawRequest, 'dns');
      if (net.isIP(request.host)) throw new Error('Fleet Stage 0 DNS measurement requires the local hostname localhost.');
      return runAttempts(request, async () => {
        const stages = emptyStages();
        const start = performance.now();
        try {
          await resolveLoopback(request.host, request.af, lookup);
          stages.dns = 'ok';
          return result('observed', stages, { dns: elapsed(start) });
        } catch {
          stages.dns = 'error';
          return errorResult(stages, { dns: elapsed(start) }, 'dns_error');
        }
      });
    },

    tcp: async (rawRequest) => {
      const request = validateRequest(rawRequest, 'tcp');
      let resolved;
      try {
        resolved = await resolveLoopback(request.host, request.af, lookup);
      } catch {
        const stages = emptyStages();
        stages.dns = 'error';
        return errorResult(stages, {}, 'dns_error');
      }
      return runAttempts(request, () => tcpAttempt(request, resolved.address, resolved.dnsStage, resolved.dnsMs, connect));
    },

    tls: async (rawRequest) => {
      const request = validateRequest(rawRequest, 'tls');
      let resolved;
      try {
        resolved = await resolveLoopback(request.host, request.af, lookup);
      } catch {
        const stages = emptyStages();
        stages.dns = 'error';
        return errorResult(stages, {}, 'dns_error');
      }
      return runAttempts(request, () => tlsAttempt(request, resolved.address, resolved.dnsStage, resolved.dnsMs, tlsConnect));
    },

    https: async (rawRequest) => {
      const request = validateRequest(rawRequest, 'https');
      let resolved;
      try {
        resolved = await resolveLoopback(request.host, request.af, lookup);
      } catch {
        const stages = emptyStages();
        stages.dns = 'error';
        return errorResult(stages, {}, 'dns_error');
      }
      return runAttempts(request, () => httpsAttempt(request, resolved.address, resolved.dnsStage, resolved.dnsMs, httpsRequest));
    },
  });
}
