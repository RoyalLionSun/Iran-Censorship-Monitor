const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  config: null,
  overview: null,
  circumvention: null,
  providers: null,
  loading: false,
  requestSerial: 0,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function number(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
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
  return payload;
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

function setLoading(value) {
  state.loading = value;
  $('#refresh-button').disabled = value;
  $('#refresh-button').textContent = value ? 'Loading…' : 'Refresh';
  $('#ooni-panel').classList.toggle('loading-shimmer', value);
  $('#ripe-panel').classList.toggle('loading-shimmer', value);
  $('#radar-panel').classList.toggle('loading-shimmer', value);
  $('#ioda-panel').classList.toggle('loading-shimmer', value);
  $('#tor-panel').classList.toggle('loading-shimmer', value);
  if (value) $('#ooni-query-state').textContent = 'Requesting live sources';
}

function stateDot(element, status) {
  element.className = 'state-dot ' + (status === 'ok' || status === 'observed' ? 'ok' : status === 'warn' || status === 'partial' || status === 'token_required' ? 'warn' : status === 'error' ? 'error' : 'neutral');
}

function renderConfig(config) {
  const select = $('#asn-select');
  select.innerHTML = '<option value="ALL">All Iran networks (may hit OONI row limit)</option>' + config.asns.map((item) => `<option value="${escapeHtml(item.asn)}">${escapeHtml(item.asn)} · ${escapeHtml(item.name)}</option>`).join('');
  select.value = 'AS58224';
  $('#since-input').value = config.defaultRange.since;
  $('#until-input').value = config.defaultRange.until;
  renderSources(config.sources, config.radarConfigured);
}

function renderSources(sources, radarConfigured) {
  $('#source-grid').innerHTML = sources.map((source) => {
    const access = source.id === 'radar' && !radarConfigured ? 'token not configured' : source.access;
    return `<div class="source-card"><div class="source-card-head"><strong>${escapeHtml(source.name)}</strong><span class="access">${escapeHtml(access)}</span></div><p>${escapeHtml(source.role)}</p><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open source ↗</a>${source.docs ? ` · <a href="${escapeHtml(source.docs)}" target="_blank" rel="noreferrer">Docs ↗</a>` : ''}</div>`;
  }).join('');
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
    const stateClass = signal.strong ? 'strong' : signal.elevated ? 'elevated' : '';
    const status = signal.strong ? 'STRONG SIGNAL' : signal.elevated ? 'ELEVATED' : signal.usableForAssessment === false ? 'EXCLUDED' : 'NOT ELEVATED';
    return `<div class="signal-item"><div class="signal-item-head"><strong>${escapeHtml(signal.source)}</strong><span class="${stateClass}">${status}</span></div><div class="signal-metric"><b>${signal.value===null?'—':number(signal.value,1)}</b><small>${escapeHtml(signal.unit)} · n=${number(signal.sample,0)}</small></div><p>${escapeHtml(signal.note)}</p></div>`;
  }).join('') : '<div class="empty-state">No independent measurement source returned usable observations.</div>';
}

