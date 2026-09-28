// The server's own state for operators (/api/health): uptime, what each collector path is doing,
// cache sizes, and problems that would otherwise go unnoticed, such as a switched-on path that
// stopped delivering. It carries no keys and nothing about readers or measurement participants.

const HOUR = 60 * 60 * 1000;
// Collector paths run hourly; three missed runs, or a newest measurement older than a day and a
// half, mean the path has stopped delivering even if it reports no error.
export const PATH_SILENT_AFTER_MS = 3 * HOUR;
export const STORE_STALE_AFTER_MS = 36 * HOUR;

const age = (value, now) => (value ? now - Date.parse(value) : null);

export function healthIssues({ paths = {}, now = Date.now(), ooniLimitedUntil = 0 } = {}) {
  const issues = [];
  for (const [name, path] of Object.entries(paths)) {
    if (!path.enabled) continue;
    const sinceSuccess = age(path.lastSuccess, now);
    if (path.lastError) issues.push({ kind: 'path-error', path: name, detail: String(path.lastError).slice(0, 200) });
    if (sinceSuccess === null || sinceSuccess > PATH_SILENT_AFTER_MS) {
      issues.push({ kind: 'path-silent', path: name, detail: path.lastSuccess ? `last successful run ${path.lastSuccess}` : 'no successful run yet' });
    }
    const sinceNewest = age(path.newest, now);
    if (sinceNewest !== null && sinceNewest > STORE_STALE_AFTER_MS) {
      issues.push({ kind: 'data-stale', path: name, detail: `newest measurement ${path.newest}` });
    }
  }
  if (ooniLimitedUntil > now) issues.push({ kind: 'ooni-rate-limited', detail: `OONI limits requests until ${new Date(ooniLimitedUntil).toISOString()}; last good answers are shown` });
  return issues;
}

export function buildHealth({ now = Date.now(), startedAt, version, commit = null, configured = {}, paths = {}, caches = {}, ooniLimitedUntil = 0, memoryBytes = null }) {
  const issues = healthIssues({ paths, now, ooniLimitedUntil });
  return {
    ok: true,
    service: 'iran-censorship-monitor',
    status: issues.length ? 'degraded' : 'ok',
    now: new Date(now).toISOString(),
    version,
    commit,
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    configured,
    collector: paths,
    caches,
    memoryMb: memoryBytes === null ? null : Math.round(memoryBytes / 1024 / 1024),
    issues,
  };
}
