import enCore from './locales/en.js';
import faCore from './locales/fa.js';
import enExtra from './locales/en-extra.js';
import faExtra from './locales/fa-extra.js';
import enRuntime from './locales/en-runtime.js';
import faRuntime from './locales/fa-runtime.js';
import enContext from './locales/en-context.js';
import faContext from './locales/fa-context.js';
import enV19 from './locales/en-v19.js';
import faV19 from './locales/fa-v19.js';

const en = Object.freeze({ ...enCore, ...enExtra, ...enRuntime, ...enContext, ...enV19 });
const fa = Object.freeze({ ...faCore, ...faExtra, ...faRuntime, ...faContext, ...faV19 });
const dictionaries = Object.freeze({ en, fa });
const storageKey = 'iran-monitor-language';

function initialLanguage() {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage?.getItem(storageKey);
    if (stored && Object.hasOwn(dictionaries, stored)) return stored;
  } catch {}
  // A first visit from a browser set to Persian opens in Farsi; a choice made once is kept.
  const preferred = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  return preferred.some((tag) => /^fa\b/i.test(String(tag ?? ''))) ? 'fa' : 'en';
}

let language = initialLanguage();
const reverse = new Map();
for (const [key, value] of Object.entries(en)) reverse.set(String(value), key);
for (const [key, value] of Object.entries(fa)) if (!reverse.has(String(value))) reverse.set(String(value), key);

export function getLanguage() { return language; }
// Separator between parts of a line. The middle dot looks like the Persian zero (۰) next to
// Persian digits, so Farsi uses its comma.
export function separator(nextLanguage = language) { return nextLanguage === 'fa' ? '، ' : ' · '; }

export function t(key, variables = {}) {
  const dictionary = dictionaries[language] || dictionaries.en;
  const fallback = dictionaries.en[key] ?? key;
  const template = dictionary[key] ?? fallback;
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => String(variables[name] ?? `{${name}}`));
}

export function setLanguage(nextLanguage, { persist = true, notify = true } = {}) {
  if (!Object.hasOwn(dictionaries, nextLanguage)) throw new Error(`Unsupported language: ${nextLanguage}`);
  language = nextLanguage;
  if (persist && typeof window !== 'undefined') {
    try { window.localStorage?.setItem(storageKey, language); } catch {}
  }
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('iran-monitor-languagechange', { detail: { language } }));
  }
  return language;
}

export function directionFor(nextLanguage = language) { return nextLanguage === 'fa' ? 'rtl' : 'ltr'; }
export function localeFor(nextLanguage = language) { return nextLanguage === 'fa' ? 'fa-IR' : 'en-US'; }
export function translationKeyForText(value) { return reverse.get(String(value ?? '')) || null; }
export function translateKnownText(value) {
  const key = translationKeyForText(value);
  return key ? t(key) : String(value ?? '');
}
export function supportedLanguages() { return Object.keys(dictionaries); }
export function dictionaryKeys(nextLanguage = 'en') { return Object.keys(dictionaries[nextLanguage] || {}); }
