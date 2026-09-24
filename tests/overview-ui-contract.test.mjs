import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SERVICE_BRANDS, brandForHost } from '../public/service-findings.js';

const situation = await readFile(new URL('../public/v18-situation.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/v18.css', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/app-core.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../public/v19-runtime.js', import.meta.url), 'utf8');
const legacyContext = await readFile(new URL('../public/v11-context.js', import.meta.url), 'utf8');
const browserGate = await readFile(new URL('../scripts/verify-overview-runtime-browser.mjs', import.meta.url), 'utf8');
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const markup = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('overview is the default view and the established dashboard remains technical analysis', () => {
  assert.match(situation, /data-dashboard-view="overview"/);
  assert.match(situation, /data-dashboard-view="technical"/);
  // Overview stays the default; only a shared link with view=technical opens the analysis.
  assert.match(situation, /get\('view'\) === 'technical' \? 'technical' : 'overview'/);
  assert.match(situation, /id="situation-headline"/);
  for (const selector of ['#assessment-strip', '.kpi-grid', '.status-legend', '.dashboard-grid']) {
    assert.ok(situation.includes(`'${selector}'`), `${selector} is not preserved in technical analysis`);
  }
});

test('overview does not reuse source-health colors as severity colors', () => {
  assert.doesNotMatch(css, /var\(--(?:red|yellow|green)\)/);
  assert.match(css, /var\(--blue\)/);
  // Findings use their own status palette, never the source-health colours; there is no
  // single overall tone for the whole page.
  assert.doesNotMatch(situation, /heroTone/);
  assert.match(css, /\.interpretation-card\[data-finding="bad"\][^}]*var\(--status-blocked\)/);
});

test('real overview loader delivers success and errors directly; incompatible responses cannot remain loading', () => {
  assert.match(loader, /publishOverview\('loading'\)/);
  assert.match(loader, /publishOverview\('ready', overview\.assessment[,)]/);
  assert.match(loader, /publishOverview\('error'\)/);
  assert.match(situation, /interpretation\.overview\.\$\{kind\}\.headline/);
  assert.match(situation, /document\.querySelector\(selector\)\.hidden = !valid/);
  assert.doesNotMatch(runtime, /window\.fetch\s*=/);
  assert.doesNotMatch(loader, /source families observed/);
  assert.match(legacyContext, /if \(!overview\.assessment\?\.sourceHealth\?\.summary\) renderSourceFamilyCount\(overview\)/);
});

test('browser gate loads the actual app and covers current, legacy and failed overview responses', () => {
  assert.match(browserGate, /files\.get\(path === '\/' \? '\/index\.html' : path\)/);
  assert.match(browserGate, /buildAssessment\(/);
  for (const scenario of ['ready', 'legacy', 'error']) assert.ok(browserGate.includes(`'${scenario}'`));
  assert.match(browserGate, /requests\.includes\('\/api\/overview'\)/);
  assert.match(packageInfo.scripts['verify:ui'], /verify-overview-runtime-browser\.mjs/);
});

test('situation board states every service status in words and keeps it apart from source-health colors', () => {
  assert.match(situation, /board\.status\.\$\{item\.status\}/);
  assert.match(situation, /board\.headline\.\$\{headline\.state\}/);
  assert.match(css, /--status-blocked:/);
  assert.match(situation, /replaceWith\(serviceDetails\)/);
  assert.match(browserGate, /service-tile/);
});

test('the target filter offers each service once, so a selection cannot miss its other hosts', () => {
  const options = [...markup.matchAll(/<option value="(https:[^"]*)">([^<]+)<\/option>/g)]
    .map(([, value, label]) => ({ host: new URL(value).hostname, label }));
  for (const brand of SERVICE_BRANDS) {
    const matching = options.filter((option) => brand.domains.includes(option.host));
    assert.equal(matching.length, 1, `${brand.id} must appear exactly once in the target filter`);
    assert.doesNotMatch(matching[0].label, /\./, `${brand.id} must be offered as a service, not as a hostname`);
  }
  for (const option of options) {
    assert.ok(brandForHost(option.host) || !SERVICE_BRANDS.some((brand) => brand.domains.includes(option.host)));
  }
});
