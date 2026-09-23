import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const files = new Map();
for (const path of [
  'public/styles.css',
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
  'public/locales/en-v19.js',
  'public/locales/fa-v19.js',
  'public/v18-situation.js',
  'public/v18-i18n-ui.js',
  'public/v18.css',
  'public/v19-runtime.js',
  'public/v19.css',
]) files.set(`/${path.replace(/^public\//, '')}`, await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

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

const sourceHealth = {
  contractVersion: 1,
  summary: { totalContract: 13, queried: 8, reachable: 8, dataAvailable: 5, observed: 4, partial: 1, noData: 3, scopeRequired: 5, errors: 0 },
  families: [
    { id:'ooni', name:'OONI', state:'observed', queried:true, reachable:true, hasData:true },
    { id:'ripe', name:'RIPE Atlas', state:'no_data', queried:true, reachable:true, hasData:false },
    { id:'ioda', name:'IODA', state:'observed', queried:true, reachable:true, hasData:true },
    { id:'tor', name:'Tor Metrics', state:'observed', queried:true, reachable:true, hasData:true },
    { id:'mlab', name:'M-Lab NDT', state:'no_data', queried:true, reachable:true, hasData:false },
    { id:'apnic', name:'APNIC Labs IPv6', state:'observed', queried:true, reachable:true, hasData:true },
    { id:'ripestat', name:'RIPEstat / RIPE RIS', state:'scope_required', queried:false, reachable:false, hasData:false },
    { id:'globalping', name:'Globalping passive inventory', state:'no_data', queried:true, reachable:true, hasData:false },
    { id:'censoredPlanet', name:'Censored Planet', state:'partial', queried:true, reachable:true, hasData:true },
    { id:'peeringdb', name:'PeeringDB', state:'scope_required', queried:false, reachable:false, hasData:false },
    { id:'ihr', name:'Internet Health Report', state:'scope_required', queried:false, reachable:false, hasData:false },
    { id:'asrank', name:'CAIDA ASRank', state:'scope_required', queried:false, reachable:false, hasData:false },
    { id:'rpki', name:'RIPEstat RPKI', state:'scope_required', queried:false, reachable:false, hasData:false },
  ],
};

const evidence = {
  connectivity: [{ source:'IODA', state:'observed', metric:'events', value:2 }, { source:'Cloudflare Radar', state:'observed', metric:'events', value:1 }],
  interference: [{ source:'OONI', state:'observed', metric:'measurements', value:120 }, { source:'OONI', state:'observed', metric:'anomaly-rate', value:42.5 }, { source:'OONI', state:'observed', metric:'confirmed', value:0 }, { source:'Censored Planet', state:'partial', metric:'events', value:null }],
  routing: [{ source:'RIPEstat / RIPE RIS', state:'observed', metric:'visibility-percent', value:99.7 }, { source:'RIPEstat / RIPE RIS', state:'observed', metric:'peers-seeing', value:325 }],
  quality: [{ source:'RIPE Atlas', state:'no-data', metric:'probes', value:7 }, { source:'RIPE Atlas', state:'no-data', metric:'samples', value:0 }],
};
const assessment = {
  status: 'dimension-specific', severity: 'neutral', confidence: 'per-finding', scope: 'Iran / all measured networks',
  availableSources: ['OONI', 'IODA', 'Cloudflare Radar', 'RIPEstat / RIPE RIS'], sourceHealth,
  methodologicalBoundary: 'Severity, confidence, verification, coverage and attribution are evaluated per claim. Signals from different dimensions are not merged into proof of one common disruption or censorship cause.',
  interpretation: {
    schemaVersion: 1,
    scope: 'Iran / all measured networks',
    summary: { state:'access-and-connectivity-signals', evidenceMode:'per-finding', shutdownState:'not-established', routingState:'routes-visible' },
    dimensions: {
      connectivity: { id:'connectivity', state:'disruption-signals', severity:'unknown', confidence:'low', verification:'signal', coverage:'adequate', availableSources:['IODA','Cloudflare Radar'], supportingSources:['IODA','Cloudflare Radar'], evidence:evidence.connectivity, limitationKey:'interpretation.connectivity.limit' },
      interference: { id:'interference', state:'interference-signals', severity:'unknown', confidence:'low', verification:'signal', coverage:'limited', availableSources:['OONI'], supportingSources:['OONI'], evidence:evidence.interference, limitationKey:'interpretation.interference.limit' },
      routing: { id:'routing', state:'routes-visible', severity:'unknown', confidence:'medium', verification:'signal', coverage:'limited', availableSources:['RIPEstat / RIPE RIS'], supportingSources:['RIPEstat / RIPE RIS'], evidence:evidence.routing, limitationKey:'interpretation.routing.limit' },
      quality: { id:'quality', state:'insufficient-data', severity:'unknown', confidence:'none', verification:'not-established', coverage:'none', availableSources:[], supportingSources:[], evidence:evidence.quality, limitationKey:'interpretation.quality.limit' },
      shutdown: { id:'shutdown', state:'not-established', severity:'unknown', confidence:'none', verification:'not-established', coverage:'none', availableSources:['IODA','Cloudflare Radar'], supportingSources:[], evidence:[], limitationKey:'interpretation.shutdown.limit' },
    },
    attribution: { state:'unknown', evidence:[] },
    findings: [
      { id:'interference-signals', dimension:'interference', state:'signal', evidence:evidence.interference },
      { id:'connectivity-events', dimension:'connectivity', state:'signal', evidence:evidence.connectivity },
      { id:'routing-visible', dimension:'routing', state:'observed', evidence:evidence.routing },
      { id:'quality-unknown', dimension:'quality', state:'unknown', evidence:evidence.quality },
      { id:'shutdown-not-established', dimension:'shutdown', state:'not-established', evidence:[] },
    ],
    unknowns: ['complete-nationwide-shutdown','target-blocking','affected-services','connection-quality','cause-and-intent'],
  },
};

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body>
<header class="topbar"><div class="brand"><div><strong>Iran Censorship Monitor</strong><small>Measurement & censorship signals</small></div></div><div class="topbar-meta"><span id="header-source-state" class="source-state">Sources pending</span></div><div class="topbar-actions"><button id="refresh-button">Refresh</button><button>Export CSV</button><button>Print</button></div></header>
<main>
<section class="filterbar"></section>
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
<div id="runtime-bridge">19,300 bridge users &#183; direct estimate shown above</div>
<div class="status-legend" aria-label="Source status colors"><strong id="status-legend-title">Source status colors</strong><span><i class="state-dot ok"></i><span id="status-legend-ok">Green: available and usable</span></span><span><i class="state-dot warn"></i><span id="status-legend-warn">Yellow: limited or partial data</span></span><span><i class="state-dot error"></i><span id="status-legend-error">Red: error or unavailable</span></span><span><i class="state-dot neutral"></i><span id="status-legend-neutral">Gray: no usable data or not assessed</span></span></div>
<div id="runtime-assessment">No corroborated major disruption signal</div>
<div id="runtime-context">No operator snapshot is available. No inventory count is inferred.</div>
<div id="runtime-status">observed</div>
<div id="runtime-dynamic">7 rows · 3 days</div>
<div id="runtime-routing">Radar HTTP series · AS58224 · 1h · confidence L2</div>
<div data-i18n-external id="external-title">External incident title should stay English</div>
<div id="technical-value" class="technical-ltr">AS58224 · 2.144.0.0/13</div>
</main>
<script>window.fetch = async () => new Response(JSON.stringify({ assessment: ${JSON.stringify(assessment)} }), { status: 200, headers: { 'Content-Type': 'application/json' } });</script>
<script type="module">
await import('/v18-situation.js');
await import('/v19-runtime.js');
await import('/v18-i18n-ui.js');
const fixtureResponse = await window.fetch('/api/overview?fixture=1');
const fixturePayload = await fixtureResponse.json();
window.dispatchEvent(new CustomEvent('iran-monitor-overview', { detail: { state: 'ready', assessment: fixturePayload.assessment } }));
await new Promise((resolve) => setTimeout(resolve, 100));
document.body.dataset.overviewReady = document.querySelector('.interpretation-grid')?.children.length === 4 &&
  document.querySelector('#overview-view')?.getAttribute('aria-busy') === 'false' ? 'yes' : 'no';
window.dispatchEvent(new CustomEvent('iran-monitor-overview', { detail: { state: 'error', assessment: null } }));
document.body.dataset.overviewError = /Measurements could not be loaded/.test(document.querySelector('#situation-headline')?.textContent || '') &&
  document.querySelector('#interpretation-dimensions')?.hidden && document.querySelector('.overview-lower-grid')?.hidden ? 'yes' : 'no';
window.dispatchEvent(new CustomEvent('iran-monitor-overview', { detail: { state: 'ready', assessment: { publicSummary: {} } } }));
document.body.dataset.overviewIncompatible = /cannot evaluate this response/.test(document.querySelector('#situation-headline')?.textContent || '') &&
  document.querySelector('#evidence-overview')?.hidden ? 'yes' : 'no';
window.dispatchEvent(new CustomEvent('iran-monitor-overview', { detail: { state: 'ready', assessment: fixturePayload.assessment } }));
document.body.dataset.overviewRecovered = document.querySelector('.interpretation-grid')?.children.length === 4 &&
  !document.querySelector('#interpretation-dimensions')?.hidden ? 'yes' : 'no';
const overviewView = document.querySelector('#overview-view');
const technicalView = document.querySelector('#technical-view');
const technicalButton = document.querySelector('[data-dashboard-view="technical"]');
const overviewButton = document.querySelector('[data-dashboard-view="overview"]');
const initialViewValid = !overviewView.hidden && technicalView.hidden;
technicalButton.click();
const technicalViewValid = overviewView.hidden && !technicalView.hidden && technicalView.contains(document.querySelector('#assessment-strip')) && technicalView.contains(document.querySelector('.kpi-grid'));
overviewButton.click();
document.body.dataset.viewSwitch = initialViewValid && !overviewView.hidden && technicalView.hidden && technicalViewValid ? 'yes' : 'no';
const fa = document.querySelector('[data-lang="fa"]');
fa.click();
await new Promise((resolve) => setTimeout(resolve, 100));
const faButtonStyle = getComputedStyle(fa);
const faBodyStyle = getComputedStyle(document.body);
const faNoteStyle = getComputedStyle(document.querySelector('.panel-note'));
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
document.body.dataset.faRuntimeBridge = /[\u0600-\u06FF]/.test(document.querySelector('#runtime-bridge')?.textContent || '') && document.querySelector('#runtime-bridge')?.textContent.includes('19,300') ? 'yes' : 'no';
document.body.dataset.faLegend = /[\u0600-\u06FF]/.test(document.querySelector('.status-legend')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faChannels = /[\u0600-\u06FF]/.test(document.querySelector('.interpretation-grid')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faSourceHealth = /منبع داده در دسترس/.test(document.querySelector('#header-source-state')?.textContent || '') && /۸ از ۸|8 از 8/.test(document.querySelector('#header-source-state')?.textContent || '') ? 'yes' : 'no';
document.body.dataset.faBodyReadable = parseFloat(faBodyStyle.fontSize) >= 16 && /Tahoma|Segoe UI|Noto Sans Arabic|Noto Naskh Arabic/.test(faBodyStyle.fontFamily) ? 'yes' : 'no';
document.body.dataset.faButtonReadable = parseFloat(faButtonStyle.fontSize) >= 12 && !/Consolas|Liberation Mono|monospace/i.test(faButtonStyle.fontFamily) ? 'yes' : 'no';
document.body.dataset.faNoteReadable = parseFloat(faNoteStyle.fontSize) >= 13 ? 'yes' : 'no';
document.body.dataset.techLtr = document.querySelector('#technical-value')?.getAttribute('dir') || '';
document.body.dataset.externalPreserved = document.querySelector('#external-title')?.textContent === 'External incident title should stay English' ? 'yes' : 'no';
const en = document.querySelector('[data-lang="en"]');
en.click();
await new Promise((resolve) => setTimeout(resolve, 100));
document.body.dataset.enDir = document.documentElement.dir;
document.body.dataset.enKpi = document.querySelector('.kpi-grid')?.textContent.includes('OONI anomaly rate') ? 'yes' : 'no';
document.body.dataset.enRuntimeRestored = document.querySelector('#runtime-dynamic')?.textContent === '7 rows · 3 days' && document.querySelector('#runtime-assessment')?.textContent === 'No corroborated major disruption signal' ? 'yes' : 'no';
document.body.dataset.enRuntimeBridgeRestored = document.querySelector('#runtime-bridge')?.textContent === '19,300 bridge users \u00b7 direct estimate shown above' ? 'yes' : 'no';
document.body.dataset.enLegend = document.querySelector('#status-legend-ok')?.textContent === 'Green: available and usable' ? 'yes' : 'no';
document.body.dataset.enSourceHealth = document.querySelector('#header-source-state')?.textContent.includes('8 of 8 data sources available') ? 'yes' : 'no';
document.body.dataset.enBodyReadable = parseFloat(getComputedStyle(document.body).fontSize) >= 15 ? 'yes' : 'no';
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
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--virtual-time-budget=4500', '--dump-dom',
    `http://127.0.0.1:${address.port}/fixture`,
  ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const required = [
    'data-fixture-ready="1"', 'data-fa-dir="rtl"', 'data-fa-lang="fa"', 'data-fa-headline="yes"', 'data-fa-kpi="yes"',
    'data-meaning="yes"', 'data-fa-runtime-fixed="yes"', 'data-fa-runtime-assessment="yes"', 'data-fa-runtime-context="yes"',
    'data-fa-runtime-status="yes"', 'data-fa-runtime-dynamic="yes"', 'data-fa-runtime-routing="yes"', 'data-fa-runtime-bridge="yes"', 'data-fa-legend="yes"', 'data-fa-channels="yes"',
    'data-fa-source-health="yes"', 'data-fa-body-readable="yes"', 'data-fa-button-readable="yes"', 'data-fa-note-readable="yes"',
    'data-tech-ltr="ltr"', 'data-external-preserved="yes"', 'data-en-dir="ltr"', 'data-en-kpi="yes"', 'data-en-runtime-restored="yes"', 'data-en-runtime-bridge-restored="yes"', 'data-en-legend="yes"',
    'data-en-source-health="yes"', 'data-en-body-readable="yes"', 'data-persisted="fa"', 'data-view-switch="yes"', 'id="language-switch"',
    'data-overview-ready="yes"', 'data-overview-error="yes"', 'data-overview-incompatible="yes"', 'data-overview-recovered="yes"',
    'این برای شما چه معنایی دارد', 'این چه معنایی دارد', 'AS58224 · 2.144.0.0/13'
  ];
  const missing = required.filter((needle) => !stdout.includes(needle));
  if (missing.length) throw new Error(`i18n browser gate missing: ${missing.join(', ')}`);
  console.log('i18n browser presentation gate passed for readable EN/FA typography, RTL/LTR, source health, channel status, controlled runtime text, restoration, persistence and technical direction safety.');
} finally {
  server.close();
}
