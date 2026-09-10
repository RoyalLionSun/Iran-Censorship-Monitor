function coverageEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function coverageNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function coveragePercent(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function coverageDate(value) {
  if (!value) return '—';
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return String(value);
  return new Date(timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
}

function coverageClass(value) {
  return String(value || '—').replaceAll('_', ' ');
}

function insertAsnCoveragePanel() {
  const anchor = document.querySelector('#globalping-panel');
  if (!anchor || document.querySelector('#asn-coverage-panel')) return;
  anchor.insertAdjacentHTML('afterend', `
    <article class="panel span-12" id="asn-coverage-panel">
      <header class="panel-header">
        <div><span class="section-label">IRAN ASN INVENTORY / OPERATOR SNAPSHOT</span><h2>Coverage and review queue</h2></div>
        <span id="asn-coverage-state" class="micro-state">Loading</span>
      </header>
      <p class="panel-note">This panel reads a local operator-generated snapshot only. RIR association, RIPE RIS routing counts and ipverse topology metadata stay separate context dimensions; review priority is not a censorship score.</p>
      <div id="asn-coverage-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Loading</b></div></div>
      <div id="asn-coverage-warning" class="micro-note"></div>
      <div class="table-wrap compact-table-wrap"><table><thead><tr><th>ASN</th><th>Network</th><th>Review class</th><th>Role / category</th><th>Last announced</th><th>Topology</th></tr></thead><tbody id="asn-coverage-table"><tr><td colspan="6" class="table-empty">Loading local ASN coverage snapshot.</td></tr></tbody></table></div>
    </article>`);
}

function renderUnavailable(payload) {
  const state = document.querySelector('#asn-coverage-state');
  const summary = document.querySelector('#asn-coverage-summary');
  const warning = document.querySelector('#asn-coverage-warning');
  const table = document.querySelector('#asn-coverage-table');
  if (!state || !summary || !warning || !table) return;
  const status = payload?.status || 'error';
  state.textContent = status;
  if (status === 'no_data') {
    summary.innerHTML = '<div class="mini-stat"><span>Status</span><b>No local snapshot</b></div><div class="mini-stat"><span>Iran ASN count</span><b>—</b></div><div class="mini-stat"><span>Independent censorship votes</span><b>0</b></div>';
    warning.textContent = payload?.note || 'Run the operator inventory command with --write. Missing snapshot data is not zero Iran ASNs.';
    table.innerHTML = '<tr><td colspan="6" class="table-empty">No operator snapshot is available. No inventory count is inferred.</td></tr>';
    return;
  }
  summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Independent censorship votes</span><b>0</b></div>`;
  warning.textContent = payload?.error || payload?.note || 'Local ASN coverage snapshot is unavailable.';
  table.innerHTML = '<tr><td colspan="6" class="table-empty">Invalid snapshot rejected fail-closed.</td></tr>';
}

function renderAsnCoverage(payload) {
  insertAsnCoveragePanel();
  if (!payload?.ok || payload?.status === 'no_data' || payload?.status === 'error') {
    renderUnavailable(payload);
    return;
  }
  const state = document.querySelector('#asn-coverage-state');
  const summary = document.querySelector('#asn-coverage-summary');
  const warning = document.querySelector('#asn-coverage-warning');
  const table = document.querySelector('#asn-coverage-table');
  if (!state || !summary || !warning || !table) return;

  state.textContent = payload.status === 'stale' ? 'Stale snapshot' : 'Observed snapshot';
  summary.innerHTML = `
    <div class="mini-stat"><span>RIR-associated ASNs</span><b>${coverageNumber(payload.inventory?.total)}</b></div>
    <div class="mini-stat"><span>Curated profiles</span><b>${coverageNumber(payload.curatedCoverage?.curatedInInventoryCount)} / ${coverageNumber(payload.curatedCoverage?.inventoryCount)}</b></div>
    <div class="mini-stat"><span>Curated coverage</span><b>${coveragePercent(payload.curatedCoverage?.coveragePercent)}%</b></div>
    <div class="mini-stat"><span>Registered / routed</span><b>${coverageNumber(payload.routingSummary?.registeredCount)} / ${coverageNumber(payload.routingSummary?.routedCount)}</b></div>
    <div class="mini-stat"><span>ipverse coverage</span><b>${coverageNumber(payload.enrichment?.secondaryCoverageCount)} / ${coverageNumber(payload.inventory?.total)}</b></div>
    <div class="mini-stat"><span>Review queue</span><b>${coverageNumber(payload.candidateQueue?.length)}</b></div>
    <div class="mini-stat"><span>Snapshot age</span><b>${coverageNumber(payload.ageHours)} h</b></div>
    <div class="mini-stat"><span>Independent censorship votes</span><b>0</b></div>`;

  const stalePrefix = payload.status === 'stale' ? `STALE: older than ${coverageNumber(payload.maxAgeHours)} hours. ` : '';
  warning.textContent = `${stalePrefix}Generated ${coverageDate(payload.generatedAt)}. RIR inventory is country-scope metadata; routed is a country-level RIPE RIS count, not an ASN-by-ASN routed classification.`;

  table.innerHTML = payload.candidateQueue?.length ? payload.candidateQueue.slice(0, 20).map((row) => {
    const secondary = row.secondary || {};
    const role = secondary.networkRole || '—';
    const category = secondary.category || '—';
    const topology = `reach ${coverageNumber(secondary.reach)} · customers ${coverageNumber(secondary.customers)} · degree ${coverageNumber(secondary.degree)}`;
    const mismatch = row.quality?.secondaryCountryMismatch ? '<small>secondary country mismatch · review required</small>' : '';
    return `<tr>
      <td>${coverageEscape(row.asn)}</td>
      <td>${coverageEscape(row.displayName)}${mismatch}</td>
      <td>${coverageEscape(coverageClass(row.candidateClass))}<small>analyst priority only</small></td>
      <td>${coverageEscape(role)}<small>${coverageEscape(category)}</small></td>
      <td>${coverageEscape(row.secondary?.lastAnnounced || '—')}</td>
      <td>${coverageEscape(topology)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="table-empty">Snapshot contains no uncurated review candidates.</td></tr>';
}

async function loadAsnCoverage() {
  insertAsnCoveragePanel();
  try {
    const response = await window.fetch('/api/asn-coverage');
    let payload;
    try { payload = await response.json(); } catch { payload = { ok: false, status: 'error', error: 'ASN coverage endpoint returned invalid JSON.' }; }
    if (!response.ok && payload?.ok !== false) payload = { ...payload, ok: false, status: 'error' };
    renderAsnCoverage(payload);
  } catch (error) {
    renderAsnCoverage({ ok: false, status: 'error', error: error?.message || String(error) });
  }
}

insertAsnCoveragePanel();
setTimeout(loadAsnCoverage, 0);
