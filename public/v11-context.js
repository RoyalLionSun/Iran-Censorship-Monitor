import { buildV16ShutdownContextExportRows } from './v16-context-export.js';

const contextState = { overview: null, intelligence: null };

function contextEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function contextNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function contextPercent(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${contextNumber(value, digits)}%`;
}

function contextShortDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function safeExternalUrl(value, fallback = '#') {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch { return fallback; }
}

function contextCsvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function insertContextPanels() {
  const ripePanel = document.querySelector('#ripe-panel');
  if (ripePanel && !document.querySelector('#mlab-panel')) {
    ripePanel.insertAdjacentHTML('afterend', `
      <article class="panel span-6" id="mlab-panel">
        <header class="panel-header">
          <div><span class="section-label">M-LAB NDT / PERFORMANCE CONTEXT</span><h2>Throughput & minimum RTT</h2></div>
          <a id="mlab-source-link" href="https://www.measurementlab.net/" target="_blank" rel="noreferrer">M-Lab ↗</a>
        </header>
        <p class="panel-note">Client-initiated NDT performance context with explicit sample coverage. Throughput or RTT changes are not, by themselves, evidence of censorship or throttling intent and do not vote in the censorship assessment.</p>
        <div id="mlab-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Pending</b></div></div>
        <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Date</th><th>Download</th><th>Upload</th><th>Min RTT</th><th>Samples D/U</th></tr></thead><tbody id="mlab-table"><tr><td colspan="5" class="table-empty">No M-Lab context loaded.</td></tr></tbody></table></div>
      </article>
      <article class="panel span-6" id="apnic-panel">
        <header class="panel-header">
          <div><span class="section-label">APNIC LABS / IPV6 CONTEXT</span><h2>IPv6 capability & preference</h2></div>
          <a id="apnic-source-link" href="https://stats.labs.apnic.net/ipv6" target="_blank" rel="noreferrer">APNIC Labs ↗</a>
        </header>
        <p class="panel-note">APNIC client-side protocol deployment context. Capability/preference shifts remain sample-qualified protocol observations and are not interpreted as censorship or availability on their own.</p>
        <div id="apnic-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Pending</b></div></div>
        <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Date</th><th>IPv6 capable</th><th>IPv6 preferred</th><th>Raw samples</th><th>30d capable</th></tr></thead><tbody id="apnic-table"><tr><td colspan="5" class="table-empty">No APNIC context loaded.</td></tr></tbody></table></div>
      </article>`);
  }

  const intelligencePanel = document.querySelector('#intelligence-panel');
  if (intelligencePanel && !document.querySelector('#stop-context')) {
    const note = intelligencePanel.querySelector('.panel-note');
    if (note) note.textContent = 'Access Now STOP provides curated shutdown-incident context; GDELT discovers professional reporting. Both are contextual intelligence, not additional independent technical sensor votes. Root evidence provenance must be reviewed before corroboration.';
    const sourceGrid = intelligencePanel.querySelector('#intelligence-source-grid');
    if (sourceGrid) sourceGrid.insertAdjacentHTML('beforebegin', `
      <section id="stop-context">
        <div class="panel-header"><div><span class="section-label">ACCESS NOW #KEEPITON / STOP</span><h2>Curated Iran shutdown incidents</h2></div><a id="stop-source-link" href="https://www.accessnow.org/keepiton-data-dashboard/" target="_blank" rel="noreferrer">STOP dashboard ↗</a></div>
        <p class="panel-note">STOP can cite OONI, Radar, IODA and other evidence already present in this dashboard. Evidence lineage is shown explicitly; every STOP record remains context-only.</p>
        <div id="stop-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Load intelligence</b></div></div>
        <div id="stop-warning" class="micro-note"></div>
        <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Start</th><th>Event / area</th><th>Type / extent</th><th>Status</th><th>Evidence lineage</th></tr></thead><tbody id="stop-table"><tr><td colspan="5" class="table-empty">Use “Discover current reporting” to load STOP incident context.</td></tr></tbody></table></div>
      </section>`);
  }

  const exportButton = document.querySelector('#export-button');
  if (exportButton && !document.querySelector('#export-context-button')) {
    exportButton.insertAdjacentHTML('afterend', '<button id="export-context-button" class="button" type="button" disabled>Export context CSV</button>');
    document.querySelector('#export-context-button').addEventListener('click', exportContextCsv);
  }
  const footer = document.querySelector('#footer-version');
  if (footer) footer.textContent = 'v1.1.0-dev';
}

function renderMlab(mlab) {
  const summary = document.querySelector('#mlab-summary');
  const table = document.querySelector('#mlab-table');
  if (!summary || !table) return;
  if (!mlab?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${contextEscape(mlab?.error || 'Unavailable')}</b></div>`;
    table.innerHTML = '<tr><td colspan="5" class="table-empty">M-Lab performance context unavailable.</td></tr>';
    return;
  }
  const latest = mlab.latest;
  const comparison = mlab.comparison || {};
  const downloadChange = comparison.metrics?.downloadMedianMbps?.changePercent;
  const rttChange = comparison.metrics?.downloadMinRttMedianMs?.changePercent;
  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${contextEscape(mlab.status || '—')}</b></div>
    <div class="mini-stat"><span>Latest download</span><b>${latest?.downloadMedianMbps == null ? '—' : `${contextNumber(latest.downloadMedianMbps)} Mbps`}</b></div>
    <div class="mini-stat"><span>Latest upload</span><b>${latest?.uploadMedianMbps == null ? '—' : `${contextNumber(latest.uploadMedianMbps)} Mbps`}</b></div>
    <div class="mini-stat"><span>Latest min RTT</span><b>${latest?.downloadMinRttMedianMs == null ? '—' : `${contextNumber(latest.downloadMinRttMedianMs)} ms`}</b></div>
    <div class="mini-stat"><span>Download vs baseline</span><b>${downloadChange == null ? '—' : `${downloadChange >= 0 ? '+' : ''}${contextPercent(downloadChange)}`}</b></div>
    <div class="mini-stat"><span>RTT vs baseline</span><b>${rttChange == null ? '—' : `${rttChange >= 0 ? '+' : ''}${contextPercent(rttChange)}`}</b></div>`;
  table.innerHTML = mlab.points?.length ? mlab.points.slice(-12).reverse().map((row) => `<tr><td>${contextEscape(contextShortDate(row.date))}</td><td>${row.downloadMedianMbps == null ? '—' : `${contextNumber(row.downloadMedianMbps)} Mbps`}</td><td>${row.uploadMedianMbps == null ? '—' : `${contextNumber(row.uploadMedianMbps)} Mbps`}</td><td>${row.downloadMinRttMedianMs == null ? '—' : `${contextNumber(row.downloadMinRttMedianMs)} ms`}</td><td>${contextNumber(row.downloadSamples, 0)} / ${contextNumber(row.uploadSamples, 0)}</td></tr>`).join('') : `<tr><td colspan="5" class="table-empty">${contextEscape(mlab.noDataReason || 'No M-Lab aggregate exists for this exact scope/window.')}</td></tr>`;
  const link = document.querySelector('#mlab-source-link');
  if (link && mlab.sourceUrls?.length) link.href = safeExternalUrl(mlab.sourceUrls[0], link.href);
}

function renderApnic(apnic) {
  const summary = document.querySelector('#apnic-summary');
  const table = document.querySelector('#apnic-table');
  if (!summary || !table) return;
  if (!apnic?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${contextEscape(apnic?.error || 'Unavailable')}</b></div>`;
    table.innerHTML = '<tr><td colspan="5" class="table-empty">APNIC IPv6 context unavailable.</td></tr>';
    return;
  }
  const latest = apnic.latest;
  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${contextEscape(apnic.status || '—')}</b></div>
    <div class="mini-stat"><span>IPv6 capable</span><b>${contextPercent(latest?.raw?.capablePercent)}</b></div>
    <div class="mini-stat"><span>IPv6 preferred</span><b>${contextPercent(latest?.raw?.preferredPercent)}</b></div>
    <div class="mini-stat"><span>Latest raw samples</span><b>${contextNumber(latest?.raw?.seen, 0)}</b></div>
    <div class="mini-stat"><span>Observed days</span><b>${contextNumber(apnic.coverage?.observedDays, 0)}</b></div>
    <div class="mini-stat"><span>Median samples/day</span><b>${contextNumber(apnic.coverage?.dailySamplesMedian, 0)}</b></div>`;
  table.innerHTML = apnic.points?.length ? apnic.points.slice(-12).reverse().map((row) => `<tr><td>${contextEscape(contextShortDate(row.date))}</td><td>${contextPercent(row.raw?.capablePercent)}</td><td>${contextPercent(row.raw?.preferredPercent)}</td><td>${contextNumber(row.raw?.seen, 0)}</td><td>${contextPercent(row.smoothed30?.capablePercent)}</td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">No APNIC IPv6 observations for this exact scope/window.</td></tr>';
  const link = document.querySelector('#apnic-source-link');
  if (link && apnic.sourceUrl) link.href = safeExternalUrl(apnic.sourceUrl, link.href);
}

