import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const v11Source = await readFile(new URL('../public/v11-context.js', import.meta.url), 'utf8');
const v13Source = await readFile(new URL('../public/v13-context.js', import.meta.url), 'utf8');

function findBrowser() {
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error('No supported Chrome/Chromium executable found for the UI presentation gate.');
}

const overview = {
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
      startDate: '2025-06-20', event: 'Fixture incident', areaName: 'Iran', shutdownType: 'Internet shutdown',
      shutdownExtent: 'National context', status: 'Ended', evidenceLineage: [{ source: 'OONI' }],
      evidenceUrls: ['https://ooni.org/'], accessNowUrls: [],
    }],
  },
};

const fixture = `<!doctype html><html><body>
<span id="header-source-state">pending</span>
<button id="export-button" type="button">Export</button>
<input id="since-input" value="2026-09-01"><input id="until-input" value="2026-09-09">
<article id="ripe-panel"></article>
<article id="intelligence-panel"><p class="panel-note"></p><div id="intelligence-source-grid"></div></article>
<span id="footer-version"></span>
<script>
const overview = ${JSON.stringify(overview)};
const intelligence = ${JSON.stringify(intelligence)};
window.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const payload = url.startsWith('/api/overview?') ? overview : intelligence;
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
</script>
<script type="module">
await import('/v11-context.js');
await import('/v13-context.js');
await window.fetch('/api/overview?fixture=1');
await window.fetch('/api/intelligence?fixture=1');
await new Promise((resolve) => setTimeout(resolve, 80));
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
    '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--virtual-time-budget=2000', '--dump-dom',
    `http://127.0.0.1:${address.port}/fixture`,
  ];
  let stdout;
  try {
    ({ stdout } = await execFileAsync(browser, args, { encoding: 'utf8', timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    const detail = error?.stderr || error?.message || String(error);
    throw new Error(`Headless browser execution failed: ${detail}`);
  }

  const dom = stdout;
  const required = [
    'data-fixture-ready="1"', 'id="mlab-panel"', 'id="apnic-panel"', 'id="stop-context"',
    'id="asrank-panel"', 'id="rpki-panel"',
    '42.5 Mbps', '35.5%', 'Fixture incident', 'Independent sensor votes',
    'Customer-cone ASNs', 'AS12880', '2.144.0.0/13', 'invalid_length',
    '2/13 source families observed · assessment votes remain separate',
  ];
  for (const token of required) {
    if (!dom.includes(token)) throw new Error(`Headless UI gate missing rendered token: ${token}`);
  }
  const exportTag = dom.match(/<button id="export-context-button"[^>]*>/)?.[0];
  if (!exportTag || /\bdisabled\b/.test(exportTag)) throw new Error('Context CSV export button was not enabled after overview rendering.');
  if (/national[^<]{0,20}(blocked|available)/i.test(dom)) throw new Error('Fixture unexpectedly rendered a national blocked/available verdict.');

  console.log(`UI PRESENTATION PASS · ${browser} · M-Lab/APNIC/STOP + ASRank/RPKI rendered in a real headless browser`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
