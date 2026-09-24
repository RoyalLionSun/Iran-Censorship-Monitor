import { getLanguage, localeFor, setLanguage, t } from './i18n.js';
import { SERVICE_BRANDS, summarizeMessagingAppTests, summarizeServiceFindings } from './service-findings.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  config: null,
  overview: null,
  circumvention: null,
  providers: null,
  targets: null,
  routingUpdates: null,
  ooniDomains: null,
  showAllOoniDomains: false,
  selectedOoniDomain: null,
  ooniDomainDetails: null,
  ooniDomainDetailsError: null,
  ooniDomainDetailsLoading: false,
  ooniDomainDetailsRequest: 0,
  loading: false,
  requestSerial: 0,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function number(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  // Numbers in the reader's language (Persian digits in Farsi), like the Overview.
  return Number(value).toLocaleString(localeFor(), { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function percent(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${number(value, digits)}%`;
}

function dateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

function shortDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function ageLabel(value) {
  if (!value) return '—';
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.max(0, Math.round(diff / 60_000));
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

async function api(path, signal) {
  const response = await fetch(path, { signal, headers: { accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  // Without a connection the offline copy answers (sw.js); the page says from when it is.
  if (path.startsWith('/api/overview')) showOfflineCopy(response.headers.get('x-offline-copy') ? payload.fetchedAt || response.headers.get('x-offline-copy') : null);
  return payload;
}

// A returning reader sees the last saved state of the same view at once, marked "updating",
// instead of waiting for OONI; the fresh answer replaces it as soon as it arrives.
async function showSavedCopy(serial, path) {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open('icm-offline-v1');
    const saved = await cache.match(new URL(path, location.origin).href, { ignoreVary: true });
    if (!saved || serial !== state.requestSerial || state.freshSerial === serial) return;
    const overview = await saved.json();
    if (serial !== state.requestSerial || state.freshSerial === serial || !overview?.assessment) return;
    publishOverview('ready', overview.assessment, overview.dataPaths ?? null);
    renderOverview(overview);
    const banner = $('#offline-banner');
    if (banner && state.freshSerial !== serial) {
      const date = Date.parse(overview.fetchedAt ?? '');
      const when = Number.isFinite(date) ? new Intl.DateTimeFormat(document.documentElement.lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) : '';
      banner.textContent = t('ui.savedCopyUpdating', { date: when });
      banner.dataset.kind = 'updating';
      banner.hidden = false;
    }
  } catch { /* no saved copy */ }
}

function showOfflineCopy(savedAt) {
  const banner = $('#offline-banner');
  if (!banner) return;
  banner.hidden = !savedAt;
  banner.dataset.kind = savedAt ? 'offline' : '';
  if (!savedAt) return;
  const date = Date.parse(savedAt);
  const when = Number.isFinite(date)
    ? new Intl.DateTimeFormat(document.documentElement.lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)
    : savedAt;
  banner.textContent = t('ui.offlineCopy', { date: when });
}

function queryString() {
  const params = new URLSearchParams({
    asn: $('#asn-select').value,
    testName: $('#test-select').value,
    since: $('#since-input').value,
    until: $('#until-input').value,
  });
  if ($('#test-select').value === 'web_connectivity' && $('#target-select').value) params.set('target', $('#target-select').value);
  return params.toString();
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 120;

// A selection lives in the URL, so a view can be shared and reopened exactly as it was.
function applyUrlState() {
  const params = new URLSearchParams(window.location.search);
  const pick = (selector, value) => {
    const element = $(selector);
    if (!value || ![...element.options].some((option) => option.value === value)) return false;
    element.value = value;
    return true;
  };
  // A network outside the curated list (for example opened from the per-network table) is added.
  const asn = params.get('asn');
  if (asn && /^AS\d{1,10}$/.test(asn) && ![...$('#asn-select').options].some((option) => option.value === asn)) {
    $('#asn-select').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(asn)}">${escapeHtml(asn)}</option>`);
  }
  pick('#asn-select', asn);
  if (pick('#test-select', params.get('testName'))) updateTargetVisibility();
  pick('#target-select', params.get('target'));
  const since = params.get('since');
  const until = params.get('until');
  if (ISO_DAY.test(since ?? '') && ISO_DAY.test(until ?? '') && since <= until) {
    $('#since-input').value = since;
    $('#until-input').value = until;
    markPreset(null);
  }
  const language = params.get('lang');
  if (['en', 'fa'].includes(language) && language !== getLanguage()) setLanguage(language, { persist: false });
}

function writeUrlState() {
  const params = new URLSearchParams(queryString());
  if (getLanguage() !== 'en') params.set('lang', getLanguage());
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'technical') params.set('view', view);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

// Nationwide outages Radar has dated, so a reader can open one without knowing its dates.
async function loadOutageHistory() {
  try {
    const result = await api('/api/outages');
    state.outages = result?.ok && Array.isArray(result.outages) ? result.outages : [];
    state.outageEpisodes = result?.ok && Array.isArray(result.episodes) ? result.episodes : [];
  } catch {
    state.outages = [];
    state.outageEpisodes = [];
  }
  renderOutageOptions();
}

function outageLabel(outage) {
  const format = new Intl.DateTimeFormat(localeFor(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const causeKey = `outages.cause.${outage.cause}`;
  const cause = t(causeKey) === causeKey ? t('outages.cause.UNKNOWN') : t(causeKey);
  const start = format.format(Date.parse(outage.start));
  const end = outage.end ? format.format(Date.parse(outage.end)) : t('outages.ongoing');
  return `${start === end ? start : `${start} – ${end}`} · ${cause}`;
}

function episodeLabel(episode) {
  const format = new Intl.DateTimeFormat(localeFor(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const causeKey = `outages.cause.${episode.cause}`;
  const cause = t(causeKey) === causeKey ? t('outages.cause.UNKNOWN') : t(causeKey);
  const start = format.format(Date.parse(episode.start));
  const end = format.format(Date.parse(episode.end));
  const range = start === end ? start : `${start} – ${end}`;
  const who = episode.networks?.length ? episode.networks.join(', ') : t(`outages.scope.${episode.scope}`);
  return `${range} · ${who} · ${t(episode.days === 1 ? 'outages.shutdowns.one' : 'outages.shutdowns.other', { count: episode.days })} · ${cause}`;
}

function renderOutageOptions() {
  const picker = $('#outage-picker');
  const select = $('#outage-select');
  if (!picker || !select) return;
  const outages = state.outages ?? [];
  const episodes = state.outageEpisodes ?? [];
  picker.hidden = !outages.length && !episodes.length;
  const current = select.value;
  // Nationwide outages first; shutdowns of single networks or regions, such as the 2022
  // mobile curfews, in their own group.
  select.innerHTML = `<option value="">${escapeHtml(t('outages.choose'))}</option>`
    + (outages.length ? `<optgroup label="${escapeHtml(t('outages.group.nationwide'))}">${outages.map((outage, index) => `<option value="n${index}">${escapeHtml(outageLabel(outage))}</option>`).join('')}</optgroup>` : '')
    + (episodes.length ? `<optgroup label="${escapeHtml(t('outages.group.networks'))}">${episodes.map((episode, index) => `<option value="e${index}">${escapeHtml(episodeLabel(episode))}</option>`).join('')}</optgroup>` : '');
  select.value = current;
}

// The week before shows the normal level, the week after what came back; the range stays
// inside the selectable limit.
function selectOutage(outage) {
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const since = Math.floor(Date.parse(outage.start) / DAY_MS) * DAY_MS - 7 * DAY_MS;
  const end = outage.end ? Date.parse(outage.end) : Date.now();
  const until = Math.min(Math.floor(end / DAY_MS) * DAY_MS + 7 * DAY_MS, today, since + (MAX_RANGE_DAYS - 1) * DAY_MS);
  $('#since-input').value = new Date(since).toISOString().slice(0, 10);
  $('#until-input').value = new Date(until).toISOString().slice(0, 10);
  markPreset(null);
  loadAll();
}

function setLoading(value) {
  state.loading = value;
  $('#refresh-button').disabled = value;
  $('#refresh-button').textContent = value ? 'Loading…' : 'Refresh';
  $('#ooni-panel').classList.toggle('loading-shimmer', value);
  $('#ripe-panel').classList.toggle('loading-shimmer', value);
  $('#radar-panel').classList.toggle('loading-shimmer', value);
  $('#ioda-panel').classList.toggle('loading-shimmer', value);
  $('#tor-panel').classList.toggle('loading-shimmer', value);
  $('#routing-panel').classList.toggle('loading-shimmer', value);
  $('#censoredplanet-panel').classList.toggle('loading-shimmer', value);
  $('#globalping-panel').classList.toggle('loading-shimmer', value);
  if (value) $('#ooni-query-state').textContent = 'Requesting live sources';
}

function stateDot(element, status) {
  element.className = 'state-dot ' + (status === 'ok' || status === 'observed' ? 'ok' : status === 'warn' || status === 'partial' || status === 'token_required' ? 'warn' : status === 'error' ? 'error' : 'neutral');
}

function renderConfig(config) {
  const select = $('#asn-select');
  select.innerHTML = '<option value="ALL">All networks in Iran</option>' + config.asns.map((item) => `<option value="${escapeHtml(item.asn)}">${escapeHtml(item.asn)} · ${escapeHtml(item.name)}</option>`).join('');
  select.value = 'AS58224';
  $('#since-input').value = config.defaultRange.since;
  $('#until-input').value = config.defaultRange.until;
  renderSources(config.sources, config.radarConfigured);
  renderIntelligenceSourceRegistry(config.intelligenceSources || []);
}

function renderSources(sources, radarConfigured) {
  $('#source-grid').innerHTML = sources.map((source) => {
    const access = source.id === 'radar' && !radarConfigured ? 'token not configured' : source.access;
    return `<div class="source-card"><div class="source-card-head"><strong>${escapeHtml(source.name)}</strong><span class="access">${escapeHtml(access)}</span></div><p>${escapeHtml(source.role)}</p><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open source ↗</a>${source.docs ? ` · <a href="${escapeHtml(source.docs)}" target="_blank" rel="noreferrer">Docs ↗</a>` : ''}</div>`;
  }).join('');
}

function renderIntelligenceSourceRegistry(sources) {
  $('#intelligence-source-grid').innerHTML = sources.map((source)=>`<a class="intelligence-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(source.role)}"><strong>${escapeHtml(source.name)}</strong><span>${escapeHtml(source.class)}</span></a>`).join('');
}

function updateTargetVisibility() {
  const web = $('#test-select').value === 'web_connectivity';
  $('#target-field').classList.toggle('hidden', !web);
  $('#target-select').disabled = !web;
  if (!web) $('#target-select').value = '';
}

function setPreset(days) {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  $('#since-input').value = since.toISOString().slice(0, 10);
  $('#until-input').value = until.toISOString().slice(0, 10);
}

function markPreset(button) {
  $$('.presets button').forEach((item) => item.classList.toggle('active', item === button));
}

function pathFor(values, x, y) {
  let path = '';
  let open = false;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) { open = false; return; }
    const command = open ? 'L' : 'M';
    path += `${command}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
    open = true;
  });
  return path.trim();
}

function chartLabels(points, x, bottomY) {
  if (!points.length) return '';
  const step = Math.max(1, Math.ceil(points.length / 6));
  return points.map((point, index) => index % step === 0 || index === points.length - 1 ? `<text x="${x(index)}" y="${bottomY}" text-anchor="middle" fill="#6f8094" font-size="9">${escapeHtml(shortDate(point.date))}</text>` : '').join('');
}

function renderOoniChart(ooni) {
  const el = $('#ooni-chart');
  if (!ooni?.ok || !ooni.points?.length) {
    el.className = 'chart large-chart empty-chart';
    el.innerHTML = `<span>${escapeHtml(ooni?.warning || ooni?.error || 'No OONI measurements returned for this selection.')}</span>`;
    $('#ooni-methods').innerHTML = '';
    return;
  }
  el.className = 'chart large-chart';
  const data = ooni.points;
  const W = 920, H = 285, L = 42, R = 18, T = 32, B = 34;
  const innerW = W - L - R, innerH = H - T - B;
  const x = (index) => L + (data.length === 1 ? innerW / 2 : index * innerW / (data.length - 1));
  const yRate = (value) => T + innerH - (Math.max(0, Math.min(100, value)) / 100) * innerH;
  const maxVolume = Math.max(...data.map((row) => row.measurements || 0), 1);
  const barWidth = Math.max(2, Math.min(18, innerW / Math.max(data.length, 1) * .58));
  const bars = data.map((row, index) => {
    const height = (row.measurements / maxVolume) * innerH * .58;
    return `<rect x="${x(index) - barWidth / 2}" y="${T + innerH - height}" width="${barWidth}" height="${height}" rx="2" fill="#59a8ff" opacity=".16"><title>${escapeHtml(row.date)} · ${row.measurements} measurements</title></rect>`;
  }).join('');
  const grid = [0,25,50,75,100].map((tick) => `<line x1="${L}" x2="${W-R}" y1="${yRate(tick)}" y2="${yRate(tick)}" stroke="#263445" stroke-width="1"/><text x="${L-8}" y="${yRate(tick)+3}" text-anchor="end" fill="#6f8094" font-size="9">${tick}%</text>`).join('');
  const values = data.map((row) => Number.isFinite(row.anomalyRate) ? row.anomalyRate : null);
  const path = pathFor(values, x, yRate);
  const dots = data.map((row, index) => row.anomalyRate === null ? '' : `<circle cx="${x(index)}" cy="${yRate(row.anomalyRate)}" r="2.8" fill="#ef6d6d" stroke="#121b27" stroke-width="1.5"><title>${escapeHtml(row.date)} · ${row.anomalyRate}% anomalies · ${row.measurements} measurements · ${row.confirmed} confirmed</title></circle>`).join('');
  el.innerHTML = `${ooni.truncatedAtApiLimit ? '<span class="chart-truncated">API ROW LIMIT REACHED · RATE NOT USED FOR ASSESSMENT</span>' : ''}<div class="chart-legend"><span><i class="legend-key bar"></i>measurement volume</span><span><i class="legend-key anomaly"></i>anomaly rate</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="OONI anomaly timeline">${grid}${bars}<path d="${path}" fill="none" stroke="#ef6d6d" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>${dots}${chartLabels(data,x,H-8)}</svg>`;

  const methodCounts = new Map();
  for (const point of data) for (const method of point.methods || []) methodCounts.set(method.label, (methodCounts.get(method.label) || 0) + method.count);
  $('#ooni-methods').innerHTML = [...methodCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([label,count]) => `<span class="method-chip"><i></i>${escapeHtml(label)} <b>${count}×</b></span>`).join('') || '<span class="method-chip">No safely inferable mechanism fields in returned rows</span>';
}

function renderDivergence(assessment) {
  const item = assessment?.controlDataPlane;
  const box = $('#divergence-card');
  $('#divergence-panel').dataset.finding = item?.classification === 'control-data-plane-divergence' ? 'warn' : item && item.classification !== 'insufficient-data' ? 'info' : 'unknown';
  if (!item || item.classification === 'insufficient-data') {
    $('#divergence-state').textContent = 'Insufficient data';
    box.dataset.state = 'neutral';
    box.innerHTML = '<div class="empty-state">No defensible control/data-plane comparison is available for this scope.</div>';
    return;
  }
  const diverged = item.classification === 'control-data-plane-divergence';
  $('#divergence-state').textContent = diverged ? 'Divergence detected' : 'No broad divergence established';
  box.dataset.state = diverged ? 'warning' : 'neutral';
  box.innerHTML = `<div class="posture-head"><strong>${escapeHtml(diverged ? 'Routes are visible while a broad Radar disruption annotation is present' : 'No broad, time-aligned routing/data-plane split established')}</strong><span>${escapeHtml(item.classification)}</span></div><div class="posture-metrics"><div><span>BGP visibility</span><b>${item.bgpVisibilityPercent===null?'—':percent(item.bgpVisibilityPercent)}</b></div><div><span>RIPE loss</span><b>${item.ripePacketLossPercent===null?'—':percent(item.ripePacketLossPercent)}</b></div><div><span>IODA events</span><b>${number(item.iodaOutageEvents,0)}</b></div><div><span>Radar events</span><b>${number(item.radarDisruptionEvents,0)}</b></div></div><p>${escapeHtml(item.interpretation)}</p>`;
}

function renderRouting(ripestat) {
  const summary = $('#routing-summary');
  const neighbours = $('#routing-neighbours');
  const button = $('#load-bgp-updates');
  if (!ripestat || ripestat.status === 'scope_required') {
    summary.innerHTML = '<div class="mini-stat"><span>Status</span><b>Select ASN</b></div>';
    neighbours.innerHTML = '<tr><td colspan="4" class="table-empty">Select a specific ASN for RIPE RIS routing context.</td></tr>';
    button.disabled = true;
    return;
  }
  if (!ripestat.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${escapeHtml(ripestat.error || 'Unavailable')}</b></div>`;
    neighbours.innerHTML = '<tr><td colspan="4" class="table-empty">Routing context unavailable.</td></tr>';
    button.disabled = true;
    return;
  }
  button.disabled = false;
  const routing = ripestat.routing || {};
  const vis = routing.visibility || {};
  const space = routing.announcedSpace || {};
  summary.innerHTML = `<div class="mini-stat"><span>BGP visibility</span><b>${vis.percent===null || vis.percent===undefined?'—':percent(vis.percent)}</b></div><div class="mini-stat"><span>RIS peers</span><b>${number(vis.seeingPeers,0)} / ${number(vis.totalPeers,0)}</b></div><div class="mini-stat"><span>Announced IPv4</span><b>${number(space.ipv4Prefixes ?? ripestat.announcedPrefixes?.length,0)} prefixes</b></div><div class="mini-stat"><span>Observed neighbours</span><b>${number(routing.observedNeighbours?.length || 0,0)}</b></div>`;
  neighbours.innerHTML = routing.observedNeighbours?.length ? routing.observedNeighbours.slice(0,20).map((row)=>`<tr><td><strong>${escapeHtml(row.asn)}</strong></td><td>${number(row.power,3)}</td><td>${number(row.v4Peers,0)}</td><td>${number(row.v6Peers,0)}</td></tr>`).join('') : '<tr><td colspan="4" class="table-empty">No observed neighbours returned.</td></tr>';
}

function renderCensoredPlanet(cp) {
  const summary = $('#censoredplanet-summary');
  const events = $('#censoredplanet-events');
  if (!cp?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${escapeHtml(cp?.error || 'Unavailable')}</b></div>`;
    events.innerHTML = '<div class="empty-state">Censored Planet unavailable.</div>';
    return;
  }
  summary.innerHTML = `<div class="mini-stat"><span>Unexpected rate</span><b>${cp.iranUnexpectedRate===null?'—':percent(cp.iranUnexpectedRate)}</b></div><div class="mini-stat"><span>CenAlert points</span><b>${number(cp.timeseries?.length || 0,0)}</b></div><div class="mini-stat"><span>CenAlert events</span><b>${number(cp.events?.length || 0,0)}</b></div><div class="mini-stat"><span>Partial errors</span><b>${number(cp.partialErrors?.length || 0,0)}</b></div>`;
  events.innerHTML = cp.events?.length ? cp.events.slice().sort((a,b)=>String(b.peak||b.startDate).localeCompare(String(a.peak||a.startDate))).slice(0,8).map((row)=>`<div class="event-item"><span class="event-time">${escapeHtml(shortDate(row.peak || row.startDate))}</span><div class="event-copy"><strong>CenAlert · impact ${row.impact===null?'—':number(row.impact,2)}</strong><small>${escapeHtml([row.cause,row.reportedBy,row.startDate&&row.endDate?`${row.startDate} → ${row.endDate}`:null].filter(Boolean).join(' · ') || 'Behavioral anomaly')}</small></div><span class="event-source warn">CP</span></div>`).join('') : '<div class="empty-state">No CenAlert events returned for the selected window.</div>';
}

function renderGlobalping(globalping) {
  const summary = $('#globalping-summary');
  const table = $('#globalping-networks');
  if (!globalping?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${escapeHtml(globalping?.error || 'Unavailable')}</b></div>`;
    table.innerHTML = '<tr><td colspan="6" class="table-empty">Probe inventory unavailable.</td></tr>';
    return;
  }
  const cities = new Set((globalping.probes || []).map((p)=>p.city).filter(Boolean));
  const asnCount = new Set((globalping.probes || []).map((p)=>p.asn).filter(Boolean)).size;
  const eyeball = (globalping.probes || []).filter((p)=>p.tags?.some((tag)=>/eyeball/i.test(tag))).length;
  summary.innerHTML = `<div class="mini-stat"><span>Iran probes</span><b>${number(globalping.probeCount,0)}</b></div><div class="mini-stat"><span>ASNs covered</span><b>${number(asnCount,0)}</b></div><div class="mini-stat"><span>Cities observed</span><b>${number(cities.size,0)}</b></div><div class="mini-stat"><span>Eyeball probes</span><b>${number(eyeball,0)}</b></div>`;
  table.innerHTML = globalping.networks?.length ? globalping.networks.slice(0,20).map((row)=>`<tr><td><strong>${escapeHtml(row.asn)}</strong></td><td>${escapeHtml(row.network || '—')}</td><td>${number(row.probes,0)}</td><td>${escapeHtml((row.cities || []).join(', ') || '—')}</td><td>${number(row.eyeball,0)}</td><td>${number(row.datacenter,0)}</td></tr>`).join('') : '<tr><td colspan="6" class="table-empty">No matching Iran probes are currently visible for this scope.</td></tr>';
}

function renderProtocolMix(radar) {
  const el = $('#protocol-mix');
  const dimensions = radar?.protocolMix?.dimensions || {};
  const labels = { HTTP_PROTOCOL:'HTTP protocol', HTTP_VERSION:'HTTP version', IP_VERSION:'IP version', TLS_VERSION:'TLS version' };
  const cards = Object.entries(labels).map(([key,label]) => {
    const row = dimensions[key];
    if (!row || row.status !== 'observed') return `<div class="distribution-card"><strong>${escapeHtml(label)}</strong><span class="micro-note">No observed distribution</span></div>`;
    const values = Object.entries(row.values || {}).sort((a,b)=>b[1]-a[1]);
    return `<div class="distribution-card"><div class="distribution-head"><strong>${escapeHtml(label)}</strong><span>confidence ${row.confidenceLevel===null||row.confidenceLevel===undefined?'—':`L${number(row.confidenceLevel,0)}`}</span></div>${values.map(([name,value])=>`<div class="distribution-row"><span>${escapeHtml(name)}</span><progress max="100" value="${Math.max(0,Math.min(100,Number(value)))}"></progress><b>${percent(value)}</b></div>`).join('') || '<span class="micro-note">No values</span>'}</div>`;
  });
  el.innerHTML = radar?.status === 'token_required' ? '<div class="empty-state">Radar Read token required for protocol distributions.</div>' : cards.join('');
}

function renderTopology(peeringdb, ihr) {
  const summary = $('#topology-summary');
  const table = $('#hegemony-table');
  if (peeringdb?.status === 'scope_required' || ihr?.status === 'scope_required') {
    summary.innerHTML = '<div class="mini-stat"><span>Status</span><b>Select ASN</b></div>';
    table.innerHTML = '<tr><td colspan="4" class="table-empty">Select a specific ASN to inspect topology and transit dependency.</td></tr>';
    return;
  }
  const net = peeringdb?.networks?.[0];
  summary.innerHTML = `<div class="mini-stat"><span>Network</span><b>${escapeHtml(net?.name || peeringdb?.asn || '—')}</b></div><div class="mini-stat"><span>IX presence</span><b>${number(net?.ixCount,0)}</b></div><div class="mini-stat"><span>Facilities</span><b>${number(net?.facilityCount,0)}</b></div><div class="mini-stat"><span>IHR latest bin</span><b>${escapeHtml(ihr?.latestTimebin ? String(ihr.latestTimebin).slice(0,16).replace('T',' ') : '—')}</b></div>`;
  table.innerHTML = ihr?.dependencies?.length ? ihr.dependencies.slice(0,15).map((row)=>`<tr><td><strong>AS${number(row.transitAsn,0).replaceAll(',','')}</strong></td><td>${escapeHtml(row.transitName || '—')}</td><td>${number(row.hegemony,4)}</td><td>IPv${number(row.addressFamily,0)}</td></tr>`).join('') : `<tr><td colspan="4" class="table-empty">${escapeHtml(ihr?.error || 'No dependency rows returned.')}</td></tr>`;
}

function renderRipeChart(ripe) {
  const el = $('#ripe-chart');
  if (!ripe?.ok || !ripe.series?.length) {
    el.className = 'chart empty-chart';
    el.innerHTML = `<span>${escapeHtml(ripe?.note || ripe?.error || 'No RIPE Atlas observations returned.')}</span>`;
    $('#ripe-summary').innerHTML = '';
    return;
  }
  el.className = 'chart';
  const data = ripe.series;
  const W = 760, H = 235, L = 44, R = 42, T = 28, B = 32;
  const innerW = W-L-R, innerH = H-T-B;
  const x = (index) => L + (data.length === 1 ? innerW/2 : index * innerW/(data.length-1));
  const rttValues = data.map((row) => row.rttMs).filter(Number.isFinite);
  const rttMax = Math.max(...rttValues, 10) * 1.15;
  const yRtt = (value) => T + innerH - Math.max(0, value) / rttMax * innerH;
  const yLoss = (value) => T + innerH - Math.max(0, Math.min(100,value)) / 100 * innerH;
  const grid = [0,.25,.5,.75,1].map((fraction) => `<line x1="${L}" x2="${W-R}" y1="${T+innerH*fraction}" y2="${T+innerH*fraction}" stroke="#263445"/><text x="${L-7}" y="${T+innerH*fraction+3}" text-anchor="end" fill="#6f8094" font-size="9">${number(rttMax*(1-fraction),0)}</text><text x="${W-R+7}" y="${T+innerH*fraction+3}" fill="#6f8094" font-size="9">${number(100*(1-fraction),0)}%</text>`).join('');
  const rttPath = pathFor(data.map((r)=>r.rttMs),x,yRtt);
  const lossPath = pathFor(data.map((r)=>r.packetLossPercent),x,yLoss);
  const dots = data.map((row,index)=>`<circle cx="${x(index)}" cy="${row.rttMs===null?H-B:yRtt(row.rttMs)}" r="2.3" fill="#59a8ff"><title>${escapeHtml(row.date)} · RTT ${number(row.rttMs)} ms · loss ${percent(row.packetLossPercent)} · ${row.samples} samples</title></circle>`).join('');
  el.innerHTML = `<div class="chart-legend"><span><i class="legend-key"></i>RTT ms</span><span><i class="legend-key loss"></i>loss %</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="RIPE Atlas RTT and packet loss">${grid}<path d="${rttPath}" fill="none" stroke="#59a8ff" stroke-width="2.1"/><path d="${lossPath}" fill="none" stroke="#e2bd59" stroke-width="1.8" stroke-dasharray="5 4"/>${dots}${chartLabels(data,x,H-7)}</svg>`;
  const overall = ripe.overall || {};
  $('#ripe-summary').innerHTML = `<div class="mini-stat"><span>Active probes</span><b>${number(ripe.probeCount,0)}</b></div><div class="mini-stat"><span>Observed probes</span><b>${number(overall.observedProbes,0)}</b></div><div class="mini-stat"><span>Average RTT</span><b>${overall.averageRttMs===null?'—':number(overall.averageRttMs)+' ms'}</b></div><div class="mini-stat"><span>Samples</span><b>${number(overall.samples,0)}</b></div>`;
}

function renderRadarChart(radar) {
  const el = $('#radar-chart');
  if (!radar || radar.status === 'token_required') {
    el.className = 'chart empty-chart';
    el.innerHTML = '<span>Cloudflare Radar API token not configured. No Radar values are fabricated.</span>';
    $('#radar-summary').innerHTML = '<div class="mini-stat"><span>Traffic</span><b>Token required</b></div><div class="mini-stat"><span>Outages</span><b>Token required</b></div><div class="mini-stat"><span>BGP events</span><b>Token required</b></div><div class="mini-stat"><span>Access</span><b>Radar Read</b></div>';
    return;
  }
  const series = radar.traffic?.series || [];
  if (!series.length) {
    el.className = 'chart empty-chart';
    el.innerHTML = `<span>${escapeHtml(radar.traffic?.error || 'Radar returned no HTTP series for this window.')}</span>`;
  } else {
    el.className = 'chart';
    const W=760,H=235,L=44,R=18,T=28,B=32,innerW=W-L-R,innerH=H-T-B;
    const x=(i)=>L+(series.length===1?innerW/2:i*innerW/(series.length-1));
    const values=series.map((r)=>Number(r.value)).filter(Number.isFinite);
    let min=Math.min(...values), max=Math.max(...values); if (min===max) { min-=1; max+=1; }
    const y=(v)=>T+innerH-(v-min)/(max-min)*innerH;
    const grid=[0,.25,.5,.75,1].map((f)=>`<line x1="${L}" x2="${W-R}" y1="${T+innerH*f}" y2="${T+innerH*f}" stroke="#263445"/><text x="${L-7}" y="${T+innerH*f+3}" text-anchor="end" fill="#6f8094" font-size="9">${number(max-(max-min)*f,1)}</text>`).join('');
    const line=pathFor(series.map((r)=>Number.isFinite(Number(r.value))?Number(r.value):null),x,y);
    const radarMeta = radar.traffic?.meta || {};
    const confidence = radar.traffic?.confidenceLevel;
    const scope = radar.asn || 'IR';
    const interval = radarMeta.aggInterval || 'auto';
    const confidenceText = confidence === null || confidence === undefined ? 'n/a' : `L${number(confidence,0)}`;
    el.innerHTML=`<div class="chart-legend"><span><i class="legend-key radar"></i>Radar HTTP series · ${escapeHtml(scope)} · ${escapeHtml(interval)} · confidence ${escapeHtml(confidenceText)}</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cloudflare Radar HTTP series">${grid}<path d="${line}" fill="none" stroke="#52c9c4" stroke-width="2.2"/>${series.map((r,i)=>Number.isFinite(Number(r.value))?`<circle cx="${x(i)}" cy="${y(Number(r.value))}" r="2.3" fill="#52c9c4"><title>${escapeHtml(r.date)} · ${number(r.value,2)}</title></circle>`:'').join('')}${chartLabels(series.map(r=>({date:String(r.date).slice(0,10)})),x,H-7)}</svg>`;
  }
  $('#radar-summary').innerHTML = `<div class="mini-stat"><span>HTTP points</span><b>${number(radar.traffic?.series?.length || 0,0)}</b></div><div class="mini-stat"><span>Traffic anomalies</span><b>${number(radar.trafficAnomalies?.events?.length || 0,0)}</b></div><div class="mini-stat"><span>Outage annotations</span><b>${number(radar.outages?.annotations?.length || 0,0)}</b></div><div class="mini-stat"><span>BGP hijack events</span><b>${number(radar.bgp?.events?.length || 0,0)}</b></div>`;
}


function renderIodaChart(ioda) {
  const el = $('#ioda-chart');
  const series = (ioda?.series || []).filter((row) => row.points?.length);
  if (!ioda?.ok || !series.length) {
    el.className = 'chart empty-chart';
    el.innerHTML = `<span>${escapeHtml(ioda?.error || ioda?.partialErrors?.signals || 'IODA returned no plottable raw series for this selection.')}</span>`;
    $('#ioda-summary').innerHTML = `<div class="mini-stat"><span>Outage events</span><b>${number(ioda?.events?.length || 0,0)}</b></div><div class="mini-stat"><span>Series</span><b>${number(ioda?.series?.length || 0,0)}</b></div><div class="mini-stat"><span>Scope</span><b>${escapeHtml(ioda?.asn || 'IR')}</b></div><div class="mini-stat"><span>Status</span><b>${escapeHtml(ioda?.status || 'unavailable')}</b></div>`;
    return;
  }
  el.className = 'chart';
  const W=760,H=235,L=38,R=18,T=34,B=32,innerW=W-L-R,innerH=H-T-B;
  const colors=['#59a8ff','#52c9c4','#9d8cf2','#e2bd59'];
  const classes=['ioda-a','ioda-b','ioda-c','ioda-d'];
  const picked=series.slice(0,4);
  const longest=picked.reduce((best,row)=>row.points.length>best.points.length?row:best,picked[0]);
  const grid=[0,.25,.5,.75,1].map((f)=>`<line x1="${L}" x2="${W-R}" y1="${T+innerH*f}" y2="${T+innerH*f}" stroke="#263445"/><text x="${L-6}" y="${T+innerH*f+3}" text-anchor="end" fill="#6f8094" font-size="9">${number((1-f)*100,0)}%</text>`).join('');
  const paths=picked.map((row,index)=>{
    const values=row.points.map((point)=>Number(point.value)).filter(Number.isFinite);
    let min=Math.min(...values), max=Math.max(...values);
    if (min===max) { min-=.5; max+=.5; }
    const x=(i)=>L+(row.points.length===1?innerW/2:i*innerW/(row.points.length-1));
    const y=(v)=>T+innerH-(v-min)/(max-min)*innerH;
    const path=pathFor(row.points.map((point)=>Number.isFinite(Number(point.value))?Number(point.value):null),x,y);
    return `<path d="${path}" fill="none" stroke="${colors[index]}" stroke-width="${index===0?2.2:1.7}"${index>1?' stroke-dasharray="5 3"':''}><title>${escapeHtml(row.datasource)} · own selected-window scale ${number(min,2)}–${number(max,2)}</title></path>`;
  }).join('');
  const labels=longest.points.map((point)=>({date:String(point.timestamp||'').slice(0,10)}));
  const lx=(i)=>L+(labels.length===1?innerW/2:i*innerW/(labels.length-1));
  const legend=picked.map((row,index)=>`<span><i class="legend-key ${classes[index]}"></i>${escapeHtml(row.datasource)}</span>`).join('');
  el.innerHTML=`<div class="chart-legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="IODA connectivity signals normalized per series">${grid}${paths}${chartLabels(labels,lx,H-7)}</svg>`;
  const top=picked.slice(0,2);
  $('#ioda-summary').innerHTML = `<div class="mini-stat"><span>Outage events</span><b>${number(ioda.events?.length || 0,0)}</b></div><div class="mini-stat"><span>Signal series</span><b>${number(series.length,0)}</b></div>${top.map((row)=>`<div class="mini-stat"><span>${escapeHtml(row.datasource)} latest / window median</span><b>${number(row.latest,1)} / ${number(row.windowMedian,1)} (${row.deltaFromWindowMedianPercent===null?'—':`${row.deltaFromWindowMedianPercent>=0?'+':''}${number(row.deltaFromWindowMedianPercent)}%`})</b></div>`).join('')}`;
}

function renderTorChart(tor) {
  const el = $('#tor-chart');
  const relay=tor?.relay?.rows || [], bridge=tor?.bridge?.rows || [];
  if (!tor?.ok || (!relay.length && !bridge.length)) {
    el.className='chart empty-chart';
    el.innerHTML=`<span>${escapeHtml(tor?.error || tor?.partialErrors?.relay || tor?.partialErrors?.bridge || 'Tor Metrics returned no observations for this selection.')}</span>`;
    $('#tor-summary').innerHTML='';
    $('#tor-transports').innerHTML='';
    return;
  }
  el.className='chart';
  const dates=[...new Set([...relay.map(r=>r.date),...bridge.map(r=>r.date)])].sort();
  const relayBy=new Map(relay.map(r=>[r.date,r])); const bridgeBy=new Map(bridge.map(r=>[r.date,r]));
  const direct=dates.map(d=>relayBy.get(d)?.users ?? null), lower=dates.map(d=>relayBy.get(d)?.lower ?? null), bridged=dates.map(d=>bridgeBy.get(d)?.users ?? null);
  const values=[...direct,...lower,...bridged].filter(Number.isFinite);
  const W=760,H=235,L=48,R=18,T=30,B=32,innerW=W-L-R,innerH=H-T-B;
  const max=Math.max(...values,1)*1.08;
  const x=(i)=>L+(dates.length===1?innerW/2:i*innerW/(dates.length-1));
  const y=(v)=>T+innerH-Math.max(0,v)/max*innerH;
  const grid=[0,.25,.5,.75,1].map((f)=>`<line x1="${L}" x2="${W-R}" y1="${T+innerH*f}" y2="${T+innerH*f}" stroke="#263445"/><text x="${L-7}" y="${T+innerH*f+3}" text-anchor="end" fill="#6f8094" font-size="9">${number(max*(1-f),0)}</text>`).join('');
  const labels=dates.map(date=>({date}));
  el.innerHTML=`<div class="chart-legend"><span><i class="legend-key tor-direct"></i>direct users</span><span><i class="legend-key tor-lower"></i>expected lower bound</span><span><i class="legend-key tor-bridge"></i>bridge users</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tor direct and bridge user estimates in Iran">${grid}<path d="${pathFor(direct,x,y)}" fill="none" stroke="#9d8cf2" stroke-width="2.2"/><path d="${pathFor(lower,x,y)}" fill="none" stroke="#e2bd59" stroke-width="1.4" stroke-dasharray="5 4"/><path d="${pathFor(bridged,x,y)}" fill="none" stroke="#52c9c4" stroke-width="1.9"/>${chartLabels(labels,x,H-7)}</svg>`;
  $('#tor-summary').innerHTML=`<div class="mini-stat"><span>Direct users latest</span><b>${number(tor.relay?.latestUsers,0)}</b></div><div class="mini-stat"><span>Bridge users latest</span><b>${number(tor.bridge?.latestUsers,0)}</b></div><div class="mini-stat"><span>Direct below lower bound</span><b>${number(tor.relay?.possibleCensorshipDays,0)} day(s)</b></div><div class="mini-stat"><span>Latest observation</span><b>${escapeHtml(tor.relay?.latestDate || tor.bridge?.latestDate || '—')}</b></div>`;
  const transports = tor.transports || [];
  $('#tor-transports').innerHTML = transports.length ? transports.slice(0,8).map((row)=>`<div class="transport-card"><span>${escapeHtml(row.transport)}</span><b>${row.latestLow===null?'—':number(row.latestLow,0)}–${row.latestHigh===null?'—':number(row.latestHigh,0)}</b><small>${escapeHtml(row.latestDate || '—')} · derived bounds</small></div>`).join('') : '';
}

function renderAssessment(assessment) {
  const strip = $('#assessment-strip');
  strip.dataset.severity = assessment?.severity || 'neutral';
  $('#assessment-label').textContent = assessment?.label || 'Assessment unavailable';
  $('#assessment-boundary').textContent = assessment?.methodologicalBoundary || 'No political attribution is derived from these measurements.';
  $('#assessment-confidence').textContent = (assessment?.confidence || 'none').toUpperCase();
  $('#assessment-sources').textContent = String(assessment?.availableSources?.length || 0);
  $('#assessment-scope').textContent = assessment?.scope || '—';
  $('#signal-list').innerHTML = assessment?.signals?.length ? assessment.signals.map((signal) => {
    const stateClass = signal.usableForAssessment === false ? 'excluded' : '';
    const status = signal.usableForAssessment === false ? 'EXCLUDED' : 'OBSERVED';
    return `<div class="signal-item"><div class="signal-item-head"><strong>${escapeHtml(signal.source)}</strong><span class="${stateClass}">${status}</span></div><div class="signal-metric"><b>${signal.value===null?'—':number(signal.value,1)}</b><small>${escapeHtml(signal.unit)} · n=${number(signal.sample,0)}</small></div><p>${escapeHtml(signal.note)}</p></div>`;
  }).join('') : '<div class="empty-state">No independent measurement source returned usable observations.</div>';
}

function renderKpis(overview) {
  const ooni = overview.ooni, ripe = overview.ripe, radar = overview.radar, ioda = overview.ioda, tor = overview.tor;
  $('#kpi-ooni-count').textContent = ooni?.ok ? number(ooni.totalMeasurements,0) : 'Error';
  $('#kpi-ooni-meta').textContent = ooni?.ok ? `${ooni.points?.length || 0} UTC days · ${ooni.totalConfirmed || 0} confirmed${ooni.truncatedAtApiLimit ? ' · truncated' : ''}` : (ooni?.error || 'Unavailable');
  const ooniSourceState = ooni?.ok && ooni.totalMeasurements ? 'ok' : ooni?.ok ? 'warn' : 'error';
  stateDot($('#ooni-state-dot'), ooniSourceState);
  stateDot($('#ooni-anomaly-state-dot'), ooniSourceState);
  $('#kpi-anomaly-rate').textContent = ooni?.ok && ooni.anomalyRate !== null ? `${percent(ooni.anomalyRate)}${ooni.truncatedAtApiLimit?'*':''}` : '—';
  $('#kpi-anomaly-meta').textContent = ooni?.truncatedAtApiLimit ? '* API row limit reached; excluded from assessment' : 'Returned OONI rows in selected scope';

  $('#kpi-ripe-probes').textContent = ripe?.ok ? number(ripe.probeCount,0) : 'Error';
  $('#kpi-ripe-meta').textContent = ripe?.ok ? `${number(ripe.overall?.observedProbes || 0,0)} observed · ${number(ripe.overall?.samples || 0,0)} samples` : (ripe?.error || 'Unavailable');
  const ripeSourceState = ripe?.ok && ripe.series?.length ? 'ok' : ripe?.ok ? 'warn' : 'error';
  stateDot($('#ripe-state-dot'), ripeSourceState);
  stateDot($('#ripe-loss-state-dot'), ripeSourceState);
  $('#kpi-loss').textContent = ripe?.ok ? percent(ripe.overall?.packetLossPercent) : '—';
  $('#kpi-loss-meta').textContent = ripe?.ok && ripe.overall?.averageRttMs !== null ? `${number(ripe.overall.averageRttMs)} ms average RTT` : 'No RTT sample';

  $('#kpi-ioda').textContent = ioda?.ok ? number(ioda.events?.length || 0,0) : 'Error';
  $('#kpi-ioda-meta').textContent = ioda?.ok ? `${ioda.series?.length || 0} raw signal series · ${ioda.asn || 'IR country'}` : (ioda?.error || 'Unavailable');
  stateDot($('#ioda-state-dot'), ioda?.ok && (ioda.series?.length || ioda.events?.length) ? 'ok' : ioda?.ok ? 'warn' : 'error');

  const radarStatus = radar?.status || 'error';
  const radarKpi = $('#kpi-radar');
  const radarKpiState = radarStatus === 'observed'
    ? 'ok'
    : radarStatus === 'partial' || radarStatus === 'token_required'
      ? 'warn'
      : radarStatus === 'error'
        ? 'error'
        : 'neutral';
  radarKpi.textContent = radarKpiState === 'ok' ? '\u2713' : radarKpiState === 'warn' ? '!' : radarKpiState === 'error' ? '\u00d7' : '\u2013';
  radarKpi.classList.remove('ok', 'warn', 'error', 'neutral');
  radarKpi.classList.add('service-status', radarKpiState);
  $('#kpi-radar-meta').textContent = radarStatus === 'token_required' ? 'CLOUDFLARE_RADAR_API_TOKEN required' : `${radar?.trafficAnomalies?.events?.length || 0} traffic anomalies · ${radar?.outages?.annotations?.length || 0} outages · ${radar?.bgp?.events?.length || 0} BGP events`;
  stateDot($('#radar-state-dot'), radarStatus);

  $('#kpi-tor').textContent = tor?.ok && tor.relay?.latestUsers !== null ? number(tor.relay.latestUsers,0) : tor?.ok ? '—' : 'Error';
  $('#kpi-tor-meta').textContent = tor?.ok ? `${number(tor.bridge?.latestUsers,0)} bridge users · direct estimate shown above` : (tor?.error || 'Unavailable');
  stateDot($('#tor-state-dot'), tor?.ok && (tor.relay?.rows?.length || tor.bridge?.rows?.length) ? 'ok' : tor?.ok ? 'warn' : 'error');

  const ripestat = overview.ripestat;
  const bgpVisibility = ripestat?.routing?.visibility?.percent;
  $('#kpi-bgp').textContent = bgpVisibility===null || bgpVisibility===undefined ? (ripestat?.status === 'scope_required' ? 'Select ASN' : '—') : percent(bgpVisibility);
  $('#kpi-bgp-meta').textContent = ripestat?.status === 'scope_required' ? 'RIPE RIS requires selected ASN' : ripestat?.ok ? `${number(ripestat.routing?.visibility?.seeingPeers,0)} / ${number(ripestat.routing?.visibility?.totalPeers,0)} RIS peers` : (ripestat?.error || 'Unavailable');
  const bgpSourceState = ripestat?.status === 'scope_required'
    ? 'neutral'
    : bgpVisibility === null || bgpVisibility === undefined
      ? ripestat?.ok ? 'warn' : 'error'
      : 'ok';
  stateDot($('#bgp-state-dot'), bgpSourceState);
  $('#header-updated').textContent = `Updated ${ageLabel(overview.fetchedAt)} ago`;
}

function renderEvents(overview) {
  const events = [];
  for (const row of overview.ooni?.points || []) {
    if ((row.anomalies || 0) > 0 || (row.confirmed || 0) > 0) events.push({ time: row.date, source: 'OONI', title: `${number(row.anomalyRate)}% anomalous OONI rows`, detail: `${row.measurements} measurements · ${row.confirmed || 0} confirmed` });
  }
  for (const item of overview.radar?.outages?.annotations || []) {
    events.push({ time: item.startDate || overview.input.since, source: 'RADAR', title: item.description || `${item.outageType || 'Outage'} annotation`, detail: [item.outageCause, item.scope, item.asns?.length ? `${item.asns.length} ASN(s)` : null].filter(Boolean).join(' · ') });
  }
  for (const item of overview.radar?.trafficAnomalies?.events || []) {
    events.push({ time: item.startDate || overview.input.since, source: 'RADAR', title: `Traffic anomaly${item.status ? ` · ${item.status.toLowerCase()}` : ''}`, detail: [item.type, item.asn ? `AS${String(item.asn).replace(/^AS/i,'')}` : null, item.asnName, item.locationCode].filter(Boolean).join(' · ') });
  }
  for (const item of overview.radar?.bgp?.events || []) {
    events.push({ time: item.minTimestamp || overview.input.since, source: 'BGP', title: `BGP hijack event ${item.id ?? ''}`.trim(), detail: `confidence ${number(item.confidenceScore,0)} · ${item.prefixes?.length || 0} prefix(es)` });
  }
  for (const item of overview.ioda?.events || []) {
    events.push({ time: item.start || overview.input.since, source: 'IODA', title: `IODA outage event · ${item.datasource || 'signal'}`, detail: `${item.entityName || item.entityCode || 'Iran'}${item.durationSeconds ? ` · ${number(item.durationSeconds / 3600,1)} h` : ''}${item.score !== null && item.score !== undefined ? ` · score ${number(item.score,1)}` : ''}` });
  }
  for (const item of overview.censoredPlanet?.events || []) {
    events.push({ time: item.peak || item.startDate || overview.input.since, source: 'CP', title: `CenAlert event · impact ${item.impact===null?'—':number(item.impact,2)}`, detail: [item.cause,item.reportedBy].filter(Boolean).join(' · ') || 'Censored Planet behavioral anomaly' });
  }
  for (const item of overview.pulse?.events || []) {
    events.push({ time: item.startDate || overview.input.since, source: 'PULSE', title: `${item.type || 'Shutdown'} · ${item.verificationLevel || 'verification unknown'}`, detail: [item.affectedRegions,item.cause].filter(Boolean).join(' · ') || 'Curated shutdown context' });
  }
  events.sort((a,b) => Date.parse(b.time) - Date.parse(a.time));
  $('#event-feed').innerHTML = events.length ? events.slice(0,12).map((event) => `<div class="event-item"><span class="event-time">${escapeHtml(shortDate(String(event.time).slice(0,10)))}</span><div class="event-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail || 'Source event')}</small></div><span class="event-source">${escapeHtml(event.source)}</span></div>`).join('') : '<div class="empty-state">No anomalous OONI measurement days or source-native events were returned for this selected window.</div>';
}

function renderOoniDomains() {
  const payload = state.ooniDomains;
  renderServiceFindings();
  const table = $('#ooni-domains-table');
  const more = $('#ooni-domains-more');
  more.classList.add('hidden');
  if (!payload?.ok) {
    const message = payload?.error ? t('ooni.domains.unavailable', { error: payload.error })
      : t($('#test-select').value === 'web_connectivity' ? 'ooni.domains.loading' : 'ooni.domains.notApplicable');
    $('#ooni-domains-state').textContent = message;
    table.innerHTML = `<tr><td class="table-empty" colspan="6">${escapeHtml(message)}</td></tr>`;
    return;
  }
  $('#ooni-domains-source').href = payload.sourceUrl;
  if (!payload.domains.length) {
    const message = t('ooni.domains.noData');
    $('#ooni-domains-state').textContent = message;
    table.innerHTML = `<tr><td class="table-empty" colspan="6">${escapeHtml(message)}</td></tr>`;
    return;
  }
  const search = $('#ooni-domain-search').value.trim().toLowerCase();
  const matches = payload.domains.filter((row) => row.domain.toLowerCase().includes(search));
  const visible = state.showAllOoniDomains || search ? matches : matches.slice(0, 30);
  $('#ooni-domains-state').textContent = t('ooni.domains.count', {
    shown: number(visible.length, 0), total: number(payload.domainCount, 0), measurements: number(payload.totalMeasurements, 0),
    confirmed: number(payload.domains.filter((row) => row.confirmed > 0).length, 0),
    anomalous: number(payload.domains.filter((row) => row.anomalous > 0 && row.confirmed === 0).length, 0),
  });
  table.innerHTML = visible.length ? visible.map((row) => {
    const source = new URL(payload.sourceUrl);
    source.searchParams.set('domain', row.domain);
    // A bar shows at a glance which share of the tests was confirmed blocked (red) or anomalous (amber).
    const confirmedShare = row.measurements ? Math.round((row.confirmed / row.measurements) * 100) : 0;
    const anomalousShare = row.measurements ? Math.round((row.anomalous / row.measurements) * 100) : 0;
    const bar = `<span class="domain-share" aria-hidden="true"><i class="share-confirmed"></i><i class="share-anomalous"></i></span>`;
    return `<tr data-confirmed-share="${confirmedShare}" data-anomalous-share="${anomalousShare}"><td><strong dir="ltr">${escapeHtml(row.domain)}</strong>${bar}</td><td class="num-confirmed${row.confirmed ? ' has-value' : ''}">${number(row.confirmed, 0)}</td><td class="num-anomalous${row.anomalous ? ' has-value' : ''}">${number(row.anomalous, 0)}</td><td>${number(row.measurements, 0)}</td><td dir="ltr">${escapeHtml(row.lastObserved)}</td><td class="evidence-cell"><button class="button" type="button" data-ooni-domain="${escapeHtml(row.domain)}" aria-label="${escapeHtml(t('ooni.details.open', { domain: row.domain }))}">${escapeHtml(t('ooni.details.button'))}</button> <a href="${escapeHtml(source.href)}" target="_blank" rel="noreferrer">${escapeHtml(t('ooni.domains.view'))}</a></td></tr>`;
  }).join('') : `<tr><td class="table-empty" colspan="6">${escapeHtml(t('ooni.domains.noMatch'))}</td></tr>`;
  more.classList.toggle('hidden', Boolean(search) || state.showAllOoniDomains || matches.length <= visible.length);
  // Widths through the CSSOM; the CSP forbids inline style attributes.
  table.querySelectorAll('tr[data-confirmed-share]').forEach((tr) => {
    tr.querySelector('.share-confirmed').style.width = `${tr.dataset.confirmedShare}%`;
    tr.querySelector('.share-anomalous').style.width = `${tr.dataset.anomalousShare}%`;
  });
}

function renderServiceFindings() {
  const payload = state.ooniDomains;
  const selection = { testName: $('#test-select').value, target: $('#target-select').value };
  const { rows, focus, sourceUrl } = summarizeServiceFindings(payload, selection);
  const section = $('#service-findings');
  const source = $('#service-findings-source');
  const loading = !payload && selection.testName === 'web_connectivity';
  section.dataset.status = loading ? 'pending' : focus?.status || 'neutral';
  $('#service-findings-kicker').textContent = t('services.kicker');
  // Where this network had no usable test, the result from other Iranian networks answers.
  const countryItems = (state.overview?.assessment?.interpretation?.services?.items ?? [])
    .filter((item) => item.country && ['untested', 'unclear'].includes(item.status));
  // The Overview situation board carries the headline; this panel is the per-website detail.
  const title = focus ? t('services.detailsTitle')
    : countryItems.length && payload?.ok ? t('services.headline.countryOnly')
    : t(loading ? 'services.headline.loading' : selection.testName !== 'web_connectivity' ? 'services.headline.notWeb'
      : !payload?.ok ? 'services.headline.unavailable' : selection.target && !rows.some((row) => row.measurements > 0) ? 'services.headline.targetEmpty'
        : !rows.some((row) => row.measurements > 0) ? 'services.headline.untested'
          : !rows.some((row) => row.status === 'no_signal') ? 'services.headline.inconclusive' : 'services.headline.noFinding');
  $('#service-findings-title').textContent = title;
  $('#service-findings-context').textContent = t('services.context', {
    asn: $('#asn-select').value === 'ALL' ? 'IR / all networks' : $('#asn-select').value,
    since: $('#since-input').value, until: $('#until-input').value,
  }) + (selection.target ? ` · ${t('services.target', { target: selection.target })}` : '')
    + (focus ? ` · ${t('services.total', {
      count: number(rows.reduce((sum, row) => sum + (row.status === 'out_of_scope' ? 0 : row.measurements), 0), 0),
      date: rows.map((row) => row.lastObserved).filter(Boolean).sort().at(-1) ?? '—',
    })}` : '');
  $('#service-findings-boundary').textContent = t('services.boundary');
  source.classList.toggle('hidden', !sourceUrl);
  if (sourceUrl) source.href = sourceUrl;
  source.textContent = t('services.source');
  // One card per service: its tested addresses as rows, the servers its app uses, and the
  // addresses nobody tested in one line, so a service never appears as several cards and an
  // untested alias (instagram.com) never looks like an untested service.
  const RANK = { confirmed: 6, anomaly: 5, no_signal: 4, inconclusive: 3, loading: 2, unavailable: 1, untested: 0 };
  const tested = (row) => ['confirmed', 'anomaly', 'no_signal', 'inconclusive'].includes(row.status);
  const interpretationItems = state.overview?.assessment?.interpretation?.services?.items ?? [];
  const lri = (value) => `\u2066${value}\u2069`;
  const cards = SERVICE_BRANDS.map((brand) => {
    const brandRows = rows.filter((row) => brand.domains.includes(row.domain) && row.status !== 'out_of_scope');
    if (!brandRows.length) return null;
    const measuredRows = brandRows.filter(tested).sort((a, b) => b.measurements - a.measurements);
    const strongest = [...brandRows].sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0) || b.confirmed - a.confirmed)[0];
    const servers = interpretationItems.find((item) => item.id === brand.id)?.appServers ?? null;
    return { brand, rows: measuredRows, untested: brandRows.filter((row) => !tested(row)).map((row) => row.domain), status: strongest.status, servers };
  }).filter(Boolean).sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0) || b.rows.reduce((sum, row) => sum + row.confirmed, 0) - a.rows.reduce((sum, row) => sum + row.confirmed, 0));
  const renderCard = (card) => {
    const domains = card.rows.map((row) => `<li><span class="service-domain" dir="ltr">${escapeHtml(row.domain)}</span><small>${number(row.measurements, 0)} ${t('services.tests')} · ${number(row.confirmed, 0)} ${t('services.confirmed')} · ${number(row.anomalous, 0)} ${t('services.anomalies')} · ${escapeHtml(row.lastObserved)} UTC</small><button type="button" class="button" data-service-domain="${escapeHtml(row.domain)}">${escapeHtml(t('services.inspect'))}</button></li>`).join('');
    const servers = card.servers && card.servers.status !== 'inconclusive' ? `<p class="service-app-servers">${escapeHtml((card.servers.country ? (text) => t('board.appServers.country', { text }) : (text) => text)(t(`board.appServers.${card.servers.status}`, {
      hosts: card.servers.hosts.length > 1 ? t('board.appServers.more', { host: lri(card.servers.hosts[0]), count: number(card.servers.hosts.length - 1, 0) }) : lri(card.servers.hosts[0]),
      total: number(card.servers.measurements, 0), failed: number(card.servers.confirmed + card.servers.anomalous, 0), confirmed: number(card.servers.confirmed, 0), ok: number(card.servers.ok, 0),
    })))}</p>` : '';
    const untested = card.untested.length ? `<p class="service-untested">${escapeHtml(t('services.noTests', { domains: lri(card.untested.join(', ')) }))}</p>` : '';
    return `<div class="service-finding service-brand" data-status="${card.status}"><div><strong>${escapeHtml(t(`board.brand.${card.brand.id}`) === `board.brand.${card.brand.id}` ? card.brand.name : t(`board.brand.${card.brand.id}`))}</strong></div><b>${escapeHtml(t(`services.status.${card.status}`))}</b>${domains ? `<ul class="service-domains">${domains}</ul>` : ''}${servers}${untested}</div>`;
  };
  $('#service-findings-list').innerHTML = cards.map(renderCard).join('');
  const countryStatus = { blocked: 'confirmed', restricted: 'anomaly', reachable: 'no_signal' };
  $('#service-country-title').hidden = !countryItems.length;
  $('#service-country-list').hidden = !countryItems.length;
  $('#service-country-title').textContent = t('services.countryTitle');
  $('#service-country-list').innerHTML = countryItems.map((item) => {
    const status = countryStatus[item.country.status] ?? 'inconclusive';
    const detail = `${number(item.country.measurements, 0)} ${t('services.tests')} · ${number(item.country.confirmed, 0)} ${t('services.confirmed')} · ${number(item.country.anomalous, 0)} ${t('services.anomalies')} · ${escapeHtml(item.country.lastObserved || '—')} UTC`;
    return `<div class="service-finding" data-status="${status}"><div><strong>${escapeHtml(item.name)}</strong><span dir="ltr">${escapeHtml(item.country.domain)}</span></div><b>${escapeHtml(t(`services.status.${status}`))}</b><small>${detail}</small></div>`;
  }).join('');
  $('#service-app-title').textContent = t('services.appTitle');
  $('#service-app-tests').innerHTML = summarizeMessagingAppTests(state.circumvention, selection).map((row) => {
    const detail = ['anomaly', 'no_signal'].includes(row.status)
      ? `${number(row.measurements, 0)} ${t('services.tests')} · ${number(row.anomalies, 0)} ${t('services.anomalies')} · ${escapeHtml(row.lastObservation || '—')} UTC` : '';
    const sourceLink = detail && row.sourceUrl
      ? `<a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('services.source'))}</a>` : '';
    // An app test has no block page; "not confirmed" would suggest missing evidence that cannot exist.
    const label = row.status === 'anomaly' ? t('services.status.appFailed') : t(`services.status.${row.status}`);
    return `<div class="service-finding" data-status="${row.status}"><div><strong>${escapeHtml({ whatsapp: 'WhatsApp', telegram: 'Telegram', signal: 'Signal', facebook_messenger: 'Facebook Messenger' }[row.testName] ?? row.testName)}</strong><span>${escapeHtml(t('services.appTest'))}</span></div><b>${escapeHtml(label)}</b>${detail ? `<small>${detail}</small>` : ''}${sourceLink}</div>`;
  }).join('');
}