function stopEvidenceLabel(incident) {
  const lineage = (incident.evidenceLineage || []).map((row) => row.source).filter(Boolean);
  if (lineage.length) return lineage.join(', ');
  return incident.primaryEvidenceClass || 'Contextual evidence';
}

function renderStop(accessNow) {
  const summary = document.querySelector('#stop-summary');
  const table = document.querySelector('#stop-table');
  const warning = document.querySelector('#stop-warning');
  if (!summary || !table || !warning) return;
  if (!accessNow?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${contextEscape(accessNow?.error || 'Unavailable')}</b></div>`;
    table.innerHTML = '<tr><td colspan="5" class="table-empty">Access Now STOP context unavailable.</td></tr>';
    warning.textContent = '';
    return;
  }
  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${contextEscape(accessNow.status || '—')}</b></div>
    <div class="mini-stat"><span>Iran incidents matched</span><b>${contextNumber(accessNow.totalMatched, 0)}</b></div>
    <div class="mini-stat"><span>Published through</span><b>${contextNumber(accessNow.datasetThroughYear, 0)}</b></div>
    <div class="mini-stat"><span>Independent sensor votes</span><b>0</b></div>`;
  warning.textContent = accessNow.coverageWarning || 'STOP is curated contextual incident evidence; technical-source links are provenance, not extra sensor votes.';
  table.innerHTML = accessNow.incidents?.length ? accessNow.incidents.slice(0, 20).map((row) => {
    const sourceUrl = row.accessNowUrls?.[0] || row.evidenceUrls?.[0] || accessNow.dashboardUrl;
    const event = row.event || row.causeDetails || row.areaName || 'Shutdown incident';
    return `<tr><td>${contextEscape(contextShortDate(row.startDate))}</td><td><a href="${contextEscape(safeExternalUrl(sourceUrl, accessNow.dashboardUrl))}" target="_blank" rel="noreferrer">${contextEscape(event)}</a><small>${row.areaName ? ` · ${contextEscape(row.areaName)}` : ''}</small></td><td>${contextEscape([row.shutdownType, row.shutdownExtent].filter(Boolean).join(' · ') || '—')}</td><td>${contextEscape(row.status || '—')}</td><td>${contextEscape(stopEvidenceLabel(row))}<small> · context only</small></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="table-empty">No STOP incidents overlap this selected window. This is not evidence that no disruption occurred.</td></tr>';
  const link = document.querySelector('#stop-source-link');
  if (link && accessNow.dashboardUrl) link.href = safeExternalUrl(accessNow.dashboardUrl, link.href);
}

function renderSourceFamilyCount(overview) {
  const el = document.querySelector('#header-source-state');
  if (!el) return;
  const radarStatus = overview.radar?.status || 'error';
  const active = [
    overview.ooni?.ok && overview.ooni.totalMeasurements > 0,
    overview.ripe?.ok && overview.ripe.series?.length > 0,
    overview.ioda?.ok && (overview.ioda.series?.length > 0 || overview.ioda.events?.length > 0),
    radarStatus === 'observed' || radarStatus === 'partial',
    overview.tor?.ok && (overview.tor.relay?.rows?.length > 0 || overview.tor.bridge?.rows?.length > 0),
    overview.ripestat?.ok && overview.ripestat?.status === 'observed',
    overview.globalping?.ok && overview.globalping?.probeCount > 0,
    overview.censoredPlanet?.ok && overview.censoredPlanet?.status === 'observed',
    overview.peeringdb?.ok && overview.peeringdb?.status === 'observed',
    overview.ihr?.ok && overview.ihr?.status === 'observed',
    overview.pulse?.ok && overview.pulse?.status === 'observed',
    overview.mlab?.ok && overview.mlab?.points?.length > 0,
    overview.apnic?.ok && overview.apnic?.points?.length > 0,
  ].filter(Boolean).length;
  el.textContent = `${active}/13 source families observed · assessment votes remain separate`;
}

function renderOverviewContext(overview) {
  contextState.overview = overview;
  renderMlab(overview.mlab);
  renderApnic(overview.apnic);
  renderSourceFamilyCount(overview);
  const button = document.querySelector('#export-context-button');
  if (button) button.disabled = false;
}

function renderIntelligenceContext(payload) {
  contextState.intelligence = payload;
  renderStop(payload.accessNow);
}

function exportContextCsv() {
  const overview = contextState.overview;
  if (!overview) return;
  const rows = [['source', 'scope', 'metric', 'date', 'value', 'unit', 'note']];
  const mlab = overview.mlab;
  for (const point of mlab?.points || []) {
    const scope = mlab.asn || 'IR-ALL';
    rows.push(['M-Lab NDT', scope, 'download_median', point.date, point.downloadMedianMbps, 'Mbps', `${point.downloadSamples ?? ''} download samples · context only`]);
    rows.push(['M-Lab NDT', scope, 'upload_median', point.date, point.uploadMedianMbps, 'Mbps', `${point.uploadSamples ?? ''} upload samples · context only`]);
    rows.push(['M-Lab NDT', scope, 'download_min_rtt_median', point.date, point.downloadMinRttMedianMs, 'ms', 'context only']);
  }
  const apnic = overview.apnic;
  for (const point of apnic?.points || []) {
    const scope = apnic.asn || 'IR-ALL';
    rows.push(['APNIC Labs IPv6', scope, 'ipv6_capable_raw', point.date, point.raw?.capablePercent, 'percent', `${point.raw?.seen ?? ''} raw samples · context only`]);
    rows.push(['APNIC Labs IPv6', scope, 'ipv6_preferred_raw', point.date, point.raw?.preferredPercent, 'percent', `${point.raw?.seen ?? ''} raw samples · context only`]);
    rows.push(['APNIC Labs IPv6', scope, 'ipv6_capable_30d', point.date, point.smoothed30?.capablePercent, 'percent', '30-day APNIC context']);
  }
  for (const incident of contextState.intelligence?.accessNow?.incidents || []) {
    rows.push(['Access Now STOP', 'IR', 'shutdown_incident', incident.startDate, [incident.shutdownType, incident.shutdownExtent].filter(Boolean).join(' / '), 'context event', `${incident.event || ''} · status=${incident.status || 'unknown'} · lineage=${stopEvidenceLabel(incident)} · independentTechnicalVote=false`]);
  }
  rows.push(...buildV16ShutdownContextExportRows(contextState.intelligence));
  const csv = rows.map((row) => row.map(contextCsvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const since = document.querySelector('#since-input')?.value || 'start';
  const until = document.querySelector('#until-input')?.value || 'end';
  link.download = `iran-internet-context-${since}-${until}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

insertContextPanels();

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (response.ok && (url.startsWith('/api/overview?') || url.startsWith('/api/intelligence?'))) {
      response.clone().json().then((payload) => {
        setTimeout(() => {
          if (url.startsWith('/api/overview?')) renderOverviewContext(payload);
          else renderIntelligenceContext(payload);
        }, 0);
      }).catch(() => {});
    }
  } catch {}
  return response;
};
