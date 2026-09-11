import { t } from './i18n.js';

function ensureV19Styles() {
  if (document.querySelector('link[data-v19-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/v19.css';
  link.dataset.v19Style = '1';
  document.head.appendChild(link);
}

let lastHealth = null;

function healthText(health) {
  const summary = health?.summary;
  if (!summary) return t('ui.sources.pending');
  const parts = [
    t('sourceHealth.reachable', { reachable: summary.reachable, queried: summary.queried }),
    t('sourceHealth.withData', { count: summary.dataAvailable }),
  ];
  if (summary.scopeRequired) parts.push(t('sourceHealth.scopeRequired', { count: summary.scopeRequired }));
  if (summary.errors) parts.push(t('sourceHealth.errors', { count: summary.errors }));
  return parts.join(' · ');
}

function healthDetail(health) {
  if (!health?.families?.length) return '';
  return health.families.map((family) => {
    const state = t(`sourceHealth.detail.${family.state}`);
    return `${family.name}: ${state}${family.error ? ` — ${family.error}` : ''}`;
  }).join('\n');
}

function renderSourceHealth(health = lastHealth) {
  lastHealth = health || null;
  const element = document.querySelector('#header-source-state');
  if (!element || !health?.summary) return;
  element.textContent = healthText(health);
  element.title = healthDetail(health);
  element.dataset.health = health.summary.errors > 0 ? 'error' : health.summary.partial > 0 || health.summary.noData > 0 || health.summary.scopeRequired > 0 ? 'mixed' : 'ok';
}

function overviewRequest(input) {
  const raw = typeof input === 'string' ? input : input?.url || '';
  if (!raw) return false;
  try {
    return new URL(raw, window.location.href).pathname === '/api/overview';
  } catch {
    return false;
  }
}

ensureV19Styles();
const previousFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await previousFetch(...args);
  if (response.ok && overviewRequest(args[0])) {
    response.clone().json().then((payload) => setTimeout(() => {
      renderSourceHealth(payload?.assessment?.sourceHealth);
      window.dispatchEvent(new CustomEvent('iran-monitor-overview', { detail: payload }));
    }, 0)).catch(() => {});
  }
  return response;
};

window.addEventListener('iran-monitor-languagechange', () => renderSourceHealth());

export { renderSourceHealth };