function renderKpis(overview) {
  const ooni = overview.ooni, ripe = overview.ripe, radar = overview.radar, ioda = overview.ioda, tor = overview.tor;
  $('#kpi-ooni-count').textContent = ooni?.ok ? number(ooni.totalMeasurements,0) : 'Error';
  $('#kpi-ooni-meta').textContent = ooni?.ok ? `${ooni.points?.length || 0} UTC days · ${ooni.totalConfirmed || 0} confirmed${ooni.truncatedAtApiLimit ? ' · truncated' : ''}` : (ooni?.error || 'Unavailable');
  stateDot($('#ooni-state-dot'), ooni?.ok && ooni.totalMeasurements ? 'ok' : ooni?.ok ? 'warn' : 'error');
  $('#kpi-anomaly-rate').textContent = ooni?.ok && ooni.anomalyRate !== null ? `${percent(ooni.anomalyRate)}${ooni.truncatedAtApiLimit?'*':''}` : '—';
  $('#kpi-anomaly-meta').textContent = ooni?.truncatedAtApiLimit ? '* API row limit reached; excluded from assessment' : 'Returned OONI rows in selected scope';

  $('#kpi-ripe-probes').textContent = ripe?.ok ? number(ripe.probeCount,0) : 'Error';
  $('#kpi-ripe-meta').textContent = ripe?.ok ? `${number(ripe.overall?.observedProbes || 0,0)} observed · ${number(ripe.overall?.samples || 0,0)} samples` : (ripe?.error || 'Unavailable');
  stateDot($('#ripe-state-dot'), ripe?.ok && ripe.series?.length ? 'ok' : ripe?.ok ? 'warn' : 'error');
  $('#kpi-loss').textContent = ripe?.ok ? percent(ripe.overall?.packetLossPercent) : '—';
  $('#kpi-loss-meta').textContent = ripe?.ok && ripe.overall?.averageRttMs !== null ? `${number(ripe.overall.averageRttMs)} ms average RTT` : 'No RTT sample';

  $('#kpi-ioda').textContent = ioda?.ok ? number(ioda.events?.length || 0,0) : 'Error';
  $('#kpi-ioda-meta').textContent = ioda?.ok ? `${ioda.series?.length || 0} raw signal series · ${ioda.asn || 'IR country'}` : (ioda?.error || 'Unavailable');
  stateDot($('#ioda-state-dot'), ioda?.ok && (ioda.series?.length || ioda.events?.length) ? 'ok' : ioda?.ok ? 'warn' : 'error');

  const radarStatus = radar?.status || 'error';
  $('#kpi-radar').textContent = radarStatus === 'token_required' ? 'Token' : radarStatus === 'observed' ? 'Live' : radarStatus === 'partial' ? 'Partial' : radarStatus === 'error' ? 'Error' : radarStatus;
  $('#kpi-radar-meta').textContent = radarStatus === 'token_required' ? 'CLOUDFLARE_RADAR_API_TOKEN required' : `${radar?.trafficAnomalies?.events?.length || 0} traffic anomalies · ${radar?.outages?.annotations?.length || 0} outages · ${radar?.bgp?.events?.length || 0} BGP events`;
  stateDot($('#radar-state-dot'), radarStatus);

  $('#kpi-tor').textContent = tor?.ok && tor.relay?.latestUsers !== null ? number(tor.relay.latestUsers,0) : tor?.ok ? '—' : 'Error';
  $('#kpi-tor-meta').textContent = tor?.ok ? `${number(tor.bridge?.latestUsers,0)} bridge users · direct estimate shown above` : (tor?.error || 'Unavailable');
  stateDot($('#tor-state-dot'), tor?.ok && (tor.relay?.rows?.length || tor.bridge?.rows?.length) ? 'ok' : tor?.ok ? 'warn' : 'error');

  $('#kpi-freshness').textContent = ageLabel(overview.fetchedAt);
  $('#kpi-freshness-meta').textContent = dateTime(overview.fetchedAt);
  $('#header-updated').textContent = `Updated ${ageLabel(overview.fetchedAt)} ago`;
  const active = [
    ooni?.ok && ooni.totalMeasurements > 0,
    ripe?.ok && ripe.series?.length > 0,
    ioda?.ok && (ioda.series?.length > 0 || ioda.events?.length > 0),
    radarStatus === 'observed' || radarStatus === 'partial',
    tor?.ok && (tor.relay?.rows?.length > 0 || tor.bridge?.rows?.length > 0),
  ].filter(Boolean).length;
  $('#header-source-state').textContent = `${active}/5 live source families observed`;
}

function renderEvents(overview) {
  const events = [];
  for (const row of overview.ooni?.points || []) {
    if ((row.measurements || 0) >= 10 && (row.anomalyRate || 0) >= 25) events.push({ time: row.date, source: 'OONI', severity: row.anomalyRate >= 60 ? 'critical' : 'warn', title: `${number(row.anomalyRate)}% anomalous OONI rows`, detail: `${row.measurements} measurements · ${row.confirmed || 0} confirmed` });
  }
  for (const item of overview.radar?.outages?.annotations || []) {
    events.push({ time: item.startDate || overview.input.since, source: 'RADAR', severity: 'critical', title: item.description || `${item.outageType || 'Outage'} annotation`, detail: [item.outageCause, item.scope, item.asns?.length ? `${item.asns.length} ASN(s)` : null].filter(Boolean).join(' · ') });
  }
  for (const item of overview.radar?.trafficAnomalies?.events || []) {
    events.push({ time: item.startDate || overview.input.since, source: 'RADAR', severity: item.status === 'VERIFIED' ? 'critical' : 'warn', title: `Traffic anomaly${item.status ? ` · ${item.status.toLowerCase()}` : ''}`, detail: [item.type, item.asn ? `AS${String(item.asn).replace(/^AS/i,'')}` : null, item.asnName, item.locationCode].filter(Boolean).join(' · ') });
  }
  for (const item of overview.radar?.bgp?.events || []) {
    events.push({ time: item.minTimestamp || overview.input.since, source: 'BGP', severity: (item.confidenceScore || 0) >= 8 ? 'critical' : 'warn', title: `BGP hijack event ${item.id ?? ''}`.trim(), detail: `confidence ${number(item.confidenceScore,0)} · ${item.prefixes?.length || 0} prefix(es)` });
  }
  for (const item of overview.ioda?.events || []) {
    events.push({ time: item.start || overview.input.since, source: 'IODA', severity: 'critical', title: `IODA outage event · ${item.datasource || 'signal'}`, detail: `${item.entityName || item.entityCode || 'Iran'}${item.durationSeconds ? ` · ${number(item.durationSeconds / 3600,1)} h` : ''}${item.score !== null && item.score !== undefined ? ` · score ${number(item.score,1)}` : ''}` });
  }
  events.sort((a,b) => Date.parse(b.time) - Date.parse(a.time));
  $('#event-feed').innerHTML = events.length ? events.slice(0,12).map((event) => `<div class="event-item"><span class="event-time">${escapeHtml(shortDate(String(event.time).slice(0,10)))}</span><div class="event-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail || 'Source event')}</small></div><span class="event-source ${event.severity}">${escapeHtml(event.source)}</span></div>`).join('') : '<div class="empty-state">No thresholded OONI days, IODA events or Radar/BGP annotations in this selected window.</div>';
}

