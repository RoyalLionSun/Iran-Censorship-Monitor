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

export function summarizeMessagingAppTests(payload, selection = {}) {
  return ['whatsapp', 'telegram'].map((testName) => {
    const row = payload?.ok && appTestInScope(testName, selection) ? payload.signals?.find((item) => item.testName === testName) : null;
    const status = !appTestInScope(testName, selection) ? 'out_of_scope'
      : !payload ? 'loading' : !payload.ok || !Array.isArray(payload.signals) || row?.status === 'error' ? 'unavailable'
      : !row || row.status === 'no_data' || !row.measurements ? 'untested'
        : row.anomalies > 0 ? 'anomaly' : 'no_signal';
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
  { id: 'facebook', name: 'Facebook', domains: ['www.facebook.com', 'facebook.com', 'web.facebook.com'] },
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

function brandStatus(web, app) {
  const channels = [web?.status, app?.status].filter(Boolean);
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
  const appRows = summarizeMessagingAppTests(appPayload, selection);
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
    } : null;
    return { id: brand.id, name: brand.name, status: brandStatus(web, app), web, app, country: countryFallback(countryRows, brand, web) };
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
    return { ...network, level, thin };
  }).sort((a, b) => rank[a.level] - rank[b.level] || Number(a.thin) - Number(b.thin) || b.measurements - a.measurements);
}

// Further services an information site should cover, in four groups. Website tests only: the
// result describes each website, not its app. Hosts as OONI tests them in Iran.
export const MORE_SERVICE_GROUPS = Object.freeze([
  { id: 'social', services: [
    { id: 'signal', name: 'Signal', domains: ['signal.org', 'www.signal.org'] },
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
  ] },
  { id: 'circumvention', services: [
    { id: 'psiphon', name: 'Psiphon', domains: ['psiphon.ca', 'www.psiphon.ca'] },
    { id: 'torproject', name: 'Tor Project', domains: ['www.torproject.org', 'torproject.org'] },
    { id: 'protonvpn', name: 'Proton VPN', domains: ['protonvpn.com'] },
    { id: 'expressvpn', name: 'ExpressVPN', domains: ['www.expressvpn.com'] },
    { id: 'lantern', name: 'Lantern', domains: ['getlantern.org', 'www.getlantern.org'] },
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
export function summarizeMoreServices(networkPayload, countryPayload = null) {
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
        scope: usable ? 'network' : totals ? 'country' : null,
        status: totals ? networkStatus(totals) : 'untested',
        ...(totals ?? { measurements: 0, confirmed: 0, anomalous: 0, ok: 0, lastObserved: null }),
      };
    }),
  }));
}

// The same per-network view for each group of further services, keyed by group id.
export function summarizeNetworkAccessByGroup(rows = []) {
  return Object.fromEntries([
    ['main', summarizeNetworkAccess(rows)],
    ...MORE_SERVICE_GROUPS.map((group) => [group.id, summarizeNetworkAccess(rows, group.services)]),
  ]);
}
