import { getLanguage, localeFor, separator, t as translate } from './i18n.js';
import { CONTEXT_CHECKED, CONTEXT_SOURCES, contextItems } from './context-items.js';
import { MORE_SERVICE_GROUPS } from './service-findings.js';

// With "all networks in Iran" selected, sentences that speak of "this network" have their own
// wording (key + ".iran"); every other text is unchanged.
let allIran = false;
function t(key, variables) {
  if (allIran) {
    const scoped = `${key}.iran`;
    const text = translate(scoped, variables);
    if (text !== scoped) return text;
  }
  return translate(key, variables);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function ensureStyles() {
  if (document.querySelector('link[data-v18-situation-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/v18.css';
  link.dataset.v18SituationStyle = '1';
  document.head.appendChild(link);
}

function updateFilterSummary() {
  const toggle = document.querySelector('#filter-toggle');
  if (!toggle) return;
  const network = document.querySelector('#asn-select')?.selectedOptions?.[0]?.textContent?.trim() ?? '';
  const since = document.querySelector('#since-input')?.value;
  const until = document.querySelector('#until-input')?.value;
  const period = since && until ? `${formatDay(since)} – ${formatDay(until)}` : '';
  toggle.querySelector('.filter-toggle-now').textContent = [network, period].filter(Boolean).join(separator());
  toggle.querySelector('b').textContent = t(document.body.classList.contains('filters-open') ? 'ui.filters.close' : 'ui.filters.change');
}

function insertViews() {
  ensureStyles();
  const assessment = document.querySelector('#assessment-strip');
  const filterbar = document.querySelector('.filterbar');
  if (!assessment || !filterbar || document.querySelector('#dashboard-view-switch')) return;

  // On phones the filters fold into one line with the current choice, so the finding is on the
  // first screen; a tap opens them.
  filterbar.insertAdjacentHTML('beforebegin', '<button type="button" id="filter-toggle" class="filter-toggle" aria-expanded="false" aria-controls="filters"><span class="filter-toggle-now"></span><b></b></button>');
  filterbar.id = filterbar.id || 'filters';
  const toggle = document.querySelector('#filter-toggle');
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('filters-open');
    toggle.setAttribute('aria-expanded', String(open));
    updateFilterSummary();
  });
  filterbar.addEventListener('change', () => updateFilterSummary());
  updateFilterSummary();

  // The view switch opens the page, in the toolbar above the filters, next to the actions.
  const viewSwitch = `
    <nav id="dashboard-view-switch" class="view-switch" aria-label="${escapeHtml(t('interpretation.view.label'))}">
      <button type="button" data-dashboard-view="overview" class="active" aria-pressed="true"></button>
      <button type="button" data-dashboard-view="technical" aria-pressed="false"></button>
    </nav>`;
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.insertAdjacentHTML('afterbegin', viewSwitch);
  filterbar.insertAdjacentHTML('afterend', `${toolbar ? '' : viewSwitch}
    <section id="overview-view" class="overview-view" aria-live="polite">
      <section id="current-situation" class="situation-board"></section>
      <div class="overview-lower-grid">
        <section class="overview-panel" id="user-meaning"></section>
        <section class="overview-panel" id="current-unknowns"></section>
      </div>
      <div id="situation-sections" class="situation-sections"></div>
    </section>
    <section id="technical-view" class="technical-view" hidden>
      <div id="overview-services-slot"></div>
      <header id="overview-details-head" class="overview-section-head"></header>
      <section id="interpretation-dimensions" class="interpretation-grid" aria-label="${escapeHtml(t('interpretation.dimensions.label'))}"></section>
      <div class="overview-lower-grid">
        <section class="overview-panel" id="current-findings"></section>
        <section class="overview-panel evidence-overview" id="evidence-overview"></section>
      </div>
    </section>`);

  const serviceDetails = document.querySelector('#service-findings');
  const slot = document.querySelector('#overview-services-slot');
  if (serviceDetails && slot) slot.replaceWith(serviceDetails);

  // Where the data comes from belongs on the first page, at its end.
  const sources = document.querySelector('#sources-panel');
  if (sources) document.querySelector('#overview-view').appendChild(sources);

  const technical = document.querySelector('#technical-view');
  for (const selector of ['#assessment-strip', '.kpi-grid', '.status-legend', '.dashboard-grid']) {
    const element = document.querySelector(selector);
    if (element) technical.appendChild(element);
  }

  document.querySelectorAll('[data-dashboard-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.dashboardView));
  });
  // The connection card links to its details in the technical view; the card is re-rendered, so
  // the click is caught on the view.
  document.querySelector('#overview-view')?.addEventListener('click', (event) => {
    if (!event.target.closest('[data-open-technical]')) return;
    event.preventDefault();
    setView('technical');
    document.querySelector('#overview-details-head')?.scrollIntoView({ block: 'start' });
  });
  // A shared link can open the technical view directly.
  setView(new URLSearchParams(window.location.search).get('view') === 'technical' ? 'technical' : 'overview');
}

