// Each row represents one OONI domain group, not all hosts, URLs or apps under a brand.
export const SERVICE_DOMAINS = Object.freeze([
  { name: 'Facebook', domain: 'facebook.com' },
  { name: 'Facebook (www)', domain: 'www.facebook.com' },
  { name: 'Facebook (web)', domain: 'web.facebook.com' },
  { name: 'Instagram', domain: 'instagram.com' },
  { name: 'Instagram (www)', domain: 'www.instagram.com' },
  { name: 'X', domain: 'x.com' },
  { name: 'X (www)', domain: 'www.x.com' },
  { name: 'X (legacy)', domain: 'twitter.com' },
  { name: 'WhatsApp', domain: 'whatsapp.com' },
  { name: 'WhatsApp (www)', domain: 'www.whatsapp.com' },
  { name: 'WhatsApp Web host', domain: 'web.whatsapp.com' },
  { name: 'Telegram', domain: 'telegram.org' },
  { name: 'Telegram Web host', domain: 'web.telegram.org' },
  { name: 'Telegram links (t.me)', domain: 't.me' },
  { name: 'Telegram links (telegram.me)', domain: 'telegram.me' },
  { name: 'YouTube', domain: 'youtube.com' },
  { name: 'YouTube (www)', domain: 'www.youtube.com' },
]);

function webRow(payload, { name, domain }, selection = {}) {
  const { testName = 'web_connectivity', target = '' } = selection;
  const targetHost = target ? new URL(target).hostname.toLowerCase() : '';
  const usable = payload?.ok === true && Array.isArray(payload.domains);
  const brand = targetHost ? brandForHost(targetHost) : null;
  const inScope = !targetHost ? true
    : brand ? brand.domains.includes(domain)
      : targetHost === domain || (domain === domain.split('.').slice(-2).join('.') && targetHost.endsWith(`.${domain}`));
  const measured = usable && testName === 'web_connectivity' && inScope
    ? payload.domains.find((item) => item.domain.toLowerCase() === domain)
    : null;
  const status = testName !== 'web_connectivity' || !inScope ? 'out_of_scope'
    : !payload ? 'loading'
      : !usable ? 'unavailable'
      : !measured ? 'untested'
        : measured.confirmed > 0 ? 'confirmed'
          : measured.anomalous > 0 ? 'anomaly'
            : measured.ok > 0 ? 'no_signal' : 'inconclusive';
  return { name, domain, status, measurements: measured?.measurements ?? 0,
    confirmed: measured?.confirmed ?? 0, anomalous: measured?.anomalous ?? 0,
    failures: measured?.failures ?? 0, observedDays: measured?.observedDays ?? 0,
    lastObserved: measured?.lastObserved ?? null };
}

export function summarizeServiceFindings(payload, selection = {}) {
  const usable = payload?.ok === true && Array.isArray(payload.domains);
  const rows = SERVICE_DOMAINS.map((entry) => webRow(payload, entry, selection));
  const observed = rows.filter((row) => row.status === 'confirmed' || row.status === 'anomaly');
  const focus = observed.sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed')
    || (b.status === 'confirmed' ? b.confirmed - a.confirmed : b.anomalous - a.anomalous)
    || a.domain.localeCompare(b.domain))[0] || null;
  return { rows, focus, sourceUrl: usable ? payload.sourceUrl : null };
}

// A selected website target does not select an app test, and a selected OONI test only
// covers its own app. Otherwise app findings would answer a question nobody asked.
export function appTestInScope(appTest, selection = {}) {
  const { testName = 'web_connectivity', target = '' } = selection;
  // A selected service keeps its own app test; an unrelated website target does not.
  if (target) return selectionBrand(selection)?.app === appTest;
  return testName === 'web_connectivity' || testName === appTest;
}

// OONI app tests: each connects to the app's own servers from inside the network.
export const APP_TESTS = Object.freeze(['whatsapp', 'telegram', 'signal', 'facebook_messenger']);

export function summarizeMessagingAppTests(payload, selection = {}) {
  return APP_TESTS.map((testName) => {
    const row = payload?.ok && appTestInScope(testName, selection) ? payload.signals?.find((item) => item.testName === testName) : null;
    const status = !appTestInScope(testName, selection) ? 'out_of_scope'
      : !payload ? 'loading' : !payload.ok || !Array.isArray(payload.signals) || row?.status === 'error' ? 'unavailable'
      : !row || row.status === 'no_data' || !row.measurements ? 'untested'
        // By majority, as for websites: a few failed connections among many do not decide it.
        : row.anomalies * 2 > row.measurements ? 'anomaly' : 'no_signal';
    return { testName, status, measurements: row?.measurements ?? 0, anomalies: row?.anomalies ?? 0,
      lastObservation: row?.lastObservation ?? null, sourceUrl: row?.sourceUrl ?? null };
  });
}

