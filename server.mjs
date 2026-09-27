import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssessment } from './lib/assessment.mjs';
import { buildHealth } from './lib/server-health.mjs';
import { clientAddress, createRequestBudget, createSelfRequestKey, publicBase, selfOrigin } from './lib/request-budget.mjs';
import { compressBody, createLastGoodStore, errorPayload, FETCH_CACHE_LIMIT, fetchCacheSize, isInternalError, isCleanOverview, isSettledPeriod, jsonResponse, loadEnvFile, pickEncoding, mapLimit, normalizeAsn, validateRange } from './lib/common.mjs';
import { mergeFailedSignals, ooniRateLimitedUntil, getCircumventionSignals, getOoniDomainMeasurements, getOoniDomains, getOoniMeasurementDetail, getOoniNetworks, getOoniServiceNetworks, getOoniTimeline, iranRegisteredAsns, getOoniSample, listOoniMeasurements, OONI_TESTS } from './lib/ooni.mjs';
import { getRipeSignals } from './lib/ripe.mjs';
import { getRadarConnectionQuality, getRadarOutageHistory, getRadarOutageTraffic, getRadarSignals, isNationwideAnnotation } from './lib/radar.mjs';
import { getIodaSignals } from './lib/ioda.mjs';
import { getTorMetrics } from './lib/tor.mjs';
import { getRipeBgpUpdates, getRipeStatSignals } from './lib/ripestat.mjs';
import { getRpkiIntegrity } from './lib/rpki.mjs';
import { getAsRankTopology } from './lib/asrank.mjs';
import { compareAsnIdentity, getAsnRegistryIdentity } from './lib/asn-registry.mjs';
import { readAsnCoverageSnapshot } from './lib/asn-coverage-snapshot.mjs';
import { authorizeGlobalpingControl, createGlobalpingMeasurement, getGlobalpingIranProbes, getGlobalpingMeasurement, globalpingRateLimit } from './lib/globalping.mjs';
import { getCensoredPlanetSignals } from './lib/censoredplanet.mjs';
import { SERVICE_BRANDS, selectionBrand, MORE_SERVICE_GROUPS, summarizeMoreServices, summarizeNetworkAccess, summarizeNetworkAccessByGroup, summarizeServiceBrands, summarizeServiceNetworks } from './public/service-findings.js';
import { readAsnDirectory } from './lib/asn-directory.mjs';
import { openStore } from './lib/store.mjs';
import { storeCircumvention, storeCovers, storeDomains, storeNetworks, storeSample, storeServiceNetworks, storeTimeline } from './lib/store-payloads.mjs';
import { collectOoniApi, runCollectors } from './lib/collector.mjs';
import { collectOoniS3 } from './lib/ooni-raw.mjs';
import { ACTIVE_HOSTS, activeHttp, atlasPath, collectActivePath, collectorPlan, globalpingPath } from './lib/active-collector.mjs';
import { getAsnNames, publicNetworkName } from './lib/asn-names.mjs';
import { getCitizenLabIranTargets } from './lib/citizenlab.mjs';
import { getPeeringDbTopology } from './lib/peeringdb.mjs';
import { getIhrDependencies } from './lib/ihr.mjs';
import { getPulseShutdowns } from './lib/pulse.mjs';
import { correlateShutdownContext } from './lib/shutdown-context.mjs';
import { getGdeltIranIntelligence } from './lib/osint.mjs';
import { getMlabPerformance } from './lib/mlab.mjs';
import { getAccessNowStopIncidents } from './lib/accessnow.mjs';
import { getShutdownAnatomy } from './lib/anatomy.mjs';
import { getEncryptedDns } from './lib/encrypted-dns.mjs';
import { getPsiphonConduit } from './lib/psiphon.mjs';
import { getApnicCountryComposition, getApnicIpv6, getApnicVpnShare } from './lib/apnic.mjs';
import { getServiceHistory } from './lib/history.mjs';
import { buildFeedEntry, postToTelegram, readEntries, renderAtom, upsertEntry } from './lib/feed.mjs';
import { renderWidget } from './lib/widget.mjs';
import { buildDailyData, OPEN_DATA_SCHEMA, openDataStore } from './lib/open-data.mjs';
import { monthRange, recentMonths, recentWeeks, renderMonthlyReport, renderReportIndex, renderSourcesPage, renderToolsPage, renderUpdatesPage, weekRange } from './lib/report.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

await loadEnvFile(join(root, '.env'));
const publicRoot = resolve(root, 'public');
const asnCoverageSnapshotPath = join(root, 'var/asn-coverage/latest.json');
const asns = JSON.parse(await readFile(join(root, 'data/asns.json'), 'utf8'));
const SERVER_STARTED_AT = Date.now();
const PACKAGE_VERSION = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const sources = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));
const intelligenceSources = JSON.parse(await readFile(join(root, 'data/intelligence-sources.json'), 'utf8'));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const SELF_ORIGIN = selfOrigin(HOST, PORT);
const selfKey = createSelfRequestKey();
// The server's own /api/overview, not charged to a visitor's budget (see createSelfRequestKey).
const selfFetch = (path, options = {}) => fetch(`${SELF_ORIGIN}${path}`, { ...options, headers: selfKey.headers });
const linkBase = () => publicBase(process.env.PUBLIC_URL, SELF_ORIGIN);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

// A period that ended two or more days ago no longer changes upstream, so its complete answer
// can be served again for a day. Only a clean answer is kept: a failed, stale or still-pending
// source must be retried, never frozen.
const HISTORICAL_OVERVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORICAL_OVERVIEW_LIMIT = 40;
const historicalOverviews = new Map();
const inflightOverviews = new Map();

function historicalOverviewKey(input) {
  return JSON.stringify([input.asn, input.since, input.until, input.testName, input.target]);
}

// A current period is kept only for a few minutes: long enough that the next reader does not
// wait, short enough that the page stays current. Its age is shown in the header.
const CURRENT_OVERVIEW_TTL_MS = 10 * 60 * 1000;

function rememberHistoricalOverview(key, payload, ttlMs = HISTORICAL_OVERVIEW_TTL_MS) {
  historicalOverviews.delete(key);
  historicalOverviews.set(key, { expires: Date.now() + ttlMs, payload });
  while (historicalOverviews.size > HISTORICAL_OVERVIEW_LIMIT) historicalOverviews.delete(historicalOverviews.keys().next().value);
}

