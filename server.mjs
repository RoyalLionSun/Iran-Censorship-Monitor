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
import { getRipeBgpUpdates, getRipeStatSignals } from './lib/ripestat.mjs';
import { getRpkiIntegrity } from './lib/rpki.mjs';
import { getAsRankTopology } from './lib/asrank.mjs';
import { compareAsnIdentity, getAsnRegistryIdentity } from './lib/asn-registry.mjs';
import { authorizeGlobalpingControl, createGlobalpingMeasurement, getGlobalpingIranProbes, getGlobalpingMeasurement, globalpingRateLimit } from './lib/globalping.mjs';
import { getCensoredPlanetSignals } from './lib/censoredplanet.mjs';
import { getCitizenLabIranTargets } from './lib/citizenlab.mjs';
import { getPeeringDbTopology } from './lib/peeringdb.mjs';
import { getIhrDependencies } from './lib/ihr.mjs';
import { getPulseShutdowns } from './lib/pulse.mjs';
import { getGdeltIranIntelligence } from './lib/osint.mjs';
import { getMlabPerformance } from './lib/mlab.mjs';
import { getAccessNowStopIncidents } from './lib/accessnow.mjs';
import { getApnicIpv6 } from './lib/apnic.mjs';

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
const intelligenceSources = JSON.parse(await readFile(join(root, 'data/intelligence-sources.json'), 'utf8'));
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

async function readJsonBody(req, maxBytes = 16_384) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('Expected a valid JSON request body.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected a JSON object.');
  return payload;
}

