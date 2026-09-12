import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const v11Source = await readFile(new URL('../public/v11-context.js', import.meta.url), 'utf8');
const v13Source = await readFile(new URL('../public/v13-context.js', import.meta.url), 'utf8');
const v14Source = await readFile(new URL('../public/v14-context.js', import.meta.url), 'utf8');
const v16ExportSource = await readFile(new URL('../public/v16-context-export.js', import.meta.url), 'utf8');
const v16Source = await readFile(new URL('../public/v16-shutdown-context.js', import.meta.url), 'utf8');
const v17Source = await readFile(new URL('../public/v17-asn-coverage.js', import.meta.url), 'utf8');

function findBrowser() {
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';

    const candidates = [
      process.env.CHROME_BIN,
      `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${programFilesX86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      localAppData ? `${localAppData}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe` : null,
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      localAppData ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` : null,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ];

    for (const candidate of candidates.filter(Boolean)) {
      if (existsSync(candidate)) return candidate;
    }

    throw new Error('No supported Chromium-based browser executable found for the browser presentation gate.');
  }

  for (const candidate of [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean)) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return candidate;
  }

  throw new Error('No supported Chromium-based browser executable found for the browser presentation gate.');
}

const overview = {
  input: { country: 'IR', asn: 'AS58224', since: '2026-09-01', until: '2026-09-09' },
  mlab: {
    ok: true, status: 'observed', asn: 'AS58224', sourceUrls: ['https://www.measurementlab.net/'],
    latest: { downloadMedianMbps: 42.5, uploadMedianMbps: 11.2, downloadMinRttMedianMs: 37.4 },
    comparison: { metrics: { downloadMedianMbps: { changePercent: -12.3 }, downloadMinRttMedianMs: { changePercent: 8.1 } } },
    points: [{ date: '2026-09-08', downloadMedianMbps: 42.5, uploadMedianMbps: 11.2, downloadMinRttMedianMs: 37.4, downloadSamples: 120, uploadSamples: 118 }],
  },
  apnic: {
    ok: true, status: 'observed', asn: 'AS58224', sourceUrl: 'https://stats.labs.apnic.net/ipv6',
    latest: { raw: { capablePercent: 35.5, preferredPercent: 22.25, seen: 640 } },
    coverage: { observedDays: 7, dailySamplesMedian: 610 },
    points: [{ date: '2026-09-08', raw: { capablePercent: 35.5, preferredPercent: 22.25, seen: 640 }, smoothed30: { capablePercent: 34.1 } }],
  },
  tor: {
    ok: true, status: 'observed', sourceFamily: 'tor', evidenceRole: 'circumvention-context', independentCensorshipVote: false,
    transports: [{
      transport: 'obfs4', latestDate: '2026-09-05', latestLow: 140, latestHigh: 160,
      rows: [
        { date: '2026-09-04', low: 100, high: 120, frac: 74 },
        { date: '2026-09-05', low: 140, high: 160, frac: 79 },
      ],
    }],
    coverage: { bridgeDbGlobal: 'no_data' },
    bridgeDemandGlobal: { geographicScope: 'global', iranSpecific: false, transports: [] },
  },
  asrank: {
    ok: true, status: 'observed', asn: 'AS58224', independentCensorshipVote: false,
    sourceUrls: { overview: 'https://api.asrank.caida.org/v2/restful/asns/58224' },
    overview: { rank: 321, customerCone: { asns: 17 }, degree: { customers: 8, peers: 4, transits: 3 } },
    links: [{ asn: 'AS12880', relationship: 'peer', paths: 27, locations: ['Tehran-IR'] }],
  },
  rpki: {
    ok: true, status: 'partial', asn: 'AS58224', independentCensorshipVote: false, routingSourceFamily: 'ripe',
    sourceUrls: { announcedPrefixes: 'https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS58224' },
    coverage: { valid: 7, invalid_asn: 0, invalid_length: 1, unknown: 2, checkedPrefixCount: 10, totalPrefixCount: 20, truncated: true },
    validations: [{ prefix: '2.144.0.0/13', status: 'invalid_length', description: 'Fixture RPKI description' }],
  },
};

