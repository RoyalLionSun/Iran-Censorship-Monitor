import { directionFor, getLanguage, setLanguage, t, translateKnownText } from './i18n.js';
import { translateRuntimeText } from './i18n-runtime.js';

const dynamicOriginal = new WeakMap();
const technicalSelectors = [
  '.technical-ltr', '.mono-cell', '.scope-chip', '.chart', 'svg', 'pre', 'code', '.event-time', '.route-type',
  '#asn-select', '#since-input', '#until-input', '#measurement-select',
  '#routing-neighbours td:first-child', '#bgp-updates-table td:nth-child(3)', '#bgp-updates-table td:nth-child(4)', '#bgp-updates-table td:nth-child(5)',
  '#asn-coverage-table td:first-child', '#asrank-table td:first-child', '#rpki-table td:first-child', '#hegemony-table td:first-child',
  '#providers-table td:first-child', '#targets-table td:first-child', '#situation-scope', '#assessment-scope'
].join(',');

const meaningPanels = Object.freeze({
  'ooni-panel': 'meaning.ooni',
  'ripe-panel': 'meaning.ripe',
  'ioda-panel': 'meaning.ioda',
  'routing-panel': 'meaning.routing',
  'radar-panel': 'meaning.radar',
  'tor-panel': 'meaning.tor',
  'censoredplanet-panel': 'meaning.cp',
  'globalping-panel': 'meaning.globalping'
});

let lastAssessment = null;

function shouldSkip(node) {
  const element = node?.parentElement;
  return !element || Boolean(element.closest('script,style,pre,code,[data-i18n-external]'));
}

function preserveWhitespace(original, replacement) {
  const lead = original.match(/^\s*/)?.[0] || '';
  const tail = original.match(/\s*$/)?.[0] || '';
  return `${lead}${replacement}${tail}`;
}

function translateDynamic(text, node) {
  if (getLanguage() === 'en') return dynamicOriginal.get(node) || text;
  const translated = translateRuntimeText(text);
  if (translated !== text) dynamicOriginal.set(node, text);
  return translated;
}

function translateTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkip(node)) return;
  const raw = node.nodeValue || '';
  const text = raw.trim();
  if (!text) return;
  const known = translateKnownText(text);
  const translated = known !== text ? known : translateDynamic(text, node);
  if (translated !== text) node.nodeValue = preserveWhitespace(raw, translated);
}

function translateElementAttributes(element) {
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    if (!element.hasAttribute?.(attr)) continue;
    const current = element.getAttribute(attr) || '';
    const translated = translateKnownText(current);
    if (translated !== current) element.setAttribute(attr, translated);
  }
}

function translateTree(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) translateTextNode(node);
  if (root.querySelectorAll) root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(translateElementAttributes);
}

function ensureLanguageSwitch() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.querySelector('#language-switch')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'language-switch';
  wrapper.className = 'language-switch';
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', t('ui.language'));
  wrapper.innerHTML = '<button type="button" data-lang="en">EN</button><button type="button" data-lang="fa">فارسی</button>';
  actions.prepend(wrapper);
  wrapper.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
}

function renderMeanings() {
  for (const [panelId, key] of Object.entries(meaningPanels)) {
    const panel = document.getElementById(panelId);
    if (!panel) continue;
    let box = panel.querySelector(':scope > .plain-meaning');
    if (!box) {
      box = document.createElement('div');
      box.className = 'plain-meaning';
      const note = panel.querySelector(':scope > .panel-note');
      if (note) note.insertAdjacentElement('afterend', box);
      else panel.querySelector('.panel-header')?.insertAdjacentElement('afterend', box);
    }
    box.innerHTML = `<strong>${t('meaning.label')}</strong><span>${t(key)}</span>`;
  }
}

function markTechnicalFields() {
  document.querySelectorAll(technicalSelectors).forEach((element) => {
    element.setAttribute('dir', 'ltr');
    element.classList.add('technical-direction');
  });
}

function syncAssessmentStrip(assessment = lastAssessment) {
  if (assessment !== lastAssessment) lastAssessment = assessment || null;
  const current = lastAssessment;
  if (!current) return;
  const sourceCount = current.publicSummary?.sourceCount
    ?? current.supportingSources?.length
    ?? current.availableSources?.length
    ?? 0;
  const sourceElement = document.querySelector('#assessment-sources');
  if (sourceElement) sourceElement.textContent = String(sourceCount);
  const confidenceElement = document.querySelector('#assessment-confidence');
  if (confidenceElement) {
    const confidence = current.confidence || 'none';
    confidenceElement.textContent = getLanguage() === 'fa' ? t(`confidence.${confidence}`) : String(confidence).toUpperCase();
  }
}

function applyLanguage() {
  const language = getLanguage();
  document.documentElement.lang = language;
  document.documentElement.dir = directionFor(language);
  document.body?.setAttribute('data-language', language);
  ensureLanguageSwitch();
  const switcher = document.querySelector('#language-switch');
  if (switcher) {
    switcher.setAttribute('aria-label', t('ui.language'));
    switcher.querySelectorAll('[data-lang]').forEach((button) => {
      const active = button.dataset.lang === language;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  renderMeanings();
  translateTree(document.body);
  syncAssessmentStrip();
  markTechnicalFields();
}

let scheduled = false;
function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyLanguage();
  });
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') translateTextNode(mutation.target);
    for (const node of mutation.addedNodes) translateTree(node);
  }
  markTechnicalFields();
});

ensureLanguageSwitch();
applyLanguage();
if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
window.addEventListener('iran-monitor-overview', (event) => {
  syncAssessmentStrip(event.detail?.assessment || null);
  scheduleApply();
});
window.addEventListener('iran-monitor-languagechange', scheduleApply);

export { applyLanguage, renderMeanings };