function renderOoniDomainDetails() {
  const panel = $('#ooni-domain-details');
  const domain = state.selectedOoniDomain;
  panel.classList.toggle('hidden', !domain);
  if (!domain) return;
  const payload = state.ooniDomainDetails;
  $('#ooni-detail-title').textContent = t('ooni.details.title', { domain });
  $('#ooni-detail-close').textContent = t('ooni.details.close');
  $('#ooni-detail-note').textContent = t('ooni.details.note');
  for (const [id, key] of [
    ['ooni-detail-url-header','url'], ['ooni-detail-outcome-header','outcome'],
    ['ooni-detail-date-header','date'], ['ooni-detail-evidence-header','evidence'],
  ]) $(`#${id}`).textContent = t(`ooni.details.${key}`);
  const rows = payload?.rows || [];
  const message = state.ooniDomainDetailsError
    ? t('ooni.details.error', { error: state.ooniDomainDetailsError })
    : state.ooniDomainDetailsLoading && !rows.length ? t('ooni.details.loading')
      : rows.length ? [t('ooni.details.count', { count: number(rows.length, 0) }), payload.limitReached ? t('ooni.details.limit') : ''].filter(Boolean).join(' ')
        : t('ooni.details.empty');
  $('#ooni-detail-state').textContent = message;
  $('#ooni-detail-table').innerHTML = rows.map((row) => `<tr><td><span class="ooni-url" dir="ltr" data-i18n-external>${escapeHtml(row.url)}</span></td><td>${escapeHtml(t(`ooni.details.outcome.${row.outcome}`))}${row.outsideIran ? `<small class="ooni-outside"> · ${escapeHtml(t('ooni.details.outsideIran', { asn: row.asn || '—' }))}</small>` : ''}</td><td dir="ltr">${escapeHtml(row.timestamp)}</td><td>${row.explorerUrl || row.rawUrl ? `<a href="${escapeHtml(row.explorerUrl || row.rawUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t(row.explorerUrl ? 'ooni.details.uid' : 'ooni.details.raw'))}</a>` : escapeHtml(t('ooni.details.noEvidence'))}</td></tr>`).join('');
  const more = $('#ooni-detail-more');
  more.textContent = t('ooni.details.more');
  more.classList.toggle('hidden', !payload?.hasMore);
  more.disabled = state.ooniDomainDetailsLoading;
  const source = $('#ooni-detail-source');
  source.classList.toggle('hidden', !payload?.sourceUrl);
  source.textContent = t('ooni.details.source');
  if (payload?.sourceUrl) source.href = payload.sourceUrl;
}

async function loadOoniDomainPage(offset = 0) {
  const domain = state.selectedOoniDomain;
  const serial = state.requestSerial;
  const request = ++state.ooniDomainDetailsRequest;
  state.ooniDomainDetailsLoading = true;
  state.ooniDomainDetailsError = null;
  renderOoniDomainDetails();
  const params = new URLSearchParams(queryString());
  params.set('domain', domain);
  params.set('offset', String(offset));
  try {
    const payload = await api(`/api/ooni/domain-measurements?${params}`, activeController?.signal);
    if (serial !== state.requestSerial || request !== state.ooniDomainDetailsRequest || domain !== state.selectedOoniDomain) return;
    const previous = offset ? state.ooniDomainDetails : null;
    if (offset && (!previous || previous.offset + previous.pageSize !== offset)) throw new Error('Unexpected OONI pagination state.');
    const known = new Set((previous?.rows || []).map((row) => row.uid || `${row.url}|${row.timestamp}`));
    if (payload.rows.some((row) => known.has(row.uid || `${row.url}|${row.timestamp}`))) throw new Error('Repeated OONI URL records across pages.');
    state.ooniDomainDetails = { ...payload, rows: [...(previous?.rows || []), ...payload.rows] };
  } catch (error) {
    if (serial === state.requestSerial && request === state.ooniDomainDetailsRequest && domain === state.selectedOoniDomain && error.name !== 'AbortError') state.ooniDomainDetailsError = error.message;
  } finally {
    if (request === state.ooniDomainDetailsRequest) {
      state.ooniDomainDetailsLoading = false;
      renderOoniDomainDetails();
    }
  }
}

async function loadOoniDomains(serial, signal) {
  state.ooniDomains = null;
  renderOoniDomains();
  if ($('#test-select').value !== 'web_connectivity') return;
  try {
    const payload = await api(`/api/ooni/domains?${queryString()}`, signal);
    if (serial === state.requestSerial) {
      state.ooniDomains = payload;
      renderOoniDomains();
    }
  } catch (error) {
    if (serial === state.requestSerial && error.name !== 'AbortError') {
      state.ooniDomains = { ok: false, error: error.message };
      renderOoniDomains();
    }
  }
}


// Every source panel shows at its edge whether its source answered, with the same colours as
// the source-status legend: available, partial, error, or no data for this selection.
const PANEL_SOURCES = {
  'ooni-panel': 'ooni', 'ripe-panel': 'ripe', 'radar-panel': 'radar', 'ioda-panel': 'ioda', 'tor-panel': 'tor',
  'routing-panel': 'ripestat', 'censoredplanet-panel': 'censoredPlanet', 'globalping-panel': 'globalping',
  'apnic-panel': 'apnic', 'mlab-panel': 'mlab', 'asrank-panel': 'asrank', 'rpki-panel': 'rpki', 'topology-panel': 'peeringdb',
};

function sourceState(source) {
  if (!source) return 'nodata';
  if (source.ok === false || source.status === 'error') return 'error';
  if (['partial', 'stale'].includes(source.status)) return 'partial';
  if (source.status === 'observed') return 'ok';
  return 'nodata';
}

function markSourcePanels(overview) {
  for (const [id, key] of Object.entries(PANEL_SOURCES)) {
    const panel = document.getElementById(id);
    if (panel) panel.dataset.sourceState = sourceState(overview?.[key]);
  }
}

function renderOverview(overview) {
  state.overview = overview;
  markSourcePanels(overview);
  renderServiceFindings();
  renderAssessment(overview.assessment);
  renderKpis(overview);
  renderDivergence(overview.assessment);
  renderRouting(overview.ripestat);
  renderCensoredPlanet(overview.censoredPlanet);
  renderGlobalping(overview.globalping);
  renderTopology(overview.peeringdb, overview.ihr);
  renderProtocolMix(overview.radar);
  renderOoniChart(overview.ooni);
  renderRipeChart(overview.ripe);
  renderRadarChart(overview.radar);
  renderIodaChart(overview.ioda);
  renderTorChart(overview.tor);
  renderEvents(overview);
  $('#ooni-query-state').textContent = overview.ooni?.ok ? `${overview.ooni.totalMeasurements || 0} rows · ${overview.ooni.points?.length || 0} days` : 'Source error';
  if (overview.ooni?.sourceUrl) $('#ooni-source-link').href = overview.ooni.sourceUrl;
  if (overview.ripe?.measurementUrl) $('#ripe-source-link').href = overview.ripe.measurementUrl;
  if (overview.ioda?.sourceUrls?.signals) $('#ioda-source-link').href = overview.ioda.sourceUrls.signals;
  $('#export-button').disabled = false;
}

function renderCircumvention(payload) {
  state.circumvention = payload;
  if (!payload?.ok) {
    $('#circumvention-state').textContent = 'Source error';
    $('#circumvention-table').innerHTML = `<tr><td colspan="5" class="table-empty">${escapeHtml(payload?.error || 'Circumvention signals unavailable.')}</td></tr>`;
    renderServiceFindings();
    return;
  }
  $('#circumvention-state').textContent = `Updated ${ageLabel(payload.fetchedAt)} ago`;
  $('#circumvention-table').innerHTML = payload.signals.map((row) => {
    const status = row.status === 'observed' ? (row.anomalyRate !== null && row.anomalyRate >= 25 ? 'warn' : 'observed') : row.status;
    return `<tr><td><strong>${escapeHtml(row.testName)}</strong></td><td><span class="status-cell ${status}"><i></i>${escapeHtml(row.status)}</span></td><td>${number(row.measurements,0)}</td><td>${row.anomalyRate===null?'—':percent(row.anomalyRate)} <small>(${number(row.anomalies,0)})</small></td><td>${escapeHtml(row.lastObservation || '—')}</td></tr>`;
  }).join('');
  renderServiceFindings();
}

async function loadCircumvention(serial, signal) {
  $('#circumvention-state').textContent = 'Loading…';
  try {
    const payload = await api(`/api/circumvention?${queryString()}`, signal);
    if (serial === state.requestSerial) renderCircumvention(payload);
  } catch (error) {
    if (error.name !== 'AbortError') renderCircumvention({ ok:false, error:error.message });
  }
}

let activeController = null;
function publishOverview(stateName, assessment = null, dataPaths = null) {
  window.dispatchEvent(new CustomEvent('iran-monitor-overview', { detail: { state: stateName, assessment, dataPaths } }));
}

async function loadAll() {
  const since = $('#since-input').value, until = $('#until-input').value;
  if (!since || !until || since > until) {
    if (activeController) activeController.abort();
    ++state.requestSerial;
    publishOverview('error');
    $('#assessment-label').textContent = 'Invalid date range';
    return;
  }
  writeUrlState();
  if (activeController) activeController.abort();
  activeController = new AbortController();
  const serial = ++state.requestSerial;
  setLoading(true);
  publishOverview('loading');
  state.providers = null;
  state.routingUpdates = null;
  state.ooniDomains = null;
  state.showAllOoniDomains = false;
  state.selectedOoniDomain = null;
  state.ooniDomainDetails = null;
  state.ooniDomainDetailsError = null;
  state.ooniDomainDetailsLoading = false;
  ++state.ooniDomainDetailsRequest;
  $('#ooni-domain-search').value = '';
  renderOoniDomains();
  renderOoniDomainDetails();
  $('#bgp-updates-state').textContent = 'BGP update drilldown not requested.';
  $('#bgp-updates-table').innerHTML = '<tr><td colspan="5" class="table-empty">Load updates for a selected ASN.</td></tr>';
  $('#providers-table').innerHTML = '<tr><td colspan="7" class="table-empty">Provider comparison has not been requested for this filter state.</td></tr>';
  loadOoniDomains(serial, activeController.signal);
  showSavedCopy(serial, `/api/overview?${queryString()}`);
  try {
    const overview = await api(`/api/overview?${queryString()}`, activeController.signal);
    if (serial !== state.requestSerial) return;
    state.freshSerial = serial;
    publishOverview('ready', overview.assessment, overview.dataPaths ?? null);
    renderOverview(overview);
    loadCircumvention(serial, activeController.signal);
  } catch (error) {
    if (serial === state.requestSerial && error.name !== 'AbortError') {
      publishOverview('error');
      $('#assessment-strip').dataset.severity = 'neutral';
      $('#assessment-label').textContent = `Dashboard query failed: ${error.message}`;
      $('#assessment-confidence').textContent = 'NONE';
      $('#ooni-query-state').textContent = 'Query failed';
    }
  } finally {
    if (serial === state.requestSerial) setLoading(false);
  }
}

let scheduled = null;
function scheduleLoad() {
  clearTimeout(scheduled);
  scheduled = setTimeout(loadAll, 450);
}

async function loadIntelligence() {
  const button = $('#load-intelligence');
  button.disabled = true;
  button.textContent = 'Discovering…';
  $('#intelligence-state').textContent = 'Querying professional-domain OSINT discovery…';
  try {
    const payload = await api(`/api/intelligence?${queryString()}`);
    const gdelt = payload.gdelt;
    if (gdelt?.status === 'unavailable_historical_window') {
      $('#intelligence-state').textContent = gdelt.note || 'GDELT recent-corpus limit reached.';
      $('#intelligence-table').innerHTML = '<tr><td colspan="5" class="table-empty">GDELT DOC discovery is unavailable for this historical window; the curated research-source registry remains available above.</td></tr>';
      return;
    }
    $('#intelligence-state').textContent = `${number(gdelt?.articles?.length || 0,0)} allowlisted articles discovered · context only · no sensor vote`;
    $('#intelligence-table').innerHTML = gdelt?.articles?.length ? gdelt.articles.map((row)=>`<tr><td>${escapeHtml(row.seenDate ? dateTime(row.seenDate) : '—')}</td><td><strong>${escapeHtml(row.domain || '—')}</strong></td><td><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.title || row.url)}</a></td><td>${escapeHtml(row.language || '—')}</td><td>OSINT discovery · provenance review required</td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">No allowlisted professional reporting returned.</td></tr>';
  } catch (error) {
    $('#intelligence-state').textContent = `Error: ${error.message}`;
    $('#intelligence-table').innerHTML = `<tr><td colspan="5" class="table-empty">${escapeHtml(error.message)}</td></tr>`;
  } finally { button.disabled = false; button.textContent = 'Refresh reporting discovery'; }
}

async function loadBgpUpdates() {
  const button = $('#load-bgp-updates');
  if ($('#asn-select').value === 'ALL') return;
  button.disabled = true;
  button.textContent = 'Loading…';
  $('#bgp-updates-state').textContent = 'Requesting bounded RIPEstat update history…';
  try {
    const payload = await api(`/api/routing-updates?${queryString()}`);
    state.routingUpdates = payload;
    if (payload.status === 'unavailable_historical_window') {
      $('#bgp-updates-state').textContent = payload.note || 'Historical BGP updates unavailable for this window.';
      $('#bgp-updates-table').innerHTML = '<tr><td colspan="5" class="table-empty">Selected range is outside the RIPEstat BGP Updates index.</td></tr>';
      return;
    }
    const effective = payload.effective ? `${payload.effective.since} → ${payload.effective.until}${payload.effective.cappedTo48Hours?' · capped to last 48 h':''}` : '—';
    $('#bgp-updates-state').textContent = `${number(payload.events?.length || 0,0)} updates · ${effective}`;
    $('#bgp-updates-table').innerHTML = payload.preview?.length ? payload.preview.map((row)=>`<tr><td>${escapeHtml(dateTime(row.timestamp))}</td><td><span class="route-type ${escapeHtml(row.type)}">${escapeHtml(row.type)}</span></td><td>${escapeHtml(row.prefix || '—')}</td><td class="mono-cell">${escapeHtml((row.asPath || []).join(' → ') || '—')}</td><td>${escapeHtml([row.collector,row.peerAsn,row.peerIp].filter(Boolean).join(' · ') || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">No BGP announcements/withdrawals returned for the effective window.</td></tr>';
  } catch (error) {
    $('#bgp-updates-state').textContent = `Error: ${error.message}`;
    $('#bgp-updates-table').innerHTML = `<tr><td colspan="5" class="table-empty">${escapeHtml(error.message)}</td></tr>`;
  } finally { button.disabled = $('#asn-select').value === 'ALL'; button.textContent = 'Reload BGP updates'; }
}

async function loadTargets() {
  const button = $('#load-targets');
  button.disabled = true;
  button.textContent = 'Loading…';
  const params = new URLSearchParams({ search: $('#target-search').value.trim(), category: $('#target-category').value, limit: '200' });
  try {
    const payload = await api(`/api/targets?${params}`);
    state.targets = payload;
    if ($('#target-category').options.length === 1 && payload.categories?.length) {
      $('#target-category').innerHTML = '<option value="">All categories</option>' + payload.categories.map((row)=>`<option value="${escapeHtml(row.code)}">${escapeHtml(row.code)} · ${escapeHtml(row.description || 'Other')} (${number(row.count,0)})</option>`).join('');
    }
    $('#targets-table').innerHTML = payload.targets?.length ? payload.targets.map((row)=>`<tr><td><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.url)}</a></td><td><strong>${escapeHtml(row.categoryCode || '—')}</strong></td><td>${escapeHtml(row.categoryDescription || '—')}</td><td>${escapeHtml(row.dateAdded || '—')}</td><td>${escapeHtml([row.source,row.notes].filter(Boolean).join(' · ') || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">No matching Iran test targets.</td></tr>';
  } catch (error) { $('#targets-table').innerHTML = `<tr><td colspan="5" class="table-empty">${escapeHtml(error.message)}</td></tr>`; }
  finally { button.disabled = false; button.textContent = 'Reload Iran targets'; }
}

async function loadProviders() {
  const button = $('#load-providers');
  button.disabled = true;
  button.textContent = 'Loading providers…';
  $('#providers-table').innerHTML = '<tr><td colspan="7" class="table-empty">Querying OONI and RIPE Atlas for 10 Iran ASNs…</td></tr>';
  try {
    const payload = await api(`/api/providers?${queryString()}`);
    state.providers = payload;
    $('#providers-table').innerHTML = payload.providers.map((row) => `<tr><td><strong>${escapeHtml(row.asn)} · ${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.type)}</td><td>${row.ooni?.error ? 'Error' : number(row.ooni?.measurements,0)}${row.ooni?.truncated ? ' *' : ''}</td><td>${row.ooni?.error || row.ooni?.anomalyRate===null ? '—' : percent(row.ooni.anomalyRate)}${row.ooni?.truncated ? ' *' : ''}</td><td>${row.ripe?.error ? 'Error' : `${number(row.ripe?.observedProbes,0)} / ${number(row.ripe?.activeProbes,0)}`}</td><td>${row.ripe?.averageRttMs===null || row.ripe?.averageRttMs===undefined ? '—' : `${number(row.ripe.averageRttMs)} ms`}</td><td>${row.ripe?.packetLossPercent===null || row.ripe?.packetLossPercent===undefined ? '—' : percent(row.ripe.packetLossPercent)}</td></tr>`).join('');
  } catch (error) {
    $('#providers-table').innerHTML = `<tr><td colspan="7" class="table-empty">${escapeHtml(error.message)}</td></tr>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Reload provider comparison';
  }
}

async function loadMeasurementIds() {
  const button = $('#load-measurements');
  const select = $('#measurement-select');
  button.disabled = true; button.textContent = 'Loading…';
  try {
    const payload = await api(`/api/ooni/measurements?${queryString()}`);
    select.innerHTML = '<option value="">Choose measurement UID…</option>' + (payload.measurements || []).map((row) => `<option value="${escapeHtml(row.uid)}">${escapeHtml(row.uid)} · ${escapeHtml(row.timestamp ? dateTime(row.timestamp) : 'no timestamp')} · ${row.anomaly ? 'anomaly' : 'not marked anomalous'}</option>`).join('');
    select.disabled = !(payload.measurements || []).length;
    if (!(payload.measurements || []).length) $('#measurement-json').textContent = 'No OONI measurement IDs returned for this selection.';
  } catch (error) {
    $('#measurement-json').textContent = `Error: ${error.message}`;
  } finally { button.disabled = false; button.textContent = 'Reload measurement IDs'; }
}

async function loadMeasurementDetail() {
  const uid = $('#measurement-select').value;
  const link = $('#measurement-external');
  if (!uid) { $('#measurement-json').textContent = 'No measurement selected.'; link.classList.add('hidden'); return; }
  $('#measurement-json').textContent = 'Loading raw measurement…';
  link.href = `https://explorer.ooni.org/measurement/${encodeURIComponent(uid)}`;
  link.classList.remove('hidden');
  try {
    const payload = await api(`/api/ooni/measurement/${encodeURIComponent(uid)}`);
    $('#measurement-json').textContent = JSON.stringify(payload.raw, null, 2);
  } catch (error) { $('#measurement-json').textContent = `Error: ${error.message}`; }
}

function csvCell(value) { return `"${String(value ?? '').replaceAll('"','""')}"`; }
function exportCsv() {
  if (!state.overview) return;
  const rows = [['source','scope','metric','date','value','unit','note']];
  const ooni = state.overview.ooni;
  for (const point of ooni?.points || []) {
    rows.push(['OONI', ooni.asn || 'IR-ALL', 'measurements', point.date, point.measurements, 'rows', ooni.sourceUrl]);
    rows.push(['OONI', ooni.asn || 'IR-ALL', 'anomaly_rate', point.date, point.anomalyRate, 'percent', ooni.truncatedAtApiLimit ? 'API limit reached; rate excluded from assessment' : '']);
    rows.push(['OONI', ooni.asn || 'IR-ALL', 'confirmed', point.date, point.confirmed, 'rows', '']);
  }
  const ripe = state.overview.ripe;
  for (const point of ripe?.series || []) {
    rows.push(['RIPE Atlas', ripe.asn || 'IR-ALL', 'rtt', point.date, point.rttMs, 'ms', `measurement ${ripe.measurementId}`]);
    rows.push(['RIPE Atlas', ripe.asn || 'IR-ALL', 'packet_loss', point.date, point.packetLossPercent, 'percent', `${point.samples} samples`]);
  }
  const radar = state.overview.radar;
  for (const point of radar?.traffic?.series || []) rows.push(['Cloudflare Radar','IR','http_series',String(point.date).slice(0,10),point.value,'source scale',radar.traffic.sourceUrl]);
  for (const item of radar?.outages?.annotations || []) rows.push(['Cloudflare Radar','IR','outage_annotation',item.startDate,item.outageType || item.eventType,'event',item.description || '']);
  for (const item of radar?.bgp?.events || []) rows.push(['Cloudflare Radar',radar.asn || 'IR','bgp_hijack',item.minTimestamp,item.confidenceScore,'confidence score',`event ${item.id}`]);
  const ioda = state.overview.ioda;
  for (const serie of ioda?.series || []) for (const point of serie.points || []) rows.push(['IODA',ioda.asn || 'IR',`signal_${serie.datasource}`,point.timestamp,point.value,'source units',ioda.sourceUrls?.signals || '']);
  for (const item of ioda?.events || []) rows.push(['IODA',ioda.asn || 'IR',`outage_${item.datasource}`,item.start,item.score,'event score',`${item.entityType}/${item.entityCode}`]);
  const tor = state.overview.tor;
  for (const point of tor?.relay?.rows || []) rows.push(['Tor Metrics','IR','direct_users',point.date,point.users,'estimated users',point.lower!==null?`lower=${point.lower}`:'']);
  for (const point of tor?.bridge?.rows || []) rows.push(['Tor Metrics','IR','bridge_users',point.date,point.users,'estimated users','']);
  for (const row of state.circumvention?.signals || []) rows.push(['OONI',state.circumvention.asn || 'IR-ALL',`circumvention_${row.testName}`,row.lastObservation,row.anomalyRate,'percent anomalies',`${row.measurements} measurements`]);
  for (const provider of state.providers?.providers || []) rows.push(['PROVIDER COMPARISON',provider.asn,'ooni_measurements',state.providers.input.until,provider.ooni?.measurements,'rows',provider.name]);
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`iran-internet-monitor-${$('#since-input').value}-${$('#until-input').value}.csv`; a.click(); URL.revokeObjectURL(url);
}

function vpnValues() {
  const ids = ['control-latency','control-loss','control-download','tunnel-latency','tunnel-loss','tunnel-download'];
  const values = Object.fromEntries(ids.map((id) => [id, $('#'+id).value === '' ? null : Number($('#'+id).value)]));
  return values;
}

function renderVpnCalculation() {
  const v = vpnValues();
  const complete = Object.values(v).every((value) => value !== null && Number.isFinite(value));
  if (!complete) { $('#vpn-result').innerHTML = '<span>Enter both control and tunnel values to calculate the measured cost.</span>'; return; }
  const latency = v['control-latency'] > 0 ? ((v['tunnel-latency']/v['control-latency'])-1)*100 : null;
  const download = v['control-download'] > 0 ? ((v['tunnel-download']/v['control-download'])-1)*100 : null;
  const loss = v['tunnel-loss'] - v['control-loss'];
  $('#vpn-result').innerHTML = `<div class="vpn-result-grid"><div><span>Latency change</span><b>${latency===null?'—':`${latency>=0?'+':''}${number(latency)}%`}</b></div><div><span>Packet-loss delta</span><b>${loss>=0?'+':''}${number(loss)} pp</b></div><div><span>Throughput change</span><b>${download===null?'—':`${download>=0?'+':''}${number(download)}%`}</b></div></div><span>Derived only from the values entered above. No external tunnel-performance claim is added.</span>`;
}

function getSavedRuns() {
  try { return JSON.parse(localStorage.getItem('iran-monitor-vpn-runs') || '[]'); } catch { return []; }
}
function setSavedRuns(runs) { localStorage.setItem('iran-monitor-vpn-runs', JSON.stringify(runs)); }
function renderSavedRuns() {
  const runs = getSavedRuns();
  $('#vpn-runs').innerHTML = runs.length ? runs.slice(0,10).map((run,index)=>`<div class="saved-run"><span>${escapeHtml(dateTime(run.createdAt))}</span><strong>${escapeHtml(run.protocol)}</strong><span>${escapeHtml(run.target || 'No target note')} · ${number(run.control.latency)}→${number(run.tunnel.latency)} ms · ${number(run.control.download)}→${number(run.tunnel.download)} Mbps</span><button type="button" data-run-index="${index}">Delete</button></div>`).join('') : '';
  $$('#vpn-runs [data-run-index]').forEach((button)=>button.addEventListener('click',()=>{ const current=getSavedRuns(); current.splice(Number(button.dataset.runIndex),1); setSavedRuns(current); renderSavedRuns(); }));
}
function saveVpnRun() {
  const v=vpnValues();
  if (!Object.values(v).every((value)=>value!==null && Number.isFinite(value))) { $('#vpn-result').insertAdjacentHTML('beforeend','<span>Complete all six numeric fields before saving.</span>'); return; }
  const run={ createdAt:new Date().toISOString(), protocol:$('#vpn-protocol').value, target:$('#vpn-target').value.trim(), control:{latency:v['control-latency'],loss:v['control-loss'],download:v['control-download']}, tunnel:{latency:v['tunnel-latency'],loss:v['tunnel-loss'],download:v['tunnel-download']} };
  const runs=getSavedRuns(); runs.unshift(run); setSavedRuns(runs.slice(0,50)); renderSavedRuns();
}

async function init() {
  try {
    const config = await api('/api/config');
    state.config = config;
    renderConfig(config);
    updateTargetVisibility();
    applyUrlState();
    renderSavedRuns();
    loadOutageHistory();
    await loadAll();
  } catch (error) {
    publishOverview('error');
    $('#assessment-strip').dataset.severity = 'neutral';
    $('#assessment-label').textContent = `Initialization failed: ${error.message}`;
  }
}

$('#refresh-button').addEventListener('click', loadAll);
// The export menu closes after a choice and when the reader clicks elsewhere.
document.addEventListener('click', (event) => {
  const menu = document.querySelector('.export-menu');
  if (!menu?.open) return;
  if (!menu.contains(event.target) || event.target.closest('.export-menu-list button')) menu.open = false;
});
$('#export-button').addEventListener('click', exportCsv);
$('#print-button').addEventListener('click', () => window.print());
$('#load-providers').addEventListener('click', loadProviders);
$('#load-bgp-updates').addEventListener('click', loadBgpUpdates);
$('#load-intelligence').addEventListener('click', loadIntelligence);
$('#load-targets').addEventListener('click', loadTargets);
$('#target-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); loadTargets(); } });
$('#target-category').addEventListener('change', loadTargets);
$('#load-measurements').addEventListener('click', loadMeasurementIds);
$('#ooni-domain-search').addEventListener('input', renderOoniDomains);
$('#ooni-domains-more').addEventListener('click', () => { state.showAllOoniDomains = true; renderOoniDomains(); });
$('#ooni-domains-table').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-ooni-domain]');
  if (!button || !$('#ooni-domains-table').contains(button) || !state.ooniDomains?.domains.some((row) => row.domain === button.dataset.ooniDomain)) return;
  state.selectedOoniDomain = button.dataset.ooniDomain;
  state.ooniDomainDetails = null;
  state.ooniDomainDetailsError = null;
  loadOoniDomainPage();
});
$('#ooni-detail-close').addEventListener('click', () => {
  state.selectedOoniDomain = null;
  state.ooniDomainDetails = null;
  ++state.ooniDomainDetailsRequest;
  renderOoniDomainDetails();
});
$('#ooni-detail-more').addEventListener('click', () => {
  const payload = state.ooniDomainDetails;
  if (payload?.hasMore && !state.ooniDomainDetailsLoading) loadOoniDomainPage(payload.offset + payload.pageSize);
});
window.addEventListener('iran-monitor-languagechange', () => {
  renderOutageOptions();
  if (state.config) writeUrlState();
  renderOoniDomains();
  renderOoniDomainDetails();
  renderServiceFindings();
  renderDivergence(state.overview?.assessment);
});
$('#service-findings-list').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-service-domain]');
  if (!button || !$('#service-findings-list').contains(button) || !state.ooniDomains?.domains.some((row) => row.domain === button.dataset.serviceDomain)) return;
  state.selectedOoniDomain = button.dataset.serviceDomain;
  state.ooniDomainDetails = null;
  state.ooniDomainDetailsError = null;
  loadOoniDomainPage();
  $('#ooni-domains-title').scrollIntoView({ behavior: 'smooth' });
});
$('#measurement-select').addEventListener('change', loadMeasurementDetail);
$('#save-vpn-run').addEventListener('click', saveVpnRun);
$('#vpn-form').addEventListener('input', renderVpnCalculation);
$('#vpn-form').addEventListener('reset', () => setTimeout(renderVpnCalculation, 0));
$('#test-select').addEventListener('change', () => { updateTargetVisibility(); scheduleLoad(); });
['#asn-select','#target-select','#since-input','#until-input'].forEach((selector)=>$(selector).addEventListener('change', scheduleLoad));
$('#outage-select').addEventListener('change', (event) => {
  const value = event.target.value;
  const outage = value.startsWith('n') ? state.outages?.[Number(value.slice(1))]
    : value.startsWith('e') ? state.outageEpisodes?.[Number(value.slice(1))] : null;
  if (outage) selectOutage(outage);
});
$$('.presets button').forEach((button)=>button.addEventListener('click',()=>{
  if (button.dataset.days) setPreset(Number(button.dataset.days));
  else { $('#since-input').value='2022-09-15'; $('#until-input').value='2022-09-30'; }
  markPreset(button); loadAll();
}));

init();