// Brand-level view for the Overview. Domain groups of one brand are never summed (X and
// legacy Twitter stay separate counts); the brand shows its strongest single domain result.
// App tests stay a separate channel: website results never stand in for app availability.
export const SERVICE_BRANDS = Object.freeze([
  { id: 'instagram', name: 'Instagram', domains: ['www.instagram.com', 'instagram.com'] },
  // Hosts as OONI actually tests them; www.whatsapp.com, t.me and telegram.me were missing, so
  // the website channel reported "not tested" while hundreds of tests existed.
  { id: 'whatsapp', name: 'WhatsApp', domains: ['www.whatsapp.com', 'web.whatsapp.com', 'whatsapp.com'], app: 'whatsapp' },
  { id: 'telegram', name: 'Telegram', domains: ['web.telegram.org', 'telegram.org', 't.me', 'telegram.me'], app: 'telegram' },
  { id: 'youtube', name: 'YouTube', domains: ['www.youtube.com', 'youtube.com'] },
  { id: 'x', name: 'X (Twitter)', domains: ['x.com', 'www.x.com', 'twitter.com'] },
  { id: 'facebook', name: 'Facebook', domains: ['www.facebook.com', 'facebook.com', 'web.facebook.com'], app: 'facebook_messenger', appName: 'Messenger' },
]);

// A selection names a service, not one hostname: picking "Facebook" must cover
// facebook.com and www.facebook.com, otherwise the dashboard reports "not tested" for a
// service it just reported as blocked.
export function brandForHost(host) {
  const clean = String(host ?? '').toLowerCase();
  return SERVICE_BRANDS.find((brand) => brand.domains.includes(clean)) ?? null;
}

export function selectionBrand(selection = {}) {
  const testName = selection.testName || 'web_connectivity';
  if (selection.target && testName === 'web_connectivity') {
    try { return brandForHost(new URL(selection.target).hostname); } catch { return null; }
  }
  return SERVICE_BRANDS.find((brand) => brand.app && brand.app === testName) ?? null;
}

const WEB_RANK = { confirmed: 6, anomaly: 5, no_signal: 4, inconclusive: 3, untested: 2, out_of_scope: 1, unavailable: 0, loading: 0 };

function strongestWebRow(rows) {
  return [...rows].sort((a, b) => (WEB_RANK[b.status] ?? 0) - (WEB_RANK[a.status] ?? 0)
    || b.confirmed - a.confirmed || b.anomalous - a.anomalous || b.measurements - a.measurements)[0] ?? null;
}

// The servers a service's mobile app talks to, as far as OONI's test lists cover them (checked
// against the Citizen Lab global list, September 2026). Blocking works on these server names
// just as on the website, so their results answer "does the app reach its servers" for
// services without an OONI app test. Close to an app test, not the same: apps may also use
// other transports (QUIC, fixed addresses) or built-in fallbacks.
export const APP_SERVERS = Object.freeze({
  instagram: { hosts: ['i.instagram.com', 'edge-chat.instagram.com', 'graph.instagram.com'], suffixes: ['.cdninstagram.com'], patterns: [/^instagram\.[a-z0-9-]+\.fna\.fbcdn\.net$/] },
  whatsapp: { hosts: [], suffixes: ['.whatsapp.net'], patterns: [] },
  facebook: { hosts: ['graph.facebook.com', 'edge-mqtt.facebook.com', 'fbcdn.net'], suffixes: ['.xx.fbcdn.net'], patterns: [] },
  x: { hosts: ['api.x.com', 'api.twitter.com'], suffixes: ['.twimg.com'], patterns: [] },
  youtube: { hosts: ['youtubei.googleapis.com'], suffixes: ['.ytimg.com', '.googlevideo.com'], patterns: [] },
});

export function isAppServer(brandId, host) {
  const spec = APP_SERVERS[brandId];
  const name = String(host ?? '').toLowerCase();
  return Boolean(spec && (spec.hosts.includes(name) || spec.suffixes.some((suffix) => name.endsWith(suffix)) || spec.patterns.some((pattern) => pattern.test(name))));
}

