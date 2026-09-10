const shutdownUiState = { intelligence: null };

function shutdownEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function shutdownNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function shutdownDate(value) {
  if (!value) return '—';
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return String(value);
  return new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function shutdownSafeUrl(value, fallback) {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch { return fallback; }
}

function insertShutdownUi() {
  const stopContext = document.querySelector('#stop-context');
  if (!stopContext || document.querySelector('#pulse-context')) return;
  stopContext.insertAdjacentHTML('afterend', `
    <section id="pulse-context">
      <div class="panel-header"><div><span class="section-label">INTERNET SOCIETY PULSE</span><h2>Current Iran shutdown context</h2></div><a id="pulse-source-link" href="https://pulse.internetsociety.org/en/shutdowns/" target="_blank" rel="noreferrer">Pulse shutdowns ↗</a></div>
      <p class="panel-note">Pulse is curated shutdown context with provider verification metadata. It is not an additional independent technical sensor and missing credentials are never interpreted as zero incidents.</p>
      <div id="pulse-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Load intelligence</b></div></div>
      <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Start / end</th><th>Type / area</th><th>Verification</th><th>Cause</th></tr></thead><tbody id="pulse-table"><tr><td colspan="4" class="table-empty">Load intelligence to display Pulse shutdown context.</td></tr></tbody></table></div>
    </section>
    <section id="shutdown-correlation-context">
      <div class="panel-header"><div><span class="section-label">STOP ↔ PULSE / ANALYST CONTEXT</span><h2>Possible incident correlation</h2></div></div>
      <p class="panel-note">Only matching time intervals plus matching broad scope create a review candidate. Records stay separate, are never auto-merged and contribute zero independent technical votes.</p>
      <div id="shutdown-correlation-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Load intelligence</b></div></div>
      <div id="shutdown-correlation-warning" class="micro-note"></div>
      <div class="table-wrap compact-table-wrap"><table><thead><tr><th>STOP record</th><th>Pulse record</th><th>Scope</th><th>Relation</th></tr></thead><tbody id="shutdown-correlation-table"><tr><td colspan="4" class="table-empty">No correlation context loaded.</td></tr></tbody></table></div>
    </section>`);
}

function renderPulseContext(pulse) {
  const summary = document.querySelector('#pulse-summary');
  const table = document.querySelector('#pulse-table');
  const link = document.querySelector('#pulse-source-link');
  if (!summary || !table) return;

  if (!pulse?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${shutdownEscape(pulse?.error || 'Unavailable')}</b></div><div class="mini-stat"><span>Independent sensor votes</span><b>0</b></div>`;
    table.innerHTML = '<tr><td colspan="4" class="table-empty">Pulse shutdown context unavailable; no incident count is inferred.</td></tr>';
    return;
  }

  if (pulse.status === 'token_required') {
    summary.innerHTML = '<div class="mini-stat"><span>Status</span><b>Token required</b></div><div class="mini-stat"><span>Matched incidents</span><b>—</b></div><div class="mini-stat"><span>Independent sensor votes</span><b>0</b></div>';
    table.innerHTML = '<tr><td colspan="4" class="table-empty">INTERNET_SOCIETY_PULSE_API_TOKEN is not configured. Missing access is not zero incidents.</td></tr>';
    if (link && pulse.methodologyUrl) link.href = shutdownSafeUrl(pulse.methodologyUrl, link.href);
    return;
  }

  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${shutdownEscape(pulse.status || '—')}</b></div>
    <div class="mini-stat"><span>Matched incidents</span><b>${shutdownNumber(pulse.totalMatched)}</b></div>
    <div class="mini-stat"><span>Independent sensor votes</span><b>0</b></div>`;

  table.innerHTML = pulse.events?.length ? pulse.events.slice(0, 20).map((event) => `<tr>
    <td>${shutdownEscape(shutdownDate(event.startTime || event.startDate))}<small> → ${event.endTime || event.endDate ? shutdownEscape(shutdownDate(event.endTime || event.endDate)) : 'ongoing / open-ended'}</small></td>
    <td>${shutdownEscape(event.type || '—')}<small>${event.affectedRegions ? ` · ${shutdownEscape(event.affectedRegions)}` : ''}</small></td>
    <td>${shutdownEscape(event.verificationLevel || '—')}<small> · context only</small></td>
    <td>${shutdownEscape(event.cause || '—')}</td>
  </tr>`).join('') : '<tr><td colspan="4" class="table-empty">No Pulse incidents overlap this selected window. This is not evidence that no disruption occurred.</td></tr>';

  if (link) link.href = shutdownSafeUrl(pulse.methodologyUrl || pulse.sourceUrl, link.href);
}

function renderShutdownCorrelation(context) {
  const summary = document.querySelector('#shutdown-correlation-summary');
  const warning = document.querySelector('#shutdown-correlation-warning');
  const table = document.querySelector('#shutdown-correlation-table');
  if (!summary || !warning || !table) return;

  if (!context?.ok) {
    summary.innerHTML = '<div class="mini-stat"><span>Status</span><b>Unavailable</b></div><div class="mini-stat"><span>Independent sensor votes</span><b>0</b></div>';
    warning.textContent = 'Correlation context unavailable; no incident relationship is inferred.';
    table.innerHTML = '<tr><td colspan="4" class="table-empty">No correlation context available.</td></tr>';
    return;
  }

  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${shutdownEscape(context.status || '—')}</b></div>
    <div class="mini-stat"><span>STOP records</span><b>${shutdownNumber(context.stop?.count)}</b></div>
    <div class="mini-stat"><span>Pulse records</span><b>${context.pulse?.available === false ? '—' : shutdownNumber(context.pulse?.count)}</b></div>
    <div class="mini-stat"><span>Review candidates</span><b>${shutdownNumber(context.possibleSameIncidentCount)}</b></div>
    <div class="mini-stat"><span>Auto-merged</span><b>${shutdownNumber(context.automaticMergedCount)}</b></div>
    <div class="mini-stat"><span>Independent sensor votes</span><b>0</b></div>`;

  warning.textContent = context.note || 'Correlation is analyst context only; STOP and Pulse remain separate provenance records.';
  table.innerHTML = context.correlations?.length ? context.correlations.slice(0, 20).map((row) => `<tr>
    <td>${shutdownEscape(row.stopId || '—')}</td>
    <td>${shutdownEscape(row.pulseId || '—')}</td>
    <td>${shutdownEscape(row.scopeClass || '—')}</td>
    <td>${shutdownEscape(row.relation || '—')}<small> · possible same incident · never auto-merged</small></td>
  </tr>`).join('') : '<tr><td colspan="4" class="table-empty">No conservative STOP/Pulse correlation candidate for this window. This does not disprove a shutdown.</td></tr>';
}

function renderShutdownIntelligence(payload) {
  shutdownUiState.intelligence = payload;
  insertShutdownUi();
  renderPulseContext(payload?.pulse);
  renderShutdownCorrelation(payload?.shutdownContext);
}

insertShutdownUi();

const shutdownPreviousFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await shutdownPreviousFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (response.ok && url.startsWith('/api/intelligence?')) {
      response.clone().json().then((payload) => setTimeout(() => renderShutdownIntelligence(payload), 0)).catch(() => {});
    }
  } catch {}
  return response;
};
