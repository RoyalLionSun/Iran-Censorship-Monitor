import { spawn } from 'node:child_process';

const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function currentRange(days = 14) {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return { since: iso(since), until: iso(until) };
}

async function json(path, timeoutMs = 40_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' }, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${payload.error || response.statusText}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function sourceState(name, payload) {
  return {
    name,
    ok: payload?.ok === true,
    status: payload?.status ?? (payload?.ok ? 'ok' : 'error'),
    error: payload?.ok === false ? payload.error || 'unknown source error' : null,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before live acceptance (code ${child.exitCode}).`);
    try {
      const health = await json('/api/health', 2_000);
      if (health.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Server did not become ready for live acceptance.');
}

async function main() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), NODE_ENV: 'test', GLOBALPING_ACTIVE_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForServer(child);
    const range = currentRange(14);
    const query = new URLSearchParams({ asn: 'AS58224', testName: 'web_connectivity', since: range.since, until: range.until });

    const config = await json('/api/config');
    assert(config.capabilities?.mlabNdtPerformance === true, 'M-Lab capability missing from live config.');
    assert(config.capabilities?.apnicIpv6Context === true, 'APNIC IPv6 capability missing from live config.');
    assert(config.capabilities?.accessNowStopIncidents === true, 'Access Now STOP capability missing from live config.');
    assert(config.capabilities?.caidaAsRankTopology === true, 'CAIDA ASRank capability missing from live config.');
    assert(config.capabilities?.ripeStatRpkiIntegrity === true, 'RIPEstat RPKI capability missing from live config.');
    assert(config.capabilities?.globalpingActiveMeasurements === false, 'Live acceptance must not enable active Globalping.');

    const overview = await json(`/api/overview?${query}`, 120_000);
    const required = [
      sourceState('OONI', overview.ooni),
      sourceState('RIPE Atlas', overview.ripe),
      sourceState('IODA', overview.ioda),
      sourceState('Tor Metrics', overview.tor),
      sourceState('M-Lab NDT', overview.mlab),
      sourceState('APNIC Labs IPv6', overview.apnic),
      sourceState('RIPEstat / RIPE RIS', overview.ripestat),
      sourceState('Globalping passive inventory', overview.globalping),
      sourceState('Censored Planet', overview.censoredPlanet),
      sourceState('PeeringDB', overview.peeringdb),
      sourceState('Internet Health Report', overview.ihr),
      sourceState('CAIDA ASRank', overview.asrank),
      sourceState('RIPEstat RPKI', overview.rpki),
    ];

    for (const item of required) {
      console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.status}${item.error ? ` — ${item.error}` : ''}`);
    }
    const failures = required.filter((item) => !item.ok);
    assert(!failures.length, `Public adapter live acceptance failed: ${failures.map((item) => item.name).join(', ')}`);

    assert(Array.isArray(overview.mlab?.points), 'M-Lab response missing points array.');
    assert(overview.mlab?.comparison && typeof overview.mlab.comparison === 'object', 'M-Lab response missing sample-aware comparison metadata.');
    assert(Array.isArray(overview.apnic?.points), 'APNIC response missing points array.');
    assert(overview.apnic?.coverage && typeof overview.apnic.coverage === 'object', 'APNIC response missing coverage metadata.');
    assert(overview.asrank?.independentCensorshipVote === false, 'ASRank must never become an independent censorship vote.');
    assert(overview.asrank?.evidenceRole === 'topology-context', 'ASRank evidence role changed unexpectedly.');
    assert(overview.rpki?.independentCensorshipVote === false, 'RPKI must never become an independent censorship vote.');
    assert(overview.rpki?.routingSourceFamily === 'ripe', 'RPKI must remain in the RIPE routing source family.');
    assert(overview.rpki?.coverage && typeof overview.rpki.coverage === 'object', 'RPKI response missing bounded coverage metadata.');

    const stopQuery = new URLSearchParams({ asn: 'AS58224', testName: 'web_connectivity', since: '2022-09-15', until: '2022-09-30' });
    const stop = await json(`/api/stop?${stopQuery}`, 60_000);
    assert(stop.ok === true, `Access Now STOP live fetch failed: ${stop.error || 'unknown error'}`);
    assert(Array.isArray(stop.incidents) && stop.incidents.length > 0, 'Access Now STOP returned no Iran incidents for the known September 2022 validation window.');
    assert(stop.incidents.every((incident) => incident.independentTechnicalVote === false), 'STOP incident was incorrectly promoted to an independent technical vote.');
    console.log(`PASS Access Now STOP: ${stop.incidents.length} Iran incident record(s) in validation window`);

    const targets = await json('/api/targets?limit=5', 40_000);
    assert(targets.ok === true, `Citizen Lab live fetch failed: ${targets.error || 'unknown error'}`);
    assert(Array.isArray(targets.targets) && targets.targets.length > 0, 'Citizen Lab returned no Iran targets.');
    console.log(`PASS Citizen Lab: ${targets.targets.length} target(s) returned`);

    const intelligence = await json(`/api/intelligence?${query}`, 60_000);
    assert(intelligence.ok === true, 'Intelligence endpoint failed.');
    assert(intelligence.accessNow?.ok === true, 'Intelligence endpoint did not preserve successful STOP context.');
    console.log(`INFO GDELT: ${intelligence.gdelt?.ok ? intelligence.gdelt.status || 'ok' : `unavailable — ${intelligence.gdelt?.error || 'unknown error'}`}`);

    console.log(`LIVE ACCEPTANCE PASS ${range.since}..${range.until} AS58224`);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(2_000),
    ]);
    if (stderr.trim()) console.error(stderr.trim());
  }
}

main().catch((error) => {
  console.error(`LIVE ACCEPTANCE FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
