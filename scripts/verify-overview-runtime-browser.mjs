// Exercise the actual index.html -> app.js -> app-core.js startup path. Other
// browser fixtures render isolated modules and cannot catch old API processes.
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssessment } from '../lib/assessment.mjs';

const execFileAsync = promisify(execFile);
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const files = new Map();
for (const relativePath of await readdir(publicRoot, { recursive: true })) {
  const path = relativePath.replaceAll('\\', '/');
  if (!['.js', '.css', '.html'].includes(extname(path))) continue;
  files.set(`/${path}`, await readFile(join(publicRoot, relativePath)));
}

function browserExecutable() {
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
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ];
    const browser = candidates.filter(Boolean).find((candidate) => existsSync(candidate));
    if (browser) return browser;
  } else {
    for (const candidate of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
      const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
      if (!result.error && result.status === 0) return candidate;
    }
  }
  throw new Error('No supported Chromium browser found for the real-app Overview gate.');
}

const input = { country: 'IR', asn: 'AS58224', testName: 'web_connectivity', since: '2026-09-06', until: '2026-09-12' };
const ooni = { ok: true, status: 'observed', totalMeasurements: 100, totalAnomalies: 40, totalConfirmed: 0, anomalyRate: 40, points: [] };
const ripe = { ok: true, status: 'no_data', probeCount: 7, overall: { samples: 0, averageRttMs: null, packetLossPercent: null }, series: [] };
const ioda = { ok: true, status: 'observed', asn: 'AS58224', events: [{ start: '2026-09-10', datasource: 'ping-slash24' }], series: [] };
const radar = { ok: false, status: 'token_required' };
const ripestat = { ok: true, status: 'observed', timeAlignment: 'aligned', routing: { visibility: { percent: 99.7, seeingPeers: 325, totalPeers: 326 } } };
const tor = { ok: true, status: 'no_data', relay: { rows: [], latestUsers: null }, bridge: { rows: [], latestUsers: null } };
const missing = { ok: true, status: 'no_data' };
const overview = {
  input, fetchedAt: '2026-09-12T00:00:00.000Z', ooni, ripe, ioda, radar, ripestat, tor,
  censoredPlanet: { ...missing, events: [] }, globalping: missing, mlab: missing, apnic: missing,
  peeringdb: { ...missing, networks: [] }, ihr: missing, asrank: missing, rpki: missing, pulse: { ...missing, events: [] },
};
const ooniDomains = { ok: true, sourceUrl: 'https://api.ooni.io/', domains: [
  { domain: 'www.instagram.com', measurements: 40, confirmed: 12, anomalous: 8, ok: 20, failures: 0, lastObserved: '2026-09-12' },
] };
const circumvention = { ok: true, signals: [{ testName: 'whatsapp', status: 'observed', measurements: 30, anomalies: 9, lastObservation: '2026-09-12' }] };
overview.assessment = buildAssessment({ ...overview, ooniDomains, circumvention, selection: input, scopeLabel: 'AS58224 / Iran' });
if (overview.assessment.interpretation?.schemaVersion !== 1) throw new Error('Fixture must use the current server interpretation contract.');

const config = {
  asns: [{ asn: 'AS58224', name: 'Fixture network' }],
  defaultRange: { since: input.since, until: input.until }, sources: [], intelligenceSources: [], radarConfigured: false,
};

function respondJson(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function runScenario(browser, scenario) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    requests.push(path);
    if (path === '/api/config') return respondJson(response, config);
    if (path === '/api/overview') {
      if (scenario === 'error') return respondJson(response, { error: 'Fixture upstream unavailable' }, 503);
      if (scenario === 'legacy') return respondJson(response, { ...overview, assessment: { status: 'corroborated', publicSummary: {} } });
      return respondJson(response, overview);
    }
    if (path === '/api/asn-coverage') return respondJson(response, { ok: true, status: 'no_data' });
    if (path === '/api/circumvention') return respondJson(response, { ok: false, status: 'no_data' });
    const asset = files.get(path === '/' ? '/index.html' : path);
    if (asset) {
      const mime = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/html';
      response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(asset);
    } else response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const port = server.address().port;
    const { stdout } = await execFileAsync(browser, [
      '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
      '--virtual-time-budget=7000', '--dump-dom', `http://127.0.0.1:${port}/`,
    ], { encoding: 'utf8', timeout: 40_000, maxBuffer: 8 * 1024 * 1024 });
    if (!requests.includes('/api/config') || !requests.includes('/api/overview')) {
      throw new Error(`${scenario}: real app did not request config AND overview (${requests.join(', ')})`);
    }
    const headline = stdout.match(/<h1 id="situation-headline">([^<]*)<\/h1>/)?.[1] || '';
    if (!headline || /Analyzing current measurements/i.test(headline)) throw new Error(`${scenario}: Overview remained loading: ${headline}`);
    const cards = (stdout.match(/class="interpretation-card"/g) || []).length;
    if (scenario === 'ready') {
      const tiles = (stdout.match(/class="service-tile"/g) || []).length;
      if (headline !== 'Instagram is blocked' || tiles !== 6 || !stdout.includes('class="status-row"') ||
          !/<article class="service-tile" data-status="restricted">[\s\S]*?WhatsApp/.test(stdout)) {
        throw new Error(`ready: situation board incomplete (headline=${headline}, tiles=${tiles})`);
      }
      if (cards !== 4 || !stdout.includes('Dimension-specific evidence assessment') ||
          !stdout.includes('data sources available') || !stdout.includes('id="technical-view" class="technical-view" hidden')) {
        throw new Error(`ready: app rendering incomplete (cards=${cards}, headline=${headline})`);
      }
    } else if (scenario === 'legacy') {
      if (!/cannot evaluate this response/i.test(headline) || cards !== 0) throw new Error(`legacy: old backend was not explained (headline=${headline}, cards=${cards})`);
    } else if (!/Measurements could not be loaded/i.test(headline) || cards !== 0) {
      throw new Error(`error: failed request was not explained (headline=${headline}, cards=${cards})`);
    }
    console.log(`REAL APP OVERVIEW ${scenario.toUpperCase()} PASS · ${headline}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const browser = browserExecutable();
for (const scenario of ['ready', 'legacy', 'error']) await runScenario(browser, scenario);
console.log(`REAL APP OVERVIEW PASS · ${browser} · index.html + app.js + /api/overview`);
