import { fetchJson } from './common.mjs';

// Filterwatch publishes monthly expert reports on Iran's network and censorship policy, in English
// and Persian. The weekly and monthly reports link the ones published in their period, in the
// reader's language, as dated context: they are analysis, not a measurement, and never count as
// evidence of access. Only the network-monitoring and investigation categories are read.
const SITES = {
  en: { base: 'https://filter.watch/english', categories: '4,3' },
  fa: { base: 'https://filter.watch', categories: '7,9' },
};
const DAY_MS = 86_400_000;

export function buildFilterwatchUrl({ lang = 'en', since, until }) {
  const site = SITES[lang] ?? SITES.en;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(until))) throw new Error('Filterwatch needs a period.');
  const before = new Date(Date.parse(`${until}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  const params = new URLSearchParams({ after: `${since}T00:00:00`, before: `${before}T00:00:00`, categories: site.categories, per_page: '20', orderby: 'date', order: 'asc', _fields: 'date_gmt,link,title' });
  return `${site.base}/wp-json/wp/v2/posts?${params}`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', zwnj: '‌' };
function plainTitle(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFilterwatchPosts(payload, lang = 'en') {
  const site = SITES[lang] ?? SITES.en;
  return (Array.isArray(payload) ? payload : [])
    .map((post) => ({ date: String(post?.date_gmt ?? '').slice(0, 10), title: plainTitle(post?.title?.rendered), url: String(post?.link ?? '') }))
    // Only the site's own articles, as web links.
    .filter((post) => /^\d{4}-\d{2}-\d{2}$/.test(post.date) && post.title && post.url.startsWith(`${site.base}/`));
}

export async function getFilterwatchReports({ lang = 'en', since, until, complete = false, fetch = fetchJson }) {
  const sourceUrl = buildFilterwatchUrl({ lang, since, until });
  // A finished period no longer changes; one in progress is asked again after a few hours.
  const payload = await fetch(sourceUrl, { cacheTtlMs: complete ? 7 * DAY_MS : 6 * 60 * 60 * 1000, timeoutMs: 15_000 });
  return { ok: true, source: 'Filterwatch', evidenceRole: 'curated-context', independentCensorshipVote: false, items: parseFilterwatchPosts(payload, lang), sourceUrl };
}
