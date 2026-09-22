// Each row represents one OONI domain group, not all hosts, URLs or apps under a brand.
export const SERVICE_DOMAINS = Object.freeze([
  { name: 'Facebook', domain: 'facebook.com' },
  { name: 'Facebook (www)', domain: 'www.facebook.com' },
  { name: 'Instagram', domain: 'instagram.com' },
  { name: 'Instagram (www)', domain: 'www.instagram.com' },
  { name: 'X', domain: 'x.com' },
  { name: 'X (www)', domain: 'www.x.com' },
  { name: 'X (legacy)', domain: 'twitter.com' },
  { name: 'WhatsApp', domain: 'whatsapp.com' },
  { name: 'WhatsApp Web host', domain: 'web.whatsapp.com' },
  { name: 'Telegram', domain: 'telegram.org' },
  { name: 'Telegram Web host', domain: 'web.telegram.org' },
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
    failures: measured?.failures ?? 0, lastObserved: measured?.lastObserved ?? null };
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
  { id: 'whatsapp', name: 'WhatsApp', domains: ['web.whatsapp.com', 'whatsapp.com'], app: 'whatsapp' },
  { id: 'telegram', name: 'Telegram', domains: ['web.telegram.org', 'telegram.org'], app: 'telegram' },
  { id: 'youtube', name: 'YouTube', domains: ['www.youtube.com', 'youtube.com'] },
  { id: 'x', name: 'X (Twitter)', domains: ['x.com', 'www.x.com', 'twitter.com'] },
  { id: 'facebook', name: 'Facebook', domains: ['www.facebook.com', 'facebook.com'] },
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

export function summarizeServiceBrands(domainPayload, appPayload, selection = {}) {
  const webRows = summarizeServiceFindings(domainPayload, selection).rows;
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
      confirmed: strongest.confirmed, anomalous: strongest.anomalous, lastObserved: strongest.lastObserved,
    } : null;
    const appRow = brand.app ? appRows.find((row) => row.testName === brand.app) : null;
    const app = appRow ? {
      status: appRow.status, measurements: appRow.measurements, anomalies: appRow.anomalies, lastObserved: appRow.lastObservation,
    } : null;
    return { id: brand.id, name: brand.name, status: brandStatus(web, app), web, app };
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
  return { state, scoped, items, visible, blocked, restricted, reachable, tested, latestObserved };
}