let historyCache = null;
let historyInFlight = null;
async function serviceHistory() {
  if (historyCache && Date.now() - historyCache.at < 60 * 60 * 1000) return historyCache.value;
  historyInFlight ??= (async () => {
    // Nationwide shutdowns (Cloudflare Radar) mark months whose few tests do not stand for them.
    const outages = await getRadarOutageHistory().then((result) => result?.outages ?? []).catch(() => []);
    return getServiceHistory({ storeDir: join(root, 'var/history'), outages });
  })()
    // A complete answer is kept for an hour; one with a failed request is asked again soon.
    .then((value) => { if (value.ok) historyCache = { at: Date.now() - (value.errors.length ? 55 * 60 * 1000 : 0), value }; return value; })
    .finally(() => { historyInFlight = null; });
  return historyInFlight;
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
  const selection = { country: 'IR', asn, since, until, testName, target: testName === 'web_connectivity' ? target : '' };
  // A selected service covers all of its hosts, so OONI must not be filtered to one exact URL.
  selection.serviceId = selectionBrand(selection)?.id ?? null;
  return selection;
}

// OONI queries for a selected service drop the exact-URL filter; the service scope is
// applied to the returned domain groups instead.
function ooniScope(input) {
  return input.serviceId ? { ...input, target: '' } : input;
}

// Access evidence is read from the local store when it covers the whole period; otherwise
// from OONI directly, as before. The collector fills the store (see docs/DATA_RESILIENCE_PLAN.md).
const store = openStore(join(root, 'var/store/monitor.db'));

async function viaStore(scope, build, live) {
  if (!scope.target && storeCovers(store, scope)) {
    const iran = await iranRegisteredAsns();
    if (iran) return build(iran);
  }
  return live();
}

// Answers live in var/last-good/entries/; the single sources.json of earlier versions is taken over once.
const lastGoodSources = createLastGoodStore({ path: join(root, 'var/last-good/sources.json') });

function sourceKey(name, input) {
  return [name, input.asn || 'ALL', input.since, input.until, input.testName || '', input.target || ''].join('|');
}

// OONI answers each circumvention test separately. When some of them fail (for example while
// OONI limits requests), their last good values for the same period stand in, dated, instead of
// the tile saying "not loaded"; the tests that did answer stay fresh.
async function circumventionFor(scope) {
  const key = sourceKey('OONI circumvention', scope);
  const previous = lastGoodSources.stale(key, '');
  const now = await safeSource('OONI circumvention', () => viaStore(scope, (iran) => storeCircumvention(store, scope, iran), () => getCircumventionSignals(scope)), key);
  const result = mergeFailedSignals(previous, now);
  if (result !== now) lastGoodSources.remember(key, result);
  return result;
}

// How long each source took for the request being answered, for the Server-Timing header: the
// browser's developer tools then show which upstream source makes a new view slow.
const sourceTimings = new AsyncLocalStorage();
function serverTimingHeader(timings) {
  if (!timings?.size) return {};
  const entries = [...timings].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([name, ms]) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')};dur=${Math.round(ms)};desc="${name.replace(/"/g, '')}"`);
  return { 'server-timing': entries.join(', ') };
}

// The visitor's address; behind a reverse proxy set TRUST_PROXY=1 so its X-Forwarded-For counts.
const OVERVIEW_BUDGET = Math.max(5, Number(process.env.OVERVIEW_NEW_PER_10_MIN) || 40);
const overviewBudget = createRequestBudget({ limit: OVERVIEW_BUDGET });
// Lookups a visitor can make unique (any domain, measurement, search, network): generous for
// people, a stop for scripts that would spend the server's upstream quota.
const LOOKUP_BUDGET = Math.max(20, Number(process.env.LOOKUPS_PER_10_MIN) || 120);
const lookupBudget = createRequestBudget({ limit: LOOKUP_BUDGET });
// The domain list and the ways around the filter are loaded with every page view and stay outside:
// many readers in Iran share one address (carrier NAT), and their answers are cached and bounded by
// the OONI gate.
const BUDGETED_LOOKUPS = /^\/api\/(ooni\/(domain-measurements|measurements?)(\/|$)|stop$|targets$|intelligence$|providers$|routing-updates$)/;

function withDeadline(promise, ms, fallback) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(fallback()), ms); })]).finally(() => clearTimeout(timer));
}

