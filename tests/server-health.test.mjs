import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHealth, healthIssues } from '../lib/server-health.mjs';

const now = Date.parse('2026-09-26T20:00:00Z');

test('a switched-on path that stopped delivering is reported, a switched-off one is not', () => {
  const issues = healthIssues({ now, paths: {
    'ooni-api': { enabled: true, lastSuccess: '2026-09-26T19:10:00Z', newest: '2026-09-26T18:00:00Z', lastError: null },
    'ripe-atlas': { enabled: true, lastSuccess: '2026-09-26T12:00:00Z', newest: '2026-09-24T00:00:00Z', lastError: 'RIPE Atlas credits too low for a round' },
    globalping: { enabled: false, lastSuccess: null },
  } });
  assert.deepEqual(issues.map((issue) => `${issue.kind}:${issue.path}`), ['path-error:ripe-atlas', 'path-silent:ripe-atlas', 'data-stale:ripe-atlas']);
});

test('the health answer stays ok for readiness checks and says degraded when something is wrong', () => {
  const healthy = buildHealth({ now, startedAt: now - 3_600_000, version: '1.8.0', paths: {} });
  assert.equal(healthy.ok, true);
  assert.equal(healthy.status, 'ok');
  assert.equal(healthy.uptimeSeconds, 3600);
  const limited = buildHealth({ now, startedAt: now, version: '1.8.0', ooniLimitedUntil: now + 60_000 });
  assert.equal(limited.ok, true);
  assert.equal(limited.status, 'degraded');
  assert.equal(limited.issues[0].kind, 'ooni-rate-limited');
});
