import { t } from './i18n.js';

function situationEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function ensureSituationStyles() {
  if (document.querySelector('link[data-v18-situation-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/v18.css';
  link.dataset.v18SituationStyle = '1';
  document.head.appendChild(link);
}

function insertSituationPanel() {
  ensureSituationStyles();
  const assessment = document.querySelector('#assessment-strip');
  if (!assessment || document.querySelector('#current-situation')) return;
  assessment.insertAdjacentHTML('beforebegin', `
    <section id="current-situation" class="situation-overview" data-severity="neutral" aria-live="polite">
      <div class="situation-primary">
        <span id="situation-kicker" class="section-label">${situationEscape(t('situation.kicker'))}</span>
        <h1 id="situation-headline">${situationEscape(t('situation.headline.insufficient'))}</h1>
        <p id="situation-meaning">${situationEscape(t('situation.meaning.insufficient'))}</p>
      </div>
      <div class="situation-facts">
        <div><span>${situationEscape(t('situation.label.confidence'))}</span><b id="situation-confidence">—</b></div>
        <div><span>${situationEscape(t('situation.label.sources'))}</span><b id="situation-sources">0</b></div>
        <div><span>${situationEscape(t('situation.label.scope'))}</span><b id="situation-scope" class="technical-ltr">—</b></div>
        <div><span>${situationEscape(t('situation.label.shutdown'))}</span><b id="situation-shutdown">${situationEscape(t('situation.shutdown.notEstablished'))}</b></div>
      </div>
      <div class="situation-explanation">
        <div>
          <strong>${situationEscape(t('situation.label.why'))}</strong>
          <ul id="situation-drivers"><li>${situationEscape(t('situation.noElevatedDrivers'))}</li></ul>
          <p id="situation-divergence"></p>
        </div>
        <div class="situation-limit">
          <strong>${situationEscape(t('situation.label.limit'))}</strong>
          <p id="situation-caveat">${situationEscape(t('situation.caveat.insufficient'))}</p>
        </div>
      </div>
    </section>`);
}

function signalMetric(driver) {
  if (driver?.value === null || driver?.value === undefined) return '';
  const numeric = Number(driver.value);
  const value = Number.isFinite(numeric) ? String(Math.round(numeric * 10) / 10) : String(driver.value);
  return [value, driver.unit].filter(Boolean).join(' ');
}

function renderSituation(assessment) {
  insertSituationPanel();
  const summary = assessment?.publicSummary;
  const panel = document.querySelector('#current-situation');
  if (!panel) return;
  if (!summary) {
    panel.dataset.severity = 'neutral';
    return;
  }

  panel.dataset.severity = summary.severity || 'neutral';
  document.querySelector('#situation-kicker').textContent = t('situation.kicker');
  document.querySelector('#situation-headline').textContent = t(summary.headlineKey);
  document.querySelector('#situation-meaning').textContent = t(summary.meaningKey);
  document.querySelector('#situation-caveat').textContent = t(summary.caveatKey);
  document.querySelector('#situation-confidence').textContent = t(`confidence.${summary.confidence || 'none'}`);
  document.querySelector('#situation-sources').textContent = String(summary.sourceCount ?? 0);
  document.querySelector('#situation-scope').textContent = summary.scope || '—';
  document.querySelector('#situation-shutdown').textContent = t('situation.shutdown.notEstablished');
  document.querySelector('#situation-divergence').textContent = t(summary.controlDataPlane?.messageKey || 'situation.controlDataPlane.noDivergence');

  const drivers = document.querySelector('#situation-drivers');
  if (summary.drivers?.length) {
    drivers.innerHTML = summary.drivers.map((driver) => {
      const metric = signalMetric(driver);
      return `<li><strong>${situationEscape(driver.source)}</strong><span>${situationEscape(t(`situation.driver.${driver.state}`))}${metric ? ` · <b class="technical-ltr">${situationEscape(metric)}</b>` : ''}</span></li>`;
    }).join('');
  } else {
    drivers.innerHTML = `<li>${situationEscape(t('situation.noElevatedDrivers'))}</li>`;
  }
}

insertSituationPanel();

const previousFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await previousFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (response.ok && url.startsWith('/api/overview?')) {
      response.clone().json().then((payload) => setTimeout(() => renderSituation(payload?.assessment), 0)).catch(() => {});
    }
  } catch {}
  return response;
};
