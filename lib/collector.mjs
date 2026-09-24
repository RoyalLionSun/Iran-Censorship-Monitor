import { fetchOoniListPage } from './ooni.mjs';

// Collector paths write into the local store in parallel; each keeps its own coverage window,
// so a failing path never erases what another delivered.

const HOUR = 60 * 60 * 1000;
const OONI_PAGE_SIZE = 1000;

function isoSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildOoniListUrl({ since, until }) {
  const params = new URLSearchParams({
    probe_cc: 'IR',
    since: since.replace(/Z$/, ''),
    until: until.replace(/Z$/, ''),
    limit: String(OONI_PAGE_SIZE),
    order_by: 'measurement_start_time',
    order: 'asc',
  });
  return `https://api.ooni.io/api/v1/measurements?${params}`;
}

// Iranian OONI measurements since the path's last covered time, paged in time order. After a
// short outage the gap is closed; after a long one, coverage restarts, so the page never reads
// a period with a hole as complete.
export async function collectOoniApi(store, {
  now = new Date(), fetchPage = fetchOoniListPage, maxPages = 40, overlapHours = 3, catchUpHours = 72,
} = {}) {
  const path = 'ooni-api';
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const coveredUntil = Date.parse(store.getMeta(`${path}:coveredUntil`) ?? '');
  const earliest = nowMs - catchUpHours * HOUR;
  const continuous = Number.isFinite(coveredUntil) && coveredUntil >= earliest;
  const startMs = continuous ? coveredUntil - overlapHours * HOUR : nowMs - overlapHours * HOUR;
  const run = store.startRun(path);
  let url = buildOoniListUrl({ since: isoSeconds(startMs), until: isoSeconds(nowMs) });
  let added = 0;
  let pages = 0;
  let lastTs = null;
  try {
    while (url && pages < maxPages) {
      const payload = await fetchPage(url);
      const results = Array.isArray(payload?.results) ? payload.results : null;
      if (!results) throw new Error('OONI measurement list without results.');
      added += store.addOoniMeasurements(results, 'api');
      for (const item of results) {
        const ts = Date.parse(String(item?.measurement_start_time ?? ''));
        if (Number.isFinite(ts) && (lastTs === null || ts > lastTs)) lastTs = ts;
      }
      pages += 1;
      url = typeof payload?.metadata?.next_url === 'string' && payload.metadata.next_url ? payload.metadata.next_url : null;
    }
    // A cut-off listing covers only up to its last measurement; the next run continues there.
    const reachedMs = url ? (lastTs ?? startMs) : nowMs;
    if (!continuous) store.setMeta(`${path}:coveredSince`, isoSeconds(startMs));
    store.setMeta(`${path}:coveredUntil`, isoSeconds(reachedMs));
    store.finishRun(run, { rows: added, newest: store.newestOoni() });
    return { ok: true, path, added, pages, complete: !url, coveredUntil: isoSeconds(reachedMs) };
  } catch (error) {
    // Whatever was read before the failure stays; coverage only advances to its last measurement.
    if (lastTs !== null && continuous) store.setMeta(`${path}:coveredUntil`, isoSeconds(Math.max(lastTs, coveredUntil)));
    store.finishRun(run, { rows: added, newest: store.newestOoni(), error: error?.message ?? String(error) });
    return { ok: false, path, added, pages, error: error?.message ?? String(error) };
  }
}

// All configured paths at once; one failing path does not stop the others.
export async function runCollectors(store, paths) {
  const results = await Promise.allSettled(Object.entries(paths).map(async ([name, run]) => [name, await run(store)]));
  return Object.fromEntries(results.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : [Object.keys(paths)[index], { ok: false, error: result.reason?.message ?? String(result.reason) }]));
}