// All tested app servers of a service together, decided by majority like a network.
export function summarizeAppServers(payload, brandId) {
  if (!APP_SERVERS[brandId] || payload?.ok !== true || !Array.isArray(payload.domains)) return null;
  const rows = payload.domains.filter((row) => isAppServer(brandId, row.domain));
  const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const counts = { measurements: sum('measurements'), confirmed: sum('confirmed'), anomalous: sum('anomalous'), ok: sum('ok'), failures: sum('failures') };
  if (!counts.measurements) return null;
  const latest = (key) => rows.map((row) => row[key]).filter(Boolean).sort().at(-1) ?? null;
  return {
    ...counts, status: networkStatus(counts), hostCount: rows.length,
    hosts: [...rows].sort((a, b) => b.measurements - a.measurements || a.domain.localeCompare(b.domain)).map((row) => row.domain),
    observedDays: Math.max(0, ...rows.map((row) => Number(row.observedDays) || 0)), lastObserved: latest('lastObserved'),
  };
}

// App servers count like a channel of their own: blocked by majority is a blocked service.
const APP_SERVER_CHANNEL = { blocked: 'confirmed', restricted: 'anomaly', partial: 'anomaly', reachable: 'no_signal', inconclusive: 'inconclusive' };

function brandStatus(web, app, appServers = null) {
  const channels = [web?.status, app?.status, appServers && !appServers.country ? APP_SERVER_CHANNEL[appServers.status] : null].filter(Boolean);
  if (channels.includes('confirmed')) return 'blocked';
  if (channels.includes('anomaly')) return 'restricted';
  if (channels.includes('no_signal')) return 'reachable';
  if (channels.includes('inconclusive')) return 'unclear';
  if (channels.includes('loading')) return 'loading';
  if (channels.every((status) => status === 'unavailable')) return 'unavailable';
  if (channels.every((status) => status === 'out_of_scope')) return 'out-of-scope';
  return 'untested';
}

// The host of a selected website target, unless one of the priority brands already covers it.
export function selectedTargetHost(selection = {}) {
  const testName = selection.testName || 'web_connectivity';
  if (!selection.target || testName !== 'web_connectivity') return null;
  let host;
  try { host = new URL(selection.target).hostname.toLowerCase(); } catch { return null; }
  return brandForHost(host) ? null : host;
}

const COUNTRY_STATUS = { confirmed: 'blocked', anomaly: 'restricted', no_signal: 'reachable', inconclusive: 'unclear' };

// When the selected network has no usable test for a service, what OONI measured across Iran
// is still worth knowing. It stays a separate, labelled channel and never becomes the
// network's own status, so a country-wide test cannot stand in for this network.
function countryFallback(countryRows, brand, networkWeb) {
  if (!countryRows || !networkWeb || !['untested', 'inconclusive'].includes(networkWeb.status)) return null;
  const strongest = strongestWebRow(countryRows.filter((row) => brand.domains.includes(row.domain)));
  if (!strongest || !COUNTRY_STATUS[strongest.status] || strongest.status === 'inconclusive') return null;
  return {
    status: COUNTRY_STATUS[strongest.status], webStatus: strongest.status, domain: strongest.domain,
    measurements: strongest.measurements, confirmed: strongest.confirmed, anomalous: strongest.anomalous,
    observedDays: strongest.observedDays, lastObserved: strongest.lastObserved,
  };
}

