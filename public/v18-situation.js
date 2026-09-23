import { localeFor, t } from './i18n.js';

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

function insertViews() {
  ensureStyles();
  const assessment = document.querySelector('#assessment-strip');
  const filterbar = document.querySelector('.filterbar');
  if (!assessment || !filterbar || document.querySelector('#dashboard-view-switch')) return;

  filterbar.insertAdjacentHTML('afterend', `
    <nav id="dashboard-view-switch" class="view-switch" aria-label="${escapeHtml(t('interpretation.view.label'))}">
      <button type="button" data-dashboard-view="overview" class="active" aria-pressed="true"></button>
      <button type="button" data-dashboard-view="technical" aria-pressed="false"></button>
    </nav>
    <section id="overview-view" class="overview-view" aria-live="polite">
      <section id="current-situation" class="situation-board"></section>
      <div class="overview-lower-grid">
        <section class="overview-panel" id="user-meaning"></section>
        <section class="overview-panel" id="current-unknowns"></section>
      </div>
      <p class="overview-more"><button type="button" id="open-technical" class="button"></button></p>
    </section>
    <section id="technical-view" class="technical-view" hidden>
      <header id="overview-details-head" class="overview-section-head"></header>
      <section id="interpretation-dimensions" class="interpretation-grid" aria-label="${escapeHtml(t('interpretation.dimensions.label'))}"></section>
      <div id="overview-services-slot"></div>
      <div class="overview-lower-grid">
        <section class="overview-panel" id="current-findings"></section>
        <section class="overview-panel evidence-overview" id="evidence-overview"></section>
      </div>
    </section>`);

  const serviceDetails = document.querySelector('#service-findings');
  const slot = document.querySelector('#overview-services-slot');
  if (serviceDetails && slot) slot.replaceWith(serviceDetails);

  const technical = document.querySelector('#technical-view');
  for (const selector of ['#assessment-strip', '.kpi-grid', '.status-legend', '.dashboard-grid']) {
    const element = document.querySelector(selector);
    if (element) technical.appendChild(element);
  }

  document.querySelectorAll('[data-dashboard-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.dashboardView));
  });
  document.querySelector('#open-technical')?.addEventListener('click', () => {
    setView('technical');
    document.querySelector('#overview-details-head')?.scrollIntoView({ block: 'start' });
  });
  setView('overview');
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
  const openTechnical = document.querySelector('#open-technical');
  if (openTechnical) openTechnical.textContent = t('board.openTechnical');
}

function stateKey(dimension) {
  return `interpretation.${dimension.id}.state.${dimension.state}`;
}

function valueText(evidence) {
  if (evidence.value === null || evidence.value === undefined) return '—';
  const value = Number(evidence.value);
  if (!Number.isFinite(value)) return String(evidence.value);
  if (['anomaly-rate', 'visibility-percent', 'packet-loss-percent'].includes(evidence.metric)) {
    return `${new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value)}%`;
  }
  if (['rtt-ms', 'latency-ms'].includes(evidence.metric)) return `${new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value)} ms`;
  if (evidence.metric === 'download-mbps') return `${new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value)} Mbit/s`;
  return new Intl.NumberFormat(localeFor(), { maximumFractionDigits: 1 }).format(value);
}