const intelligence = {
  accessNow: {
    ok: true, status: 'observed', totalMatched: 1, datasetThroughYear: 2025,
    coverageWarning: 'Fixture coverage warning.',
    dashboardUrl: 'https://www.accessnow.org/keepiton-data-dashboard/',
    incidents: [{
      id: 'fixture-stop-1', startDate: '2026-09-05', endDate: '2026-09-06', event: 'Fixture incident', areaName: 'Iran', shutdownType: 'Internet shutdown',
      shutdownExtent: 'National context', status: 'Ended', evidenceLineage: [{ source: 'OONI' }],
      evidenceUrls: ['https://ooni.org/'], accessNowUrls: [], independentTechnicalVote: false,
    }],
  },
  pulse: {
    ok: true, source: 'Internet Society Pulse', status: 'observed', totalMatched: 1,
    methodologyUrl: 'https://pulse.internetsociety.org/en/shutdowns/', independentTechnicalVote: false,
    events: [{
      id: 'pulse-fixture-1', country: 'Iran', startTime: '2026-09-05T12:00:00.000Z', endTime: null,
      startDate: '2026-09-05', endDate: null, type: 'National shutdown', verificationLevel: 'Confirmed',
      cause: 'Fixture cause', affectedRegions: 'Nationwide', independentTechnicalVote: false,
    }],
  },
  shutdownContext: {
    ok: true, status: 'complete_context', stop: { available: true, count: 1, datasetThroughYear: 2025 },
    pulse: { available: true, configured: true, count: 1 }, possibleSameIncidentCount: 1, automaticMergedCount: 0,
    independentTechnicalVote: false,
    correlations: [{
      stopId: 'fixture-stop-1', pulseId: 'pulse-fixture-1', relation: 'temporal_scope_overlap', scopeClass: 'national',
      possibleSameIncident: true, automaticMerge: false, independentTechnicalVote: false,
    }],
    note: 'Fixture correlation remains analyst context only.',
  },
};

const asnCoverage = {
  ok: true,
  source: 'Local Iran ASN coverage snapshot',
  status: 'observed',
  ageHours: 2.5,
  maxAgeHours: 168,
  schemaVersion: 1,
  generatedAt: '2026-09-10T08:30:00.000Z',
  country: 'IR',
  inventory: { total: 854 },
  routingSummary: { registeredCount: 854, routedCount: 742 },
  curatedCoverage: { inventoryCount: 854, curatedCount: 23, curatedInInventoryCount: 23, coveragePercent: 2.69, uncuratedCount: 831 },
  secondaryMetadata: { source: 'ipverse/as-metadata', matchedInventoryAsnCount: 850 },
  enrichment: { secondaryCoverageCount: 850, secondaryMissingCount: 4, secondaryCountryMismatchCount: 2 },
  candidateQueue: [{
    asn: 'AS12345', displayName: 'Fixture Access Network', operatorFamily: null, candidateClass: 'access_review',
    priorityReasons: ['class:access_review'],
    quality: { secondaryMetadataMissing: false, secondaryCountryMismatch: false, secondaryCountryCode: 'IR', secondaryOrigin: 'RIPE' },
    secondary: { networkRole: 'access_provider', category: 'isp', lastAnnounced: '2026-09-09T00:00:00.000Z', reach: 12, customers: 3, degree: 9 },
    evidenceRole: 'scope-topology-prioritization', independentCensorshipVote: false,
  }],
  evidenceRole: 'scope-topology-prioritization',
  independentCensorshipVote: false,
};