export function summarizeServiceBrands(domainPayload, appPayload, selection = {}, countryPayload = null) {
  const webRows = summarizeServiceFindings(domainPayload, selection).rows;
  const countryRows = selection.asn && countryPayload?.ok ? summarizeServiceFindings(countryPayload, selection).rows : null;
  // No app payload means app tests were not asked for; the tiles then show websites only.
  const appRows = appPayload === null || appPayload === undefined ? [] : summarizeMessagingAppTests(appPayload, selection);
  const targetHost = selectedTargetHost(selection);
  const targetItem = targetHost ? (() => {
    const web = webRow(domainPayload, { name: targetHost, domain: targetHost }, selection);
    return { id: 'selected-target', name: targetHost, status: brandStatus(web, null), web, app: null };
  })() : null;
  const items = SERVICE_BRANDS.map((brand) => {
    const strongest = strongestWebRow(webRows.filter((row) => brand.domains.includes(row.domain)));
    const web = strongest ? {
      status: strongest.status, domain: strongest.domain, measurements: strongest.measurements,
      confirmed: strongest.confirmed, anomalous: strongest.anomalous,
      observedDays: strongest.observedDays, lastObserved: strongest.lastObserved,
    } : null;
    const appRow = brand.app ? appRows.find((row) => row.testName === brand.app) : null;
    const app = appRow ? {
      status: appRow.status, measurements: appRow.measurements, anomalies: appRow.anomalies, lastObserved: appRow.lastObservation,
      name: brand.appName ?? null,
    } : null;
    // App servers answer for the service only where the selection covers its website.
    const inScope = strongest && strongest.status !== 'out_of_scope';
    const networkServers = inScope ? summarizeAppServers(domainPayload, brand.id) : null;
    const countryServers = inScope && !networkServers && selection.asn && countryPayload?.ok ? summarizeAppServers(countryPayload, brand.id) : null;
    const appServers = networkServers ?? (countryServers ? { ...countryServers, country: true } : null);
    return { id: brand.id, name: brand.name, status: brandStatus(web, app, appServers), web, app, appServers, country: countryFallback(countryRows, brand, web) };
  });
  if (targetItem) items.unshift(targetItem);
  // Only what the current selection actually covers is presented and summarized.
  const visible = items.filter((item) => item.status !== 'out-of-scope');
  const ids = (status) => visible.filter((item) => item.status === status).map((item) => item.id);
  const blocked = ids('blocked');
  const restricted = ids('restricted');
  const reachable = ids('reachable');
  const tested = visible.filter((item) => ['blocked', 'restricted', 'reachable', 'unclear'].includes(item.status)).length;
  const state = blocked.length ? 'blocked'
    : restricted.length ? 'restricted'
      : tested && reachable.length === tested ? 'no-problems-detected'
        : tested ? 'unclear'
          : !visible.length ? 'out-of-scope'
            : visible.every((item) => item.status === 'unavailable') ? 'unavailable' : 'untested';
  const latestObserved = visible.flatMap((item) => [item.web?.lastObserved, item.app?.lastObserved]).filter(Boolean).sort().at(-1) ?? null;
  const scoped = Boolean(selection.target || (selection.testName && selection.testName !== 'web_connectivity'));
  const countryBlocked = visible.filter((item) => ['untested', 'unclear'].includes(item.status) && item.country?.status === 'blocked').map((item) => item.id);
  return { state, scoped, items, visible, blocked, restricted, reachable, tested, latestObserved, countryBlocked };
}

// How a service fared in one network, by majority: when most tests failed it is blocked (more
// confirmed blocks than successes) or shows problems; when most got through it is reachable, or partly
// blocked if some tests were confirmed blocked. A few odd tests among many do not decide it.
export function networkStatus({ confirmed, anomalous, ok }) {
  const failed = confirmed + anomalous;
  if (!failed && !ok) return 'inconclusive';
  // Most tests failed: blocked when confirmed blocks outnumber the tests that got through.
  if (failed > ok) return confirmed > ok ? 'blocked' : 'restricted';
  return confirmed > 0 ? 'partial' : 'reachable';
}

export function summarizeServiceNetworks(rows = [], brands = SERVICE_BRANDS) {
  return brands.map((brand) => {
    const byAsn = new Map();
    for (const row of rows) {
      if (!brand.domains.includes(row.domain)) continue;
      const entry = byAsn.get(row.asn) ?? { asn: row.asn, measurements: 0, confirmed: 0, anomalous: 0, ok: 0, failures: 0 };
      for (const key of ['measurements', 'confirmed', 'anomalous', 'ok', 'failures']) entry[key] += row[key] ?? 0;
      byAsn.set(row.asn, entry);
    }
    const networks = [...byAsn.values()].map((entry) => ({ ...entry, status: networkStatus(entry) }))
      .sort((a, b) => b.measurements - a.measurements);
    const pick = (status) => networks.filter((entry) => entry.status === status);
    return {
      id: brand.id, name: brand.name, measured: networks.length,
      blocked: pick('blocked'), partial: pick('partial'), restricted: pick('restricted'),
      reachable: pick('reachable'), inconclusive: pick('inconclusive'),
    };
  }).filter((item) => item.measured > 0);
}

// Who has access: every Iranian network with tests, and how far the popular services worked
// there. "full" only when every service tested in that network was reachable; "partial" when
// at least one got through at least half the time; otherwise "blocked".
const THIN_TESTS = 5;

