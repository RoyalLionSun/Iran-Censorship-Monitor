import { directionFor, getLanguage, setLanguage, t, translateKnownText } from './i18n.js';

const dynamicOriginal = new WeakMap();
const technicalSelectors = [
  '.technical-ltr', '.mono-cell', '.scope-chip', '.chart', 'svg', 'pre', 'code',
  '#asn-select', '#since-input', '#until-input', '#measurement-select',
  '#routing-neighbours td:first-child', '#bgp-updates-table td:nth-child(3)', '#bgp-updates-table td:nth-child(4)', '#bgp-updates-table td:nth-child(5)',
  '#asn-coverage-table td:first-child', '#asrank-table td:first-child', '#rpki-table td:first-child', '#hegemony-table td:first-child',
  '#providers-table td:first-child', '#targets-table td:first-child'
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
  const language = getLanguage();
  if (language === 'en') return dynamicOriginal.get(node) || text;
  const patterns = [
    [/^Updated (.+) ago$/, (m) => `به‌روزرسانی: ${m[1]} پیش`],
    [/^(\d+)\/(\d+) source families observed(?: · assessment votes remain separate)?$/, (m) => `${m[1]}/${m[2]} خانواده منبع مشاهده‌شده · رأی‌های ارزیابی جدا می‌مانند`],
    [/^(\d+) allowlisted articles discovered · context only · no sensor vote$/, (m) => `${m[1]} گزارش از دامنه‌های مجاز یافت شد · فقط زمینه · بدون رأی حسگر`],
    [/^(\d+) updates · (.+)$/, (m) => `${m[1]} به‌روزرسانی · ${m[2]}`],
    [/^(\d+) UTC days · (\d+) confirmed( · truncated)?$/, (m) => `${m[1]} روز UTC · ${m[2]} تأییدشده${m[3] ? ' · نمونه ناقص' : ''}`],
    [/^(\d+) observed · (\d+) samples$/, (m) => `${m[1]} مشاهده‌شده · ${m[2]} نمونه`],
    [/^(\d+) raw signal series · (.+)$/, (m) => `${m[1]} سری خام سیگنال · ${m[2]}`],
    [/^(\d+) traffic anomalies · (\d+) outages · (\d+) BGP events$/, (m) => `${m[1]} ناهنجاری ترافیک · ${m[2]} قطعی · ${m[3]} رویداد BGP`],
    [/^(\d+) bridge users · direct estimate shown above$/, (m) => `${m[1]} کاربر بریج · برآورد مستقیم در بالا`],
    [/^(\d+) \/ (\d+) RIS peers$/, (m) => `${m[1]} / ${m[2]} همتای RIS`]
  ];
  for (const [pattern, renderer] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    dynamicOriginal.set(node, text);
    return renderer(match);
  }
  return text;
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
window.addEventListener('iran-monitor-languagechange', scheduleApply);

export { applyLanguage, renderMeanings };
