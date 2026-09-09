import { asRecord, fetchJson, validateRange } from './common.mjs';

const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_GDELT_DAYS = 90;
const PROFESSIONAL_DOMAINS = new Set([
  'asl19.org','miaan.org','accessnow.org','internetsociety.org','netblocks.org','psiphon.ca','protonvpn.com','ceno.app',
  'article19.org','freedomhouse.org','kentik.com','ooni.org','censoredplanet.org','ripe.net','torproject.org','cloudflare.com',
  'measurementlab.net','caida.org','apnic.net','isc.org','eff.org','citizenlab.ca','globalping.io','jsdelivr.com','reuters.com','bbc.com'
]);

function dateTimeParam(date, end = false) {
  return `${String(date).replaceAll('-', '')}${end ? '235959' : '000000'}`;
}

function daysBetween(since, until) {
  return Math.floor((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) + 1;
}

export function buildGdeltUrl({ since, until }) {
  validateRange(since, until, 120);
  if (daysBetween(since, until) > MAX_GDELT_DAYS || Date.parse(`${until}T23:59:59Z`) < Date.now() - MAX_GDELT_DAYS * 86_400_000) {
    return { available: false, reason: 'GDELT DOC 2.0 precise date search is limited to the recent three-month corpus.' };
  }
  const params = new URLSearchParams({
    query: 'Iran ("internet shutdown" OR "internet censorship" OR whitelisting OR "National Information Network" OR VPN OR DPI OR throttling)',
    mode: 'artlist', format: 'json', maxrecords: '250', sort: 'datedesc',
    startdatetime: dateTimeParam(since), enddatetime: dateTimeParam(until, true),
  });
  return { available: true, url: `${GDELT}?${params}` };
}

function normalizedDomain(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return [...PROFESSIONAL_DOMAINS].find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
  } catch { return null; }
}

export function parseGdelt(payload) {
  const root = asRecord(payload) ?? {};
  const articles = Array.isArray(root.articles) ? root.articles : [];
  const seen = new Set();
  return articles.map((raw) => {
    const row = asRecord(raw) ?? {};
    const url = typeof row.url === 'string' ? row.url : '';
    const domain = normalizedDomain(url);
    return {
      url,
      domain,
      title: typeof row.title === 'string' ? row.title : null,
      seenDate: row.seendate ?? null,
      sourceCountry: row.sourcecountry ?? null,
      language: row.language ?? null,
      socialImage: row.socialimage ?? null,
    };
  }).filter((row) => row.url && row.domain && !seen.has(row.url) && seen.add(row.url)).slice(0, 80);
}

export async function getGdeltIranIntelligence({ since, until }) {
  const built = buildGdeltUrl({ since, until });
  if (!built.available) return { ok: true, source: 'GDELT DOC 2.0', status: 'unavailable_historical_window', articles: [], sourceUrl: GDELT, note: built.reason };
  const payload = await fetchJson(built.url, { cacheTtlMs: 15 * 60_000, timeoutMs: 20_000 });
  const articles = parseGdelt(payload);
  return {
    ok: true,
    source: 'GDELT DOC 2.0',
    status: articles.length ? 'observed' : 'no_data',
    articles,
    sourceUrl: built.url,
    fetchedAt: new Date().toISOString(),
    note: 'GDELT is used only for discovery of professional reporting. Articles are contextual OSINT and are never counted as independent technical sensor votes; underlying evidence provenance must be checked before corroboration.',
  };
}