export function summarizeNetworkAccess(rows = [], brands = SERVICE_BRANDS) {
  const perService = summarizeServiceNetworks(rows, brands);
  const networks = new Map();
  for (const service of perService) {
    for (const status of ['blocked', 'partial', 'restricted', 'reachable', 'inconclusive']) {
      for (const entry of service[status]) {
        const network = networks.get(entry.asn) ?? { asn: entry.asn, services: {}, measurements: 0 };
        network.services[service.id] = { status, measurements: entry.measurements, ok: entry.ok, confirmed: entry.confirmed };
        network.measurements += entry.measurements;
        networks.set(entry.asn, network);
      }
    }
  }
  const rank = { full: 0, partial: 1, blocked: 2, unclear: 3 };
  return [...networks.values()].map((network) => {
    const statuses = Object.values(network.services).map((item) => item.status).filter((status) => status !== 'inconclusive');
    const level = !statuses.length ? 'unclear'
      : statuses.every((status) => status === 'reachable') ? 'full'
        : statuses.some((status) => status === 'reachable' || status === 'partial') ? 'partial' : 'blocked';
    // One tester can make a network look open or closed; below a handful of tests per service
    // the row is marked and sorted after the well-covered networks of its level.
    const thin = Math.max(...Object.values(network.services).map((item) => item.measurements)) < THIN_TESTS;
    // How much of the tested services a network lets through: reachable counts fully, partly
    // half, a problem without a confirmed block a quarter, blocked nothing. Sorting by it puts
    // the networks with the most access first; networks with few tests follow the others.
    const scores = Object.values(network.services).map((item) => ACCESS_SCORE[item.status]).filter((score) => score !== undefined);
    const access = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) : 0;
    return { ...network, level, thin, access };
  }).sort((a, b) => Number(a.thin) - Number(b.thin) || b.access - a.access || rank[a.level] - rank[b.level] || b.measurements - a.measurements);
}

const ACCESS_SCORE = { reachable: 1, partial: 0.5, restricted: 0.25, blocked: 0 };