async function safeSource(name, work, key = null) {
  const started = performance.now();
  try {
    return lastGoodSources.remember(key, await work());
  } catch (error) {
    // A failing source falls back to its last successful answer, marked as history. For OONI,
    // whose answers the statement rests on, the nearest period of the same network stands in when
    // this exact one was never loaded; the page names that period.
    return lastGoodSources.stale(key, error)
      ?? (/^OONI/.test(name) ? lastGoodSources.staleNearest(key, error) : null)
      ?? errorPayload(error, name);
  } finally {
    const timings = sourceTimings.getStore();
    if (timings) timings.set(name, Math.max(timings.get(name) ?? 0, performance.now() - started));
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
  if (BUDGETED_LOOKUPS.test(url.pathname) && !selfKey.matches(req)) {
    const budget = lookupBudget.take(clientAddress(req));
    if (!budget.ok) {
      jsonResponse(res, 429, { ok: false, error: 'Too many lookups from this address; please wait a few minutes.', retryAfterSeconds: budget.retryAfterSeconds }, { 'retry-after': String(budget.retryAfterSeconds) });
      return true;
    }
  }
  if (url.pathname === '/api/health') {
    // Which collector paths exist and are on, joined with what each last did.
    const stored = store.health();
    const paths = Object.fromEntries(Object.entries(collectorPlan()).map(([name, planned]) => [name, { ...planned, ...(stored[name] ?? {}) }]));
    jsonResponse(res, 200, buildHealth({
      startedAt: SERVER_STARTED_AT,
      version: PACKAGE_VERSION,
      configured: {
        radar: Boolean(process.env.CLOUDFLARE_RADAR_API_TOKEN), pulse: Boolean(process.env.INTERNET_SOCIETY_PULSE_API_TOKEN),
        globalpingActive: process.env.GLOBALPING_ACTIVE_ENABLED === 'true' && Boolean(process.env.GLOBALPING_CONTROL_KEY),
        publicUrl: Boolean(process.env.PUBLIC_URL?.trim()), telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
      },
      paths,
      caches: { upstreamAnswers: fetchCacheSize(), upstreamLimit: FETCH_CACHE_LIMIT, lastGoodAnswers: lastGoodSources.size(), overviews: historicalOverviews.size, overviewsInProgress: inflightOverviews.size },
      ooniLimitedUntil: ooniRateLimitedUntil(),
      memoryBytes: process.memoryUsage().rss,
    }));
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
        shutdownContextCorrelation: true,
        ripeStatRouting: true,
        ripeStatRpkiIntegrity: true,
        ripeStatAsnRegistryIdentity: true,
        localAsnCoverageSnapshot: true,
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
    // A network held by a private person: the registry's names and handles would name them.
    if (profile.privateRegistrant) Object.assign(registry, { asName: null, orgId: null, registryName: null });
    jsonResponse(res, 200, {
      ...registry,
      profile,
      profileMatch: compareAsnIdentity(profile, registry),
      note: 'Registry identity is scope/topology context only and contributes zero independent censorship votes.',
    });
    return true;
  }

  if (url.pathname === '/api/asn-coverage') {
    const maxAgeHours = Number(process.env.ASN_COVERAGE_MAX_AGE_HOURS || 168);
    const result = await readAsnCoverageSnapshot({ path: asnCoverageSnapshotPath, maxAgeHours });
    // Registry names of networks held by private persons stay numbers (see publicNetworkName).
    if (Array.isArray(result.candidateQueue)) {
      result.candidateQueue = result.candidateQueue.map((row) => ({
        ...row,
        displayName: publicNetworkName(row.asn, row.displayName, asns) ?? row.asn,
        ...(row.secondary ? { secondary: { ...row.secondary, description: publicNetworkName(row.asn, row.secondary.description, asns) } } : {}),
      }));
    }
    jsonResponse(res, result.ok ? 200 : 500, result);
    return true;
  }

  // How long each main service has been blocked (monthly since 2022, TCI/MCI/Irancell).
  if (url.pathname === '/api/history') {
    jsonResponse(res, 200, await serviceHistory());
    return true;
  }
  if (url.pathname === '/api/outages') {
    const result = await safeSource('Cloudflare Radar outage history', () => getRadarOutageHistory(), 'Radar outage history');
    // Network episodes name their operators the way the network selector does.
    const names = Object.fromEntries(asns.map((item) => [item.asn, item.name]));
    if (Array.isArray(result?.episodes)) result.episodes = result.episodes.map((episode) => ({ ...episode, networks: episode.asns.map((asn) => names[asn] ?? asn) }));
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/overview') {
    const input = queryInput(url);
    const settled = isSettledPeriod(input.until);
    const cacheKey = historicalOverviewKey(input);
    const cached = cacheKey ? historicalOverviews.get(cacheKey) : null;
    if (cached && cached.expires > Date.now()) {
      jsonResponse(res, 200, cached.payload, {}, { reuse: true });
      return true;
    }
    // The same question already being answered (for example by the warm-up) is waited for,
    // not asked of every upstream source a second time.
    const pending = inflightOverviews.get(cacheKey);
    if (pending) {
      const shared = await pending;
      if (shared) { jsonResponse(res, 200, shared, {}, { reuse: true }); return true; }
    }
    // A new answer costs about thirty upstream requests. One visitor may start a limited number
    // per ten minutes, so nobody can make OONI block this server for every reader; answers
    // already computed are served without limit.
    const budget = selfKey.matches(req) ? { ok: true } : overviewBudget.take(clientAddress(req));
    if (!budget.ok) {
      jsonResponse(res, 429, { ok: false, source: 'server', error: 'Too many new views requested from this address. Views already loaded still open; new ones in a few minutes.', retryAfterSeconds: budget.retryAfterSeconds }, { 'retry-after': String(budget.retryAfterSeconds) });
      return true;
    }
    let settleShared;
    inflightOverviews.set(cacheKey, new Promise((resolve) => { settleShared = resolve; }));
    const timings = new Map();
    sourceTimings.enterWith(timings);
    const overviewStarted = performance.now();
    try {
    // Use of Cloudflare's WARP VPN among users in Iran (APNIC), for every scope: country context.
    const vpnUsePromise = getApnicVpnShare({ until: input.until }).catch((error) => ({ ok: false, source: 'APNIC Labs', error: error?.message ?? String(error) }));
    const [ooni, ripe, radar, radarQuality, ioda, tor, mlab, apnic, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki, pulse, ooniDomains, circumvention] = await Promise.all([
      safeSource('OONI', () => viaStore(ooniScope(input), (iran) => storeTimeline(store, ooniScope(input), iran), () => getOoniTimeline(ooniScope(input))), sourceKey('OONI', input)),
      safeSource('RIPE Atlas', () => getRipeSignals(input), sourceKey('RIPE Atlas', input)),
      safeSource('Cloudflare Radar', () => getRadarSignals(input), sourceKey('Cloudflare Radar', input)),
      safeSource('Cloudflare Radar quality', () => getRadarConnectionQuality(input), sourceKey('Cloudflare Radar quality', input)),
      safeSource('IODA', () => getIodaSignals(input), sourceKey('IODA', input)),
      safeSource('Tor Metrics', () => getTorMetrics(input)),
      safeSource('M-Lab NDT', () => getMlabPerformance(input)),
      // For all of Iran, APNIC's country figure also counts networks registered abroad (VPN exits);
      // their share and the Iranian-only value are attached.
      safeSource('APNIC Labs IPv6', async () => {
        const result = await getApnicIpv6(input);
        if (!input.asn && result?.ok) result.composition = await getApnicCountryComposition(await iranRegisteredAsns());
        return result;
      }),
      input.asn ? safeSource('RIPEstat / RIPE RIS', () => getRipeStatSignals(input), sourceKey('RIPEstat', input)) : Promise.resolve(scopeRequired('RIPEstat / RIPE RIS', input)),
      safeSource('Globalping', () => getGlobalpingIranProbes(input)),
      safeSource('Censored Planet', () => getCensoredPlanetSignals(input), sourceKey('Censored Planet', input)),
      input.asn ? safeSource('PeeringDB', () => getPeeringDbTopology(input)) : Promise.resolve(scopeRequired('PeeringDB', input)),
      input.asn ? safeSource('Internet Health Report', () => getIhrDependencies(input)) : Promise.resolve(scopeRequired('Internet Health Report', input)),
      input.asn ? safeSource('CAIDA ASRank', () => getAsRankTopology(input)) : Promise.resolve(scopeRequired('CAIDA ASRank', input)),
      // Route-origin validation is technical context: at most five seconds, then the answer
      // finishes in the background (its requests are cached) and appears with the next request.
      input.asn ? withDeadline(safeSource('RIPEstat RPKI', () => getRpkiIntegrity(input), sourceKey('RIPEstat RPKI', input)), 5_000,
        () => lastGoodSources.stale(sourceKey('RIPEstat RPKI', input), 'still loading') ?? { ok: true, source: 'RIPEstat RPKI', status: 'pending', partialStale: true, coverage: { state: 'pending' }, evidenceRole: 'route-origin-integrity-context', routingSourceFamily: 'ripe', independentCensorshipVote: false }) : Promise.resolve(scopeRequired('RIPEstat RPKI', input)),
      safeSource('Internet Society Pulse', () => getPulseShutdowns(input), sourceKey('Pulse', input)),
      // Priority-service summary for the Overview. The full domain list stays on /api/ooni/domains.
      input.testName === 'web_connectivity' ? safeSource('OONI domains', () => viaStore(ooniScope(input), (iran) => storeDomains(store, ooniScope(input), iran), () => getOoniDomains(ooniScope(input))), sourceKey('OONI domains', input)) : Promise.resolve(null),
      circumventionFor(input),
    ]);
    // The follow-up questions below do not depend on each other; asked one after another they
    // made a first load take close to half a minute, so they run side by side.
    const visibleServices = ooniDomains?.ok ? summarizeServiceBrands(ooniDomains, circumvention, input).visible : [];
    // A service with no usable test in the selected network still has an answer across Iran.
    const moreUntested = input.asn && ooniDomains?.ok && !input.target
      && (summarizeMoreServices(ooniDomains) ?? []).some((group) => group.services.some((service) => !service.scope));
    const needsCountry = Boolean(input.asn && ooniDomains?.ok && (moreUntested || visibleServices.some((item) => ['untested', 'inconclusive'].includes(item.web?.status))));
    const countryTask = needsCountry
      ? safeSource('OONI domains (Iran)', () => viaStore(ooniScope({ ...input, asn: '' }), (iran) => storeDomains(store, ooniScope({ ...input, asn: '' }), iran), () => getOoniDomains(ooniScope({ ...input, asn: '' }))), sourceKey('OONI domains', { ...input, asn: '' }))
      : Promise.resolve(null);
    // For an explicit service selection, sample how many independent measurement runs and
    // days stand behind the finding that the Overview reports.
    const sampleDomains = visibleServices
      .filter((item) => ['blocked', 'restricted'].includes(item.status) && item.web?.measurements > 0)
      .map((item) => item.web.domain);
    const focusDomain = (input.serviceId || input.target) && visibleServices[0]?.web?.measurements > 0 ? visibleServices[0].web.domain : null;
    if (focusDomain && !sampleDomains.includes(focusDomain)) sampleDomains.unshift(focusDomain);
    const samplesTask = mapLimit(sampleDomains.slice(0, 2), 2, (domain) =>
      safeSource('OONI evidence sample', () => viaStore(ooniScope(input), (iran) => storeSample(store, ooniScope(input), domain, iran), () => getOoniSample(ooniScope(input), domain)), sourceKey(`OONI sample ${domain}`, input)))
      .then((samples) => samples.filter((sample) => sample?.ok));
    // One aggregation answers whether the headline service is blocked in one network or in many.
    const headlineDomain = sampleDomains[0] ?? null;
    const networksTask = headlineDomain
      ? safeSource('OONI network comparison', () => viaStore(ooniScope(input), (iran) => storeNetworks(store, ooniScope(input), headlineDomain, iran), () => getOoniNetworks(ooniScope(input), headlineDomain)), sourceKey(`OONI networks ${headlineDomain}`, input))
      : Promise.resolve(null);
    // How deep a nationwide outage went is the plainest measure of it: traffic against the week before.
    const outage = radar?.assessmentEligible === true && radar.status !== 'stale'
      ? (radar.outages?.annotations ?? []).filter((item) => isNationwideAnnotation(item) && item.startDate)
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
      : null;
    // For a selected network its own traffic sits next to the country: networks recover differently.
    const trafficFor = (asn) => safeSource('Cloudflare Radar outage traffic', () => getRadarOutageTraffic({ start: outage.startDate, end: outage.endDate, asn }), `Radar outage traffic|${outage.startDate}|${outage.endDate ?? ''}|${asn}`);
    const trafficTask = outage ? Promise.all([trafficFor(''), input.asn ? trafficFor(input.asn) : null]) : Promise.resolve([null, null]);
    // How the same outage unfolded hour by hour (routes, traffic, reachability) for all of Iran.
    // A first build asks several sources and the RIPE Database; it never holds up the answer for
    // more than ten seconds: the last timeline for the same outage stands in (or none yet), the
    // answer is not kept as complete, and the build finishes in the background for the next reader.
    const anatomyKey = outage ? `Shutdown timeline|${outage.startDate}|${outage.endDate ?? ''}` : null;
    const anatomyTask = outage
      ? withDeadline(safeSource('Shutdown timeline', async () => getShutdownAnatomy({ start: outage.startDate, end: outage.endDate ?? null, storeDir: join(root, 'var/anatomy'), iranAsns: await iranRegisteredAsns(), catalog: asns }), anatomyKey), 10_000, () => {
        const last = lastGoodSources.stale(anatomyKey, 'still loading');
        if (!last) return { ok: true, source: 'Shutdown timeline', status: 'pending', partialStale: true };
        const observed = last.onset?.length || last.restoration?.length || last.networks?.networks?.length;
        return { ...last, status: observed ? 'observed' : 'no_data', partialStale: true };
      })
      : Promise.resolve(null);
    // Where each service was and was not blocked, by named Iranian network.
    const serviceNetworksTask = input.testName !== 'web_connectivity' ? Promise.resolve(null) : (async () => {
      const domains = [...SERVICE_BRANDS, ...MORE_SERVICE_GROUPS.flatMap((group) => group.services)].flatMap((brand) => brand.domains);
      const raw = await safeSource('OONI service networks', () => viaStore({ ...input, asn: '', target: '' }, (iran) => storeServiceNetworks(store, { ...input, asn: '', target: '' }, domains, iran), () => getOoniServiceNetworks({ ...input, asn: '', target: '' }, domains)), sourceKey('OONI service networks', { ...input, asn: '', target: '' }));
      // Without an answer now, the last answer for the same period stands in, dated, so the
      // table does not vanish; with none at all, the reader is told why it is missing.
      if (!raw?.ok || !Array.isArray(raw.rows)) return { ok: false, error: raw?.error ?? null };
      const breakdown = summarizeServiceNetworks(raw.rows);
      const access = summarizeNetworkAccess(raw.rows);
      const accessByGroup = summarizeNetworkAccessByGroup(raw.rows);
      const shown = [...new Set(Object.values(accessByGroup).flat().map((entry) => entry.asn))];
      // Who a network is: the reviewed catalogue first, then the Iranian network directory,
      // then RIPEstat for a name. Institutional and public networks are named as such.
      const directory = await readAsnDirectory();
      const kinds = Object.fromEntries(shown.map((asn) => [asn, asns.find((item) => item.asn === asn)?.type ?? directory?.entries?.[asn]?.kind ?? null]));
      const [names, inventory] = await Promise.all([getAsnNames(shown, asns, directory), iranRegisteredAsns()]);
      // Networks without any test in the period: nothing can be said about them, and the
      // reader has to know that, especially for public bodies.
      const unmeasured = inventory ? [...inventory].filter((asn) => !shown.includes(asn)) : [];
      const unmeasuredKinds = {};
      for (const asn of unmeasured) {
        const kind = directory?.entries?.[asn]?.kind ?? 'unknown';
        unmeasuredKinds[kind] = (unmeasuredKinds[kind] ?? 0) + 1;
      }
      const publicUnmeasured = unmeasured.filter((asn) => ['government_admin', 'institutional'].includes(directory?.entries?.[asn]?.kind))
        .map((asn) => ({ asn, name: publicNetworkName(asn, directory.entries[asn].name, asns) }));
      return {
        ok: true, ...(raw.status === 'stale' ? { status: 'stale', staleSince: raw.staleSince } : {}),
        breakdown, access, accessByGroup, names, types: kinds, excludedMeasurements: raw.excludedMeasurements, sourceUrl: raw.sourceUrl,
        coverage: inventory ? { registered: inventory.size, measured: shown.length, unmeasuredKinds, publicUnmeasured, directory: Boolean(directory) } : null,
      };
    })();
    // The period of the same length right before, for "what changed".
    const DAY = 86_400_000;
    const days = Math.round((Date.parse(`${input.until}T00:00:00Z`) - Date.parse(`${input.since}T00:00:00Z`)) / DAY) + 1;
    const previous = {
      since: new Date(Date.parse(`${input.since}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10),
      until: new Date(Date.parse(`${input.since}T00:00:00Z`) - DAY).toISOString().slice(0, 10),
    };
    const previousTask = input.testName === 'web_connectivity' && !input.target
      ? safeSource('OONI domains (previous period)', () => viaStore(ooniScope({ ...input, ...previous }), (iran) => storeDomains(store, ooniScope({ ...input, ...previous }), iran), () => getOoniDomains(ooniScope({ ...input, ...previous }))), sourceKey('OONI domains', { ...input, ...previous }))
      : Promise.resolve(null);
    const historyTask = safeSource('Cloudflare Radar outage history', () => getRadarOutageHistory(), 'Radar outage history');
    // Ways around the filter across Iran, for methods the selected network tested too rarely.
    const countryCircumventionTask = input.asn
      ? circumventionFor({ ...input, asn: '' })
      : Promise.resolve(circumvention);
    // Encrypted name lookup from inside Iran (a small sample of OONI dnscheck runs, all of Iran).
    // It never holds up the answer: after three seconds the last sample for the period stands in
    // (or none), and the fresh one finishes in the background for the next visit.
    const encryptedDnsKey = `OONI encrypted DNS|${input.since}|${input.until}`;
    const encryptedDnsTask = withDeadline(safeSource('OONI encrypted DNS', () => getEncryptedDns({ since: input.since, until: input.until }), encryptedDnsKey), 3_000, () => lastGoodSources.stale(encryptedDnsKey, 'still loading') ?? { ok: true, source: 'OONI dnscheck', status: 'stale', pending: true });
    // Psiphon's own count of Conduit connections from Iran (all of Iran, the last 30 days).
    const conduitTask = withDeadline(safeSource('Psiphon Conduit statistics', () => getPsiphonConduit(), 'Psiphon Conduit statistics'), 5_000, () => lastGoodSources.stale('Psiphon Conduit statistics', 'still loading'));
    const [countryOoniDomains, ooniSamples, ooniNetworks, [outageTraffic, networkOutageTraffic], serviceNetworks, previousOoniDomains, outageHistory, countryCircumvention, outageAnatomy, encryptedDns, conduit] = await Promise.all([
      countryTask, samplesTask, networksTask, trafficTask, serviceNetworksTask, previousTask, historyTask, countryCircumventionTask, anatomyTask, encryptedDnsTask, conduitTask,
    ]);
    // A nationwide outage in either period means tests came only from networks that kept access;
    // comparing such periods would show changes that are none.
    const overlapsOutage = (from, to) => (outageHistory?.outages ?? []).some((item) =>
      Date.parse(item.start) <= Date.parse(`${to}T23:59:59Z`) && (!item.end || Date.parse(item.end) >= Date.parse(`${from}T00:00:00Z`)));
    const comparisonBlockedByOutage = overlapsOutage(previous.since, previous.until) || overlapsOutage(input.since, input.until);
    const scopeLabel = input.asn ? `${input.asn} / Iran` : 'Iran / all measured networks';
    // Independent inside-out checks (RIPE Atlas, Globalping) from the local store; empty unless
    // those paths were switched on. Probes were limited to Iranian networks when measuring.
    const activeChecks = store.activeChecks({ hosts: ACTIVE_HOSTS, since: input.since, until: input.until, asn: input.asn });
    const vpnUse = await vpnUsePromise;
    const assessment = buildAssessment({ activeChecks, vpnUse, countryCircumvention, ooni, ripe, radar, radarQuality, ioda, ripestat, censoredPlanet, tor, mlab, apnic, globalping, peeringdb, ihr, asrank, rpki, pulse, ooniDomains, countryOoniDomains, circumvention, ooniSamples, ooniNetworks, outageTraffic, networkOutageTraffic, outageAnatomy, encryptedDns, conduit, serviceNetworks, previousOoniDomains: previousOoniDomains ? { ...previousOoniDomains, period: previous, outageOverlap: comparisonBlockedByOutage } : null, selection: input, scopeLabel });
    const asnProfile = input.asn ? asns.find((item) => item.asn === input.asn) || null : null;
    // Which route answered the access evidence, and how current each collector path is.
    const health = store.health();
    const dataPaths = { via: ooniDomains?.via === 'store' || ooni?.via === 'store' ? 'store' : 'live',
      paths: Object.fromEntries(Object.entries(collectorPlan()).map(([name, planned]) => [name, { ...planned, ...(health[name] ?? {}) }])),
      coverage: Object.fromEntries(['ooni-api', 'ooni-s3'].map((path) => [path, { since: store.getMeta(`${path}:coveredSince`), until: store.getMeta(`${path}:coveredUntil`) }])) };
    const payload = { ok: true, input, asnProfile, fetchedAt: new Date().toISOString(), dataPaths, assessment, ooni, ripe, radar, radarQuality, ioda, tor, mlab, apnic, vpnUse, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki, pulse };
    // An answer given before the encrypted-DNS sample was ready is not kept as complete.
    if (isCleanOverview([ooni, ripe, radar, radarQuality, ioda, tor, mlab, apnic, ripestat, censoredPlanet, pulse, ooniDomains, countryOoniDomains, circumvention, outageTraffic, networkOutageTraffic, outageAnatomy, encryptedDns, ooniNetworks, serviceNetworks, previousOoniDomains, ...ooniSamples])) {
      rememberHistoricalOverview(cacheKey, payload, settled ? HISTORICAL_OVERVIEW_TTL_MS : CURRENT_OVERVIEW_TTL_MS);
    } else if (!settled) {
      // A current answer with a missing part is kept for a minute only, so the part is retried soon.
      rememberHistoricalOverview(cacheKey, payload, 60 * 1000);
    }
    settleShared(payload);
    timings.set('total', performance.now() - overviewStarted);
    jsonResponse(res, 200, payload, serverTimingHeader(timings), { reuse: true });
    return true;
    } finally {
      settleShared(null);
      inflightOverviews.delete(cacheKey);
    }
  }

  if (url.pathname === '/api/circumvention') {
    const input = queryInput(url);
    const result = await circumventionFor(input);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/ooni/measurements') {
    const input = queryInput(url);
    const result = await listOoniMeasurements(input);
    jsonResponse(res, 200, result);
    return true;
  }

  if (url.pathname === '/api/ooni/domains') {
    const input = queryInput(url);
    if (input.testName !== 'web_connectivity') throw new Error('Domain findings require Web Connectivity.');
    // The same path as the Overview (local store first, then OONI, then the last good answer or the
    // nearest period), so the technical table answers whenever the Overview can.
    const result = await safeSource('OONI domains', () => viaStore(ooniScope(input), (iran) => storeDomains(store, ooniScope(input), iran), () => getOoniDomains(ooniScope(input))), sourceKey('OONI domains', input));
    jsonResponse(res, result?.ok === false ? 400 : 200, result);
    return true;
  }

  if (url.pathname === '/api/ooni/domain-measurements') {
    const input = queryInput(url);
    const domain = url.searchParams.get('domain') || '';
    const offsetText = url.searchParams.get('offset') || '0';
    if (!/^(0|[1-9]\d*)$/.test(offsetText)) throw new Error('Invalid OONI domain page offset.');
    const result = await getOoniDomainMeasurements(input, domain, Number(offsetText));
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
    const [accessNow, pulse, gdelt] = await Promise.all([
      safeSource('Access Now #KeepItOn / STOP', () => getAccessNowStopIncidents(input)),
      safeSource('Internet Society Pulse', () => getPulseShutdowns(input)),
      safeSource('GDELT DOC 2.0', () => getGdeltIranIntelligence(input)),
    ]);
    const shutdownContext = correlateShutdownContext({ accessNow, pulse, since: input.since, until: input.until });
    jsonResponse(res, 200, {
      ok: true,
      input: { since: input.since, until: input.until },
      fetchedAt: new Date().toISOString(),
      sources: intelligenceSources,
      accessNow,
      pulse,
      shutdownContext,
      gdelt,
      note: 'Access Now STOP and Internet Society Pulse are separate curated contextual incident sources; GDELT is discovery context. Temporal/scope correlation never auto-merges incidents or creates an additional independent technical vote. Root-evidence lineage must be reviewed before any corroboration claim.',
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

// Static files carry a content fingerprint (ETag): a returning browser gets "304 not modified"
// and transfers nothing. Text files are sent compressed; each version is compressed once.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);
const staticCache = new Map();

async function staticEntry(file) {
  const info = await stat(file);
  const cached = staticCache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached;
  let body = await readFile(file);
  if (file.endsWith(`${sep}index.html`) && process.env.PUBLIC_URL) {
    const base = process.env.PUBLIC_URL.replace(/\/+$/, '').replace(/[&"<>]/g, (char) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char]));
    body = Buffer.from(body.toString('utf8').replace('content="/brand/og-image.png"', `content="${base}/brand/og-image.png"`)
      .replace('<meta property="og:type"', `<meta property="og:url" content="${base}/" />\n  <meta property="og:type"`));
  }
  const entry = { mtimeMs: info.mtimeMs, size: info.size, body, etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`, encoded: new Map() };
  staticCache.set(file, entry);
  return entry;
}

async function serveStatic(req, res, pathname) {
  const file = safeStaticPath(pathname);
  if (!file) return false;
  if (!existsSync(file)) return false;
  const extension = extname(file).toLowerCase();
  const entry = await staticEntry(file);
  const encoding = COMPRESSIBLE.has(extension) && entry.body.length >= 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
  const headers = {
    'content-type': mime[extension] || 'application/octet-stream',
    'cache-control': ['.html', '.js', '.css'].includes(extension) ? 'no-cache' : 'public, max-age=86400',
    etag: entry.etag,
    vary: 'accept-encoding',
    ...pageSecurityHeaders(),
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  let body = entry.body;
  if (encoding) {
    if (!entry.encoded.has(encoding)) entry.encoded.set(encoding, compressBody(entry.body, encoding));
    body = entry.encoded.get(encoding);
    headers['content-encoding'] = encoding;
  }
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

// "What changed" as an Atom feed (English, or Farsi with ?lang=fa), one entry per day for
// all of Iran. Built from the same cached Overview answer as the page, at most every 6 hours.
const FEED_REFRESH_MS = 6 * 60 * 60 * 1000;
const feedInFlight = new Map();

// The current all-Iran picture for the feed and the widget: the cached Overview answer and the
// service history, kept for 30 minutes.
let snapshotCache = null;
let snapshotInFlight = null;
async function currentSnapshot() {
  if (snapshotCache && Date.now() - snapshotCache.at < 30 * 60 * 1000) return snapshotCache.value;
  snapshotInFlight ??= (async () => {
    const { since, until } = defaultRange();
    const response = await selfFetch(`/api/overview?asn=ALL&testName=web_connectivity&since=${since}&until=${until}`);
    const overview = await response.json();
    const history = await serviceHistory().catch(() => null);
    const value = { since, until, interpretation: overview?.assessment?.interpretation ?? null, history };
    if (value.interpretation) snapshotCache = { at: Date.now(), value };
    return value;
  })().finally(() => { snapshotInFlight = null; });
  return snapshotInFlight;
}
async function feedEntries(lang, base) {
  const path = join(root, `var/feed/${lang}.json`);
  const entries = await readEntries(path);
  const today = new Date().toISOString().slice(0, 10);
  if (entries[0]?.id === today && Date.now() - Date.parse(entries[0].updated) < FEED_REFRESH_MS) return entries;
  if (!feedInFlight.has(lang)) {
    feedInFlight.set(lang, (async () => {
      const { since, until, interpretation, history } = await currentSnapshot();
      const link = `${base}/?asn=ALL&testName=web_connectivity&since=${since}&until=${until}&lang=${lang}`;
      const entry = buildFeedEntry({ interpretation, lang, date: today, link, history });
      if (!entry) return entries;
      // The first entry of a new day goes to the language's Telegram channel, if one is set, and
      // only with a public address: a link to this machine's own address helps no reader.
      if (entries[0]?.id !== today && process.env.PUBLIC_URL?.trim()) {
        postToTelegram(entry, { token: process.env.TELEGRAM_BOT_TOKEN?.trim(), chat: process.env[`TELEGRAM_CHANNEL_${lang.toUpperCase()}`]?.trim() })
          .then((result) => { if (!result.ok && !result.skipped) console.log(`telegram ${lang}: ${result.error}`); })
          .catch((error) => console.log(`telegram ${lang}: ${error?.message ?? error}`));
      }
      return upsertEntry(path, entry);
    })().catch(() => entries).finally(() => feedInFlight.delete(lang)));
  }
  return feedInFlight.get(lang);
}

async function serveFeed(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  const base = linkBase();
  const entries = await feedEntries(lang, base);
  let body = Buffer.from(renderAtom({ entries, lang, selfUrl: `${base}/feed.xml${lang === 'fa' ? '?lang=fa' : ''}`, siteUrl: `${base}/` }));
  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (encoding) body = compressBody(body, encoding);
  res.writeHead(200, {
    'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=1800', vary: 'accept-encoding',
    'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'cross-origin',
    ...(encoding ? { 'content-encoding': encoding } : {}), 'content-length': body.length,
  });
  res.end(body);
}

// The embeddable status image (/widget.svg, ?lang=fa for Farsi).
// Open daily data for all of Iran (/data/latest.json, /data/YYYY-MM-DD.json, /data/index.json).
// Built from the same snapshot as the feed, at most every six hours; each day is kept in var/data/.
const openData = openDataStore(join(root, 'var/data'));
let openDataInFlight = null;
async function latestOpenData(base) {
  const today = new Date().toISOString().slice(0, 10);
  const stored = await openData.read(today);
  if (stored && Date.now() - Date.parse(stored.generatedAt) < FEED_REFRESH_MS) return stored;
  openDataInFlight ??= (async () => {
    const { since, until, interpretation, history } = await currentSnapshot();
    const data = buildDailyData({ interpretation, history, since, until, date: today, dashboardUrl: `${base}/?asn=ALL&testName=web_connectivity&since=${since}&until=${until}` });
    if (data) await openData.write(data);
    return data ?? stored;
  })().catch(() => stored).finally(() => { openDataInFlight = null; });
  return openDataInFlight;
}

async function serveOpenData(req, res, url) {
  const base = linkBase();
  const open = { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' };
  const name = url.pathname.slice('/data/'.length);
  if (name === 'index.json') {
    jsonResponse(res, 200, { schema: OPEN_DATA_SCHEMA, latest: `${base}/data/latest.json`, days: (await openData.dates()).map((day) => `${base}/data/${day}.json`) }, { ...open, 'cache-control': 'public, max-age=1800' });
    return;
  }
  const data = name === 'latest.json' ? await latestOpenData(base) : await openData.read(name.replace(/\.json$/, ''));
  if (!data) {
    jsonResponse(res, name === 'latest.json' ? 503 : 404, { ok: false, error: name === 'latest.json' ? 'Today\'s data is not ready yet; try again in a few minutes.' : 'No data for this day.' }, open);
    return;
  }
  jsonResponse(res, 200, data, { ...open, 'cache-control': name === 'latest.json' ? 'public, max-age=1800' : 'public, max-age=86400' });
}

// Ways around the filter with platforms and official downloads (/tools, ?lang=fa), from the
// same all-Iran snapshot as the feed.
async function serveTools(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  const snapshot = await Promise.race([currentSnapshot(), new Promise((resolve) => setTimeout(() => resolve(null), 8_000))]).catch(() => null);
  sendHtml(req, res, renderToolsPage({ lang, interpretation: snapshot?.interpretation ?? null, since: snapshot?.since ?? null, until: snapshot?.until ?? null }));
}

// The source catalogue page (/sources, ?lang=fa), with each source's answer for the default view.
async function serveSources(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  // The default view is kept warm; if it is still being computed, the page says so instead of waiting.
  const overview = await selfFetch('/api/overview', { signal: AbortSignal.timeout(8_000) })
    .then((response) => (response.ok ? response.json() : null)).catch(() => null);
  sendHtml(req, res, renderSourcesPage({ lang, sources: Array.isArray(sources) ? sources : sources.sources ?? [], overview }));
}

async function serveWidget(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  const snapshot = await currentSnapshot();
  let body = Buffer.from(renderWidget({ ...snapshot, lang }));
  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (encoding) body = compressBody(body, encoding);
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=1800', vary: 'accept-encoding',
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    // Meant to be embedded on other sites.
    'cross-origin-resource-policy': 'cross-origin',
    ...(encoding ? { 'content-encoding': encoding } : {}), 'content-length': body.length,
  });
  res.end(body);
}

// Weekly and monthly reports (/report?week=YYYY-MM-DD, ?month=YYYY-MM, /reports): a completed
// period is written once to var/reports and never computed again; one in progress is kept for an
// hour.
const reportMemory = new Map();
const reportInFlight = new Map();
// A report not yet computed costs one new Overview; `admit` charges it to the visitor who asked and
// returns their budget, so reports cannot be used to start Overviews beyond that visitor's limit.
async function monthlyReportHtml(range, lang, base, admit = () => ({ ok: true })) {
  const name = range.week ? `week-${range.week}` : range.month;
  // The format number changes when a report shows something new; older files are then written again.
  const file = join(root, 'var/reports', `${name}-${lang}.v3.html`);
  if (range.complete) {
    try { return await readFile(file, 'utf8'); } catch { /* not written yet */ }
  }
  const key = `${name}|${lang}`;
  const cached = reportMemory.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.html;
  if (!reportInFlight.has(key)) {
    const budget = admit();
    if (!budget.ok) return { refused: budget };
    reportInFlight.set(key, (async () => {
      const response = await selfFetch(`/api/overview?asn=ALL&testName=web_connectivity&since=${range.since}&until=${range.until}`);
      const overview = await response.json();
      const interpretation = overview?.assessment?.interpretation ?? null;
      const history = await serviceHistory().catch(() => null);
      const outages = await getRadarOutageHistory().then((result) => result?.outages ?? []).catch(() => []);
      const dashboardUrl = `${base}/?asn=ALL&testName=web_connectivity&since=${range.since}&until=${range.until}&lang=${lang}`;
      const html = renderMonthlyReport({ interpretation, history, outages, range, lang, dashboardUrl });
      // Only a complete answer for a finished month becomes the permanent report.
      if (range.complete && interpretation && isCleanOverview([overview.ooni])) {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, html);
        await rename(`${file}.tmp`, file);
      }
      reportMemory.set(key, { at: Date.now(), html });
      return html;
    })().finally(() => reportInFlight.delete(key)));
  }
  return reportInFlight.get(key);
}

// Daily updates as a readable page: the feed's entries, plus how to follow them.
async function serveUpdates(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  const base = linkBase();
  const entries = await feedEntries(lang, base);
  const channel = process.env[`TELEGRAM_CHANNEL_${lang.toUpperCase()}`]?.trim() ?? '';
  const telegramUrl = /^@\w{4,}$/.test(channel) ? `https://t.me/${channel.slice(1)}` : '';
  sendHtml(req, res, renderUpdatesPage({ lang, entries, feedUrl: `${base}/feed.xml${lang === 'fa' ? '?lang=fa' : ''}`, telegramUrl }));
}

// Headers every page carries: no sniffing, no referrer beyond the origin, no device access, its
// own browsing context (other sites cannot reach into a window they opened), resources only for
// this site, and HTTPS kept once served over it.
function pageSecurityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    ...(/^https:/i.test(process.env.PUBLIC_URL ?? '') ? { 'strict-transport-security': 'max-age=31536000' } : {}),
  };
}

function sendHtml(req, res, html) {
  let body = Buffer.from(html);
  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (encoding) body = compressBody(body, encoding);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', vary: 'accept-encoding',
    ...pageSecurityHeaders(),
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    ...(encoding ? { 'content-encoding': encoding } : {}), 'content-length': body.length,
  });
  res.end(body);
}

async function serveReport(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  const base = linkBase();
  const today = new Date().toISOString().slice(0, 10);
  let html;
  if (url.pathname === '/reports') {
    html = renderReportIndex({ lang, months: recentMonths(12, today), weeks: recentWeeks(8, today), today });
  } else {
    const months = recentMonths(2, today);
    const week = url.searchParams.get('week');
    const range = week ? weekRange(week, today) : monthRange(url.searchParams.get('month') || months[1], today);
    if (!range) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(week ? 'Unknown week (a Saturday, YYYY-MM-DD)' : 'Unknown month');
      return;
    }
    html = await monthlyReportHtml(range, lang, base, () => overviewBudget.take(clientAddress(req)));
    if (html?.refused) {
      const wait = String(html.refused.retryAfterSeconds);
      res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': wait, ...pageSecurityHeaders() });
      res.end(lang === 'fa' ? 'درخواست‌های تازه از این نشانی زیاد بوده است؛ چند دقیقه دیگر دوباره امتحان کنید.' : 'Too many new reports requested from this address; please try again in a few minutes.');
      return;
    }
  }
  sendHtml(req, res, html);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    // Only the path and query are read; a fixed base keeps a malformed Host header from mattering.
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/feed.xml') {
      await serveFeed(req, res, url);
    } else if (/^\/data\/(latest|index|\d{4}-\d{2}-\d{2})\.json$/.test(url.pathname)) {
      await serveOpenData(req, res, url);
    } else if (url.pathname === '/tools') {
      await serveTools(req, res, url);
    } else if (url.pathname === '/sources') {
      await serveSources(req, res, url);
    } else if (url.pathname === '/widget.svg') {
      await serveWidget(req, res, url);
    } else if (url.pathname === '/updates') {
      await serveUpdates(req, res, url);
    } else if (url.pathname === '/report' || url.pathname === '/reports') {
      await serveReport(req, res, url);
    } else if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) jsonResponse(res, 404, { ok: false, error: 'API route not found.' });
    } else if (!(await serveStatic(req, res, url.pathname))) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  } catch (error) {
    if (isInternalError(error)) {
      console.error('%s %s:', req.method, req.url, error);
      jsonResponse(res, 500, { ok: false, source: 'server', error: 'Internal error; the details are in the server log.', fetchedAt: new Date().toISOString() });
    } else {
      jsonResponse(res, 400, errorPayload(error));
    }
  } finally {
    const ms = Date.now() - started;
    if (process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.url} ${ms}ms`);
  }
});

// A connection that sends its request very slowly holds a socket; such requests are cut off.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.listen(PORT, HOST, () => {
  console.log(`Iran Censorship Monitor listening on http://${HOST}:${PORT}`);
  // Warm the view most readers open first, and keep it warm, so the first visitor does not wait
  // for a dozen upstream sources. MONITOR_PREWARM=0 turns it off.
  // The collector fills the store from all paths in parallel, hourly. Off until switched on
  // (MONITOR_COLLECTOR=1), so no upstream request is made before the owner decides.
  const plan = collectorPlan();
  if (Object.values(plan).some((entry) => entry.enabled)) {
    // Every enabled path runs in parallel; the active ones start a new round every 6 hours.
    const activeRun = (name, build) => async (target) => collectActivePath(target, name, build(), { iranAsns: await iranRegisteredAsns() });
    const paths = {};
    if (plan['ooni-api'].enabled) paths['ooni-api'] = (target) => collectOoniApi(target);
    if (plan['ooni-s3'].enabled) paths['ooni-s3'] = (target) => collectOoniS3(target);
    if (plan['ripe-atlas'].enabled) paths['ripe-atlas'] = activeRun('ripe-atlas', () => atlasPath({ http: activeHttp, key: process.env.RIPE_ATLAS_API_KEY.trim() }));
    if (plan.globalping.enabled) paths.globalping = activeRun('globalping', () => globalpingPath({ http: activeHttp, token: process.env.GLOBALPING_API_TOKEN?.trim() ?? '' }));
    const collect = async () => {
      const result = await runCollectors(store, paths);
      // About 18 MB of store per day of Iranian OONI measurements: 60 days keep it near 1 GB.
      // Older periods are answered by OONI directly, as without a store.
      const keepDays = Math.max(7, Number(process.env.STORE_RETENTION_DAYS) || 60);
      store.prune(new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10));
      console.log('collector', JSON.stringify(result));
    };
    setTimeout(collect, 5_000).unref();
    setInterval(collect, 60 * 60 * 1000).unref();
  }
  if (process.env.MONITOR_PREWARM !== '0') {
    const warm = () => {
      const { since, until } = defaultRange();
      selfFetch(`/api/overview?asn=AS58224&testName=web_connectivity&since=${since}&until=${until}`).catch(() => {});
    };
    setTimeout(warm, 1_000).unref();
    setInterval(warm, CURRENT_OVERVIEW_TTL_MS - 30_000).unref(); // every 9.5 minutes
    // The all-Iran snapshot behind the open data, the tools page, the feed and the widget: built
    // once a minute after start and then with the daily data (every six hours), so the first
    // reader after a restart does not wait for it. A reader in between gets it on demand.
    const warmIran = () => currentSnapshot()
      .then(() => latestOpenData(linkBase())).catch(() => {});
    setTimeout(warmIran, 60_000).unref();
    setInterval(warmIran, FEED_REFRESH_MS).unref();
  }
});
