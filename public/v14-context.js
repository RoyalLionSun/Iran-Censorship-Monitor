const v14State = { overview: null, intelligence: null };

function v14Escape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function v14Number(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function v14Date(value) {
  const text = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function v14AddDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function insertV14Panel() {
  const torPanel = document.querySelector('#tor-panel');
  if (!torPanel || document.querySelector('#v14-tor-context-panel')) return;
  torPanel.insertAdjacentHTML('afterend', `
    <article class="panel span-6" id="v14-tor-context-panel">
      <header class="panel-header">
        <div><span class="section-label">TOR TRANSPORT / INCIDENT CONTEXT</span><h2>Bounded change review</h2></div>
        <span id="v14-context-state" class="micro-state">Pending</span>
      </header>
      <p class="panel-note">Iran Tor transport values remain published lower/upper estimate bounds. Incident links are temporal context only: no precise client-count delta, causal attribution, blocking verdict or additional technical sensor vote is created.</p>
      <div id="v14-context-summary" class="mini-stats">
        <div class="mini-stat"><span>Status</span><b>Awaiting overview</b></div>
        <div class="mini-stat"><span>Independent technical votes</span><b>0</b></div>
      </div>
      <div id="v14-bridgedb-note" class="micro-note">BridgeDB demand: GLOBAL · not Iran-specific.</div>
      <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Incident start</th><th>Transport</th><th>Before bound</th><th>Incident-window bound</th><th>Interpretation</th></tr></thead><tbody id="v14-context-table"><tr><td colspan="5" class="table-empty">Load measurements, then use “Discover current reporting” to add STOP incident context.</td></tr></tbody></table></div>
    </article>`);
}

function v14BoundPair(row) {
  if (!row || !Number.isFinite(row.low) || !Number.isFinite(row.high) || row.low < 0 || row.high < row.low) return null;
  return { low: row.low, high: row.high };
}

function v14ChangeLabel(before, during) {
  if (!before || !during) return 'insufficient paired bounds';
  if (before.high < during.low) return 'higher non-overlapping estimate interval';
  if (before.low > during.high) return 'lower non-overlapping estimate interval';
  return 'overlapping bounds · direction indeterminate';
}

function v14IncidentWindow(incident, selectedUntil) {
  const start = v14Date(incident?.startDate);
  if (!start) return null;
  const explicitEnd = v14Date(incident?.endDate);
  if (explicitEnd) return { start, end: explicitEnd };
  if (String(incident?.status || '').trim().toLowerCase() === 'ongoing') return { start, end: v14Date(selectedUntil) || start };
  return { start, end: start };
}

function v14Comparisons(tor, accessNow, baselineDays = 7) {
  if (!tor?.ok || !Array.isArray(tor.transports) || !accessNow?.ok || !Array.isArray(accessNow.incidents)) return [];
  if (tor.independentCensorshipVote !== false || tor.sourceFamily !== 'tor') return [];
  const rows = [];
  const selectedUntil = v14State.overview?.input?.until || document.querySelector('#until-input')?.value || null;

  for (const incident of accessNow.incidents) {
    if (incident.independentTechnicalVote !== false) continue;
    const window = v14IncidentWindow(incident, selectedUntil);
    if (!window) continue;
    const baselineStart = v14AddDays(window.start, -baselineDays);
    for (const series of tor.transports) {
      const transport = String(series?.transport || '').trim();
      if (!transport) continue;
      const observations = (series.rows || [])
        .filter((row) => v14Date(row.date) && v14BoundPair(row))
        .sort((a, b) => a.date.localeCompare(b.date));
      const beforeRow = [...observations].reverse().find((row) => row.date >= baselineStart && row.date < window.start) || null;
      const duringRow = observations.find((row) => row.date >= window.start && row.date <= window.end) || null;
      if (!beforeRow && !duringRow) continue;
      const before = v14BoundPair(beforeRow);
      const during = v14BoundPair(duringRow);
      rows.push({
        incidentStart: window.start,
        transport,
        before,
        during,
        label: v14ChangeLabel(before, during),
      });
      if (rows.length >= 50) return rows;
    }
  }
  return rows;
}

function v14BoundText(pair) {
  return pair ? `${v14Number(pair.low)}–${v14Number(pair.high)}` : '—';
}

function renderV14Context() {
  const summary = document.querySelector('#v14-context-summary');
  const table = document.querySelector('#v14-context-table');
  const bridgeNote = document.querySelector('#v14-bridgedb-note');
  const state = document.querySelector('#v14-context-state');
  if (!summary || !table || !bridgeNote || !state) return;

  const tor = v14State.overview?.tor;
  const accessNow = v14State.intelligence?.accessNow;
  if (!tor?.ok) {
    state.textContent = tor?.error ? 'Tor unavailable' : 'No Tor data';
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>${v14Escape(tor?.status || 'no_data')}</b></div><div class="mini-stat"><span>Independent technical votes</span><b>0</b></div>`;
    table.innerHTML = '<tr><td colspan="5" class="table-empty">No defensible Iran Tor transport bounds are available for contextual comparison.</td></tr>';
    bridgeNote.textContent = 'BridgeDB demand: GLOBAL · not Iran-specific.';
    return;
  }

  const bridgeCoverage = tor.coverage?.bridgeDbGlobal || 'no_data';
  const bridgeLatest = tor.bridgeDemandGlobal?.transports?.find((row) => Number.isFinite(row.latestRequestsApprox));
  bridgeNote.textContent = `BridgeDB demand: GLOBAL · not Iran-specific · ${bridgeCoverage}${bridgeLatest ? ` · latest ${bridgeLatest.transport} ≈ ${v14Number(bridgeLatest.latestRequestsApprox)} requests` : ''}. Global demand is excluded from Iran incident comparison.`;

  const comparisons = v14Comparisons(tor, accessNow);
  const supported = comparisons.filter((row) => row.label.startsWith('higher ') || row.label.startsWith('lower ')).length;
  const contextStatus = !v14State.intelligence ? 'awaiting STOP context' : (accessNow?.ok ? (accessNow.status || 'observed') : 'STOP unavailable');
  state.textContent = contextStatus;
  summary.innerHTML = `
    <div class="mini-stat"><span>Tor status</span><b>${v14Escape(tor.status || 'observed')}</b></div>
    <div class="mini-stat"><span>STOP context</span><b>${v14Escape(contextStatus)}</b></div>
    <div class="mini-stat"><span>Bound comparisons</span><b>${v14Number(comparisons.length)}</b></div>
    <div class="mini-stat"><span>Non-overlapping directions</span><b>${v14Number(supported)}</b></div>
    <div class="mini-stat"><span>BridgeDB scope</span><b>GLOBAL · not Iran-specific</b></div>
    <div class="mini-stat"><span>Independent technical votes</span><b>0</b></div>`;

  if (!v14State.intelligence) {
    table.innerHTML = '<tr><td colspan="5" class="table-empty">Use “Discover current reporting” to load STOP incident context. Tor data alone does not create an incident claim.</td></tr>';
    return;
  }
  if (!accessNow?.ok) {
    table.innerHTML = `<tr><td colspan="5" class="table-empty">STOP context unavailable: ${v14Escape(accessNow?.error || 'unknown error')}. No incident comparison is inferred.</td></tr>`;
    return;
  }
  table.innerHTML = comparisons.length ? comparisons.map((row) => `<tr><td>${v14Escape(row.incidentStart)}</td><td>${v14Escape(row.transport)}</td><td>${v14Escape(v14BoundText(row.before))}</td><td>${v14Escape(v14BoundText(row.during))}</td><td>${v14Escape(row.label)}<small> · temporal context only · no causal attribution</small></td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">No paired Tor transport bounds overlap the loaded STOP incident windows. This is a no-data result, not evidence that no disruption occurred.</td></tr>';
}

insertV14Panel();

const v14NativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await v14NativeFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (response.ok && url.startsWith('/api/overview?')) {
      response.clone().json().then((payload) => {
        v14State.overview = payload;
        setTimeout(renderV14Context, 0);
      }).catch(() => {});
    } else if (response.ok && url.startsWith('/api/intelligence?')) {
      response.clone().json().then((payload) => {
        v14State.intelligence = payload;
        setTimeout(renderV14Context, 0);
      }).catch(() => {});
    }
  } catch {}
  return response;
};
