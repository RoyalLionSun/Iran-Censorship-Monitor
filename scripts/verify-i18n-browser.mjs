import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const files = new Map();
for (const path of [
  'public/i18n.js',
  'public/i18n-runtime.js',
  'public/locales/en.js',
  'public/locales/fa.js',
  'public/locales/en-extra.js',
  'public/locales/fa-extra.js',
  'public/locales/en-runtime.js',
  'public/locales/fa-runtime.js',
  'public/locales/en-context.js',
  'public/locales/fa-context.js',
  'public/v18-situation.js',
  'public/v18-i18n-ui.js',
  'public/v18.css',
]) files.set(`/${path.replace(/^public\//, '')}`, await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

function findBrowser() {
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error('No supported Chrome/Chromium executable found for the i18n presentation gate.');
}

const assessment = {
  status: 'corroborated', severity: 'critical', confidence: 'high', scope: 'AS58224 / Iran', availableSources: ['OONI', 'RIPE Atlas'],
  publicSummary: {
    severity: 'critical', confidence: 'high', sourceCount: 2, scope: 'AS58224 / Iran',
    headlineKey: 'situation.headline.corroborated', meaningKey: 'situation.meaning.corroborated', caveatKey: 'situation.caveat.corroborated',
    completeShutdownVerdict: 'not-established', nationwideImpactVerdict: 'not-established',
    drivers: [{ source: 'OONI', state: 'elevated', value: 42.5, unit: '% anomalies' }],
    controlDataPlane: { messageKey: 'situation.controlDataPlane.divergence' },
  },
};

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<header class="topbar"><div class="brand"><div><strong>Iran Censorship Monitor</strong><small>Measurement & censorship signals</small></div></div><div class="topbar-actions"><button id="refresh-button">Refresh</button><button>Export CSV</button><button>Print</button></div></header>
<main>
<section id="assessment-strip"><span>MEASUREMENT ASSESSMENT</span><b>Load measurements to assess the selected scope.</b></section>
<section class="kpi-grid"><article><span>OONI anomaly rate</span></article><article><span>BGP visibility</span></article></section>
<article class="panel" id="ooni-panel"><header class="panel-header"><h2>Measurement anomalies over time</h2></header><p class="panel-note">Anomaly rate is an OONI measurement signal, not a direct percentage of blocked internet traffic. Volume bars show returned measurements per UTC day.</p></article>
<article class="panel" id="ripe-panel"><header class="panel-header"><h2>RTT and packet-loss observations</h2></header><p class="panel-note">Built-in Ping 1001 measures paths from matching RIPE probes to its public measurement target. It is not a complete national reachability metric.</p></article>
<article class="panel" id="ioda-panel"><header class="panel-header"><h2>Routing & active-probing signals</h2></header></article>
<article class="panel" id="routing-panel"><header class="panel-header"><h2>BGP control-plane visibility</h2></header></article>
<article class="panel" id="radar-panel"><header class="panel-header"><h2>Traffic and annotated events</h2></header></article>
<article class="panel" id="tor-panel"><header class="panel-header"><h2>Direct and bridge user estimates</h2></header></article>
<article class="panel" id="censoredplanet-panel"></article><article class="panel" id="globalping-panel"></article>
<div id="runtime-fixed">Requesting live sources</div>
<div id="runtime-assessment">No corroborated major disruption signal</div>
<div id="runtime-context">No operator snapshot is available. No inventory count is inferred.</div>
<div id="runtime-status">observed</div>
<div id="runtime-dynamic">7 rows · 3 days</div>
<div id="runtime-routing">Radar HTTP series · AS58224 · 1h · confidence L2</div>
<div data-i18n-external id="external-title">External incident title should stay English</div>
<div id="technical-value" class="technical-ltr">AS58224 · 2.144.0.0/13</div>
</main>
<script>
const overview = { assessment: ${JSON.stringify(assessment)} };
window.fetch = async () => new Response(JSON.stringify(overview), { status: 200, headers: { 'Content-Type': 'application/json' } });
</script>
<script type="module">
await import('/v18-situation.js');
await import('/v18-i18n-ui.js');
await window.fetch('/api/overview?fixture=1');
await new Promise((resolve) => setTimeout(resolve, 80));
const fa = document.querySelector('[data-lang="fa"]');
fa.click();
await new Promise((resolve) => setTimeout(resolve, 80));
document.body.dataset.faDir = document.documentElement.dir;
document.body.dataset.faLang = document.documentElement.lang;
document.body.dataset.faHeadline = /[\u0600-\u06FF]/.test(document.querySelector('#situation-headline')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faKpi = /[\u0600-\u06FF]/.test(document.querySelector('.kpi-grid')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.meaning = /این چه معنایی دارد/.test(document.querySelector('#ooni-panel')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faRuntimeFixed = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-fixed')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faRuntimeAssessment = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-assessment')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faRuntimeContext = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-context')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faRuntimeStatus = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-status')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faRuntimeDynamic = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-dynamic')?.textContent || '') && document.querySelector('#runtime-dynamic')?.textContent.includes('7') ? 'yes' : 'no';
document.body.dataset.faRuntimeRouting = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-routing')?.textContent || '') && document.querySelector('#runtime-routing')?.textContent.includes('AS58224') && document.querySelector('#runtime-routing')?.textContent.includes('L2') ? 'yes' : 'no';
document.body.dataset.techLtr = document.querySelector('#technical-value')?.getAttribute('dir') || '';
document.body.dataset.externalPreserved = document.querySelector('#external-title')?.textContent === 'External incident title should stay English' ? 'yes' : 'no';
const en = document.querySelector('[data-lang="en"]');
en.click();
await new Promise((resolve) => setTimeout(resolve, 80));
document.body.dataset.enDir = document.documentElement.dir;
document.body.dataset.enKpi = document.querySelector('.kpi-grid')?.textContent.includes('OONI anomaly rate') ? 'yes' : 'no';
document.body.dataset.enRuntimeRestored = document.querySelector('#runtime-dynamic')?.textContent === '7 rows · 3 days' && document.querySelector('#runtime-assessment')?.textContent === 'No corroborated major disruption signal' ? 'yes' : 'no';
fa.click();
await new Promise((resolve) => setTimeout(resolve, 80));
document.body.dataset.persisted = localStorage.getItem('iran-monitor-language') || '';
document.body.dataset.fixtureReady = '1';
</script></body></html>`;

const server = http.createServer((request, response) => {
  if (request.url === '/fixture') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fixture);
    return;
  }
  if (files.has(request.url)) {
    const css = request.url.endsWith('.css');
    response.writeHead(200, { 'Content-Type': css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(files.get(request.url));
    return;
  }
  response.writeHead(404).end();
});

await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('i18n fixture server did not expose a TCP port.');
  const browser = findBrowser();
  const { stdout } = await execFileAsync(browser, [
    '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--virtual-time-budget=3500', '--dump-dom',
    `http://127.0.0.1:${address.port}/fixture`,
  ], { encoding: 'utf8', timeout: 25_000, maxBuffer: 4 * 1024 * 1024 });
  const required = [
    'data-fixture-ready="1"', 'data-fa-dir="rtl"', 'data-fa-lang="fa"', 'data-fa-headline="yes"', 'data-fa-kpi="yes"',
    'data-meaning="yes"', 'data-fa-runtime-fixed="yes"', 'data-fa-runtime-assessment="yes"', 'data-fa-runtime-context="yes"',
    'data-fa-runtime-status="yes"', 'data-fa-runtime-dynamic="yes"', 'data-fa-runtime-routing="yes"',
    'data-tech-ltr="ltr"', 'data-external-preserved="yes"', 'data-en-dir="ltr"', 'data-en-kpi="yes"', 'data-en-runtime-restored="yes"',
    'data-persisted="fa"', 'id="language-switch"', 'وضعیت فعلی اینترنت — ایران', 'این چه معنایی دارد', 'AS58224 · 2.144.0.0/13'
  ];
  const missing = required.filter((needle) => !stdout.includes(needle));
  if (missing.length) throw new Error(`i18n browser gate missing: ${missing.join(', ')}`);
  console.log('i18n browser presentation gate passed for EN/LTR, FA/RTL, controlled runtime text, restoration, persistence and technical direction safety.');
} finally {
  server.close();
}