// Further services an information site should cover, in four groups. Website tests only: the
// result describes each website, not its app. Hosts as OONI tests them in Iran.
export const MORE_SERVICE_GROUPS = Object.freeze([
  { id: 'social', services: [
    { id: 'signal', name: 'Signal', domains: ['signal.org', 'www.signal.org'], app: 'signal' },
    { id: 'tiktok', name: 'TikTok', domains: ['www.tiktok.com', 'tiktok.com'] },
    { id: 'snapchat', name: 'Snapchat', domains: ['www.snapchat.com'] },
    { id: 'discord', name: 'Discord', domains: ['discord.com', 'www.discord.com', 'discordapp.com'] },
    { id: 'reddit', name: 'Reddit', domains: ['www.reddit.com', 'reddit.com'] },
    { id: 'clubhouse', name: 'Clubhouse', domains: ['www.joinclubhouse.com', 'www.clubhouse.com'] },
    { id: 'viber', name: 'Viber', domains: ['www.viber.com', 'viber.com'] },
  ] },
  { id: 'news', services: [
    { id: 'bbc', name: 'BBC', domains: ['www.bbc.com', 'www.bbc.co.uk'] },
    { id: 'iranintl', name: 'Iran International', domains: ['www.iranintl.com', 'iranintl.com'] },
    { id: 'voa', name: 'VOA', domains: ['ir.voanews.com', 'www.voanews.com'] },
    { id: 'radiofarda', name: 'Radio Farda', domains: ['www.radiofarda.com'] },
    { id: 'dw', name: 'DW', domains: ['www.dw.com'] },
    { id: 'manoto', name: 'Manoto', domains: ['www.manototv.com'] },
    { id: 'independentpersian', name: 'Independent Persian', domains: ['www.independentpersian.com'] },
    { id: 'radiozamaneh', name: 'Radio Zamaneh', domains: ['www.radiozamaneh.com'] },
    { id: 'kayhanlondon', name: 'Kayhan London', domains: ['kayhan.london'] },
    // Opposition outlets. The Revolution TV page streams through YouTube (measured above). Its
    // website and Farah Pahlavi's are tested only once they are on Citizen Lab's Iran list; until
    // then they show untested (OONI has no test of either, 26 September 2026).
    { id: 'rezapahlavi', name: 'Reza Pahlavi (official site)', nameFa: 'وب‌سایت رسمی شاهزاده رضا پهلوی', domains: ['www.rezapahlavi.org', 'fa.rezapahlavi.org', 'rezapahlavi.org'] },
    { id: 'iranopasmigirim', name: 'We Take Back Iran (National Revolution TV)', nameFa: 'ایران را پس می‌گیریم (تلویزیون انقلاب ملی)', domains: ['iranopasmigirim.com', 'www.iranopasmigirim.com'] },
    { id: 'farahpahlavi', name: 'Farah Pahlavi (official site)', nameFa: 'وب‌سایت رسمی شهبانو فرح پهلوی', domains: ['farahpahlavi.org', 'www.farahpahlavi.org'] },
  ] },
  { id: 'circumvention', services: [
    { id: 'psiphon', name: 'Psiphon', domains: ['psiphon.ca', 'www.psiphon.ca'], app: 'psiphon' },
    { id: 'torproject', name: 'Tor Project', domains: ['www.torproject.org', 'torproject.org'], app: 'tor' },
    { id: 'torbridges', name: 'Tor bridges', nameFa: 'پل‌های تور', domains: ['bridges.torproject.org'] },
    { id: 'protonvpn', name: 'Proton VPN', domains: ['protonvpn.com'] },
    { id: 'expressvpn', name: 'ExpressVPN', domains: ['www.expressvpn.com'] },
    { id: 'nordvpn', name: 'NordVPN', domains: ['nordvpn.com', 'www.nordvpn.com'] },
    { id: 'surfshark', name: 'Surfshark', domains: ['surfshark.com', 'www.surfshark.com'] },
    { id: 'mullvad', name: 'Mullvad', domains: ['mullvad.net', 'www.mullvad.net'] },
    { id: 'outline', name: 'Outline', domains: ['getoutline.org', 'www.getoutline.org'] },
    { id: 'lantern', name: 'Lantern', domains: ['getlantern.org', 'www.getlantern.org'] },
    { id: 'hotspotshield', name: 'Hotspot Shield', domains: ['www.hotspotshield.com'] },
    { id: 'tunnelbear', name: 'TunnelBear', domains: ['www.tunnelbear.com'] },
    { id: 'encrypteddns', name: 'Cloudflare DNS (1.1.1.1)', domains: ['1.1.1.1'] },
  ] },
  { id: 'everyday', services: [
    { id: 'google', name: 'Google', domains: ['www.google.com', 'google.com'] },
    { id: 'gmail', name: 'Gmail', domains: ['mail.google.com', 'gmail.com'] },
    { id: 'chatgpt', name: 'ChatGPT', domains: ['chatgpt.com', 'chat.openai.com'] },
    { id: 'wikipedia', name: 'Wikipedia', domains: ['www.wikipedia.org', 'fa.wikipedia.org', 'en.wikipedia.org'] },
    { id: 'github', name: 'GitHub', domains: ['github.com'] },
    { id: 'linkedin', name: 'LinkedIn', domains: ['www.linkedin.com'] },
    { id: 'zoom', name: 'Zoom', domains: ['zoom.us'] },
    { id: 'teams', name: 'Microsoft Teams', domains: ['teams.microsoft.com'] },
    { id: 'appstore', name: 'App Store', domains: ['apps.apple.com'] },
    { id: 'googleplay', name: 'Google Play', domains: ['play.google.com'] },
    { id: 'bluesky', name: 'Bluesky', domains: ['bsky.app'] },
    { id: 'wechat', name: 'WeChat', domains: ['www.wechat.com'] },
    { id: 'netflix', name: 'Netflix', domains: ['www.netflix.com', 'netflix.com'] },
    { id: 'spotify', name: 'Spotify', domains: ['www.spotify.com', 'open.spotify.com'] },
  ] },
]);