function renderOverview(overview) {
  state.overview = overview;
  renderAssessment(overview.assessment);
  renderKpis(overview);
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
    return;
  }
  $('#circumvention-state').textContent = `Updated ${ageLabel(payload.fetchedAt)} ago`;
  $('#circumvention-table').innerHTML = payload.signals.map((row) => {
    const status = row.status === 'observed' ? (row.anomalyRate !== null && row.anomalyRate >= 25 ? 'warn' : 'observed') : row.status;
    return `<tr><td><strong>${escapeHtml(row.testName)}</strong></td><td><span class="status-cell ${status}"><i></i>${escapeHtml(row.status)}</span></td><td>${number(row.measurements,0)}</td><td>${row.anomalyRate===null?'—':percent(row.anomalyRate)} <small>(${number(row.anomalies,0)})</small></td><td>${escapeHtml(row.lastObservation || '—')}</td></tr>`;
  }).join('');
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
async function loadAll() {
  const since = $('#since-input').value, until = $('#until-input').value;
  if (!since || !until || since > until) {
    $('#assessment-label').textContent = 'Invalid date range';
    return;
  }
  if (activeController) activeController.abort();
  activeController = new AbortController();
  const serial = ++state.requestSerial;
  setLoading(true);
  state.providers = null;
  $('#providers-table').innerHTML = '<tr><td colspan="7" class="table-empty">Provider comparison has not been requested for this filter state.</td></tr>';
  try {
    const overview = await api(`/api/overview?${queryString()}`, activeController.signal);
    if (serial !== state.requestSerial) return;
    renderOverview(overview);
    loadCircumvention(serial, activeController.signal);
  } catch (error) {
    if (error.name !== 'AbortError') {
      $('#assessment-strip').dataset.severity = 'critical';
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
    renderSavedRuns();
    await loadAll();
  } catch (error) {
    $('#assessment-strip').dataset.severity = 'critical';
    $('#assessment-label').textContent = `Initialization failed: ${error.message}`;
  }
}

$('#refresh-button').addEventListener('click', loadAll);
$('#export-button').addEventListener('click', exportCsv);
$('#print-button').addEventListener('click', () => window.print());
$('#load-providers').addEventListener('click', loadProviders);
$('#load-measurements').addEventListener('click', loadMeasurementIds);
$('#measurement-select').addEventListener('change', loadMeasurementDetail);
$('#save-vpn-run').addEventListener('click', saveVpnRun);
$('#vpn-form').addEventListener('input', renderVpnCalculation);
$('#vpn-form').addEventListener('reset', () => setTimeout(renderVpnCalculation, 0));
$('#test-select').addEventListener('change', () => { updateTargetVisibility(); scheduleLoad(); });
['#asn-select','#target-select','#since-input','#until-input'].forEach((selector)=>$(selector).addEventListener('change', scheduleLoad));
$$('.presets button').forEach((button)=>button.addEventListener('click',()=>{
  if (button.dataset.days) setPreset(Number(button.dataset.days));
  else { $('#since-input').value='2022-09-15'; $('#until-input').value='2022-09-30'; }
  markPreset(button); loadAll();
}));

init();