function setView(view) {
  const technical = view === 'technical';
  const overviewElement = document.querySelector('#overview-view');
  const technicalElement = document.querySelector('#technical-view');
  if (!overviewElement || !technicalElement) return;
  overviewElement.hidden = technical;
  technicalElement.hidden = !technical;
  document.querySelectorAll('[data-dashboard-view]').forEach((button) => {
    const selected = button.dataset.dashboardView === view;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  // The view is part of a shared link, like the selection.
  const params = new URLSearchParams(window.location.search);
  if (technical) params.set('view', 'technical'); else params.delete('view');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  // The technical tables load only once the technical view is opened.
  window.dispatchEvent(new CustomEvent('iran-monitor-viewchange', { detail: { view } }));
}

function translateStaticView() {
  const overviewButton = document.querySelector('[data-dashboard-view="overview"]');
  const technicalButton = document.querySelector('[data-dashboard-view="technical"]');
  const viewSwitch = document.querySelector('#dashboard-view-switch');
  const dimensions = document.querySelector('#interpretation-dimensions');
  if (overviewButton) overviewButton.textContent = t('interpretation.view.overview');
  if (technicalButton) technicalButton.textContent = t('interpretation.view.technical');
  if (viewSwitch) viewSwitch.setAttribute('aria-label', t('interpretation.view.label'));
  if (dimensions) dimensions.setAttribute('aria-label', t('interpretation.dimensions.label'));
}

function stateKey(dimension) {
  // A lookup still running in the background is not "not evaluated".
  if (dimension.pending) return `interpretation.${dimension.id}.state.pending`;
  return `interpretation.${dimension.id}.state.${dimension.state}`;
}

function valueText(evidence) {
  if (evidence.value === null || evidence.value === undefined) return '—';
  const value = Number(evidence.value);
  if (!Number.isFinite(value)) return String(evidence.value);
  if (['anomaly-rate', 'visibility-percent', 'packet-loss-percent'].includes(evidence.metric)) {
    return `${new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value)}%`;
  }
  if (['rtt-ms', 'latency-ms', 'dns-ms'].includes(evidence.metric)) return `${new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value)} ms`;
  if (evidence.metric === 'download-mbps') return `${new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value)} Mbit/s`;
  return new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value);
}

function relevantEvidence(dimension) {
  const allowed = {
    connectivity: new Set(['events']),
    interference: new Set(['measurements', 'anomaly-rate', 'confirmed', 'events']),
    routing: new Set(['visibility-percent', 'peers-seeing', 'total-peers']),
    quality: new Set(['probes', 'samples', 'packet-loss-percent', 'rtt-ms', 'latency-ms', 'download-mbps', 'dns-ms']),
  }[dimension.id] ?? new Set();
  return (dimension.evidence ?? []).filter((item) => allowed.has(item.metric) && item.value !== null && item.value !== undefined);
}

function renderEvidenceItems(dimension) {
  const rows = relevantEvidence(dimension);
  if (!rows.length) return `<li class="empty-evidence">${escapeHtml(t('interpretation.noUsableEvidence'))}</li>`;
  return rows.map((item) => `
    <li>
      <span>${escapeHtml(item.source)} · ${escapeHtml(t(`interpretation.metric.${item.metric}`))}</span>
      <b class="technical-ltr">${escapeHtml(valueText(item))}</b>
    </li>`).join('');
}

// A routing answer from another point in time must not be described as the selected one.
function meaningKey(dimension) {
  if (dimension.pending) return `interpretation.${dimension.id}.meaning.pending`;
  const unaligned = dimension.id === 'routing' && dimension.timeAlignment === 'unknown' && dimension.state !== 'insufficient-data';
  return `interpretation.${dimension.id}.meaning.${dimension.state}${unaligned ? '-unaligned' : ''}`;
}

// The card edge says what was found: a confirmed block or a nationwide outage, signals,
// nothing found, too little data, or plain information.
function dimensionFinding(dimension) {
  if (dimension.pending) return 'unknown';
  const { id, state, severity } = dimension;
  if (id === 'interference') return { 'blocking-confirmed-in-measurements': 'bad', 'interference-signals': 'warn', 'no-interference-signals-detected': 'ok' }[state] ?? 'unknown';
  if (id === 'connectivity') {
    if (['widespread', 'severe'].includes(severity)) return 'bad';
    return { 'disruption-signals': 'warn', 'no-disruption-events-detected': 'ok' }[state] ?? 'unknown';
  }
  if (id === 'routing') return { 'routes-not-visible': 'bad', 'routes-visible': 'info' }[state] ?? 'unknown';
  if (id === 'quality') return state === 'path-observations-available' ? 'info' : 'unknown';
  return 'unknown';
}

function renderDimension(dimension) {
  const metadata = [
    ['severity', dimension.severity],
    ['confidence', dimension.confidence],
    ['verification', dimension.verification],
    ['coverage', dimension.coverage],
  ];
  return `
    <article class="interpretation-card" data-finding="${escapeHtml(dimensionFinding(dimension))}">
      <header>
        <span class="dimension-icon" aria-hidden="true">${escapeHtml(t(`interpretation.${dimension.id}.icon`))}</span>
        <div><span>${escapeHtml(t(`interpretation.${dimension.id}.title`))}</span><h2>${escapeHtml(t(stateKey(dimension)))}</h2></div>
      </header>
      <p>${escapeHtml(t(meaningKey(dimension)))}</p>
      <dl>${metadata.map(([label, value]) => `<div data-axis="${escapeHtml(label)}" data-value="${escapeHtml(value)}"><dt>${escapeHtml(t(`interpretation.axis.${label}`))}</dt><dd>${escapeHtml(t(`interpretation.${label}.${value}`))}</dd></div>`).join('')}</dl>
      <ul class="dimension-evidence">${renderEvidenceItems(dimension)}</ul>
      <small>${escapeHtml(t(dimension.limitationKey))}</small>
    </article>`;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(localeFor(), { maximumFractionDigits: digits }).format(value);
}

function formatDateTime(value) {
  const parsed = Date.parse(String(value ?? ''));
  if (!Number.isFinite(parsed)) return String(value ?? '—');
  return new Intl.DateTimeFormat(localeFor(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(parsed);
}

function formatDay(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  return new Intl.DateTimeFormat(localeFor(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function listOf(names) {
  try {
    return new Intl.ListFormat(localeFor(), { style: 'long', type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
}

function brandName(id, services = null) {
  const key = `board.brand.${id}`;
  const label = t(key);
  if (label !== key) return label;
  // Selected targets and future services have no controlled name; show the measured host.
  return services?.items?.find((item) => item.id === id)?.name ?? id;
}

function plural(key, count, variables = {}) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count: formatNumber(count), ...variables });
}

function networkLabel(interpretation) {
  const select = document.querySelector('#asn-select');
  const option = select?.selectedOptions?.[0];
  if (!interpretation.selection?.asn) return t('board.network.all');
  return option?.value === interpretation.selection.asn ? option.textContent.trim() : interpretation.selection.asn;
}

function evidenceValue(dimension, metric) {
  return dimension?.evidence?.find((item) => item.metric === metric)?.value ?? null;
}

const NAMED_HEADLINES = ['services-blocked', 'services-restricted', 'services-reachable', 'services-untested', 'services-blocked-independent'];

// The tiles right below name every service, so when all of them are blocked the heading says so
// in a few words (compact); the full sentence with the names stays for sharing.
// Nobody tested in this network, but across Iran the answer is clear: the heading says that
// instead of "not enough measurements" (the tiles below show the same, labelled).
function countryOnly(summary, services) {
  const outage = summary.headline && ['major-outage', 'outage-ended'].includes(summary.headline.state);
  return Boolean(services?.countryBlocked?.length && !services.blocked?.length && !services.restricted?.length && !outage);
}

function headlineText(summary, services, { compact = false } = {}) {
  const headline = summary.headline;
  if (countryOnly(summary, services)) {
    const ids = services.countryBlocked;
    const all = services.items?.length ?? 0;
    if (compact && all > 2 && ids.length === all) return t('board.headline.country-all-blocked', { count: formatNumber(all) });
    return plural('board.headline.country-blocked', ids.length, { services: listOf(ids.map((id) => brandName(id, services))) });
  }
  if (!headline) return t(`interpretation.summary.${summary.state}.headline`);
  const names = headline.services.map((id) => brandName(id, services));
  const all = services?.items?.length ?? 0;
  if (compact && headline.state === 'services-blocked' && all > 2 && names.length === all) return t('board.headline.all-blocked', { count: formatNumber(all) });
  if (NAMED_HEADLINES.includes(headline.state) && names.length) {
    return plural(`board.headline.${headline.state}`, names.length, { services: listOf(names) });
  }
  if (headline.state === 'major-outage') {
    // A dated nationwide outage is plainer than "a major outage has been reported".
    const period = headline.period;
    if (period?.scope === 'nationwide' && !period.endedInWindow) return t('board.headline.nationwide-since', { date: formatDay(period.start) });
  }
  if (headline.state === 'outage-ended') {
    const date = formatDay(headline.endedOn);
    return names.length
      ? plural('board.headline.outage-ended.blocked', names.length, { date, services: listOf(names) })
      : t('board.headline.outage-ended', { date });
  }
  return t(`board.headline.${headline.state}`);
}

function connectionState(connectivity) {
  if (['widespread', 'severe', 'moderate'].includes(connectivity.severity)) return connectivity.severity;
  if (connectivity.state === 'disruption-signals') return 'signals';
  if (connectivity.state === 'no-disruption-events-detected') return 'none';
  return 'unknown';
}

function ledeText(interpretation) {
  const { summary, services, dimensions } = interpretation;
  if (countryOnly(summary, services)) return t('board.lede.country');
  if (!summary.headline) return t(`interpretation.summary.${summary.state}.meaning`);
  const sentences = [];
  if (summary.headline.state === 'services-blocked') sentences.push(t('board.lede.blocked'));
  if (summary.headline.state === 'services-restricted') sentences.push(t('board.lede.restricted'));
  if (['services-blocked', 'major-outage'].includes(summary.headline.state) && services?.restricted?.length) {
    const names = services.restricted.map((id) => brandName(id, services));
    sentences.push(plural('board.lede.also-restricted', names.length, { services: listOf(names) }));
  }
  if (summary.headline.state === 'services-reachable' && !services?.scoped && dimensions.interference?.state === 'interference-signals') {
    const rate = dimensions.interference.evidence?.find((item) => item.source === 'OONI' && item.metric === 'anomaly-rate')?.value;
    const total = dimensions.interference.evidence?.find((item) => item.source === 'OONI' && item.metric === 'measurements')?.value;
    if (rate != null && total) sentences.push(t('board.lede.otherSites', { rate: formatNumber(rate, 1), total: formatNumber(total) }));
  }
  // The connection state has its own tile and the plain-language panel; no third copy here.
  return sentences.join(' ');
}

function channelLine(channel, kind) {
  if (!channel) return '';
  const status = channel.status;
  const variables = {
    total: formatNumber(channel.measurements ?? 0),
    confirmed: formatNumber(channel.confirmed ?? 0),
    count: formatNumber(kind === 'app' ? channel.anomalies ?? 0 : channel.anomalous ?? 0),
  };
  // A brand whose app has its own name (Facebook's Messenger) says which app was tested.
  const key = kind === 'app' && channel.name ? `board.appNamed.${status}` : `board.${kind}.${status}`;
  return `<li data-channel-status="${escapeHtml(status)}">${escapeHtml(t(key, { ...variables, app: channel.name ?? '' }))}</li>`;
}

function windowDays(selection) {
  const since = Date.parse(`${selection?.since ?? ''}T00:00:00Z`);
  const until = Date.parse(`${selection?.until ?? ''}T00:00:00Z`);
  if (!Number.isFinite(since) || !Number.isFinite(until) || until < since) return null;
  return Math.floor((until - since) / 86_400_000) + 1;
}

// How a service is blocked is the most actionable part of a finding.
function mechanismLine(item) {
  const dominant = item?.web?.sample?.dominantMechanism;
  if (!dominant?.code || !dominant.count) return '';
  return `<li class="tile-mechanism">${escapeHtml(t(`board.mechanism.${dominant.code}`))}</li>`;
}

// Coverage is part of the claim: 400 tests on one day are not 400 tests across a week.
function coverageLine(item, selection) {
  const days = item?.web?.observedDays ?? 0;
  const window = windowDays(selection);
  if (!days || !window) return '';
  return `<li class="tile-coverage">${escapeHtml(t('board.coverage.days', { days: formatNumber(days), window: formatNumber(window) }))}</li>`;
}

// Latin technical names (servers, networks, sources) inside Farsi text keep their own
// left-to-right order: a Unicode isolate stops brackets and numbers from jumping around.
function ltr(value) {
  return `\u2066${value}\u2069`;
}

// The servers the mobile app talks to, for services without an OONI app test.
function appServersLine(servers) {
  if (!servers || servers.status === 'inconclusive') return '';
  // The main server by name, the rest counted; the full list is in the tooltip.
  const more = servers.hosts.length - 1;
  const text = t(`board.appServers.${servers.status}`, {
    hosts: more > 0 ? t('board.appServers.more', { host: ltr(servers.hosts[0]), count: formatNumber(more) }) : ltr(servers.hosts[0]),
    total: formatNumber(servers.measurements), failed: formatNumber(servers.confirmed + servers.anomalous),
    confirmed: formatNumber(servers.confirmed), ok: formatNumber(servers.ok),
  });
  return `<li class="tile-app-servers" data-channel-status="${escapeHtml(servers.status)}" title="${escapeHtml(servers.hosts.join('\n'))}">${escapeHtml(servers.country ? t('board.appServers.country', { text }) : text)}</li>`;
}

// How long a service has been blocked (OONI, monthly since January 2022 on TCI, MCI and
// Irancell), loaded once after the Overview; one line of text and a strip of months.
let serviceHistory = null;
let historyRequested = false;
function requestHistory() {
  if (historyRequested) return;
  historyRequested = true;
  fetch('/api/history', { headers: { accept: 'application/json' } }).then((response) => response.json()).then((payload) => {
    if (!payload?.ok) return;
    serviceHistory = payload;
    if (lastAssessment) renderSituation(lastAssessment, lastViewState);
  }).catch(() => { historyRequested = false; });
}

function historyLine(id) {
  const history = serviceHistory?.services?.find((service) => service.id === id);
  if (!history?.months?.length) return '';
  const since = history.since;
  const text = since
    ? t(since.fromStart ? 'board.history.sinceStart' : 'board.history.since', { month: formatMonth(since.month) })
    : t('board.history.notBlocked', { month: formatMonth(history.months[0].month) });
  const cells = history.months.map((month, index) => {
    const label = `${formatMonth(month.month)}: ${t(`board.history.status.${month.status}`)}${month.measurements ? ` · ${t('board.history.tests', { count: formatNumber(month.measurements) })}` : ''}`;
    return `<rect class="history-cell" data-status="${escapeHtml(month.status)}" x="${index * 4}" y="0" width="3" height="12" rx="0.5"><title>${escapeHtml(label)}</title></rect>`;
  }).join('');
  return `<li class="tile-history"><span>${escapeHtml(text)}</span><svg class="history-strip" viewBox="0 0 ${history.months.length * 4} 12" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(t('board.history.chart'))}">${cells}</svg></li>`;
}

// Tile colour for an independent answer; "failing" is a failed connection, not proof of a block.
const INDEPENDENT_STATUS = { blocked: 'blocked', failing: 'restricted', partial: 'restricted', reachable: 'reachable' };
const INDEPENDENT_SOURCE = { 'ripe-atlas': 'RIPE Atlas', globalping: 'Globalping' };

// Independent inside-out checks, as their own line: which source, how many devices in how many
// networks, and what they saw. Never merged into OONI's figures.
function independentLine(independent) {
  if (!independent || independent.status === 'inconclusive') return '';
  const key = independent.status === 'blocked' && independent.dns.blocked >= independent.connect.blocked ? 'board.independent.line.blockedDns'
    : `board.independent.line.${independent.status}`;
  const networks = independent.blockedNetworks.length ? independent.blockedNetworks : independent.networks;
  return `<li class="tile-independent">${escapeHtml(t(key, {
    sources: listOf(independent.sources.map((source) => ltr(INDEPENDENT_SOURCE[source] ?? source))),
    probes: plural('board.independent.devices', independent.probes), networks: plural('board.independent.networks', independent.networks.length),
    named: ltr(networks.slice(0, 3).join(', ')),
  }))}</li>`;
}

function countryLine(country, item) {
  const key = { blocked: 'board.country.blocked', restricted: 'board.country.restricted', reachable: 'board.country.reachable' }[country.status];
  return `<li class="tile-country">${escapeHtml(t(key, {
    confirmed: formatNumber(country.confirmed), count: formatNumber(country.anomalous), total: formatNumber(country.measurements),
  }))}</li>`;
}

function networkName(asn, names, selection) {
  const name = names?.[asn];
  const label = name ? `${name} (${asn})` : asn;
  return asn === selection?.asn ? t('board.networks.this', { network: label }) : label;
}

// A network name opens that network's view directly, with the same period and test.
function networkHref(asn) {
  const params = new URLSearchParams(window.location.search);
  params.set('asn', asn);
  params.delete('target');
  return `?${params}`;
}

const KIND_GROUPS = [
  ['mobile', 'mobile'], ['institutional', 'institutional'], ['government_admin', 'public'],
  ['hosting', 'hosting'], ['education_research', 'research'], ['research', 'research'],
  ['business', 'business'], ['isp', 'provider'], ['fixed', 'provider'], ['backbone', 'provider'],
];

function kindLabel(kind) {
  if (!kind) return '';
  const group = KIND_GROUPS.find(([prefix]) => String(kind).startsWith(prefix))?.[1];
  return group ? t(`board.access.kind.${group}`) : '';
}

// Share of the tab's services a network lets through (reachable 1, partly ½, problems ¼, blocked 0).
const ACCESS_SCORE = { reachable: 1, partial: 0.5, restricted: 0.25, blocked: 0 };
function accessShare(entry) {
  if (Number.isFinite(entry.access)) return entry.access;
  const scores = Object.values(entry.services ?? {}).map((item) => ACCESS_SCORE[item.status]).filter((score) => score !== undefined);
  return scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) : 0;
}

// The key to the table: each mark exactly as it appears in the cells, with a short name and what
// it means; then one line on the bar and on networks abroad.
const ACCESS_KEY = [['reachable', '✓'], ['partial', '◐'], ['blocked', '✕'], ['restricted', '!'], ['none', '–']];
function accessKey() {
  return `<div class="access-legend">
      <ul class="access-key">${ACCESS_KEY.map(([status, mark]) => `<li><span class="access-key-mark access-cell" data-status="${status}" aria-hidden="true">${mark}</span><span><b>${escapeHtml(t(`board.access.key.${status}`))}</b> <small>${escapeHtml(t(`board.access.key.${status}.note`))}</small></span></li>`).join('')}</ul>
      <p class="access-key-foot">${escapeHtml(t('board.access.key.foot'))}</p>
    </div>`;
}

const ACCESS_MARK = { reachable: '✓', partial: '◐', blocked: '✕', restricted: '!', inconclusive: '?' };

function accessCell(entry) {
  if (!entry) return `<td class="access-cell" data-status="none" title="${escapeHtml(t('board.access.cell.none'))}">–</td>`;
  const title = t(`board.access.cell.${entry.status}`, { ok: formatNumber(entry.ok), confirmed: formatNumber(entry.confirmed), total: formatNumber(entry.measurements) });
  return `<td class="access-cell" data-status="${escapeHtml(entry.status)}" title="${escapeHtml(title)}"><span aria-hidden="true">${ACCESS_MARK[entry.status]}</span><span class="visually-hidden">${escapeHtml(title)}</span></td>`;
}

// Who has access to the internet services, by named Iranian network, full or partial, on the
// first screen: a reader should not have to switch networks one by one to find out.
// Which category the access table shows; "social & messaging" by default, with the six most used
// services first. There is no separate "main" tab: for many readers the main service is in
// another category (news, tools, everyday services).
const MAIN_IDS = ['instagram', 'whatsapp', 'telegram', 'youtube', 'x', 'facebook'];
let accessGroup = 'social';
let accessSort = 'access';
const ACCESS_GROUPS = MORE_SERVICE_GROUPS.map((group) => group.id);

// Service columns in alphabetical order of the names the reader sees (Persian names in Farsi).
function accessColumns(groupId, services) {
  const collator = new Intl.Collator(localeFor(), { sensitivity: 'base' });
  const byName = (list) => list.sort((a, b) => collator.compare(a.name, b.name));
  if (groupId === 'main') return byName(MAIN_IDS.map((id) => ({ id, name: brandName(id, services) })));
  const group = MORE_SERVICE_GROUPS.find((entry) => entry.id === groupId)?.services.map((service) => ({ id: service.id, name: moreServiceName(service) })) ?? [];
  return byName(groupId === 'social' ? [...MAIN_IDS.map((id) => ({ id, name: brandName(id, services) })), ...group] : group);
}

// Further services, reachable first: what works is what readers look for.
const REACH_RANK = { reachable: 0, partial: 1, restricted: 2, blocked: 3 };
function byReachability(list) {
  return list.map((service, index) => ({ service, index }))
    .sort((a, b) => (REACH_RANK[a.service.status] ?? 4) - (REACH_RANK[b.service.status] ?? 4) || a.index - b.index)
    .map(({ service }) => service);
}

function renderAccess(services, selection) {
  const breakdown = services?.networkBreakdown;
  const byGroup = breakdown?.accessByGroup;
  // An older saved answer has no categories yet: it shows the six on their own.
  const groupId = byGroup?.[accessGroup]?.length ? accessGroup : byGroup?.social?.length ? 'social' : 'main';
  const access = (groupId === 'main' ? breakdown?.access : byGroup?.[groupId]) ?? [];
  if (!access.length) {
    // The section says why it is empty instead of vanishing.
    if (!services?.networkBreakdownMissing) return '';
    return `
    <section class="access-board" aria-labelledby="access-title">
      <header><h2 id="access-title">${escapeHtml(t('board.access.title'))}</h2></header>
      <p class="access-missing">${escapeHtml(t(`board.access.missing.${services.networkBreakdownMissing}`))}</p>
    </section>`;
  }
  const { names, types = {}, coverage } = breakdown;
  const columns = accessColumns(groupId, services);
  const brands = columns.map((column) => column.id);
  const tabs = byGroup ? `<div class="access-tabs" role="tablist" aria-label="${escapeHtml(t('board.access.groups'))}">${ACCESS_GROUPS
    .filter((id) => byGroup[id]?.length)
    .map((id) => `<button type="button" role="tab" data-access-group="${id}" aria-selected="${id === groupId}">${escapeHtml(t(`board.more.group.${id}`))}</button>`).join('')}</div>` : '';
  const count = (level) => access.filter((entry) => entry.level === level).length;
  const VISIBLE_ROWS = 10;
  // Most access first (the order the server gives), or A–Z by the name the reader sees.
  const collator = new Intl.Collator(localeFor(), { sensitivity: 'base' });
  const ordered = [...access].sort(accessSort === 'name'
    ? (a, b) => collator.compare(networkName(a.asn, names, null), networkName(b.asn, names, null))
    : (a, b) => Number(a.thin) - Number(b.thin) || accessShare(b) - accessShare(a) || b.measurements - a.measurements);
  const sortSwitch = `<div class="access-sort" role="group" aria-label="${escapeHtml(t('board.access.sort.label'))}"><span>${escapeHtml(t('board.access.sort.label'))}</span>${['access', 'name']
    .map((id) => `<button type="button" data-access-sort="${id}" aria-pressed="${accessSort === id}">${escapeHtml(t(`board.access.sort.${id}`))}</button>`).join('')}</div>`;
  const rows = ordered.map((entry, index) => {
    const kind = kindLabel(types[entry.asn]);
    const note = types[entry.asn] === 'institutional' ? `<small class="network-note">${escapeHtml(t('board.networks.institutional'))}</small>` : '';
    // The selected network always stays visible, even beyond the first rows.
    const extra = index >= VISIBLE_ROWS && entry.asn !== selection?.asn;
    return `<tr data-level="${escapeHtml(entry.level)}"${entry.thin ? ' data-thin="yes"' : ''}${entry.asn === selection?.asn ? ' data-selected="yes"' : ''}${extra ? ' data-extra="yes" hidden' : ''}>
      <th scope="row"><a href="${escapeHtml(networkHref(entry.asn))}">${escapeHtml(networkName(entry.asn, names, selection))}</a>${kind ? `<small>${escapeHtml(kind)}</small>` : ''}${note}</th>
      <td class="access-level"><b>${escapeHtml(t(`board.access.level.${entry.level}`))}</b><span class="access-meter" title="${escapeHtml(t('board.access.share', { share: formatNumber(accessShare(entry)) }))}"><svg class="access-track" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="access-track-bg" width="100" height="6" rx="3"></rect><rect class="access-track-fill" width="${accessShare(entry)}" height="6" rx="3"></rect></svg><em>${escapeHtml(t('board.access.shareShort', { share: formatNumber(accessShare(entry)) }))}</em></span><small>${escapeHtml(t(entry.thin ? 'board.access.testsThin' : 'board.access.tests', { count: formatNumber(entry.measurements) }))}</small></td>
      ${brands.map((id) => accessCell(entry.services[id])).join('')}
    </tr>`;
  }).join('');
  const kinds = coverage?.unmeasuredKinds ?? {};
  const kindText = Object.entries(kinds).map(([kind, n]) => `${formatNumber(n)} ${kindLabel(kind) || t('board.access.kind.other')}`).join(separator());
  const publicBodies = coverage?.publicUnmeasured ?? [];
  return `
    <section class="access-board" aria-labelledby="access-title">
      <header>
        <h2 id="access-title">${escapeHtml(t('board.access.title'))}</h2>
        <p>${escapeHtml(t('board.access.summary', { measured: formatNumber(access.length), full: formatNumber(count('full')), partial: formatNumber(count('partial')), blocked: formatNumber(count('blocked')) }))}</p>
      </header>
      ${breakdown.staleSince ? `<p class="access-missing">${escapeHtml(t('board.access.stale', { date: formatDateTime(breakdown.staleSince) }))}</p>` : ''}
      ${tabs}
      ${accessKey()}
      ${sortSwitch}
      <div class="access-scroll"><table id="access-table">
        <thead><tr><th scope="col">${escapeHtml(t('board.access.network'))}</th><th scope="col">${escapeHtml(t('board.access.access'))}</th>${columns.map((column) => `<th scope="col" class="access-service-col">${escapeHtml(column.name)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${access.length > VISIBLE_ROWS ? `<button type="button" class="button access-more" data-access-more>${escapeHtml(t('board.access.showAll', { count: formatNumber(access.length) }))}</button>` : ''}
      ${coverage ? `<details class="access-unmeasured">
        <summary>${escapeHtml(t('board.access.unmeasured', { count: formatNumber(coverage.registered - coverage.measured), registered: formatNumber(coverage.registered) }))}</summary>
        ${kindText ? `<p>${escapeHtml(kindText)}</p>` : ''}
        ${publicBodies.length ? `<p><b>${escapeHtml(t('board.access.publicUnmeasured'))}</b> ${publicBodies.map((item) => `<a href="${escapeHtml(networkHref(item.asn))}">${escapeHtml(item.name ? `${item.name} (${item.asn})` : item.asn)}</a>`).join(separator())}</p>` : ''}
        <p>${escapeHtml(t('board.access.blindSpot'))}</p>
      </details>` : ''}
    </section>`;
}

// Privileged access is reported by journalists and researchers, not measurable here. It stays
// in its own block, with every statement tied to its source and date.
// Only dated, named primary reporting (no encyclopedias), newest first; checked 25 Sep 2026.
// Dated context (who decides, privileged access) comes from one list, sorted newest first; the
// dates are written here in the reader's calendar. See public/context-items.js to add news.
const CONTEXT_NEW_DAYS = 30;

function contextDate(value) {
  return value.length === 7 ? formatMonth(value) : formatDay(value);
}

function contextWhen(item) {
  return item.until ? `${contextDate(item.date)} – ${contextDate(item.until)}` : contextDate(item.date);
}

function contextSources(keys) {
  const lang = getLanguage() === 'fa' ? 'fa' : 'en';
  return keys.map((key) => {
    const source = CONTEXT_SOURCES[key];
    const label = `${source.name[lang]}, ${formatDay(source.date)}`;
    return `<a href="${escapeHtml(source.url)}"${source.internal ? '' : ' target="_blank" rel="noreferrer"'}>${escapeHtml(label)}</a>`;
  }).join(separator());
}

function contextList(panel) {
  const lang = getLanguage() === 'fa' ? 'fa' : 'en';
  const now = Date.now();
  return contextItems(panel).map((item) => {
    const fresh = item.added && now - Date.parse(`${item.added}T00:00:00Z`) < CONTEXT_NEW_DAYS * 86_400_000;
    return `<li><time>${escapeHtml(contextWhen(item))}</time>${fresh ? `<b class="context-new">${escapeHtml(t('board.context.new'))}</b>` : ''}<span>${escapeHtml(item.text[lang])} <small>${contextSources(item.sources)}</small></span></li>`;
  }).join('');
}

function contextPanel(panel, id) {
  return `
    <section class="privileged-board ${panel}-board" aria-labelledby="${id}">
      <header><h2 id="${id}">${escapeHtml(t(`board.${panel}.title`))}</h2><p>${escapeHtml(t(`board.${panel}.note`, { date: formatDay(CONTEXT_CHECKED) }))}</p></header>
      <ul class="context-list">${contextList(panel)}</ul>
      <p class="privileged-limit">${escapeHtml(t(`board.${panel}.limit`))}</p>
    </section>`;
}

// Who decides what is blocked and switched off, from official documents and named sources.
// Where the deciding body is not published, the panel says so instead of guessing.
function renderControl() {
  return contextPanel('control', 'control-title');
}

function renderPrivileged() {
  return contextPanel('privileged', 'privileged-title');
}

// A service with a Persian name of its own is shown by it in Farsi.
const MORE_NAMES_FA = new Map(MORE_SERVICE_GROUPS.flatMap((group) => group.services).filter((service) => service.nameFa).map((service) => [service.id, service.nameFa]));
function moreServiceName(service) {
  return (getLanguage() === 'fa' && MORE_NAMES_FA.get(service.id)) || service.name;
}

// Further services as compact chips per group: blocked, partly, problems or reachable, with the
// numbers on hover. A dashed chip was answered from other Iranian networks.
function renderMoreServices(services) {
  const groups = services?.more;
  if (!groups?.some((group) => group.services.some((service) => service.scope))) return '';
  const chip = (service) => {
    const title = service.scope ? t('board.more.detail', {
      total: formatNumber(service.measurements), confirmed: formatNumber(service.confirmed),
      count: formatNumber(service.anomalous), ok: formatNumber(service.ok),
    }) + (service.scope === 'country' ? ` · ${t('board.more.country')}` : '') : t('board.more.untested');
    const appTitle = (service.app ? `${separator()}${t('board.more.appDetail', { total: formatNumber(service.app.measurements), count: formatNumber(service.app.anomalies) })}` : '')
      + (service.notOfferedInIran ? `${separator()}${t('board.more.notOfferedDetail')}` : '');
    return `<li class="more-chip" data-status="${escapeHtml(service.status)}"${service.scope === 'country' ? ' data-scope="country"' : ''} title="${escapeHtml(title + appTitle)}">
      <span class="more-chip-name">${escapeHtml(moreServiceName(service))}</span><span class="more-chip-status">${escapeHtml(t(`board.more.status.${service.status}`))}</span>${service.app ? `<span class="more-chip-app" data-app-status="${escapeHtml(service.app.status)}">${escapeHtml(t(`board.more.app.${service.app.status}`))}</span>` : ''}${service.notOfferedInIran ? `<span class="more-chip-app" data-app-status="provider">${escapeHtml(t('board.more.notOffered'))}</span>` : ''}</li>`;
  };
  return `
    <section class="more-services" aria-labelledby="more-services-title">
      <header><h2 id="more-services-title">${escapeHtml(t('board.more.title'))}</h2><p>${escapeHtml(t('board.more.note'))}${services.countryCheck === 'outage' ? ` ${escapeHtml(t('board.country.outage'))}` : ''}${services.survivorsOnly ? ` ${escapeHtml(t('board.services.survivorsOnly'))}` : ''}</p></header>
      ${groups.map((group) => `<div class="more-group"><h3>${escapeHtml(t(`board.more.group.${group.id}`))}</h3><div class="more-group-body"><ul>${byReachability(group.services).map(chip).join('')}</ul>${group.services.some((service) => service.notOfferedInIran) ? `<p class="more-group-note">${escapeHtml(t('board.more.notOfferedNote'))}</p>` : ''}</div></div>`).join('')}
    </section>`;
}

// Ways around the filter today: one row per method OONI tests from inside Iran, with a plain
// explanation, a verdict by majority and its numbers, and Cloudflare WARP use at the end.
const WORKAROUND_STATUS_CLASS = { works: 'reachable', partly: 'restricted', fails: 'blocked', thin: 'thin', unavailable: 'thin' };
function renderWorkarounds(services) {
  const rows = services?.workarounds;
  if (!rows?.length) return '';
  const row = (item) => {
    const numbers = item.status === 'unavailable' ? t('board.workarounds.unavailableNote')
      : item.usable
      ? t(item.status === 'fails' ? 'board.workarounds.failed' : 'board.workarounds.worked', {
        count: formatNumber(item.status === 'fails' ? item.failed : item.ok), total: formatNumber(item.usable),
      })
      : t('board.workarounds.none');
    const scope = (item.scope === 'country' ? `${partSep()}${t('board.workarounds.country')}` : '')
      + (item.staleSince ? `${partSep()}${t('board.workarounds.lastLoaded', { date: formatDateTime(item.staleSince) })}` : '');
    return `<li class="workaround" data-status="${escapeHtml(WORKAROUND_STATUS_CLASS[item.status])}">
      <b class="workaround-name">${escapeHtml(t(`board.workarounds.tool.${item.id}`))}</b>
      <span class="workaround-verdict">${escapeHtml(t(`board.workarounds.status.${item.status}`))}</span>
      <small class="workaround-about">${escapeHtml(t(`board.workarounds.about.${item.id}`))}</small>
      <small class="workaround-numbers">${escapeHtml(numbers + scope)}</small></li>`;
  };
  // Encrypted DNS: two tiles like the tools, from a sample of single OONI measurements.
  const dns = services.encryptedDns;
  const dnsTile = (group) => {
    const item = dns?.[group];
    if (!item?.tested) return '';
    const numbers = t(item.status === 'fails' ? 'board.workarounds.failed' : 'board.workarounds.worked', {
      count: formatNumber(item.status === 'fails' ? item.failed : item.ok), total: formatNumber(item.tested),
    });
    const reason = item.status !== 'works' && item.reason ? t(`board.workarounds.dnsReason.${DNS_REASONS.has(item.reason) ? item.reason : 'other'}`) : '';
    return `<li class="workaround" data-status="${escapeHtml(WORKAROUND_STATUS_CLASS[item.status])}">
      <b class="workaround-name">${escapeHtml(t(`board.workarounds.tool.dns-${group}`))}</b>
      <span class="workaround-verdict">${escapeHtml(t(`board.workarounds.status.${item.status}`))}</span>
      <small class="workaround-about">${escapeHtml(t(`board.workarounds.about.dns-${group}`))}</small>
      <small class="workaround-numbers">${escapeHtml([numbers, t('board.workarounds.sample'), reason, dns.staleSince ? t('board.workarounds.lastLoaded', { date: formatDateTime(dns.staleSince) }) : ''].filter(Boolean).join(partSep()))}</small></li>`;
  };
  return `
    <section class="workarounds-board" aria-labelledby="workarounds-title">
      <header><h2 id="workarounds-title">${escapeHtml(t('board.workarounds.title'))}</h2></header>
      ${renderUsageCards(services)}
      <h3 class="usage-heading">${escapeHtml(t('board.workarounds.tested'))}</h3>
      <p class="usage-note">${escapeHtml(t('board.workarounds.note'))}</p>
      <ul>${rows.map(row).join('')}${dnsTile('byName')}${dnsTile('byAddress')}</ul>
      <p class="workarounds-unmeasured">${escapeHtml(t('board.workarounds.unmeasured'))}</p>
    </section>`;
}

// The middle dot looks like a Persian zero next to Persian digits; Farsi separates with "؛".
function partSep() {
  return getLanguage() === 'fa' ? '؛ ' : ' · ';
}

const DNS_REASONS = new Set(['dns_bogon_error', 'generic_timeout_error', 'connection_reset', 'host_unreachable', 'network_unreachable']);

// People use what works: a type that suddenly drops is probably being blocked.
const TRANSPORT_NAMES = { obfs4: 'obfs4', webtunnel: 'WebTunnel', snowflake: 'Snowflake', meek: 'meek', conjure: 'Conjure' };
function roundUsers(value) {
  return value >= 1000 ? Math.round(value / 1000) * 1000 : Math.round(value / 10) * 10;
}

function formatMonth(month) {
  return new Intl.DateTimeFormat(localeFor(), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

// Small bar chart for a usage card; bars scale to the largest value.
function usageBars(values, label, { width = 4, gap = 1 } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values.map((item) => item.value ?? 0), 0.0001);
  const step = width + gap;
  const bars = values.map((item, index) => {
    const height = item.value === null ? 2 : Math.max(2, Math.round(((item.value ?? 0) / max) * 30));
    return `<rect class="${item.value === null ? 'vpn-bar-empty' : 'vpn-bar'}" x="${index * step}" y="${32 - height}" width="${width}" height="${height}" rx="1"><title>${escapeHtml(item.title)}</title></rect>`;
  }).join('');
  return `<svg class="usage-chart" viewBox="0 0 ${values.length * step} 32" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}">${bars}</svg>`;
}

function usageCard({ id, title, value, unit, lines = [], chart = '', source, hint = '' }) {
  return `<article class="usage-card" data-usage="${id}"${hint ? ` title="${escapeHtml(hint)}"` : ''}>
      <h3>${escapeHtml(title)}</h3>
      <p class="usage-value"><b>${escapeHtml(value)}</b> <span>${escapeHtml(unit)}</span></p>
      ${chart}
      ${lines.map((line) => `<p class="usage-line">${escapeHtml(line)}</p>`).join('')}
      <p class="usage-source">${escapeHtml(source)}</p>
    </article>`;
}

// What people in Iran use to get around the filter, as cards with the key number large: usage
// seen from inside Iran (Psiphon, Tor Metrics, APNIC) and whether the tools can be downloaded
// (OONI). Usage shows that connections get through, not which services can then be reached.
function renderUsageCards(services) {
  const cards = [];
  const conduit = services?.conduit;
  if (conduit?.latest) {
    cards.push(usageCard({
      id: 'conduit', title: t('board.usage.conduit.title'),
      value: `≈ ${formatNumber(roundUsers(conduit.latest.connections))}`, unit: t('board.usage.conduit.unit', { date: formatDay(conduit.latest.date) }),
      chart: usageBars((conduit.series ?? []).map((row) => ({ value: row.connections, title: `${formatDay(row.date)}: ${formatNumber(row.connections)}` })), t('board.workarounds.conduitChart')),
      lines: [conduit.stationsInIran ? t('board.workarounds.conduitStations', { stations: formatNumber(conduit.stationsInIran) }) : '',
        conduit.staleSince ? t('board.workarounds.lastLoaded', { date: formatDateTime(conduit.staleSince) }) : ''].filter(Boolean),
      source: t('board.usage.conduit.source'), hint: t('board.workarounds.conduitHint'),
    }));
  }
  const tor = services?.torUse;
  if (tor && (tor.direct || tor.bridges)) {
    const types = (tor.transports ?? []).map((item) => t('board.workarounds.torType', { type: TRANSPORT_NAMES[item.transport] ?? item.transport, users: formatNumber(roundUsers(item.users)) }));
    cards.push(usageCard({
      id: 'tor', title: t('board.usage.tor.title'),
      value: `≈ ${formatNumber(roundUsers(tor.direct ?? 0))}`, unit: t('board.usage.tor.unit'),
      lines: [t('board.usage.tor.bridges', { bridges: formatNumber(roundUsers(tor.bridges ?? 0)) }), types.length ? t('board.workarounds.torTypes', { types: types.join(separator()) }) : ''].filter(Boolean),
      source: t('board.usage.tor.source', { date: tor.date ? formatDay(tor.date) : '—' }),
    }));
  }
  const vpn = services?.vpnUse;
  if (vpn?.current) {
    cards.push(usageCard({
      id: 'warp', title: t('board.usage.warp.title'),
      value: formatPercent(vpn.current.share), unit: t('board.usage.warp.unit'),
      chart: usageBars(vpn.months.map((month) => ({ value: month.share, title: `${formatMonth(month.month)}: ${month.share === null ? t('board.vpnUse.noData') : formatPercent(month.share)}` })), t('board.vpnUse.chart'), { width: 8, gap: 3 }),
      lines: [[vpn.yearAgo ? t('board.vpnUse.yearAgo', { share: formatPercent(vpn.yearAgo.share) }) : '',
        vpn.lowest && vpn.lowest.share < vpn.current.share / 2 ? t('board.vpnUse.lowest', { share: formatPercent(vpn.lowest.share), month: formatMonth(vpn.lowest.month) }) : ''].filter(Boolean).join(separator())].filter(Boolean),
      source: t('board.usage.warp.source'), hint: t('board.vpnUse.hint', { date: formatDay(vpn.current.date) }),
    }));
  }
  const group = services?.more?.find((entry) => entry.id === 'circumvention');
  const tested = (group?.services ?? []).filter((service) => service.scope);
  if (tested.length) {
    const blocked = tested.filter((service) => service.status === 'blocked');
    const open = tested.filter((service) => service.status === 'reachable');
    cards.push(usageCard({
      id: 'downloads', title: t('board.usage.downloads.title'),
      value: t('board.usage.downloads.value', { blocked: formatNumber(blocked.length), tested: formatNumber(tested.length) }), unit: t('board.usage.downloads.unit'),
      lines: [blocked.length ? t('board.workarounds.downloadsBlocked', { sites: listOf(blocked.map(moreServiceName)) }) : '',
        open.length ? t('board.workarounds.downloadsOpen', { sites: listOf(open.map(moreServiceName)) }) : ''].filter(Boolean),
      source: t('board.usage.downloads.source'),
    }));
  }
  if (!cards.length) return '';
  return `<div class="usage-block">
      <h3 class="usage-heading">${escapeHtml(t('board.usage.title'))}</h3>
      <p class="usage-note">${escapeHtml(t('board.usage.note'))}</p>
      <div class="usage-grid">${cards.join('')}</div>
    </div>`;
}

// What changed against the period of the same length before: first thing a returning reader
// wants to know. Only services with enough tests in both periods take part.
function renderChanges(services) {
  const changes = services?.changes;
  const period = changes?.previous ? `${formatDay(changes.previous.since)} – ${formatDay(changes.previous.until)}` : '';
  if (changes?.outageOverlap) {
    return `<section class="changes-board" aria-labelledby="changes-title"><header><h2 id="changes-title">${escapeHtml(t('board.changes.title'))}</h2></header>
      <p class="changes-none">${escapeHtml(t('board.changes.outage', { period }))}</p></section>`;
  }
  if (!changes?.compared) return '';
  const item = (entry) => `<li class="change-item" data-direction="${STATUS_RANK_UI[entry.to] > STATUS_RANK_UI[entry.from] ? 'worse' : 'better'}" title="${escapeHtml(t('board.changes.detail', { before: formatNumber(entry.before), now: formatNumber(entry.now) }))}">
    <b>${escapeHtml(entry.name)}</b> <span>${escapeHtml(t(`board.more.status.${entry.from}`))} → ${escapeHtml(t(`board.more.status.${entry.to}`))}</span></li>`;
  const none = !changes.worse.length && !changes.better.length;
  return `
    <section class="changes-board" aria-labelledby="changes-title">
      <header><h2 id="changes-title">${escapeHtml(t('board.changes.title'))}</h2><p>${escapeHtml(t('board.changes.note', { period, count: formatNumber(changes.compared) }))}</p></header>
      ${none ? `<p class="changes-none">${escapeHtml(t('board.changes.none'))}</p>` : ''}
      ${changes.worse.length ? `<div class="changes-row"><h3>${escapeHtml(t('board.changes.worse'))}</h3><ul>${changes.worse.map(item).join('')}</ul></div>` : ''}
      ${changes.better.length ? `<div class="changes-row"><h3>${escapeHtml(t('board.changes.better'))}</h3><ul>${changes.better.map(item).join('')}</ul></div>` : ''}
    </section>`;
}

const STATUS_RANK_UI = { reachable: 0, partial: 1, restricted: 2, blocked: 3 };

function renderServiceTiles(services, selection, connectivity = null) {
  if (!services) return '';
  const items = services.visible ?? services.items;
  const title = services.scoped ? t('board.services.selected') : t('board.services.title');
  // During a nationwide outage the volunteers' probes are cut off too: a missing test is a
  // consequence of the outage, not a gap that could hide a working service.
  const sparse = items.some((item) => ['untested', 'unclear', 'unavailable'].includes(item.status) && !item.country);
  const note = services.rateLimited ? t('board.services.rateLimited')
    : services.stale?.since ? t('board.services.staleNote')
    : services.survivorsOnly ? t('board.services.survivorsOnly')
    : items.some((item) => ['untested', 'unclear'].includes(item.status) && item.country) ? t('board.services.noteCountry')
    : nationwidePeriod(connectivity) && sparse ? t('board.services.outageNote')
      : t('board.services.note');
  return `
    <section class="service-board" aria-labelledby="service-board-title">
      <header><h2 id="service-board-title">${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p></header>
      ${items.length ? `<div class="service-tiles">${items.map((item) => {
        // Without a usable test in this network, the tile answers with the result across Iran,
        // labelled as such, instead of stopping at "not tested".
        const country = ['untested', 'unclear'].includes(item.status) ? item.country : null;
        // Without any OONI answer, an independent check (RIPE Atlas, Globalping) answers, labelled.
        const independent = !country && ['untested', 'unclear', 'unavailable'].includes(item.status) && INDEPENDENT_STATUS[item.independent?.status]
          ? item.independent : null;
        const status = country ? country.status : independent ? INDEPENDENT_STATUS[independent.status] : item.status;
        return `
        <article class="service-tile" data-status="${escapeHtml(status)}"${country ? ' data-scope="country"' : independent ? ' data-scope="independent"' : ''}>
          <div class="service-tile-head"><h3 class="${item.id === 'selected-target' ? 'technical-ltr' : ''}">${escapeHtml(brandName(item.id, services))}</h3></div>
          <b class="service-tile-status">${escapeHtml(independent ? t(`board.independent.status.${independent.status}`) : country ? t(`board.country.status.${country.status}`)
            : item.status === 'restricted' && item.app?.status === 'anomaly' && item.web?.status !== 'anomaly' ? t('board.status.appFailed')
              : t(`board.status.${item.status}`))}</b>
          <ul>${country ? countryLine(country, item) : ''}${!country && item.country && item.web?.status === 'untested' ? `<li class="tile-country">${escapeHtml(t(`board.country.web.${item.country.status}`, { confirmed: formatNumber(item.country.confirmed), count: formatNumber(item.country.anomalous), total: formatNumber(item.country.measurements) }))}</li>` : ''}${!country && ['unavailable', 'outage'].includes(services.countryCheck) && ['untested', 'unclear'].includes(item.status) ? `<li class="tile-country">${escapeHtml(t(`board.country.${services.countryCheck}`))}</li>` : ''}${item.country && item.web?.status === 'untested' ? '' : channelLine(item.web, 'web')}${channelLine(item.app, 'app')}${appServersLine(item.appServers)}${mechanismLine(item)}${coverageLine(item, selection)}${independentLine(item.independent)}${historyLine(item.id)}</ul>
        </article>`;
      }).join('')}
      </div>${serviceHistory ? `<p class="history-legend"><span class="history-key" data-status="blocked"></span>${escapeHtml(t('board.history.status.blocked'))} <span class="history-key" data-status="restricted"></span>${escapeHtml(t('board.history.status.restricted'))} <span class="history-key" data-status="reachable"></span>${escapeHtml(t('board.history.status.reachable'))} <span class="history-key" data-status="outage"></span>${escapeHtml(t('board.history.status.outage'))} · ${escapeHtml(t('board.history.scope'))}</p>` : ''}` : `<p class="service-board-empty">${escapeHtml(t('board.services.noneInSelection'))}</p>`}
    </section>`;
}

function nationwidePeriod(connectivity) {
  return (connectivity?.outagePeriods ?? []).filter((period) => period.scope === 'nationwide').at(-1) ?? null;
}

// The dates Radar gives an outage tell a reader more than the name of the monitor.
function periodHint(connectivity) {
  const period = nationwidePeriod(connectivity);
  if (!period) return null;
  return period.end
    ? t('board.connection.period', { from: formatDay(period.start), to: formatDay(period.end) })
    : t('board.connection.periodOngoing', { from: formatDay(period.start) });
}

function eventHint(connectivity) {
  const event = connectivity?.latestEvent;
  if (!event || connectivity.state !== 'disruption-signals') return null;
  const kindKey = `board.event.kind.${event.kind}`;
  const kind = t(kindKey) === kindKey ? t('board.event.kind.other') : t(kindKey);
  const time = (value) => formatDateTime(value);
  return t(event.end ? 'board.event.range' : 'board.event.since', { source: event.source, kind, from: time(event.start), to: event.end ? time(event.end) : '' });
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  if (value > 0 && value < 0.1) return t('board.outage.belowTenth');
  return t('board.outage.percent', { value: formatNumber(value, value < 10 ? 1 : 0) });
}

const CHART = { width: 640, height: 170, left: 44, right: 12, top: 12, bottom: 24 };

function chartGeometry(lines, traffic) {
  const { width, height, left, right, top, bottom } = CHART;
  const days = [...new Set(lines.flatMap((line) => line.series.map((point) => point.date)))].sort();
  const first = Date.parse(`${days[0]}T00:00:00Z`);
  const last = Date.parse(`${days.at(-1)}T00:00:00Z`);
  const max = Math.max(100, ...lines.flatMap((line) => line.series.map((point) => point.percent)));
  const yMax = Math.ceil(max / 50) * 50;
  const x = (ms) => left + ((ms - first) / Math.max(1, last - first)) * (width - left - right);
  const y = (value) => top + (1 - value / yMax) * (height - top - bottom);
  const clampX = (ms) => Math.min(width - right, Math.max(left, x(ms)));
  return {
    days, first, last, yMax, x, y,
    bandStart: clampX(Date.parse(traffic.start)),
    bandEnd: traffic.end ? clampX(Date.parse(traffic.end)) : width - right,
  };
}

function chartLines(connectivity, interpretation) {
  const traffic = connectivity?.outageTraffic;
  if (!traffic) return [];
  const lines = [{ id: 'country', label: t('board.outage.country'), series: traffic.series ?? [] }];
  // The selected network is what the page is about, so it carries the accent.
  if (traffic.network?.series?.length) lines.push({ id: 'network', label: networkLabel(interpretation), series: traffic.network.series });
  return lines.filter((line) => line.series.length >= 3);
}

// How the outage unfolded, hour by hour in Tehran time: routes (RIPE RIS), traffic (Cloudflare
// Radar) and reachability from abroad (IODA), then which networks still carried traffic.
const ANATOMY_LAYER = { routes: 'routes', traffic: 'traffic', reach: 'reach' };
const anatomyLayer = (kind) => ANATOMY_LAYER[kind.split('-')[0]] ?? 'routes';
// Spans that are not an hour: the first day of the outage, or the day after its end.
const ANATOMY_DAY_KINDS = new Set(['reach-day-after', 'routes-v6-missing', 'routes-v4-missing']);

function tehranTime(value) {
  return new Intl.DateTimeFormat(localeFor(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tehran' }).format(Date.parse(value));
}

function tehranDay(value) {
  return new Intl.DateTimeFormat(localeFor(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Tehran' }).format(Date.parse(value));
}

function anatomyWhen(event) {
  if (event.kind === 'routes-v4-kept') return t('board.anatomy.firstDay');
  if (ANATOMY_DAY_KINDS.has(event.kind)) return tehranDay(event.to);
  return t('board.anatomy.when', { day: tehranDay(event.to), time: ltr(`${tehranTime(event.from)}–${tehranTime(event.to)}`) });
}

function anatomyText(event) {
  return t(`board.anatomy.${event.kind}`, {
    before: formatNumber(event.before ?? 0), after: formatNumber(event.after ?? 0), percent: formatPercent(event.percent ?? 0),
  });
}

function renderAnatomy(interpretation) {
  const anatomy = interpretation.dimensions.connectivity?.outageAnatomy;
  if (!anatomy || (!anatomy.onset.length && !anatomy.restoration.length && !anatomy.networks?.networks?.length)) return '';
  const item = (event) => `<li data-layer="${anatomyLayer(event.kind)}"><time>${escapeHtml(anatomyWhen(event))}</time><span>${escapeHtml(anatomyText(event))}</span><small>${escapeHtml(t(`board.anatomy.source.${anatomyLayer(event.kind)}`))}</small></li>`;
  const phase = (label, events) => (events.length ? `<li class="anatomy-phase">${escapeHtml(label)}</li>${events.map(item).join('')}` : '');
  const networks = anatomy.networks?.networks ?? [];
  const share = (value) => formatPercent(value);
  const networkName = (row) => (row.name ? `${row.name} (${ltr(row.asn)})` : t('board.anatomy.networks.private', { asn: ltr(row.asn) }));
  const table = networks.length ? `
      <div class="anatomy-networks">
        <h3>${escapeHtml(t('board.anatomy.networks.title'))}</h3>
        <p>${escapeHtml(t('board.anatomy.networks.note', { from: formatDay(anatomy.networks.from), to: formatDay(new Date(Date.parse(anatomy.networks.to) - 1).toISOString()) }))}</p>
        <table><thead><tr><th>${escapeHtml(t('board.anatomy.networks.network'))}</th><th>${escapeHtml(t('board.anatomy.networks.during'))}</th><th>${escapeHtml(t('board.anatomy.networks.before'))}</th></tr></thead>
          <tbody>${networks.map((row) => `<tr><th scope="row">${escapeHtml(networkName(row))}</th><td>${escapeHtml(share(row.share))}</td><td>${escapeHtml(row.before !== null ? share(row.before) : row.beforeBelow !== null ? (row.beforeBelow < 0.1 ? share(row.beforeBelow) : t('board.anatomy.networks.below', { value: share(row.beforeBelow) })) : '—')}</td></tr>`).join('')}</tbody></table>
        ${anatomy.networks.foreignLeftOut ? `<p class="anatomy-foot">${escapeHtml(plural('board.anatomy.networks.foreign', anatomy.networks.foreignLeftOut))}</p>` : ''}
      </div>` : '';
  return `
    <section class="anatomy-board" aria-labelledby="anatomy-title">
      <header><h2 id="anatomy-title">${escapeHtml(t('board.anatomy.title'))}</h2><p>${escapeHtml(t('board.anatomy.note'))}</p></header>
      <div class="anatomy-grid">
        <ol class="anatomy-timeline">${phase(t('board.anatomy.start'), anatomy.onset)}${phase(t('board.anatomy.end'), anatomy.restoration)}</ol>
        ${table}
      </div>
    </section>`;
}

// Traffic against the week before; the outage is a shaded band dated by Radar. With a selected
// network, its own line sits next to the country, because networks recover differently.
function renderOutageTraffic(interpretation) {
  const connectivity = interpretation.dimensions.connectivity;
  const traffic = connectivity?.outageTraffic;
  const lines = chartLines(connectivity, interpretation);
  if (!lines.length) return '';
  const { width, height, left, right, top, bottom } = CHART;
  const geometry = chartGeometry(lines, traffic);
  const { days, first, last, yMax, x, y, bandStart, bandEnd } = geometry;
  const path = (series) => series.map((point, index) => `${index ? 'L' : 'M'}${x(Date.parse(`${point.date}T00:00:00Z`)).toFixed(1)},${y(point.percent).toFixed(1)}`).join('');
  const ticks = [0, 100, yMax].filter((value, index, list) => list.indexOf(value) === index);
  const label = t('board.outage.chartLabel', { from: formatDay(traffic.start), to: traffic.end ? formatDay(traffic.end) : '—' });
  const byDay = lines.map((line) => new Map(line.series.map((point) => [point.date, point.percent])));
  const data = days.map((date) => [date, ...byDay.map((map) => map.get(date) ?? '')].join('|')).join(';');
  const accent = lines.at(-1);
  return `
    <figure class="outage-traffic" dir="ltr">
      <figcaption dir="auto"><strong>${escapeHtml(t('board.outage.title'))}</strong><span>${escapeHtml(t('board.outage.subtitle'))}</span></figcaption>
      ${lines.length > 1 ? `<ul class="outage-legend" dir="${document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'}">${lines.map((line) => `<li data-line="${line.id}"><i aria-hidden="true"></i><bdi>${escapeHtml(line.label)}</bdi></li>`).join('')}</ul>` : ''}
      <div class="outage-chart" data-points="${escapeHtml(data)}" data-labels="${escapeHtml(lines.map((line) => line.label).join('|'))}">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">
          <rect class="outage-band" x="${bandStart.toFixed(1)}" y="${top}" width="${Math.max(1, bandEnd - bandStart).toFixed(1)}" height="${height - top - bottom}"></rect>
          ${ticks.map((value) => `<line class="outage-grid${value === 100 ? ' outage-grid-baseline' : ''}" x1="${left}" x2="${width - right}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"></line>`).join('')}
          <path class="outage-area" d="${path(accent.series)}L${x(Date.parse(`${accent.series.at(-1).date}T00:00:00Z`)).toFixed(1)},${y(0).toFixed(1)}L${x(Date.parse(`${accent.series[0].date}T00:00:00Z`)).toFixed(1)},${y(0).toFixed(1)}Z"></path>
          ${lines.map((line) => `<path class="outage-line" data-line="${line.id}" d="${path(line.series)}"></path>`).join('')}
          <line class="outage-crosshair" x1="0" x2="0" y1="${top}" y2="${height - bottom}" hidden></line>
          ${lines.map((line) => `<circle class="outage-dot" data-line="${line.id}" r="4" cx="0" cy="0" hidden></circle>`).join('')}
        </svg>
        <div class="outage-axis-y">${ticks.map((value) => `<span data-top="${((y(value) / height) * 100).toFixed(2)}">${escapeHtml(t('board.outage.percent', { value: formatNumber(value) }))}</span>`).join('')}</div>
        <div class="outage-axis-x"><span data-left="${((bandStart / width) * 100).toFixed(2)}">${escapeHtml(formatDay(traffic.start))}</span>${traffic.end ? `<span data-left="${((bandEnd / width) * 100).toFixed(2)}">${escapeHtml(formatDay(traffic.end))}</span>` : ''}</div>
        <div class="outage-tooltip" role="status" hidden></div>
      </div>
      <details class="outage-values" dir="auto"><summary>${escapeHtml(t('board.outage.table'))}</summary>
        <div class="outage-values-scroll"><table><thead><tr><th>${escapeHtml(t('board.outage.day'))}</th>${lines.map((line) => `<th><bdi>${escapeHtml(line.label)}</bdi></th>`).join('')}</tr></thead>
        <tbody>${days.map((date) => `<tr><td><bdi>${escapeHtml(formatDay(date))}</bdi></td>${byDay.map((map) => `<td><bdi>${escapeHtml(map.has(date) ? formatPercent(map.get(date)) : '—')}</bdi></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </details>
    </figure>`;
}

// The crosshair finds the day nearest the pointer; readers aim at a date, not at a 2px line.
function bindOutageChart(root, interpretation) {
  const chart = root?.querySelector('.outage-chart');
  if (!chart) return;
  // The CSP forbids inline style attributes; place the axis labels through the CSSOM.
  for (const label of chart.querySelectorAll('[data-top]')) label.style.top = `${label.dataset.top}%`;
  for (const label of chart.querySelectorAll('[data-left]')) label.style.left = `${label.dataset.left}%`;
  const connectivity = interpretation.dimensions.connectivity;
  const lines = chartLines(connectivity, interpretation);
  const { x, y, first, last } = chartGeometry(lines, connectivity.outageTraffic);
  const { width, left, right } = CHART;
  const svg = chart.querySelector('svg');
  const crosshair = chart.querySelector('.outage-crosshair');
  const dots = [...chart.querySelectorAll('.outage-dot')];
  const tooltip = chart.querySelector('.outage-tooltip');
  const rows = chart.dataset.points.split(';').map((entry) => {
    const [date, ...values] = entry.split('|');
    return { date, ms: Date.parse(`${date}T00:00:00Z`), values: values.map((value) => (value === '' ? null : Number(value))) };
  });
  const hide = () => { crosshair.hidden = true; tooltip.hidden = true; for (const dot of dots) dot.hidden = true; };
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const ms = first + ((((event.clientX - box.left) / box.width) * width - left) / (width - left - right)) * (last - first);
    const row = rows.reduce((best, item) => (Math.abs(item.ms - ms) < Math.abs(best.ms - ms) ? item : best), rows[0]);
    const px = x(row.ms);
    crosshair.setAttribute('x1', px); crosshair.setAttribute('x2', px); crosshair.hidden = false;
    dots.forEach((dot, index) => {
      const value = row.values[index];
      dot.hidden = value === null;
      if (value !== null) { dot.setAttribute('cx', px); dot.setAttribute('cy', y(value)); }
    });
    const parts = lines.map((line, index) => (row.values[index] === null ? null
      : lines.length > 1 ? `${line.label}: ${formatPercent(row.values[index])}` : formatPercent(row.values[index]))).filter(Boolean);
    tooltip.textContent = `${formatDay(row.date)}${separator()}${parts.join(separator())}`;
    tooltip.style.left = `${Math.min(75, Math.max(18, (px / width) * 100))}%`;
    tooltip.hidden = false;
  });
}

// Sparse days are part of the value: 4 measured days of 20 are not a typical week.
function qualityDaysNote(quality, selection) {
  const days = quality?.measuredDays;
  const window = windowDays(selection);
  if (!days || !window || days >= window) return '';
  return t('board.quality.days', { days: formatNumber(days), window: formatNumber(window) });
}

function statusRow(interpretation) {
  const { connectivity, quality, shutdown } = interpretation.dimensions;
  const connection = connectionState(connectivity);
  const loss = evidenceValue(quality, 'packet-loss-percent');
  const rtt = evidenceValue(quality, 'rtt-ms');
  const radarLatency = evidenceValue(quality, 'latency-ms');
  const radarDownload = evidenceValue(quality, 'download-mbps');
  const range = quality.typicalRange?.latency?.low != null ? quality.typicalRange : null;
  // An outage that ended inside the period is reported as ended, not as the current state.
  const ended = nationwidePeriod(connectivity)?.endedInWindow ? nationwidePeriod(connectivity) : null;
  // During an outage the quality values describe only the little traffic that still got through.
  const duringOutage = Boolean(nationwidePeriod(connectivity) && !ended);
  const items = [
    {
      id: 'connection',
      status: ended ? 'warn' : { none: 'ok', signals: 'warn', unknown: 'unknown' }[connection] ?? 'bad',
      value: ended ? t('board.connection.ended', { date: formatDay(ended.end) })
        : connection === 'signals' ? plural('board.connection.signals', connectivity.eventCount ?? 0) : t(`board.connection.${connection}`),
      hint: periodHint(connectivity) ?? eventHint(connectivity) ?? t('board.connection.hint'),
    },
    radarLatency !== null
      // Real user traffic in this network says more to a reader than a probe ping.
      ? { id: 'quality', status: 'info',
        hint: [duringOutage ? t('board.quality.duringOutage') : range ? t('board.quality.userRange', { low: formatNumber(range.latency.low, 0), high: formatNumber(range.latency.high, 0) }) : t('board.quality.userHint'),
          qualityDaysNote(quality, interpretation.selection)].filter(Boolean).join(separator()),
        value: t('board.quality.user', { download: radarDownload === null ? '—' : formatNumber(radarDownload, 1), latency: formatNumber(radarLatency, 0) }) }
      : quality.state === 'path-observations-available' && loss !== null
        ? { id: 'quality', status: 'info', value: t('board.quality.value', { delivered: formatNumber(100 - loss, 1), rtt: rtt === null ? '—' : formatNumber(rtt, 0) }), hint: t('board.quality.hint') }
        : { id: 'quality', status: 'unknown', value: t('board.quality.unknown'), hint: t('board.quality.hint') },
    {
      id: 'shutdown',
      // Measured nationwide impact without a confirmed record is neither "established" nor
      // "not confirmed" to a reader looking at a traffic line at zero; say what was measured.
      status: shutdown.state === 'nationwide-shutdown-established' ? 'bad' : connectivity.severity === 'widespread' ? 'warn' : shutdown.quiet ? 'ok' : 'unknown',
      value: shutdown.state !== 'nationwide-shutdown-established' && connectivity.severity === 'widespread'
        ? t('board.shutdown.measured') : shutdown.quiet ? t('board.shutdown.none') : t(`board.shutdown.${shutdown.state}`),
      // Name the missing access or the curated record instead of a generic caveat.
      hint: shutdown.evidence?.some((item) => item.source === 'Internet Society Pulse' && item.state === 'token-required')
        ? t('board.shutdown.missingAccess')
        : shutdown.contextEvent && shutdown.state !== 'nationwide-shutdown-established'
          ? t('board.shutdown.context', {
            verification: t(`board.shutdown.verification.${shutdown.contextEvent.verificationLevel ?? 'unconfirmed'}`),
            from: formatDay(shutdown.contextEvent.startDate), to: formatDay(shutdown.contextEvent.endDate),
          })
          : shutdown.quiet ? t('board.shutdown.noneHint') : t('board.shutdown.hint'),
    },
  ];
  return `<dl class="status-row" id="status-row">${items.map((item) => `
    <div data-status="${item.status}"><dt>${escapeHtml(t(`board.row.${item.id}`))}</dt><dd>${escapeHtml(item.value)}</dd><small>${escapeHtml(item.hint)}</small></div>`).join('')}
  </dl>`;
}

// A short table of contents for the long first page; only sections present are listed.
// Sharing the current finding. On phones the system share sheet opens the installed apps
// directly, which also works where t.me or x.com links are blocked; elsewhere direct links.
const COPY_TO_APP = new Set(['tiktok', 'signal']);

function shareBar() {
  // The system share sheet only works dependably on phones; on computers it often opens nothing.
  // Telegram, WhatsApp and X always have their own button; phones get the system sheet as well.
  const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  // By use among readers in Iran and abroad. Signal and TikTok have no web share link: their
  // buttons copy the text and link, to paste in the app.
  const buttons = ['telegram', 'whatsapp', 'x', 'facebook', 'tiktok', 'signal', 'threads', 'truthsocial', 'copy', ...(native ? ['native'] : [])];
  return buttons.map((kind) => `<button type="button" class="button share-button" data-share="${kind}"${COPY_TO_APP.has(kind) ? ` title="${escapeHtml(t(`share.pasteHint.${kind}`))}"` : ''}>${escapeHtml(t(`share.${kind}`))}</button>`).join('');
}

// Sharing sits in the toolbar next to Export, as a menu of the same kind; it is drawn again with
// every answer so its labels follow the page's language.
function renderShareMenu() {
  const exportMenu = document.querySelector('.toolbar .export-menu:not(.share-menu)');
  if (!exportMenu) return;
  let menu = document.querySelector('#share-menu');
  if (!menu) {
    menu = document.createElement('details');
    menu.id = 'share-menu';
    menu.className = 'export-menu share-menu';
    exportMenu.after(menu);
  }
  const open = menu.open;
  menu.innerHTML = `<summary class="button">${escapeHtml(t('share.menu'))}</summary><div class="export-menu-list" role="group" aria-label="${escapeHtml(t('share.label'))}">${shareBar()}</div>`;
  menu.open = open;
}

// Copies the sentence and link; where the clipboard API is not allowed (plain http, older
// browsers) a hidden text field does it. The button confirms either way, or says it failed.
async function copyShare(button, value, labelKey, copiedText = null) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(value);
    copied = true;
  } catch {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(field);
    field.select();
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    field.remove();
  }
  button.textContent = copied ? (copiedText ?? t('share.copied')) : t('share.copyFailed');
  setTimeout(() => { button.textContent = t(labelKey); }, 2000);
}

// What is shared comes from the finding on screen. Messengers (Telegram, WhatsApp, Signal,
// TikTok, copy) get the full picture line by line; X, Threads and Truth Social, with their
// length limits, a compact sentence. The link is the public address when one is configured.
let shareSource = null;

function shareUrl() {
  const base = document.querySelector('meta[property="og:url"]')?.content?.replace(/\/+$/, '') || location.origin;
  return `${base}${location.pathname}${location.search}`;
}

function shareWhere(interpretation) {
  return interpretation.selection?.asn ? networkTitle(interpretation) : t('share.where.iran');
}

function sharePeriod(interpretation) {
  const { since, until } = interpretation.selection ?? {};
  return since && until ? `${formatDay(since)} – ${formatDay(until)}` : '';
}

function shareShort(interpretation) {
  const heading = document.querySelector('#situation-headline');
  const headline = (heading?.dataset.full || heading?.textContent || '').trim();
  return t('share.short', { headline, where: shareWhere(interpretation), period: sharePeriod(interpretation) });
}

function shareLong(interpretation) {
  const { services, dimensions } = interpretation;
  const names = (ids) => listOf(ids.map((id) => brandName(id, services)));
  const lines = [t('share.msg.title', { where: shareWhere(interpretation), period: sharePeriod(interpretation) }), ''];
  if (services?.blocked?.length) lines.push(`⛔ ${t('share.msg.blocked', { services: names(services.blocked) })}`);
  if (services?.restricted?.length) lines.push(`⚠️ ${t('share.msg.restricted', { services: names(services.restricted) })}`);
  if (services?.reachable?.length) lines.push(`✅ ${t('share.msg.reachable', { services: names(services.reachable) })}`);
  const access = services?.networkBreakdown?.access ?? [];
  if (access.length) {
    const level = (name) => formatNumber(access.filter((entry) => entry.level === name).length);
    lines.push(`🌐 ${t('share.msg.access', { measured: formatNumber(access.length), full: level('full'), partial: level('partial'), blocked: level('blocked') })}`);
  }
  const tested = (services?.more ?? []).flatMap((group) => group.services.filter((service) => service.scope));
  const blockedMore = tested.filter((service) => service.status === 'blocked');
  if (tested.length) {
    lines.push(`📵 ${t('share.msg.more', { blocked: formatNumber(blockedMore.length), tested: formatNumber(tested.length), examples: listOf(blockedMore.slice(0, 5).map(moreServiceName)) })}`);
  }
  const changes = services?.changes;
  if (changes?.compared && !changes.outageOverlap) {
    // Main services by their name in the reader's language, further services by theirs.
    const label = (entry) => { const key = `board.brand.${entry.id}`; const text = t(key); return text !== key ? text : moreServiceName(entry); };
    const moved = (entry) => `${label(entry)} (${t(`board.more.status.${entry.from}`)} → ${t(`board.more.status.${entry.to}`)})`;
    const all = [...(changes.worse ?? []), ...(changes.better ?? [])];
    lines.push(`🔄 ${all.length ? t('share.msg.changes', { changes: listOf(all.slice(0, 4).map(moved)) }) : t('share.msg.noChanges')}`);
  }
  const workarounds = (services?.workarounds ?? []).filter((item) => !['thin', 'unavailable'].includes(item.status));
  if (workarounds.length) {
    lines.push(`🛡️ ${t('share.msg.workarounds', { list: listOf(workarounds.map((item) => t(`share.msg.tool.${item.status}`, { tool: t(`board.workarounds.tool.${item.id}`) }))) })}`);
  }
  if (services?.conduit?.latest) lines.push(`🧭 ${t('share.msg.conduit', { connections: formatNumber(roundUsers(services.conduit.latest.connections)) })}`);
  const period = nationwidePeriod(dimensions.connectivity);
  lines.push(`📶 ${period
    ? (period.end ? t('share.msg.outage', { from: formatDay(period.start), to: formatDay(period.end) }) : t('share.msg.outageOngoing', { from: formatDay(period.start) }))
    : t('share.msg.noOutage')}`);
  const runs = services?.vantage?.runs;
  lines.push('', runs ? t('share.msg.basisRuns', { runs: formatNumber(runs) }) : t('share.msg.basis'));
  return lines.join('\n');
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-share]');
  if (!button) return;
  const url = shareUrl();
  const interpretation = shareSource;
  if (!interpretation) return;
  const kind = button.dataset.share;
  const short = ['x', 'threads', 'truthsocial'].includes(kind);
  const text = short ? shareShort(interpretation) : shareLong(interpretation);
  const open = (address) => window.open(address, '_blank', 'noopener,noreferrer');
  if (kind === 'native') {
    try { await navigator.share({ title: 'Iran Censorship Monitor', text, url }); } catch (error) {
      // Closed by the reader is fine; any other failure falls back to copying the link.
      if (error?.name !== 'AbortError') await copyShare(button, `${text}\n${url}`, 'share.native');
    }
  } else if (kind === 'telegram') open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  else if (kind === 'whatsapp') open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`);
  else if (kind === 'x') open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
  else if (kind === 'facebook') open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  else if (kind === 'threads') open(`https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`);
  // Truth Social's documented share link: https://help.truthsocial.com/publishers/share-button/
  else if (kind === 'truthsocial') open(`https://truthsocial.com/share?title=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
  else if (COPY_TO_APP.has(kind)) await copyShare(button, `${text}\n${url}`, `share.${kind}`, t(`share.pasteIn.${kind}`));
  else if (kind === 'copy') {
    await copyShare(button, `${text}\n${url}`, 'share.copy');
  }
});

function jumpBar(interpretation) {
  const services = interpretation.services;
  // In order of what readers look for first, not in page order.
  const links = [
    services?.changes ? ['changes-title', 'board.jump.changes'] : null,
    services?.networkBreakdown?.access?.length || services?.networkBreakdownMissing ? ['access-title', 'board.jump.access'] : null,
    ['privileged-title', 'board.jump.privileged'],
    ['control-title', 'board.jump.control'],
    services?.workarounds ? ['workarounds-title', 'board.jump.workarounds'] : null,
    services ? ['service-board-title', 'board.jump.services'] : null,
    services?.more?.some((group) => group.services.some((service) => service.scope)) ? ['more-services-title', 'board.jump.more'] : null,
    ['user-meaning', 'board.jump.meaning'],
    ['connection-title', 'board.jump.connection'],
    interpretation.dimensions?.connectivity?.outageAnatomy ? ['anatomy-title', 'board.jump.anatomy'] : null,
    ['sources-panel', 'board.jump.sources'],
  ].filter(Boolean);
  return `<nav class="jump-bar" aria-label="${escapeHtml(t('board.jump.label'))}">${links.map(([id, key]) => `<a href="#${id}">${escapeHtml(t(key))}</a>`).join('')}</nav>`;
}

// The title leads with the provider's name readers know: "Shatel (AS31549)", not "AS31549 · Shatel".
function networkTitle(interpretation) {
  const label = networkLabel(interpretation);
  const match = /^(AS\d+)\s*·\s*(.+)$/.exec(label);
  return match ? `${match[2]} (${match[1]})` : label;
}

function renderHero(interpretation) {
  const summary = interpretation.summary;
  const hero = document.querySelector('#current-situation');
  const selection = interpretation.selection ?? {};
  const period = selection.since && selection.until ? `${formatDay(selection.since)} – ${formatDay(selection.until)}` : '';
  const latest = summary.latestObservation ? t('board.latest', { date: formatDay(summary.latestObservation) }) : '';
  const stale = interpretation.services?.stale?.since ?? null;
  const stalePeriod = interpretation.services?.stale?.period ?? null;
  const staleText = stale ? (stalePeriod
    ? t('board.stale.period', { from: formatDay(stalePeriod.since), to: formatDay(stalePeriod.until), date: formatDateTime(stale) })
    : t('board.stale.since', { date: formatDateTime(stale) })) : '';
  shareSource = interpretation;
  renderShareMenu();
  updateFilterSummary();
  hero.dataset.headline = summary.headline?.state ?? summary.state;
  const headlineSummary = { ...summary, headline: summary.headline && { ...summary.headline, period: nationwidePeriod(interpretation.dimensions.connectivity) } };
  hero.dataset.stale = stale ? 'yes' : 'no';
  hero.innerHTML = `
    <header class="situation-top">
      <span class="section-label">${escapeHtml(stale ? t('board.kicker.stale') : t('board.kicker'))}</span>
      <div class="situation-lead">
        <h1 id="situation-headline" data-full="${escapeHtml(headlineText(headlineSummary, interpretation.services))}">${escapeHtml(headlineText(headlineSummary, interpretation.services, { compact: true }))}</h1>
        <p class="situation-lede">${escapeHtml(ledeText(interpretation))}</p>
      </div>
      <p class="situation-scope visually-hidden">${escapeHtml(networkTitle(interpretation))}${period ? `${separator()}${escapeHtml(period)}` : ''}${latest ? `${separator()}${escapeHtml(latest)}` : ''}</p>
      ${stale ? `<p class="situation-stale" role="status">${escapeHtml(staleText)}</p>` : ''}
    </header>`;
  // The jump bar is a direct child of the overview, so it can stay under the page header while
  // every section card scrolls past.
  const overview = document.querySelector('#overview-view');
  overview.querySelector(':scope > .jump-bar')?.remove();
  hero.insertAdjacentHTML('afterend', jumpBar(interpretation));
  // Each section is its own card, in the order of importance for readers.
  const sections = document.querySelector('#situation-sections');
  sections.innerHTML = `
    ${renderChanges(interpretation.services)}
    ${renderServiceTiles(interpretation.services, selection, interpretation.dimensions.connectivity)}
    ${renderWorkarounds(interpretation.services)}
    ${renderMoreServices(interpretation.services)}
    ${renderAccess(interpretation.services, selection)}
    ${renderControl()}
    ${renderPrivileged()}
    <section class="connection-board" aria-labelledby="connection-title">
      <header><h2 id="connection-title">${escapeHtml(t('board.jump.connection'))}</h2><a class="meaning-link" href="?view=technical" data-open-technical>${escapeHtml(t('board.openTechnical'))}</a></header>
      ${statusRow(interpretation)}
      ${renderOutageTraffic(interpretation)}
      ${renderAnatomy(interpretation)}
    </section>`;
  bindOutageChart(sections, interpretation);
  bindJumpBar(overview);
  bindAccess(sections, interpretation);
}

// The jump bar stays under the page header while scrolling, and the link of the section being
// read lights up. The offset follows the header's real height (it differs on phones).
let jumpScroll = null;
function bindJumpBar(hero) {
  const bar = hero.querySelector('.jump-bar');
  if (!bar) return;
  const header = document.querySelector('.topbar');
  const setOffset = () => document.documentElement.style.setProperty('--topbar-h', `${header?.offsetHeight ?? 0}px`);
  setOffset();
  const links = [...bar.querySelectorAll('a')];
  const targets = links.map((link) => [link, document.getElementById(link.getAttribute('href').slice(1))]).filter(([, target]) => target);
  const update = () => {
    const line = (header?.offsetHeight ?? 0) + bar.offsetHeight + 24;
    let current = null;
    let best = -Infinity;
    for (const [link, target] of targets) {
      const top = target.getBoundingClientRect().top;
      if (top <= line && top > best) { best = top; current = link; }
    }
    for (const link of links) link.toggleAttribute('aria-current', link === current);
    // On narrow screens the bar scrolls sideways; keep the lit link in view without moving the page.
    if (current && bar.scrollWidth > bar.clientWidth) {
      const left = current.offsetLeft - bar.offsetLeft;
      if (left < bar.scrollLeft || left + current.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = left - 12;
    }
  };
  if (jumpScroll) { window.removeEventListener('scroll', jumpScroll); window.removeEventListener('resize', jumpScroll); }
  let queued = false;
  jumpScroll = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; setOffset(); update(); }); };
  window.addEventListener('scroll', jumpScroll, { passive: true });
  window.addEventListener('resize', jumpScroll, { passive: true });
  update();
}

function bindAccess(hero, interpretation) {
  hero.querySelector('[data-access-more]')?.addEventListener('click', (event) => {
    hero.querySelectorAll('#access-table tr[data-extra]').forEach((row) => { row.hidden = false; });
    event.currentTarget.remove();
  });
  // Switching the group or the order redraws only the access section.
  const redraw = (focus) => {
    const section = hero.querySelector('.access-board');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderAccess(interpretation.services, interpretation.selection ?? {});
    if (section && wrapper.firstElementChild) {
      section.replaceWith(wrapper.firstElementChild);
      bindAccess(hero, interpretation);
      hero.querySelector(focus)?.focus();
    }
  };
  hero.querySelectorAll('[data-access-group]').forEach((button) => button.addEventListener('click', () => {
    accessGroup = button.dataset.accessGroup;
    redraw(`[data-access-group="${accessGroup}"]`);
  }));
  hero.querySelectorAll('[data-access-sort]').forEach((button) => button.addEventListener('click', () => {
    accessSort = button.dataset.accessSort;
    redraw(`[data-access-sort="${accessSort}"]`);
  }));
}

// "What this means for you": a few plain questions with short answers. Figures that need a
// technical reading (speed, counts per mechanism, excluded foreign tests) sit folded below.
function meaningAnswers(interpretation) {
  const { services, dimensions } = interpretation;
  const names = (ids) => listOf(ids.map((id) => brandName(id, services)));
  const answers = [];

  // Do the big apps work?
  const apps = [];
  if (services?.blocked?.length) apps.push(plural('meaning.a.blocked', services.blocked.length, { services: names(services.blocked) }));
  if (services?.restricted?.length) {
    // An app test only knows that the connection to the app's servers failed; OONI has no block
    // page for apps and never confirms them. Website anomalies are a different finding.
    const byId = new Map((services.items ?? []).map((item) => [item.id, item]));
    const appOnly = services.restricted.filter((id) => byId.get(id)?.app?.status === 'anomaly' && byId.get(id)?.web?.status !== 'anomaly');
    const web = services.restricted.filter((id) => !appOnly.includes(id));
    if (web.length) apps.push(t('meaning.a.restricted', { services: names(web) }));
    if (appOnly.length) apps.push(t('meaning.a.restrictedApp', { services: names(appOnly) }));
    // In an outage a failed connection may be the outage itself, not a block of this service.
    const outageNow = nationwidePeriod(dimensions.connectivity);
    if (outageNow && !outageNow.endedInWindow) apps.push(t('meaning.outageCause'));
  }
  if (services?.reachable?.length) apps.push(t('meaning.a.reachable', { services: names(services.reachable) }));
  if (services?.countryBlocked?.length) apps.push(t('meaning.a.countryBlocked', { services: names(services.countryBlocked) }));
  if (services?.state === 'untested' && services.visible?.length) apps.push(t('meaning.a.untested', { services: names(services.visible.map((item) => item.id)) }));
  const scope = services?.networkBreakdown ? null : services?.networkScope;
  if (scope?.measured) {
    const service = scope.serviceId ? brandName(scope.serviceId, services) : scope.domain;
    if (scope.blocked > 0) apps.push(t('meaning.networks.blocked', { service, blocked: formatNumber(scope.blocked), measured: formatNumber(scope.measured) }));
    else if (scope.restricted > 0) apps.push(t('meaning.networks.restricted', { service, restricted: formatNumber(scope.restricted), measured: formatNumber(scope.measured) }));
    if (scope.reachable > 0 && (scope.blocked > 0 || scope.restricted > 0)) apps.push(t('meaning.networks.reachable', { service, reachable: formatNumber(scope.reachable) }));
  }
  if (apps.length) answers.push({ question: t('meaning.q.apps'), lines: apps });

  // Does a way around the filter help?
  const tools = (status) => (services?.workarounds ?? []).filter((item) => item.status === status).map((item) => t(`board.workarounds.tool.${item.id}`));
  const around = ['works', 'partly', 'fails'].filter((status) => tools(status).length)
    .map((status) => t(`meaning.a.around.${status}`, { tools: listOf(tools(status)) }));
  if (services?.conduit?.latest) around.push(t('meaning.a.around.conduit', { connections: formatNumber(roundUsers(services.conduit.latest.connections)) }));
  if (around.length) answers.push({ question: t('meaning.q.around'), lines: around, link: ['workarounds-title', t('meaning.a.around.more')] });

  // Does the internet itself work?
  const internet = [];
  const period = nationwidePeriod(dimensions.connectivity);
  const connection = connectionState(dimensions.connectivity);
  if (!period) {
    internet.push(connection === 'none' ? t('meaning.a.internet.fine')
      : connection === 'signals' ? plural('meaning.connection.signals', dimensions.connectivity.eventCount ?? 0)
        : t(`meaning.connection.${connection}`));
  } else {
    internet.push(period.end
      ? t('meaning.outage.period', { from: formatDay(period.start), to: formatDay(period.end) })
      : t('meaning.outage.periodOngoing', { from: formatDay(period.start) }));
    const traffic = dimensions.connectivity.outageTraffic;
    if (traffic) {
      internet.push(t('meaning.outage.depth', { lowest: formatPercent(traffic.lowestPercent), typical: formatPercent(traffic.typicalPercent) }));
      if (traffic.afterPercent !== null) internet.push(t('meaning.outage.after', { after: formatPercent(traffic.afterPercent) }));
      const own = traffic.network;
      if (own) {
        internet.push(t(own.afterPercent !== null ? 'meaning.outage.network' : 'meaning.outage.networkOngoing', {
          network: networkLabel(interpretation), typical: formatPercent(own.typicalPercent), after: formatPercent(own.afterPercent),
        }));
      }
    }
    // A restored connection is not open access.
    if (period.endedInWindow && (services?.blocked?.length || services?.restricted?.length)) internet.push(t('meaning.outage.notOpen'));
  }
  const inOutage = Boolean(period && !period.endedInWindow);
  const latency = evidenceValue(dimensions.quality, 'latency-ms');
  const range = dimensions.quality?.typicalRange?.latency;
  if (latency !== null && !inOutage && range?.high != null) internet.push(t(latency > range.high ? 'meaning.a.speed.slow' : 'meaning.a.speed.normal'));
  const shutdown = dimensions.shutdown;
  if (shutdown.state === 'nationwide-shutdown-established' && shutdown.establishedEvent) {
    internet.push(t('meaning.shutdown.established', { from: formatDay(shutdown.establishedEvent.startDate), to: formatDay(shutdown.establishedEvent.endDate) }));
  }
  answers.push({ question: t('meaning.q.internet'), lines: internet });

  // How is it blocked?
  const dominant = services?.vantage?.dominantMechanism;
  const sampled = services?.visible?.[0];
  if (dominant?.code && dominant.count && sampled) {
    answers.push({ question: t('meaning.q.how'), lines: [t(`meaning.a.mechanism.${dominant.code}`, { service: brandName(sampled.id, services) })] });
  }

  // How sure is this?
  const sure = [];
  const vantage = services?.vantage;
  if (vantage?.runs) {
    const window = windowDays(interpretation.selection);
    sure.push(t(vantage.bounded ? 'meaning.a.sure.atLeast' : 'meaning.a.sure.exact', {
      runs: formatNumber(vantage.runs), days: formatNumber(vantage.observedDays), window: window ? formatNumber(window) : formatNumber(vantage.observedDays),
    }));
  }
  sure.push(t('meaning.a.sure.basis'));
  if (interpretation.summary?.foreignUnchecked) sure.push(t('meaning.foreignUnchecked'));
  answers.push({ question: t('meaning.q.sure'), lines: sure });
  return answers;
}

function meaningDetails(interpretation) {
  const { services, dimensions } = interpretation;
  const lines = [];
  const period = nationwidePeriod(dimensions.connectivity);
  const inOutage = Boolean(period && !period.endedInWindow);
  const latency = evidenceValue(dimensions.quality, 'latency-ms');
  const download = evidenceValue(dimensions.quality, 'download-mbps');
  if (latency !== null && !inOutage) {
    const range = dimensions.quality.typicalRange;
    lines.push(t(range?.latency?.low != null ? 'meaning.quality.userRange' : 'meaning.quality.user', {
      download: download === null ? '—' : formatNumber(download, 1),
      latency: formatNumber(latency, 0),
      low: range?.latency?.low != null ? formatNumber(range.latency.low, 0) : '—',
      high: range?.latency?.high != null ? formatNumber(range.latency.high, 0) : '—',
    }));
  }
  const loss = evidenceValue(dimensions.quality, 'packet-loss-percent');
  if (loss !== null && !period) lines.push(t('meaning.connection.fine', { delivered: formatNumber(100 - loss, 1) }));
  if (period && dimensions.connectivity.outageTraffic?.lowestPercent > 0) lines.push(t('meaning.outage.residual'));
  const vantage = services?.vantage;
  const dominant = vantage?.dominantMechanism;
  const sampled = services?.visible?.[0];
  if (dominant?.code && dominant.count && sampled) {
    lines.push(t(`meaning.mechanism.${dominant.code}`, { service: brandName(sampled.id, services), count: formatNumber(dominant.count), affected: formatNumber(vantage.affected ?? dominant.count) }));
  }
  const shutdown = dimensions.shutdown;
  if (shutdown.state !== 'nationwide-shutdown-established' && shutdown.contextEvent) {
    lines.push(t('meaning.shutdown.context', {
      verification: t(`board.shutdown.verification.${shutdown.contextEvent.verificationLevel ?? 'unconfirmed'}`),
      from: formatDay(shutdown.contextEvent.startDate), to: formatDay(shutdown.contextEvent.endDate),
    }));
    if (shutdown.contextComparison === 'radar-no-nationwide-outage') lines.push(t('meaning.shutdown.radarNone'));
    if (shutdown.contextComparison === 'radar-dates-differ') lines.push(t('meaning.shutdown.radarDiffers'));
  }
  const foreign = interpretation.summary?.foreignExcluded;
  if (foreign?.measurements) lines.push(t('meaning.foreignExcluded', { count: formatNumber(foreign.measurements), networks: foreign.networks.join(', ') }));
  return lines;
}

const jumpLink = ([target, label]) => `<a class="meaning-link" href="#${target}">${escapeHtml(label)}</a>`;

function renderMeaning(interpretation) {
  const element = document.querySelector('#user-meaning');
  const details = meaningDetails(interpretation);
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('meaning.kicker'))}</span><h2>${escapeHtml(t('meaning.title'))}</h2></header>
    <div class="meaning-qa">${meaningAnswers(interpretation).map((answer) => `<div class="meaning-item"><p class="meaning-q">${escapeHtml(answer.question)}</p>${answer.lines.map((line) => `<p class="meaning-a">${escapeHtml(line)}</p>`).join('')}${answer.link ? jumpLink(answer.link) : ''}</div>`).join('')}</div>
    ${details.length ? `<details class="meaning-details"><summary>${escapeHtml(t('meaning.details'))}</summary>${details.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</details>` : ''}`;
}

function renderDetailsHead() {
  document.querySelector('#overview-details-head').innerHTML = `<span class="section-label">${escapeHtml(t('board.details.kicker'))}</span><h2>${escapeHtml(t('board.details.title'))}</h2><p>${escapeHtml(t('board.details.intro'))}</p>`;
}

function findingMetrics(finding) {
  const values = (finding.evidence ?? [])
    .filter((item) => item.value !== null && item.value !== undefined && item.metric !== 'availability')
    .slice(0, 3);
  return values.map((item) => `${item.source} · ${t(`interpretation.metric.${item.metric}`)}: ${valueText(item)}`).join('  ·  ');
}

function renderFindings(interpretation) {
  const element = document.querySelector('#current-findings');
  const rows = interpretation.findings ?? [];
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('interpretation.findings.kicker'))}</span><h2>${escapeHtml(t('interpretation.findings.title'))}</h2></header>
    <div class="finding-list">${rows.length ? rows.map((finding) => {
      const metrics = findingMetrics(finding);
      return `<article><span class="finding-marker" data-state="${escapeHtml(finding.state)}"></span><div><h3>${escapeHtml(t(`interpretation.finding.${finding.id}.title`))}</h3><p>${escapeHtml(t(`interpretation.finding.${finding.id}.meaning`))}</p>${metrics ? `<small class="technical-ltr">${escapeHtml(metrics)}</small>` : ''}</div></article>`;
    }).join('') : `<p>${escapeHtml(t('interpretation.findings.none'))}</p>`}</div>`;
}

// "What we do not know": concrete questions these measurements cannot answer, each with what is
// known and where on the page to look instead.
function unknownItems(interpretation) {
  const { services, dimensions } = interpretation;
  const items = [];
  if (services?.restricted?.length) {
    items.push({ question: plural('unknown.slowdown.q', services.restricted.length, { services: listOf(services.restricted.map((id) => brandName(id, services))) }), answer: t('unknown.slowdown.a') });
  }
  // Sites not yet on the list the volunteers' test app checks in Iran are never measured; say so
  // instead of "no tests in this period", which suggests other periods have some.
  const moreUntested = (services?.more ?? []).flatMap((group) => group.services.filter((service) => !service.scope));
  const unlisted = moreUntested.filter((service) => service.onTestList === false).map(moreServiceName);
  const untested = [
    ...(services?.visible ?? []).filter((item) => item.status === 'untested').map((item) => brandName(item.id, services)),
    ...moreUntested.filter((service) => service.onTestList !== false).map(moreServiceName),
  ];
  if (untested.length || unlisted.length) {
    const shown = untested.slice(0, 5);
    const answers = [
      untested.length ? t(untested.length > shown.length ? 'unknown.untested.aMore' : 'unknown.untested.a', { services: listOf(shown), more: formatNumber(untested.length - shown.length) }) : '',
      unlisted.length ? plural('unknown.unlisted.a', unlisted.length, { services: listOf(unlisted) }) : '',
    ];
    items.push({ question: t('unknown.untested.q'), answer: answers.filter(Boolean).join(' '), link: ['more-services-title', t('board.more.title')] });
  }
  // Most Iranian networks have no volunteer testing in a given week; say how many, not "unknown".
  const coverage = services?.networkBreakdown?.coverage;
  if (coverage?.registered > coverage?.measured) {
    items.push({
      question: t('unknown.networks.q'),
      answer: t('unknown.networks.a', { count: formatNumber(coverage.registered - coverage.measured), registered: formatNumber(coverage.registered), measured: formatNumber(coverage.measured) }),
      link: ['access-title', t('board.access.title')],
    });
  }
  const period = nationwidePeriod(dimensions.connectivity);
  if (period) {
    items.push({ question: t('unknown.outage.q'), answer: t('unknown.outage.a'), link: dimensions.connectivity.outageAnatomy ? ['anatomy-title', t('board.anatomy.title')] : null });
  }
  if ((interpretation.unknowns ?? []).includes('connection-quality')) items.push({ question: t('unknown.speed.q'), answer: t('unknown.speed.a') });
  items.push({ question: t('unknown.privileged.q'), answer: t('unknown.privileged.a'), link: ['privileged-title', t('unknown.privileged.link')] });
  items.push({ question: t('unknown.who.q'), answer: t('unknown.who.a'), link: ['control-title', t('unknown.who.link')] });
  return items;
}

function renderUnknowns(interpretation) {
  const element = document.querySelector('#current-unknowns');
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('interpretation.unknowns.kicker'))}</span><h2>${escapeHtml(t('interpretation.unknowns.title'))}</h2></header>
    <p class="unknown-intro">${escapeHtml(t('unknown.intro'))}</p>
    <ul class="unknown-list">${unknownItems(interpretation).map((item) => `<li><b>${escapeHtml(item.question)}</b><span>${escapeHtml(item.answer)}</span>${item.link ? jumpLink(item.link) : ''}</li>`).join('')}</ul>`;
}

function renderEvidenceOverview(assessment) {
  const element = document.querySelector('#evidence-overview');
  const interpretation = assessment.interpretation;
  const dimensions = Object.values(interpretation.dimensions);
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('interpretation.evidence.kicker'))}</span><h2>${escapeHtml(t('interpretation.evidence.title'))}</h2></header>
    <p>${escapeHtml(t('interpretation.evidence.intro'))}</p>
    <div class="evidence-matrix">${dimensions.map((dimension) => `
      <div data-coverage="${escapeHtml(dimension.coverage)}"><strong>${escapeHtml(t(`interpretation.${dimension.id}.title`))}</strong><span>${escapeHtml(t(`interpretation.coverage.${dimension.coverage}`))}</span><small>${escapeHtml(dimension.availableSources.join(separator()) || t('interpretation.noUsableSources'))}</small></div>`).join('')}</div>
`;
  // The methodological boundary is said once, in the assessment card below; not repeated here.
}