function serviceTotals(payload, domains) {
  if (!payload?.ok || !Array.isArray(payload.domains)) return null;
  const rows = payload.domains.filter((row) => domains.includes(String(row.domain).toLowerCase()));
  const sum = (key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  return { measurements: sum('measurements'), confirmed: sum('confirmed'), anomalous: sum('anomalous'), ok: sum('ok'),
    lastObserved: rows.map((row) => row.lastObserved).filter(Boolean).sort().at(-1) ?? null };
}

// Each service answered from the selected network; where it has no usable test there, from
// other Iranian networks, marked as such. Status as for a network: blocked, partly, problems,
// reachable.
function appResult(appPayload, testName) {
  if (!testName || !appPayload?.ok || !Array.isArray(appPayload.signals)) return null;
  const row = appPayload.signals.find((item) => item.testName === testName);
  if (!row || row.status === 'error' || !row.measurements) return null;
  // The same rule as the ways-around-the-filter tiles, so a chip and a tile never disagree about
  // one app: one failure in ten or more is "partly". With few tests the majority decides.
  const failed = (Number(row.anomalies) || 0) + (Number(row.confirmed) || 0);
  const ok = Math.max(0, row.measurements - failed - (Number(row.failures) || 0));
  const status = failed + ok >= WORKAROUND_MIN_TESTS
    ? { fails: 'anomaly', partly: 'partly', works: 'no_signal' }[workaroundStatus({ failed, ok, usable: failed + ok })]
    : failed * 2 > row.measurements ? 'anomaly' : 'no_signal';
  return { status, measurements: row.measurements, anomalies: row.anomalies };
}

export function summarizeMoreServices(networkPayload, countryPayload = null, appPayload = null) {
  if (!networkPayload?.ok) return null;
  return MORE_SERVICE_GROUPS.map((group) => ({
    id: group.id,
    services: group.services.map((service) => {
      const own = serviceTotals(networkPayload, service.domains);
      const usable = own && own.measurements > 0 && (own.confirmed + own.anomalous + own.ok) > 0;
      const country = !usable ? serviceTotals(countryPayload, service.domains) : null;
      const totals = usable ? own : country?.measurements ? country : null;
      return {
        id: service.id, name: service.name,
        app: appResult(appPayload, service.app),
        scope: usable ? 'network' : totals ? 'country' : null,
        status: totals ? networkStatus(totals) : 'untested',
        ...(totals ?? { measurements: 0, confirmed: 0, anomalous: 0, ok: 0, lastObserved: null }),
      };
    }),
  }));
}

// The same per-network view for each group of further services, keyed by group id.
// Per category of the access table. The six most used services belong to "social & messaging"
// there, ahead of the others: a category is complete, not a remainder after the main six.
// "main" stays for figures about the six alone (headline, shared text).
export function summarizeNetworkAccessByGroup(rows = []) {
  return Object.fromEntries([
    ['main', summarizeNetworkAccess(rows)],
    ...MORE_SERVICE_GROUPS.map((group) => [group.id, summarizeNetworkAccess(rows, group.id === 'social' ? [...SERVICE_BRANDS, ...group.services] : group.services)]),
  ]);
}

// What changed against the period before: every service's website status in both periods of
// the same network, by the majority rule. Only services with enough tests in both count, so a
// single tester cannot make a change appear.
const CHANGE_MIN_TESTS = 5;
const STATUS_RANK = { reachable: 0, partial: 1, restricted: 2, blocked: 3 };

function allServices() {
  return [
    ...SERVICE_BRANDS.map(({ id, name, domains }) => ({ id, name, domains })),
    ...MORE_SERVICE_GROUPS.flatMap((group) => group.services.map(({ id, name, domains }) => ({ id, name, domains }))),
  ];
}

export function compareServicePeriods(previousPayload, currentPayload) {
  if (!previousPayload?.ok || !currentPayload?.ok) return null;
  const worse = [];
  const better = [];
  let compared = 0;
  for (const service of allServices()) {
    const before = serviceTotals(previousPayload, service.domains);
    const now = serviceTotals(currentPayload, service.domains);
    if (!before || !now || before.measurements < CHANGE_MIN_TESTS || now.measurements < CHANGE_MIN_TESTS) continue;
    const from = networkStatus(before);
    const to = networkStatus(now);
    if (!(from in STATUS_RANK) || !(to in STATUS_RANK)) continue;
    compared += 1;
    if (from === to) continue;
    const entry = { id: service.id, name: service.name, from, to, before: before.measurements, now: now.measurements };
    (STATUS_RANK[to] > STATUS_RANK[from] ? worse : better).push(entry);
  }
  return { compared, worse, better };
}

// Independent inside-out checks (RIPE Atlas, Globalping) per service: a second family next to
// OONI, never added to its counts. Rows: { host, source, kind, asn, probe, outcome, n, newest }.
// DNS pointing to the block address is blocking; a failed TLS/HTTPS connection is a failure
// that fits blocking but is not proof of it on its own. Majorities decide, as for OONI.
export function summarizeIndependentChecks(rows = [], brands = [...SERVICE_BRANDS, ...MORE_SERVICE_GROUPS.flatMap((group) => group.services)]) {
  const byBrand = new Map();
  for (const row of rows ?? []) {
    const brand = brands.find((entry) => entry.domains.includes(String(row.host ?? '').toLowerCase()));
    if (!brand || !['ok', 'blocked', 'failure'].includes(row.outcome)) continue;
    if (!byBrand.has(brand.id)) {
      byBrand.set(brand.id, { id: brand.id, sources: new Set(), probes: new Set(), networks: new Set(), blockedNetworks: new Set(),
        dns: { ok: 0, blocked: 0, failure: 0 }, connect: { ok: 0, blocked: 0, failure: 0 }, newest: null });
    }
    const entry = byBrand.get(brand.id);
    const count = Number(row.n) || 0;
    (row.kind === 'dns' ? entry.dns : entry.connect)[row.outcome] += count;
    entry.sources.add(row.source);
    if (row.probe) entry.probes.add(`${row.source}:${row.probe}`);
    if (row.asn) entry.networks.add(row.asn);
    if (row.asn && (row.outcome === 'blocked' || (row.kind !== 'dns' && row.outcome === 'failure'))) entry.blockedNetworks.add(row.asn);
    if (row.newest && (!entry.newest || row.newest > entry.newest)) entry.newest = row.newest;
  }
  return Object.fromEntries([...byBrand.values()].map((entry) => {
    const { dns, connect } = entry;
    const status = dns.blocked > dns.ok || connect.blocked > connect.ok ? 'blocked'
      : connect.failure > connect.ok ? 'failing'
        : dns.ok + connect.ok === 0 ? 'inconclusive'
          : dns.blocked + connect.blocked + connect.failure > 0 ? 'partial' : 'reachable';
    return [entry.id, {
      id: entry.id, status, sources: [...entry.sources].sort(), probes: entry.probes.size, networks: [...entry.networks].sort(),
      blockedNetworks: [...entry.blockedNetworks].sort(), dns, connect, newest: entry.newest,
    }];
  }));
}

// Ways around the filter, as OONI tests them from inside Iran. Tests that ended in an error
// carry no verdict and are not counted; a method needs 20 usable tests for a verdict of its own,
// otherwise the result across Iran stands in, labelled, and only then "too few tests".
export const WORKAROUND_TOOLS = Object.freeze([
  { id: 'tor', test: 'tor' }, { id: 'torsf', test: 'torsf' }, { id: 'vanilla_tor', test: 'vanilla_tor' },
  { id: 'psiphon', test: 'psiphon' }, { id: 'riseupvpn', test: 'riseupvpn' }, { id: 'stun', test: 'stunreachability' },
]);
const WORKAROUND_MIN_TESTS = 20;

function workaroundCounts(payload, test) {
  const row = payload?.ok && Array.isArray(payload.signals) ? payload.signals.find((item) => item.testName === test) : null;
  if (!row || row.status === 'error') return null;
  const failed = (Number(row.anomalies) || 0) + (Number(row.confirmed) || 0);
  const failures = Number(row.failures) || 0;
  const ok = Math.max(0, (Number(row.measurements) || 0) - failed - failures);
  return { measurements: Number(row.measurements) || 0, failed, ok, failures, usable: failed + ok, lastObservation: row.lastObservation ?? null, staleSince: row.staleSince ?? null };
}

function workaroundErrored(payload, test) {
  return Boolean(payload?.ok && Array.isArray(payload.signals) && payload.signals.find((item) => item.testName === test)?.status === 'error');
}

export function workaroundStatus({ failed, ok, usable }) {
  if (usable < WORKAROUND_MIN_TESTS) return 'thin';
  if (failed > ok) return 'fails';
  // One failure in ten or more is not "works": the reader would meet it often.
  return failed * 10 >= usable ? 'partly' : 'works';
}

export function summarizeWorkarounds(networkPayload, countryPayload = null) {
  if (!networkPayload?.ok) return null;
  const rows = WORKAROUND_TOOLS.map((tool) => {
    const own = workaroundCounts(networkPayload, tool.test);
    if (own && own.usable >= WORKAROUND_MIN_TESTS) return { id: tool.id, test: tool.test, scope: 'network', ...own, status: workaroundStatus(own) };
    const country = countryPayload ? workaroundCounts(countryPayload, tool.test) : null;
    if (country && country.usable >= WORKAROUND_MIN_TESTS) return { id: tool.id, test: tool.test, scope: 'country', ...country, status: workaroundStatus(country) };
    const best = [own, country].filter(Boolean).sort((a, b) => b.usable - a.usable)[0] ?? { measurements: 0, failed: 0, ok: 0, failures: 0, usable: 0 };
    // A query that failed (e.g. OONI limiting requests) is not "too few tests": say it could not be loaded.
    const errored = [networkPayload, countryPayload].some((payload) => workaroundErrored(payload, tool.test));
    const status = !best.measurements && errored ? 'unavailable' : 'thin';
    return { id: tool.id, test: tool.test, scope: best === country && country ? 'country' : 'network', ...best, status };
  });
  return rows.some((row) => row.measurements > 0) ? rows : null;
}