const fixture = `<!doctype html><html><body>
<span id="header-source-state">pending</span>
<button id="export-button" type="button">Export</button>
<input id="since-input" value="2026-09-01"><input id="until-input" value="2026-09-09">
<article id="tor-panel"></article>
<article id="ripe-panel"></article>
<article id="globalping-panel"></article>
<article id="intelligence-panel"><p class="panel-note"></p><div id="intelligence-source-grid"></div></article>
<span id="footer-version"></span>
<script>
const overview = ${JSON.stringify(overview)};
const intelligence = ${JSON.stringify(intelligence)};
const asnCoverage = ${JSON.stringify(asnCoverage)};
window.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const payload = url.startsWith('/api/overview?') ? overview : url.startsWith('/api/intelligence?') ? intelligence : url === '/api/asn-coverage' ? asnCoverage : { ok: false, status: 'error', error: 'Unexpected fixture URL' };
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
</script>
<script type="module">
await import('/v11-context.js');
await import('/v13-context.js');
await import('/v14-context.js');
await import('/v16-shutdown-context.js');
await import('/v17-asn-coverage.js');
await window.fetch('/api/overview?fixture=1');
await window.fetch('/api/intelligence?fixture=1');
await new Promise((resolve) => setTimeout(resolve, 150));
document.body.dataset.fixtureReady = '1';
</script>
</body></html>`;

const server = http.createServer((request, response) => {
  if (request.url === '/fixture') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fixture);
    return;
  }
  if (request.url === '/v11-context.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(v11Source);
    return;
  }
  if (request.url === '/v13-context.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(v13Source);
    return;
  }
  if (request.url === '/v14-context.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(v14Source);
    return;
  }
  if (request.url === '/v16-context-export.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(v16ExportSource);
    return;
  }
  if (request.url === '/v16-shutdown-context.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(v16Source);
    return;
  }
  if (request.url === '/v17-asn-coverage.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(v17Source);
    return;
  }
  response.writeHead(404).end();
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('UI fixture server did not expose a TCP port.');
  const browser = findBrowser();
  const args = [
    '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--virtual-time-budget=6000', '--dump-dom',
    `http://127.0.0.1:${address.port}/fixture`,
  ];
  let stdout;
  try {
    ({ stdout } = await execFileAsync(browser, args, { encoding: 'utf8', timeout: 35_000, maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    const detail = error?.stderr || error?.message || String(error);
    throw new Error(`Headless browser execution failed: ${detail}`);
  }

  const dom = stdout;
  const required = [
    'data-fixture-ready="1"', 'id="mlab-panel"', 'id="apnic-panel"', 'id="stop-context"',
    'id="pulse-context"', 'id="shutdown-correlation-context"', 'id="asn-coverage-panel"',
    'id="asrank-panel"', 'id="rpki-panel"', 'id="v14-tor-context-panel"',
    '42.5 Mbps', '35.5%', 'Fixture incident', 'Independent sensor votes',
    'Current Iran shutdown context', 'National shutdown', 'Confirmed', 'Fixture cause', 'ongoing / open-ended',
    'Possible incident correlation', 'fixture-stop-1', 'pulse-fixture-1', 'temporal_scope_overlap', 'never auto-merged', 'Auto-merged',
    'Coverage and review queue', 'RIR-associated ASNs', '854', '2.69%', 'AS12345', 'Fixture Access Network', 'access review', 'analyst priority only', 'reach 12 · customers 3 · degree 9',
    'Customer-cone ASNs', 'AS12880', '2.144.0.0/13', 'invalid_length',
    '2/13 source families observed · assessment votes remain separate',
    'GLOBAL · not Iran-specific', '100–120', '140–160',
    'higher non-overlapping estimate interval', 'temporal context only · no causal attribution',
  ];
  for (const token of required) {
    if (!dom.includes(token)) throw new Error(`Headless UI gate missing rendered token: ${token}`);
  }
  const exportTag = dom.match(/<button id="export-context-button"[^>]*>/)?.[0];
  if (!exportTag || /\bdisabled\b/.test(exportTag)) throw new Error('Context CSV export button was not enabled after overview rendering.');
  if (/national[^<]{0,20}(blocked|available)/i.test(dom)) throw new Error('Fixture unexpectedly rendered a national blocked/available verdict.');
  if (/exact (users|client|change)/i.test(dom)) throw new Error('Fixture unexpectedly rendered exact-user/change language for bounded Tor estimates.');
  if (/asn[^<]{0,40}censorship score/i.test(dom)) throw new Error('Fixture unexpectedly rendered ASN review priority as a censorship score.');

  console.log(`UI PRESENTATION PASS · ${browser} · M-Lab/APNIC/STOP/Pulse + ASN coverage/review + ASRank/RPKI + bounded Tor/BridgeDB context rendered in a real headless browser`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
