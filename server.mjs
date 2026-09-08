import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssessment } from './lib/assessment.mjs';
import { errorPayload, jsonResponse, mapLimit, normalizeAsn, validateRange } from './lib/common.mjs';
import { getCircumventionSignals, getOoniMeasurementDetail, getOoniTimeline, listOoniMeasurements, OONI_TESTS } from './lib/ooni.mjs';
import { getRipeSignals } from './lib/ripe.mjs';
import { getRadarSignals } from './lib/radar.mjs';
import { getIodaSignals } from './lib/ioda.mjs';
import { getTorMetrics } from './lib/tor.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

async function loadDotEnv() {
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return;
  const content = await readFile(envFile, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

await loadDotEnv();
const publicRoot = resolve(root, 'public');
const asns = JSON.parse(await readFile(join(root, 'data/asns.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

function queryInput(url) {
  const defaults = defaultRange();
  const since = url.searchParams.get('since') || defaults.since;
  const until = url.searchParams.get('until') || defaults.until;
  validateRange(since, until, 120);
  const rawAsn = url.searchParams.get('asn') || 'AS58224';
  const asn = rawAsn === 'ALL' ? '' : normalizeAsn(rawAsn);
  const testName = url.searchParams.get('testName') || 'web_connectivity';
  if (!OONI_TESTS.has(testName)) throw new Error('Unsupported OONI test.');
  const target = url.searchParams.get('target') || '';
  if (target && testName === 'web_connectivity') {
    let parsed;
    try { parsed = new URL(target); } catch { throw new Error('Target must be an absolute HTTP(S) URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Target must use HTTP or HTTPS.');
  }
  return { country: 'IR', asn, since, until, testName, target: testName === 'web_connectivity' ? target : '' };
}

async function safeSource(name, work) {
  try {
    return await work();
  } catch (error) {
    return errorPayload(error, name);
  }
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    jsonResponse(res, 200, { ok: true, service: 'iran-internet-monitor', now: new Date().toISOString(), radarConfigured: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN) });
    return true;
  }

  if (url.pathname === '/api/config') {
    jsonResponse(res, 200, {
      ok: true,
      country: { code: 'IR', name: 'Iran' },
      asns,
      sources,
      defaultRange: defaultRange(),
      radarConfigured: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN),
      ooniTests: [...OONI_TESTS],
      capabilities: {
        liveOoni: true,
        liveRipeAtlas: true,
        cloudflareRadarConfigured: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN),
        liveIoda: true,
        liveTorMetrics: true,
        wireguardOrOpenvpnProbeFleet: false,
      },
    });
    return true;
  }

  if (url.pathname === '/api/overview') {
    const input = queryInput(url);
    const [ooni, ripe, radar, ioda, tor] = await Promise.all([
      safeSource('OONI', () => getOoniTimeline(input)),
      safeSource('RIPE Atlas', () => getRipeSignals(input)),
      safeSource('Cloudflare Radar', () => getRadarSignals(input)),
      safeSource('IODA', () => getIodaSignals(input)),
      safeSource('Tor Metrics', () => getTorMetrics(input)),
    ]);
    const scopeLabel = input.asn ? `${input.asn} / Iran` : 'Iran / all measured networks';
    const assessment = buildAssessment({ ooni, ripe, radar, ioda, scopeLabel });
    jsonResponse(res, 200, { ok: true, input, fetchedAt: new Date().toISOString(), assessment, ooni, ripe, radar, ioda, tor });
    return true;
  }

  if (url.pathname === '/api/circumvention') {
    const input = queryInput(url);
    const result = await safeSource('OONI', () => getCircumventionSignals(input));
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/ooni/measurements') {
    const input = queryInput(url);
    const result = await listOoniMeasurements(input);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname.startsWith('/api/ooni/measurement/')) {
    const uid = decodeURIComponent(url.pathname.slice('/api/ooni/measurement/'.length));
    const result = await getOoniMeasurementDetail(uid);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/providers') {
    const base = queryInput(url);
    const selected = asns.slice(0, 10);
    const rows = await mapLimit(selected, 3, async (network) => {
      const input = { ...base, asn: network.asn };
      const [ooni, ripe] = await Promise.all([
        safeSource('OONI', () => getOoniTimeline(input)),
        safeSource('RIPE Atlas', () => getRipeSignals(input)),
      ]);
      return {
        ...network,
        ooni: ooni.ok ? {
          measurements: ooni.totalMeasurements,
          anomalyRate: ooni.anomalyRate,
          confirmedRate: ooni.confirmedRate,
          truncated: ooni.truncatedAtApiLimit,
          lastObservation: ooni.points?.at(-1)?.date ?? null,
        } : { error: ooni.error },
        ripe: ripe.ok ? {
          activeProbes: ripe.probeCount,
          observedProbes: ripe.overall?.observedProbes ?? 0,
          averageRttMs: ripe.overall?.averageRttMs ?? null,
          packetLossPercent: ripe.overall?.packetLossPercent ?? null,
          samples: ripe.overall?.samples ?? 0,
        } : { error: ripe.error },
      };
    });
    jsonResponse(res, 200, { ok: true, input: base, fetchedAt: new Date().toISOString(), providers: rows });
    return true;
  }

  return false;
}

function safeStaticPath(pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(publicRoot, normalize(relative));
  if (candidate !== publicRoot && !candidate.startsWith(`${publicRoot}${sep}`)) return null;
  return candidate;
}

async function serveStatic(res, pathname) {
  let file = safeStaticPath(pathname);
  if (!file) return false;
  if (!existsSync(file) && !extname(file)) file = join(publicRoot, 'index.html');
  if (!existsSync(file)) return false;
  const extension = extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': mime[extension] || 'application/octet-stream',
    'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) jsonResponse(res, 404, { ok: false, error: 'API route not found.' });
    } else if (!(await serveStatic(res, url.pathname))) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  } catch (error) {
    jsonResponse(res, 400, errorPayload(error));
  } finally {
    const ms = Date.now() - started;
    if (process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.url} ${ms}ms`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Iran Internet Monitor listening on http://${HOST}:${PORT}`);
});
