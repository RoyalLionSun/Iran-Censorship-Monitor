import { localeFor, t } from './i18n.js';

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

let lastPaths = null;

function renderSourceHealth(health = lastHealth) {
  lastHealth = health || null;
  const element = document.querySelector('#header-source-state');
  if (!element) return;
  if (!health?.summary) {
    element.textContent = t('ui.sources.pending');
    element.title = '';
    element.dataset.health = 'neutral';
    return;
  }
  // A small badge on the first screen; the full sentence stays for screen readers and in the
  // tooltip, with each source's state, so nothing is hidden, only moved out of the way.
  const full = healthText(health);
  const badge = document.createElement('span');
  badge.className = 'source-state-short';
  badge.setAttribute('aria-hidden', 'true');
  const format = (value) => new Intl.NumberFormat(localeFor()).format(value);
  badge.textContent = t('sourceHealth.short', { reachable: format(health.summary.reachable), queried: format(health.summary.queried) });
  const sentence = document.createElement('span');
  sentence.className = 'visually-hidden';
  sentence.textContent = full;
  element.replaceChildren(badge, sentence);
  element.title = [full, healthDetail(health), pathsDetail(lastPaths)].filter(Boolean).join('\n\n');
  // One missing side source is not an alarm; red stays for a broadly unavailable source set.
  const broadlyDown = health.summary.errors > 0 && health.summary.reachable < health.summary.queried * 0.7;
  element.dataset.health = broadlyDown ? 'error'
    : health.summary.errors > 0 || health.summary.partial > 0 || health.summary.noData > 0 || health.summary.scopeRequired > 0 ? 'mixed' : 'ok';
}

ensureV19Styles();

// Which route delivered the access evidence and how current each collector path is, in the
// badge's tooltip, so a reader can see the dashboard is not tied to one upstream.
function pathsDetail(paths) {
  if (!paths) return '';
  const time = (value) => (value ? `${value.replace('T', ' ').slice(0, 16)} UTC` : '—');
  const lines = [t(paths.via === 'store' ? 'sourceHealth.path.store' : 'sourceHealth.path.live')];
  for (const [name, health] of Object.entries(paths.paths ?? {})) {
    const key = health.paused ? 'sourceHealth.path.paused' : health.enabled === false ? 'sourceHealth.path.off' : health.lastError ? 'sourceHealth.path.failing'
      : health.lastRun ? 'sourceHealth.path.ok' : 'sourceHealth.path.waiting';
    lines.push(t(key, { path: t(`sourceHealth.pathName.${name}`), newest: time(health.newest), error: String(health.lastError ?? '').slice(0, 80) }));
  }
  return lines.join('\n');
}

window.addEventListener('iran-monitor-overview', (event) => {
  if (event.detail?.dataPaths) lastPaths = event.detail.dataPaths;
  renderSourceHealth(event.detail?.assessment?.sourceHealth ?? null);
});
window.addEventListener('iran-monitor-languagechange', () => renderSourceHealth());

export { renderSourceHealth };
