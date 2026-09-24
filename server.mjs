import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssessment } from './lib/assessment.mjs';
import { compressBody, createLastGoodStore, errorPayload, isCleanOverview, isSettledPeriod, jsonResponse, loadEnvFile, pickEncoding, mapLimit, normalizeAsn, validateRange } from './lib/common.mjs';
import { getCircumventionSignals, getOoniDomainMeasurements, getOoniDomains, getOoniMeasurementDetail, getOoniNetworks, getOoniServiceNetworks, getOoniTimeline, iranRegisteredAsns, getOoniSample, listOoniMeasurements, OONI_TESTS } from './lib/ooni.mjs';
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
import { getAsnNames } from './lib/asn-names.mjs';
import { getCitizenLabIranTargets } from './lib/citizenlab.mjs';
import { getPeeringDbTopology } from './lib/peeringdb.mjs';
import { getIhrDependencies } from './lib/ihr.mjs';
import { getPulseShutdowns } from './lib/pulse.mjs';
import { correlateShutdownContext } from './lib/shutdown-context.mjs';
import { getGdeltIranIntelligence } from './lib/osint.mjs';
import { getMlabPerformance } from './lib/mlab.mjs';
import { getAccessNowStopIncidents } from './lib/accessnow.mjs';
import { getApnicCountryComposition, getApnicIpv6, getApnicVpnShare } from './lib/apnic.mjs';
import { getServiceHistory } from './lib/history.mjs';
import { buildFeedEntry, postToTelegram, readEntries, renderAtom, upsertEntry } from './lib/feed.mjs';
import { renderWidget } from './lib/widget.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

await loadEnvFile(join(root, '.env'));
const publicRoot = resolve(root, 'public');
const asnCoverageSnapshotPath = join(root, 'var/asn-coverage/latest.json');
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
// from OONI directly, as before. The collector fills the store (see DATA_RESILIENCE_PLAN.md).
const store = openStore(join(root, 'var/store/monitor.db'));

async function viaStore(scope, build, live) {
  if (!scope.target && storeCovers(store, scope)) {
    const iran = await iranRegisteredAsns();
    if (iran) return build(iran);
  }
  return live();
}

const lastGoodSources = createLastGoodStore({ path: join(root, 'var/last-good/sources.json') });

function sourceKey(name, input) {
  return [name, input.asn || 'ALL', input.since, input.until, input.testName || '', input.target || ''].join('|');
}

