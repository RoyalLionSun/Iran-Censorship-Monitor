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
  const unaligned = dimension.id === 'routing' && dimension.timeAlignment === 'unknown' && dimension.state !== 'insufficient-data';
  return `interpretation.${dimension.id}.meaning.${dimension.state}${unaligned ? '-unaligned' : ''}`;
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
      <p>${escapeHtml(t(meaningKey(dimension)))}</p>
      <dl>${metadata.map(([label, value]) => `<div><dt>${escapeHtml(t(`interpretation.axis.${label}`))}</dt><dd>${escapeHtml(t(`interpretation.${label}.${value}`))}</dd></div>`).join('')}</dl>
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

const NAMED_HEADLINES = ['services-blocked', 'services-restricted', 'services-reachable', 'services-untested'];

function headlineText(summary, services) {
  const headline = summary.headline;
  if (!headline) return t(`interpretation.summary.${summary.state}.headline`);
  const names = headline.services.map((id) => brandName(id, services));
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

function countryLine(country, item) {
  const key = { blocked: 'board.country.blocked', restricted: 'board.country.restricted', reachable: 'board.country.reachable' }[country.status];
  return `<li class="tile-country">${escapeHtml(t(key, {
    confirmed: formatNumber(country.confirmed), count: formatNumber(country.anomalous), total: formatNumber(country.measurements),
  }))}</li>`;
}

function renderServiceTiles(services, selection, connectivity = null) {
  if (!services) return '';
  const items = services.visible ?? services.items;
  const title = services.scoped ? t('board.services.selected') : t('board.services.title');
  // During a nationwide outage the volunteers' probes are cut off too: a missing test is a
  // consequence of the outage, not a gap that could hide a working service.
  const sparse = items.some((item) => ['untested', 'unclear', 'unavailable'].includes(item.status) && !item.country);
  const note = services.stale?.since ? t('board.services.staleNote')
    : nationwidePeriod(connectivity) && sparse ? t('board.services.outageNote')
      : t('board.services.note');
  return `
    <section class="service-board" aria-labelledby="service-board-title">
      <header><h2 id="service-board-title">${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p></header>
      ${items.length ? `<div class="service-tiles">${items.map((item) => {
        // Without a usable test in this network, the tile answers with the result across Iran,
        // labelled as such, instead of stopping at "not tested".
        const country = ['untested', 'unclear'].includes(item.status) ? item.country : null;
        const status = country ? country.status : item.status;
        return `
        <article class="service-tile" data-status="${escapeHtml(status)}"${country ? ' data-scope="country"' : ''}>
          <div class="service-tile-head"><span class="status-mark" aria-hidden="true"></span><h3 class="${item.id === 'selected-target' ? 'technical-ltr' : ''}">${escapeHtml(brandName(item.id, services))}</h3></div>
          <b class="service-tile-status">${escapeHtml(country ? t(`board.country.status.${country.status}`) : t(`board.status.${item.status}`))}</b>
          <ul>${country ? countryLine(country, item) : ''}${country && item.web?.status === 'untested' ? '' : channelLine(item.web, 'web')}${channelLine(item.app, 'app')}${mechanismLine(item)}${coverageLine(item, selection)}</ul>
        </article>`;
      }).join('')}
      </div>` : `<p class="service-board-empty">${escapeHtml(t('board.services.noneInSelection'))}</p>`}
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
    tooltip.textContent = `${formatDay(row.date)} · ${parts.join(' · ')}`;
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
      hint: periodHint(connectivity) ?? t('board.connection.hint'),
    },
    radarLatency !== null
      // Real user traffic in this network says more to a reader than a probe ping.
      ? { id: 'quality', status: 'info',
        hint: [duringOutage ? t('board.quality.duringOutage') : range ? t('board.quality.userRange', { low: formatNumber(range.latency.low, 0), high: formatNumber(range.latency.high, 0) }) : t('board.quality.userHint'),
          qualityDaysNote(quality, interpretation.selection)].filter(Boolean).join(' · '),
        value: t('board.quality.user', { download: radarDownload === null ? '—' : formatNumber(radarDownload, 1), latency: formatNumber(radarLatency, 0) }) }
      : quality.state === 'path-observations-available' && loss !== null
        ? { id: 'quality', status: 'info', value: t('board.quality.value', { delivered: formatNumber(100 - loss, 1), rtt: rtt === null ? '—' : formatNumber(rtt, 0) }), hint: t('board.quality.hint') }
        : { id: 'quality', status: 'unknown', value: t('board.quality.unknown'), hint: t('board.quality.hint') },
    {
      id: 'shutdown',
      // Measured nationwide impact without a confirmed record is neither "established" nor
      // "not confirmed" to a reader looking at a traffic line at zero; say what was measured.
      status: shutdown.state === 'nationwide-shutdown-established' ? 'bad' : connectivity.severity === 'widespread' ? 'warn' : 'unknown',
      value: shutdown.state !== 'nationwide-shutdown-established' && connectivity.severity === 'widespread'
        ? t('board.shutdown.measured') : t(`board.shutdown.${shutdown.state}`),
      // Name the missing access or the curated record instead of a generic caveat.
      hint: shutdown.evidence?.some((item) => item.source === 'Internet Society Pulse' && item.state === 'token-required')
        ? t('board.shutdown.missingAccess')
        : shutdown.contextEvent && shutdown.state !== 'nationwide-shutdown-established'
          ? t('board.shutdown.context', {
            verification: t(`board.shutdown.verification.${shutdown.contextEvent.verificationLevel ?? 'unconfirmed'}`),
            from: formatDay(shutdown.contextEvent.startDate), to: formatDay(shutdown.contextEvent.endDate),
          })
          : t('board.shutdown.hint'),
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
  const stale = interpretation.services?.stale?.since ?? null;
  hero.dataset.headline = summary.headline?.state ?? summary.state;
  hero.dataset.stale = stale ? 'yes' : 'no';
  hero.innerHTML = `
    <header class="situation-top">
      <span class="section-label">${escapeHtml(stale ? t('board.kicker.stale') : t('board.kicker'))}</span>
      <p class="situation-scope"><strong><bdi>${escapeHtml(networkLabel(interpretation))}</bdi></strong>${period ? ` · <bdi>${escapeHtml(period)}</bdi>` : ''}${latest ? ` · <bdi>${escapeHtml(latest)}</bdi>` : ''}${stale ? ` · <bdi class="scope-stale">${escapeHtml(t('board.stale.since', { date: formatDateTime(stale) }))}</bdi>` : ''}</p>
      <h1 id="situation-headline">${escapeHtml(headlineText({ ...summary, headline: summary.headline && { ...summary.headline, period: nationwidePeriod(interpretation.dimensions.connectivity) } }, interpretation.services))}</h1>
      <p class="situation-lede">${escapeHtml(ledeText(interpretation))}</p>
    </header>
    ${renderServiceTiles(interpretation.services, selection, interpretation.dimensions.connectivity)}
    ${statusRow(interpretation)}
    ${renderOutageTraffic(interpretation)}`;
  bindOutageChart(hero, interpretation);
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
  if (services?.countryBlocked?.length) {
    sentences.push(t('meaning.countryBlocked', { services: names(services.countryBlocked) }));
  }
  if (services?.state === 'untested' && services.visible?.length) {
    sentences.push(t('meaning.untested', { services: names(services.visible.map((item) => item.id)) }));
  }
  const connection = connectionState(dimensions.connectivity);
  const loss = evidenceValue(dimensions.quality, 'packet-loss-percent');
  // A dated nationwide outage says more than the generic sentence, and stays true once it ended.
  if (!nationwidePeriod(dimensions.connectivity)) sentences.push(connection === 'none' && loss !== null ? t('meaning.connection.fine', { delivered: formatNumber(100 - loss, 1) })
    : connection === 'none' ? t('meaning.connection.noOutage')
      : connection === 'signals' ? plural('meaning.connection.signals', dimensions.connectivity.eventCount ?? 0)
        : t(`meaning.connection.${connection}`));
  const period = nationwidePeriod(dimensions.connectivity);
  if (period) {
    sentences.push(period.end
      ? t('meaning.outage.period', { from: formatDay(period.start), to: formatDay(period.end) })
      : t('meaning.outage.periodOngoing', { from: formatDay(period.start) }));
    const traffic = dimensions.connectivity.outageTraffic;
    if (traffic) {
      sentences.push(t('meaning.outage.depth', { lowest: formatPercent(traffic.lowestPercent), typical: formatPercent(traffic.typicalPercent) }));
      // A remainder of traffic says nothing about who could still connect; say so plainly.
      if (traffic.lowestPercent > 0) sentences.push(t('meaning.outage.residual'));
      if (traffic.afterPercent !== null) sentences.push(t('meaning.outage.after', { after: formatPercent(traffic.afterPercent) }));
      const own = traffic.network;
      if (own) {
        sentences.push(t(own.afterPercent !== null ? 'meaning.outage.network' : 'meaning.outage.networkOngoing', {
          network: networkLabel(interpretation), typical: formatPercent(own.typicalPercent), after: formatPercent(own.afterPercent),
        }));
      }
    }
    // A restored connection is not open access.
    if (period.endedInWindow && (services?.blocked?.length || services?.restricted?.length)) sentences.push(t('meaning.outage.notOpen'));
  }
  const radarLatency = evidenceValue(dimensions.quality, 'latency-ms');
  const radarDownload = evidenceValue(dimensions.quality, 'download-mbps');
  const inOutage = Boolean(nationwidePeriod(dimensions.connectivity) && !nationwidePeriod(dimensions.connectivity).endedInWindow);
  if (radarLatency !== null && !inOutage) {
    const range = dimensions.quality.typicalRange;
    sentences.push(t(range?.latency?.low != null ? 'meaning.quality.userRange' : 'meaning.quality.user', {
      download: radarDownload === null ? '—' : formatNumber(radarDownload, 1),
      latency: formatNumber(radarLatency, 0),
      low: range?.latency?.low != null ? formatNumber(range.latency.low, 0) : '—',
      high: range?.latency?.high != null ? formatNumber(range.latency.high, 0) : '—',
    }));
  }
  const shutdown = dimensions.shutdown;
  if (shutdown.state === 'nationwide-shutdown-established' && shutdown.establishedEvent) {
    sentences.push(t('meaning.shutdown.established', {
      from: formatDay(shutdown.establishedEvent.startDate), to: formatDay(shutdown.establishedEvent.endDate),
    }));
  } else if (shutdown.contextEvent) {
    sentences.push(t('meaning.shutdown.context', {
      verification: t(`board.shutdown.verification.${shutdown.contextEvent.verificationLevel ?? 'unconfirmed'}`),
      from: formatDay(shutdown.contextEvent.startDate), to: formatDay(shutdown.contextEvent.endDate),
    }));
    if (shutdown.contextComparison === 'radar-no-nationwide-outage') sentences.push(t('meaning.shutdown.radarNone'));
    if (shutdown.contextComparison === 'radar-dates-differ') sentences.push(t('meaning.shutdown.radarDiffers'));
  }
  const scope = services?.networkScope;
  if (scope?.measured) {
    const service = scope.serviceId ? brandName(scope.serviceId, services) : scope.domain;
    if (scope.blocked > 0) sentences.push(t('meaning.networks.blocked', { service, blocked: formatNumber(scope.blocked), measured: formatNumber(scope.measured) }));
    else if (scope.restricted > 0) sentences.push(t('meaning.networks.restricted', { service, restricted: formatNumber(scope.restricted), measured: formatNumber(scope.measured) }));
    if (scope.reachable > 0 && (scope.blocked > 0 || scope.restricted > 0)) {
      sentences.push(t('meaning.networks.reachable', { service, reachable: formatNumber(scope.reachable) }));
    }
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
  const foreign = interpretation.summary?.foreignExcluded;
  if (foreign?.measurements) {
    sentences.push(t('meaning.foreignExcluded', { count: formatNumber(foreign.measurements), networks: foreign.networks.join(', ') }));
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