let lastAssessment = null;
let lastViewState = 'loading';

function renderSituation(assessment, state = assessment ? 'ready' : 'loading') {
  lastAssessment = assessment || null;
  lastViewState = state;
  insertViews();
  translateStaticView();
  const interpretation = assessment?.interpretation;
  allIran = Boolean(interpretation) && !interpretation.selection?.asn;
  if (interpretation) requestHistory();
  const valid = interpretation?.schemaVersion === 1 && interpretation.summary &&
    ['connectivity', 'interference', 'routing', 'quality', 'shutdown'].every((id) => interpretation.dimensions?.[id]);
  for (const selector of ['#overview-details-head', '#interpretation-dimensions', '.overview-lower-grid', '#current-findings', '#evidence-overview', '#situation-sections']) {
    document.querySelector(selector).hidden = !valid;
  }
  if (!valid) document.querySelector('#overview-view > .jump-bar')?.remove();
  document.querySelector('#overview-view').setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  if (!valid) {
    const kind = state === 'error' ? 'error' : assessment ? 'incompatible' : 'loading';
    const headlineKey = kind === 'loading' ? 'situation.headline.loading' : `interpretation.overview.${kind}.headline`;
    const meaningKey = kind === 'loading' ? 'situation.meaning.loading' : `interpretation.overview.${kind}.meaning`;
    const hero = document.querySelector('#current-situation');
    hero.dataset.headline = kind;
    hero.innerHTML = `<header class="situation-top"><span class="section-label">${escapeHtml(t('board.kicker'))}</span><h1 id="situation-headline">${escapeHtml(t(headlineKey))}</h1><p class="situation-lede">${escapeHtml(t(meaningKey))}</p></header>`;
    return;
  }
  renderHero(interpretation);
  renderMeaning(interpretation);
  renderDetailsHead();
  document.querySelector('#interpretation-dimensions').innerHTML = ['connectivity', 'interference', 'routing', 'quality']
    .map((id) => renderDimension(interpretation.dimensions[id])).join('');
  renderFindings(interpretation);
  renderUnknowns(interpretation);
  renderEvidenceOverview(assessment);
}

insertViews();
translateStaticView();
renderSituation(null);
window.addEventListener('iran-monitor-overview', (event) => renderSituation(event.detail?.assessment, event.detail?.state));
window.addEventListener('iran-monitor-languagechange', () => renderSituation(lastAssessment, lastViewState));

export { renderSituation, setView };