function scopeRequired(source, input) {
  return { ok: true, source, status: 'scope_required', asn: null, since: input.since, until: input.until, note: 'Select a specific ASN for this analysis.' };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    jsonResponse(res, 200, { ok: true, service: 'iran-censorship-monitor', now: new Date().toISOString(), radarConfigured: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN), pulseConfigured: Boolean(process.env.INTERNET_SOCIETY_PULSE_API_TOKEN), globalpingActiveConfigured: process.env.GLOBALPING_ACTIVE_ENABLED === 'true' && Boolean(process.env.GLOBALPING_CONTROL_KEY) });
    return true;
  }

  if (url.pathname === '/api/config') {
    jsonResponse(res, 200, {
      ok: true,
      country: { code: 'IR', name: 'Iran' },
      asns,
      sources,
      intelligenceSources,
      defaultRange: defaultRange(),
      radarConfigured: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN),
      ooniTests: [...OONI_TESTS],
      capabilities: {
        liveOoni: true,
        liveRipeAtlas: true,
        cloudflareRadarConfigured: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN),
        liveIoda: true,
        liveTorMetrics: true,
        mlabNdtPerformance: true,
        apnicIpv6Context: true,
        accessNowStopIncidents: true,
        ripeStatRouting: true,
        ripeStatRpkiIntegrity: true,
        ripeStatAsnRegistryIdentity: true,
        caidaAsRankTopology: true,
        censoredPlanet: true,
        globalpingProbeInventory: true,
        globalpingActiveMeasurements: process.env.GLOBALPING_ACTIVE_ENABLED === 'true' && Boolean(process.env.GLOBALPING_CONTROL_KEY),
        citizenLabIranTargets: true,
        peeringDbTopology: true,
        ihrAsHegemony: true,
        internetSocietyPulseConfigured: Boolean(process.env.INTERNET_SOCIETY_PULSE_API_TOKEN),
        gdeltProfessionalOsintDiscovery: true,
        wireguardOrOpenvpnProbeFleet: false,
      },
    });
    return true;
  }

  if (url.pathname === '/api/asn-registry') {
    const asn = normalizeAsn(url.searchParams.get('asn') || '');
    const profile = asns.find((item) => item.asn === asn);
    if (!profile) throw new Error('ASN is not in the curated Iran profile catalogue.');
    const registry = await getAsnRegistryIdentity(asn);
    jsonResponse(res, 200, {
      ...registry,
      profile,
      profileMatch: compareAsnIdentity(profile, registry),
      note: 'Registry identity is scope/topology context only and contributes zero independent censorship votes.',
    });
    return true;
  }

  if (url.pathname === '/api/overview') {
    const input = queryInput(url);
    const [ooni, ripe, radar, ioda, tor, mlab, apnic, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki, pulse] = await Promise.all([
      safeSource('OONI', () => getOoniTimeline(input)),
      safeSource('RIPE Atlas', () => getRipeSignals(input)),
      safeSource('Cloudflare Radar', () => getRadarSignals(input)),
      safeSource('IODA', () => getIodaSignals(input)),
      safeSource('Tor Metrics', () => getTorMetrics(input)),
      safeSource('M-Lab NDT', () => getMlabPerformance(input)),
      safeSource('APNIC Labs IPv6', () => getApnicIpv6(input)),
      input.asn ? safeSource('RIPEstat / RIPE RIS', () => getRipeStatSignals(input)) : Promise.resolve(scopeRequired('RIPEstat / RIPE RIS', input)),
      safeSource('Globalping', () => getGlobalpingIranProbes(input)),
      safeSource('Censored Planet', () => getCensoredPlanetSignals(input)),
      input.asn ? safeSource('PeeringDB', () => getPeeringDbTopology(input)) : Promise.resolve(scopeRequired('PeeringDB', input)),
      input.asn ? safeSource('Internet Health Report', () => getIhrDependencies(input)) : Promise.resolve(scopeRequired('Internet Health Report', input)),
      input.asn ? safeSource('CAIDA ASRank', () => getAsRankTopology(input)) : Promise.resolve(scopeRequired('CAIDA ASRank', input)),
      input.asn ? safeSource('RIPEstat RPKI', () => getRpkiIntegrity(input)) : Promise.resolve(scopeRequired('RIPEstat RPKI', input)),
      safeSource('Internet Society Pulse', () => getPulseShutdowns()),
    ]);
    const scopeLabel = input.asn ? `${input.asn} / Iran` : 'Iran / all measured networks';
    const assessment = buildAssessment({ ooni, ripe, radar, ioda, ripestat, scopeLabel });
    const asnProfile = input.asn ? asns.find((item) => item.asn === input.asn) || null : null;
    jsonResponse(res, 200, { ok: true, input, asnProfile, fetchedAt: new Date().toISOString(), assessment, ooni, ripe, radar, ioda, tor, mlab, apnic, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki, pulse });
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

  if (url.pathname === '/api/routing-updates') {
    const input = queryInput(url);
    if (!input.asn) throw new Error('Select a specific ASN for BGP update drilldown.');
    const result = await getRipeBgpUpdates(input);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/globalping/probes') {
    const input = queryInput(url);
    const result = await getGlobalpingIranProbes(input);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/globalping/measure' && req.method === 'POST') {
    const auth = authorizeGlobalpingControl(req.headers['x-control-key']);
    if (!auth.ok) { jsonResponse(res, auth.status, { ok: false, source: 'Globalping', error: auth.error }); return true; }
    const rate = globalpingRateLimit();
    if (!rate.ok) { jsonResponse(res, 429, { ok: false, source: 'Globalping', error: 'Server-side active measurement rate limit reached.', retryAfterSeconds: rate.retryAfterSeconds }, { 'retry-after': String(rate.retryAfterSeconds) }); return true; }
    const body = await readJsonBody(req);
    const result = await createGlobalpingMeasurement({ type: body.type, target: body.target, asn: body.asn ?? '', limit: body.limit });
    jsonResponse(res, 202, result);
    return true;
  }

  if (url.pathname.startsWith('/api/globalping/measurement/') && req.method === 'GET') {
    const auth = authorizeGlobalpingControl(req.headers['x-control-key']);
    if (!auth.ok) { jsonResponse(res, auth.status, { ok: false, source: 'Globalping', error: auth.error }); return true; }
    const id = decodeURIComponent(url.pathname.slice('/api/globalping/measurement/'.length));
    const result = await getGlobalpingMeasurement(id);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/stop') {
    const input = queryInput(url);
    const result = await safeSource('Access Now #KeepItOn / STOP', () => getAccessNowStopIncidents(input));
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/intelligence') {
    const input = queryInput(url);
    const [accessNow, gdelt] = await Promise.all([
      safeSource('Access Now #KeepItOn / STOP', () => getAccessNowStopIncidents(input)),
      safeSource('GDELT DOC 2.0', () => getGdeltIranIntelligence(input)),
    ]);
    jsonResponse(res, 200, {
      ok: true,
      input: { since: input.since, until: input.until },
      fetchedAt: new Date().toISOString(),
      sources: intelligenceSources,
      accessNow,
      gdelt,
      note: 'Access Now STOP incidents and GDELT articles are contextual intelligence. STOP may incorporate evidence from technical sensors already present in this application, so neither source creates an additional independent technical vote without root-evidence review.',
    });
    return true;
  }

  if (url.pathname === '/api/targets') {
    const category = url.searchParams.get('category') || '';
    const search = url.searchParams.get('search') || '';
    const limit = url.searchParams.get('limit') || '200';
    const result = await safeSource('Citizen Lab Test Lists', () => getCitizenLabIranTargets({ category, search, limit }));
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/providers') {
    const base = queryInput(url);
    const selected = asns.filter((network) => network.providerComparison === true);
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
  const file = safeStaticPath(pathname);
  if (!file) return false;
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
  console.log(`Iran Censorship Monitor listening on http://${HOST}:${PORT}`);
});