function relevantEvidence(dimension) {
  const allowed = {
    connectivity: new Set(['events']),
    interference: new Set(['measurements', 'anomaly-rate', 'confirmed', 'events']),
    routing: new Set(['visibility-percent', 'peers-seeing', 'total-peers']),
    quality: new Set(['probes', 'samples', 'packet-loss-percent', 'rtt-ms', 'latency-ms', 'download-mbps']),
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

function renderDimension(dimension) {
  const metadata = [
    ['severity', dimension.severity],
    ['confidence', dimension.confidence],
    ['verification', dimension.verification],
    ['coverage', dimension.coverage],
  ];
  return `
    <article class="interpretation-card">
      <header>
        <span class="dimension-icon" aria-hidden="true">${escapeHtml(t(`interpretation.${dimension.id}.icon`))}</span>
        <div><span>${escapeHtml(t(`interpretation.${dimension.id}.title`))}</span><h2>${escapeHtml(t(stateKey(dimension)))}</h2></div>
      </header>
      <p>${escapeHtml(t(`interpretation.${dimension.id}.meaning.${dimension.state}`))}</p>
      <dl>${metadata.map(([label, value]) => `<div><dt>${escapeHtml(t(`interpretation.axis.${label}`))}</dt><dd>${escapeHtml(t(`interpretation.${label}.${value}`))}</dd></div>`).join('')}</dl>
      <ul class="dimension-evidence">${renderEvidenceItems(dimension)}</ul>
      <small>${escapeHtml(t(dimension.limitationKey))}</small>
    </article>`;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(localeFor(), { maximumFractionDigits: digits }).format(value);
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

const NAMED_HEADLINES = ['services-blocked', 'services-restricted', 'services-reachable', 'services-untested'];

function headlineText(summary, services) {
  const headline = summary.headline;
  if (!headline) return t(`interpretation.summary.${summary.state}.headline`);
  const names = headline.services.map((id) => brandName(id, services));
  if (NAMED_HEADLINES.includes(headline.state) && names.length) {
    return plural(`board.headline.${headline.state}`, names.length, { services: listOf(names) });
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
  if (!summary.headline) return t(`interpretation.summary.${summary.state}.meaning`);
  const sentences = [];
  if (summary.headline.state === 'services-blocked') sentences.push(t('board.lede.blocked'));
  if (summary.headline.state === 'services-restricted') sentences.push(t('board.lede.restricted'));
  if (['services-blocked', 'major-outage'].includes(summary.headline.state) && services?.restricted?.length) {
    const names = services.restricted.map((id) => brandName(id, services));
    sentences.push(plural('board.lede.also-restricted', names.length, { services: listOf(names) }));
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
  const key = `board.${kind}.${status}`;
  return `<li data-channel-status="${escapeHtml(status)}">${escapeHtml(t(key, variables))}</li>`;
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

function renderServiceTiles(services, selection) {
  if (!services) return '';
  const items = services.visible ?? services.items;
  const title = services.scoped ? t('board.services.selected') : t('board.services.title');
  return `
    <section class="service-board" aria-labelledby="service-board-title">
      <header><h2 id="service-board-title">${escapeHtml(title)}</h2><p>${escapeHtml(t('board.services.note'))}</p></header>
      ${items.length ? `<div class="service-tiles">${items.map((item) => `
        <article class="service-tile" data-status="${escapeHtml(item.status)}">
          <div class="service-tile-head"><span class="status-mark" aria-hidden="true"></span><h3 class="${item.id === 'selected-target' ? 'technical-ltr' : ''}">${escapeHtml(brandName(item.id, services))}</h3></div>
          <b class="service-tile-status">${escapeHtml(t(`board.status.${item.status}`))}</b>
          <ul>${channelLine(item.web, 'web')}${channelLine(item.app, 'app')}${mechanismLine(item)}${coverageLine(item, selection)}</ul>
        </article>`).join('')}
      </div>` : `<p class="service-board-empty">${escapeHtml(t('board.services.noneInSelection'))}</p>`}
    </section>`;
}

function statusRow(interpretation) {
  const { connectivity, quality, shutdown } = interpretation.dimensions;
  const connection = connectionState(connectivity);
  const loss = evidenceValue(quality, 'packet-loss-percent');
  const rtt = evidenceValue(quality, 'rtt-ms');
  const radarLatency = evidenceValue(quality, 'latency-ms');
  const radarDownload = evidenceValue(quality, 'download-mbps');
  const items = [
    {
      id: 'connection',
      status: { none: 'ok', signals: 'warn', unknown: 'unknown' }[connection] ?? 'bad',
      value: connection === 'signals' ? plural('board.connection.signals', connectivity.eventCount ?? 0) : t(`board.connection.${connection}`),
      hint: t('board.connection.hint'),
    },
    radarLatency !== null
      // Real user traffic in this network says more to a reader than a probe ping.
      ? { id: 'quality', status: 'info', hint: t('board.quality.userHint'),
        value: t('board.quality.user', { download: radarDownload === null ? '—' : formatNumber(radarDownload, 1), latency: formatNumber(radarLatency, 0) }) }
      : quality.state === 'path-observations-available' && loss !== null
        ? { id: 'quality', status: 'info', value: t('board.quality.value', { delivered: formatNumber(100 - loss, 1), rtt: rtt === null ? '—' : formatNumber(rtt, 0) }), hint: t('board.quality.hint') }
        : { id: 'quality', status: 'unknown', value: t('board.quality.unknown'), hint: t('board.quality.hint') },
    {
      id: 'shutdown',
      status: shutdown.state === 'nationwide-shutdown-established' ? 'bad' : 'unknown',
      value: t(`board.shutdown.${shutdown.state}`),
      hint: t('board.shutdown.hint'),
    },
  ];
  return `<dl class="status-row">${items.map((item) => `
    <div data-status="${item.status}"><dt>${escapeHtml(t(`board.row.${item.id}`))}</dt><dd>${escapeHtml(item.value)}</dd><small>${escapeHtml(item.hint)}</small></div>`).join('')}
  </dl>`;
}

function renderHero(interpretation) {
  const summary = interpretation.summary;
  const hero = document.querySelector('#current-situation');
  const selection = interpretation.selection ?? {};
  const period = selection.since && selection.until ? `${formatDay(selection.since)} – ${formatDay(selection.until)}` : '';
  const latest = summary.latestObservation ? t('board.latest', { date: formatDay(summary.latestObservation) }) : '';
  hero.dataset.headline = summary.headline?.state ?? summary.state;
  hero.innerHTML = `
    <header class="situation-top">
      <span class="section-label">${escapeHtml(t('board.kicker'))}</span>
      <p class="situation-scope"><strong><bdi>${escapeHtml(networkLabel(interpretation))}</bdi></strong>${period ? ` · <bdi>${escapeHtml(period)}</bdi>` : ''}${latest ? ` · <bdi>${escapeHtml(latest)}</bdi>` : ''}</p>
      <h1 id="situation-headline">${escapeHtml(headlineText(summary, interpretation.services))}</h1>
      <p class="situation-lede">${escapeHtml(ledeText(interpretation))}</p>
    </header>
    ${renderServiceTiles(interpretation.services, selection)}
    ${statusRow(interpretation)}`;
}

function meaningSentences(interpretation) {
  const { services, dimensions } = interpretation;
  const names = (ids) => listOf(ids.map((id) => brandName(id, services)));
  const sentences = [];
  if (services?.blocked?.length) sentences.push(t('meaning.blocked', { services: names(services.blocked) }));
  if (services?.restricted?.length) sentences.push(t('meaning.restricted', { services: names(services.restricted) }));
  if (!services?.blocked?.length && !services?.restricted?.length && services?.reachable?.length) {
    sentences.push(t('meaning.reachable', { services: names(services.reachable) }));
  }
  if (services?.state === 'untested' && services.visible?.length) {
    sentences.push(t('meaning.untested', { services: names(services.visible.map((item) => item.id)) }));
  }
  const connection = connectionState(dimensions.connectivity);
  const loss = evidenceValue(dimensions.quality, 'packet-loss-percent');
  sentences.push(connection === 'none' && loss !== null ? t('meaning.connection.fine', { delivered: formatNumber(100 - loss, 1) })
    : connection === 'none' ? t('meaning.connection.noOutage')
      : connection === 'signals' ? plural('meaning.connection.signals', dimensions.connectivity.eventCount ?? 0)
        : t(`meaning.connection.${connection}`));
  const radarLatency = evidenceValue(dimensions.quality, 'latency-ms');
  const radarDownload = evidenceValue(dimensions.quality, 'download-mbps');
  if (radarLatency !== null) {
    sentences.push(t('meaning.quality.user', {
      download: radarDownload === null ? '—' : formatNumber(radarDownload, 1),
      latency: formatNumber(radarLatency, 0),
    }));
  }
  const vantage = services?.vantage;
  const dominant = vantage?.dominantMechanism;
  const sampled = services?.visible?.[0];
  if (dominant?.code && dominant.count && sampled) {
    // The sample belongs to one service, so the sentence names it.
    sentences.push(t(`meaning.mechanism.${dominant.code}`, {
      service: brandName(sampled.id, services),
      count: formatNumber(dominant.count), affected: formatNumber(vantage.affected ?? dominant.count),
    }));
  }
  if (vantage?.runs) {
    const window = windowDays(interpretation.selection);
    sentences.push(t(vantage.bounded ? 'meaning.vantage.atLeast' : 'meaning.vantage.exact', {
      runs: formatNumber(vantage.runs),
      days: formatNumber(vantage.observedDays),
      window: window ? formatNumber(window) : formatNumber(vantage.observedDays),
    }));
  }
  sentences.push(t('meaning.basis'));
  return sentences;
}

function renderMeaning(interpretation) {
  const element = document.querySelector('#user-meaning');
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('meaning.kicker'))}</span><h2>${escapeHtml(t('meaning.title'))}</h2></header>
    ${meaningSentences(interpretation).map((sentence) => `<p class="meaning-line">${escapeHtml(sentence)}</p>`).join('')}`;
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

function renderUnknowns(interpretation) {
  const element = document.querySelector('#current-unknowns');
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('interpretation.unknowns.kicker'))}</span><h2>${escapeHtml(t('interpretation.unknowns.title'))}</h2></header>
    <p>${escapeHtml(t('interpretation.unknowns.intro'))}</p>
    <ul class="unknown-list">${(interpretation.unknowns ?? []).map((item) => `<li>${escapeHtml(t(`interpretation.unknown.${item}`))}</li>`).join('')}</ul>`;
}

function renderEvidenceOverview(assessment) {
  const element = document.querySelector('#evidence-overview');
  const interpretation = assessment.interpretation;
  const dimensions = Object.values(interpretation.dimensions);
  element.innerHTML = `<header><span class="section-label">${escapeHtml(t('interpretation.evidence.kicker'))}</span><h2>${escapeHtml(t('interpretation.evidence.title'))}</h2></header>
    <p>${escapeHtml(t('interpretation.evidence.intro'))}</p>
    <div class="evidence-matrix">${dimensions.map((dimension) => `
      <div><strong>${escapeHtml(t(`interpretation.${dimension.id}.title`))}</strong><span>${escapeHtml(t(`interpretation.coverage.${dimension.coverage}`))}</span><small>${escapeHtml(dimension.availableSources.join(' · ') || t('interpretation.noUsableSources'))}</small></div>`).join('')}</div>
    <p class="method-boundary">${escapeHtml(assessment.methodologicalBoundary)}</p>`;
}

let lastAssessment = null;
let lastViewState = 'loading';

function renderSituation(assessment, state = assessment ? 'ready' : 'loading') {
  lastAssessment = assessment || null;
  lastViewState = state;
  insertViews();
  translateStaticView();
  const interpretation = assessment?.interpretation;
  const valid = interpretation?.schemaVersion === 1 && interpretation.summary &&
    ['connectivity', 'interference', 'routing', 'quality', 'shutdown'].every((id) => interpretation.dimensions?.[id]);
  for (const selector of ['#overview-details-head', '#interpretation-dimensions', '.overview-lower-grid', '#current-findings', '#evidence-overview', '.overview-more']) {
    document.querySelector(selector).hidden = !valid;
  }
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
