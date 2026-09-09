function v13Escape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function v13Number(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function v13SafeUrl(value, fallback = '#') {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch { return fallback; }
}

function insertV13Panels() {
  const anchor = document.querySelector('#apnic-panel') || document.querySelector('#ripe-panel');
  if (!anchor || document.querySelector('#asrank-panel')) return;
  anchor.insertAdjacentHTML('afterend', `
    <article class="panel span-6" id="asrank-panel">
      <header class="panel-header"><div><span class="section-label">CAIDA ASRANK / TOPOLOGY CONTEXT</span><h2>AS dependency structure</h2></div><a id="asrank-source-link" href="https://asrank.caida.org/" target="_blank" rel="noreferrer">ASRank ↗</a></header>
      <p class="panel-note">Macroscopic AS rank, customer-cone and inferred relationship context. ASRank incorporates CAIDA Ark plus Route Views/RIPE routing inputs; it is not an independent censorship vote and does not measure traffic or reachability.</p>
      <div id="asrank-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Pending</b></div></div>
      <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Related ASN</th><th>Relationship</th><th>Observed paths</th><th>Locations</th></tr></thead><tbody id="asrank-table"><tr><td colspan="4" class="table-empty">No ASRank context loaded.</td></tr></tbody></table></div>
    </article>
    <article class="panel span-6" id="rpki-panel">
      <header class="panel-header"><div><span class="section-label">RIPESTAT RPKI / ROUTE-ORIGIN INTEGRITY</span><h2>ROA validity & coverage</h2></div><a id="rpki-source-link" href="https://stat.ripe.net/" target="_blank" rel="noreferrer">RIPEstat ↗</a></header>
      <p class="panel-note">RPKI validates route-origin authorization, not censorship. Invalid, unknown or missing ROAs can reflect configuration/coverage issues and do not establish hijacking, intent or user-level unreachability.</p>
      <div id="rpki-summary" class="mini-stats"><div class="mini-stat"><span>Status</span><b>Pending</b></div></div>
      <div class="table-wrap compact-table-wrap"><table><thead><tr><th>Prefix</th><th>RPKI state</th><th>Description</th></tr></thead><tbody id="rpki-table"><tr><td colspan="3" class="table-empty">No RPKI context loaded.</td></tr></tbody></table></div>
    </article>`);
}

function renderAsRank(asrank) {
  const summary = document.querySelector('#asrank-summary');
  const table = document.querySelector('#asrank-table');
  if (!summary || !table) return;
  if (!asrank?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${v13Escape(asrank?.error || 'Unavailable')}</b></div>`;
    table.innerHTML = '<tr><td colspan="4" class="table-empty">CAIDA ASRank context unavailable.</td></tr>';
    return;
  }
  const row = asrank.overview || {};
  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${v13Escape(asrank.status || '—')}</b></div>
    <div class="mini-stat"><span>AS rank</span><b>${v13Number(row.rank)}</b></div>
    <div class="mini-stat"><span>Customer-cone ASNs</span><b>${v13Number(row.customerCone?.asns)}</b></div>
    <div class="mini-stat"><span>Customers / peers</span><b>${v13Number(row.degree?.customers)} / ${v13Number(row.degree?.peers)}</b></div>
    <div class="mini-stat"><span>Transit relations</span><b>${v13Number(row.degree?.transits)}</b></div>
    <div class="mini-stat"><span>Independent censorship votes</span><b>0</b></div>`;
  table.innerHTML = asrank.links?.length ? asrank.links.slice(0, 20).map((link) => `<tr><td>${v13Escape(link.asn)}</td><td>${v13Escape(link.relationship || '—')}</td><td>${v13Number(link.paths)}</td><td>${v13Escape((link.locations || []).slice(0, 3).join(', ') || '—')}</td></tr>`).join('') : '<tr><td colspan="4" class="table-empty">No ASRank relationship rows returned for this ASN.</td></tr>';
  const source = document.querySelector('#asrank-source-link');
  if (source && asrank.sourceUrls?.overview) source.href = v13SafeUrl(asrank.sourceUrls.overview, source.href);
}

function renderRpki(rpki) {
  const summary = document.querySelector('#rpki-summary');
  const table = document.querySelector('#rpki-table');
  if (!summary || !table) return;
  if (!rpki?.ok) {
    summary.innerHTML = `<div class="mini-stat"><span>Status</span><b>Error</b></div><div class="mini-stat"><span>Detail</span><b>${v13Escape(rpki?.error || 'Unavailable')}</b></div>`;
    table.innerHTML = '<tr><td colspan="3" class="table-empty">RIPEstat RPKI context unavailable.</td></tr>';
    return;
  }
  const coverage = rpki.coverage || {};
  summary.innerHTML = `
    <div class="mini-stat"><span>Status</span><b>${v13Escape(rpki.status || '—')}</b></div>
    <div class="mini-stat"><span>Valid</span><b>${v13Number(coverage.valid)}</b></div>
    <div class="mini-stat"><span>Invalid ASN / length</span><b>${v13Number(coverage.invalid_asn)} / ${v13Number(coverage.invalid_length)}</b></div>
    <div class="mini-stat"><span>Unknown</span><b>${v13Number(coverage.unknown)}</b></div>
    <div class="mini-stat"><span>Checked / announced</span><b>${v13Number(coverage.checkedPrefixCount)} / ${v13Number(coverage.totalPrefixCount)}</b></div>
    <div class="mini-stat"><span>Independent censorship votes</span><b>0</b></div>`;
  table.innerHTML = rpki.validations?.length ? rpki.validations.slice(0, 20).map((row) => `<tr><td>${v13Escape(row.prefix)}</td><td>${v13Escape(row.status)}</td><td>${v13Escape(row.description || '—')}</td></tr>`).join('') : '<tr><td colspan="3" class="table-empty">No prefix validation rows returned. Missing data is not treated as valid routing.</td></tr>';
  const source = document.querySelector('#rpki-source-link');
  if (source && rpki.sourceUrls?.announcedPrefixes) source.href = v13SafeUrl(rpki.sourceUrls.announcedPrefixes, source.href);
}

function renderV13Overview(payload) {
  renderAsRank(payload.asrank);
  renderRpki(payload.rpki);
}

insertV13Panels();

const v13NativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await v13NativeFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (response.ok && url.startsWith('/api/overview?')) {
      response.clone().json().then((payload) => setTimeout(() => renderV13Overview(payload), 0)).catch(() => {});
    }
  } catch {}
  return response;
};