async function safeSource(name, work, key = null) {
  try {
    return lastGoodSources.remember(key, await work());
  } catch (error) {
    // A failing source falls back to its last successful answer, marked as history.
    return lastGoodSources.stale(key, error) ?? errorPayload(error, name);
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
      jsonResponse(res, 200, cached.payload);
      return true;
    }
    // The same question already being answered (for example by the warm-up) is waited for,
    // not asked of every upstream source a second time.
    const pending = inflightOverviews.get(cacheKey);
    if (pending) {
      const shared = await pending;
      if (shared) { jsonResponse(res, 200, shared); return true; }
    }
    let settleShared;
    inflightOverviews.set(cacheKey, new Promise((resolve) => { settleShared = resolve; }));
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
      input.asn ? safeSource('RIPEstat RPKI', () => getRpkiIntegrity(input)) : Promise.resolve(scopeRequired('RIPEstat RPKI', input)),
      safeSource('Internet Society Pulse', () => getPulseShutdowns(input), sourceKey('Pulse', input)),
      // Priority-service summary for the Overview. The full domain list stays on /api/ooni/domains.
      input.testName === 'web_connectivity' ? safeSource('OONI domains', () => viaStore(ooniScope(input), (iran) => storeDomains(store, ooniScope(input), iran), () => getOoniDomains(ooniScope(input))), sourceKey('OONI domains', input)) : Promise.resolve(null),
      safeSource('OONI circumvention', () => viaStore(input, (iran) => storeCircumvention(store, input, iran), () => getCircumventionSignals(input)), sourceKey('OONI circumvention', input)),
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
    // Where each service was and was not blocked, by named Iranian network.
    const serviceNetworksTask = input.testName !== 'web_connectivity' ? Promise.resolve(null) : (async () => {
      const domains = [...SERVICE_BRANDS, ...MORE_SERVICE_GROUPS.flatMap((group) => group.services)].flatMap((brand) => brand.domains);
      const raw = await safeSource('OONI service networks', () => viaStore({ ...input, asn: '', target: '' }, (iran) => storeServiceNetworks(store, { ...input, asn: '', target: '' }, domains, iran), () => getOoniServiceNetworks({ ...input, asn: '', target: '' }, domains)), sourceKey('OONI service networks', { ...input, asn: '', target: '' }));
      if (!raw?.ok || raw.status === 'stale') return { ok: false };
      const breakdown = summarizeServiceNetworks(raw.rows);
      const access = summarizeNetworkAccess(raw.rows);
      const accessByGroup = summarizeNetworkAccessByGroup(raw.rows);
      const shown = [...new Set(Object.values(accessByGroup).flat().map((entry) => entry.asn))];
      // Who a network is: the reviewed catalogue first, then the Iranian network directory,
      // then RIPEstat for a name. Institutional and public networks are named as such.
      const directory = await readAsnDirectory();
      const kinds = Object.fromEntries(shown.map((asn) => [asn, asns.find((item) => item.asn === asn)?.type ?? directory?.entries?.[asn]?.kind ?? null]));
      const known = [...asns, ...shown.filter((asn) => directory?.entries?.[asn]?.name).map((asn) => ({ asn, name: directory.entries[asn].name }))];
      const [names, inventory] = await Promise.all([getAsnNames(shown, known), iranRegisteredAsns()]);
      // Networks without any test in the period: nothing can be said about them, and the
      // reader has to know that, especially for public bodies.
      const unmeasured = inventory ? [...inventory].filter((asn) => !shown.includes(asn)) : [];
      const unmeasuredKinds = {};
      for (const asn of unmeasured) {
        const kind = directory?.entries?.[asn]?.kind ?? 'unknown';
        unmeasuredKinds[kind] = (unmeasuredKinds[kind] ?? 0) + 1;
      }
      const publicUnmeasured = unmeasured.filter((asn) => ['government_admin', 'institutional'].includes(directory?.entries?.[asn]?.kind))
        .map((asn) => ({ asn, name: directory.entries[asn].name }));
      return {
        ok: true, breakdown, access, accessByGroup, names, types: kinds, excludedMeasurements: raw.excludedMeasurements, sourceUrl: raw.sourceUrl,
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
    const [countryOoniDomains, ooniSamples, ooniNetworks, [outageTraffic, networkOutageTraffic], serviceNetworks, previousOoniDomains, outageHistory] = await Promise.all([
      countryTask, samplesTask, networksTask, trafficTask, serviceNetworksTask, previousTask, historyTask,
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
    const assessment = buildAssessment({ activeChecks, vpnUse, ooni, ripe, radar, radarQuality, ioda, ripestat, censoredPlanet, tor, mlab, apnic, globalping, peeringdb, ihr, asrank, rpki, pulse, ooniDomains, countryOoniDomains, circumvention, ooniSamples, ooniNetworks, outageTraffic, networkOutageTraffic, serviceNetworks, previousOoniDomains: previousOoniDomains ? { ...previousOoniDomains, period: previous, outageOverlap: comparisonBlockedByOutage } : null, selection: input, scopeLabel });
    const asnProfile = input.asn ? asns.find((item) => item.asn === input.asn) || null : null;
    // Which route answered the access evidence, and how current each collector path is.
    const health = store.health();
    const dataPaths = { via: ooniDomains?.via === 'store' || ooni?.via === 'store' ? 'store' : 'live',
      paths: Object.fromEntries(Object.entries(collectorPlan()).map(([name, planned]) => [name, { ...planned, ...(health[name] ?? {}) }])),
      coverage: Object.fromEntries(['ooni-api', 'ooni-s3'].map((path) => [path, { since: store.getMeta(`${path}:coveredSince`), until: store.getMeta(`${path}:coveredUntil`) }])) };
    const payload = { ok: true, input, asnProfile, fetchedAt: new Date().toISOString(), dataPaths, assessment, ooni, ripe, radar, radarQuality, ioda, tor, mlab, apnic, vpnUse, ripestat, globalping, censoredPlanet, peeringdb, ihr, asrank, rpki, pulse };
    if (isCleanOverview([ooni, ripe, radar, radarQuality, ioda, tor, mlab, apnic, ripestat, censoredPlanet, pulse, ooniDomains, countryOoniDomains, circumvention, outageTraffic, networkOutageTraffic, ooniNetworks, serviceNetworks, previousOoniDomains, ...ooniSamples])) {
      rememberHistoricalOverview(cacheKey, payload, settled ? HISTORICAL_OVERVIEW_TTL_MS : CURRENT_OVERVIEW_TTL_MS);
    } else if (!settled) {
      // A current answer with a missing part is kept for a minute only, so the part is retried soon.
      rememberHistoricalOverview(cacheKey, payload, 60 * 1000);
    }
    settleShared(payload);
    jsonResponse(res, 200, payload);
    return true;
    } finally {
      settleShared(null);
      inflightOverviews.delete(cacheKey);
    }
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

  if (url.pathname === '/api/ooni/domains') {
    const input = queryInput(url);
    if (input.testName !== 'web_connectivity') throw new Error('Domain findings require Web Connectivity.');
    const result = await getOoniDomains(ooniScope(input));
    jsonResponse(res, 200, result);
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
    const base = process.env.PUBLIC_URL.replace(/\/+$/, '');
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
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
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
    const response = await fetch(`http://${HOST}:${PORT}/api/overview?asn=ALL&testName=web_connectivity&since=${since}&until=${until}`);
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
      // The first entry of a new day goes to the language's Telegram channel, if one is set.
      if (entries[0]?.id !== today) {
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
  const base = process.env.PUBLIC_URL?.replace(/\/+$/, '') || `http://${req.headers.host || `${HOST}:${PORT}`}`;
  const entries = await feedEntries(lang, base);
  let body = Buffer.from(renderAtom({ entries, lang, selfUrl: `${base}/feed.xml${lang === 'fa' ? '?lang=fa' : ''}`, siteUrl: `${base}/` }));
  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (encoding) body = compressBody(body, encoding);
  res.writeHead(200, {
    'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=1800', vary: 'accept-encoding',
    'x-content-type-options': 'nosniff', ...(encoding ? { 'content-encoding': encoding } : {}), 'content-length': body.length,
  });
  res.end(body);
}

// The embeddable status image (/widget.svg, ?lang=fa for Farsi).
async function serveWidget(req, res, url) {
  const lang = url.searchParams.get('lang') === 'fa' ? 'fa' : 'en';
  const snapshot = await currentSnapshot();
  let body = Buffer.from(renderWidget({ ...snapshot, lang }));
  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (encoding) body = compressBody(body, encoding);
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=1800', vary: 'accept-encoding',
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    ...(encoding ? { 'content-encoding': encoding } : {}), 'content-length': body.length,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/feed.xml') {
      await serveFeed(req, res, url);
    } else if (url.pathname === '/widget.svg') {
      await serveWidget(req, res, url);
    } else if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) jsonResponse(res, 404, { ok: false, error: 'API route not found.' });
    } else if (!(await serveStatic(req, res, url.pathname))) {
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
      store.prune(new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
      console.log('collector', JSON.stringify(result));
    };
    setTimeout(collect, 5_000).unref();
    setInterval(collect, 60 * 60 * 1000).unref();
  }
  if (process.env.MONITOR_PREWARM !== '0') {
    const warm = () => {
      const { since, until } = defaultRange();
      fetch(`http://${HOST}:${PORT}/api/overview?asn=AS58224&testName=web_connectivity&since=${since}&until=${until}`).catch(() => {});
    };
    setTimeout(warm, 1_000).unref();
    setInterval(warm, CURRENT_OVERVIEW_TTL_MS - 30_000).unref(); // every 9.5 minutes
  }
});
