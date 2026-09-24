import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../public/locales/en.js';
import fa from '../public/locales/fa.js';
import enExtra from '../public/locales/en-extra.js';
import faExtra from '../public/locales/fa-extra.js';
import { dictionaryKeys, directionFor, getLanguage, setLanguage, t, translateKnownText } from '../public/i18n.js';

test('English and Farsi core dictionaries expose the same controlled UI keys', () => {
  assert.deepEqual(Object.keys(fa).sort(), Object.keys(en).sort());
  assert.ok(Object.values(en).every((value) => String(value).trim().length > 0));
  assert.ok(Object.values(fa).every((value) => String(value).trim().length > 0));
});

test('English and Farsi legacy UI dictionaries expose the same keys', () => {
  assert.deepEqual(Object.keys(faExtra).sort(), Object.keys(enExtra).sort());
  assert.ok(Object.values(enExtra).every((value) => String(value).trim().length > 0));
  assert.ok(Object.values(faExtra).every((value) => String(value).trim().length > 0));
  assert.equal(dictionaryKeys('en').length, dictionaryKeys('fa').length);
});

test('language API switches controlled text and direction deterministically', () => {
  setLanguage('fa');
  assert.equal(getLanguage(), 'fa');
  assert.equal(directionFor(), 'rtl');
  assert.match(t('situation.headline.insufficient'), /[\u0600-\u06FF]/);
  assert.match(t('legacy.coverageTitle'), /[\u0600-\u06FF]/);
  assert.equal(translateKnownText('BGP visibility'), 'دیدپذیری BGP');
  setLanguage('en');
  assert.equal(directionFor(), 'ltr');
  assert.equal(t('situation.label.scope'), 'Scope');
  assert.equal(translateKnownText('دیدپذیری BGP'), 'BGP visibility');
});

test('unsupported languages fail closed', () => {
  assert.throws(() => setLanguage('de'), /Unsupported language/);
  setLanguage('en');
});

test('no interface text is spelled like a service name, or the page would translate that name', async () => {
  // Static texts are translated by their English wording; a label "Signal" once turned the
  // messenger Signal into "indicator" in Farsi.
  const { SERVICE_BRANDS, MORE_SERVICE_GROUPS } = await import('../public/service-findings.js');
  const names = new Set([...SERVICE_BRANDS, ...MORE_SERVICE_GROUPS.flatMap((group) => group.services)].map((service) => service.name));
  const modules = await Promise.all(['en.js', 'en-v19.js', 'en-runtime.js', 'en-extra.js'].map((file) => import(`../public/locales/${file}`)));
  const clashes = modules.flatMap((module) => Object.entries(module.default))
    .filter(([key, value]) => names.has(value) && !key.startsWith('board.brand.'))
    .map(([key, value]) => `${key} = ${value}`);
  assert.deepEqual(clashes, []);
});
