import test from 'node:test';
import assert from 'node:assert/strict';
import enRuntime from '../public/locales/en-runtime.js';
import faRuntime from '../public/locales/fa-runtime.js';
import enContext from '../public/locales/en-context.js';
import faContext from '../public/locales/fa-context.js';
import { setLanguage, translateKnownText } from '../public/i18n.js';
import { translateRuntimeText } from '../public/i18n-runtime.js';

const hasPersian = (value) => /[\u0600-\u06FF]/.test(String(value));

test('runtime and context locale layers have exact English/Farsi key parity', () => {
  assert.deepEqual(Object.keys(faRuntime).sort(), Object.keys(enRuntime).sort());
  assert.deepEqual(Object.keys(faContext).sort(), Object.keys(enContext).sort());
  assert.ok(Object.values(faRuntime).every((value) => String(value).trim()));
  assert.ok(Object.values(faContext).every((value) => String(value).trim()));
});

test('representative controlled runtime UI phrases translate to Farsi', () => {
  setLanguage('fa', { persist: false, notify: false });
  const phrases = [
    'Requesting live sources',
    'No OONI measurements returned for this selection.',
    'Routing remains visible while user-path disruption is elevated',
    'No corroborated major disruption signal',
    'OONI anomalies require contextual interpretation and do not by themselves prove blocking.',
    'Cloudflare Radar API token not configured. No Radar values are fabricated.',
    'No independent measurement source returned usable observations.',
    'Pulse shutdown context unavailable; no incident count is inferred.',
    'No operator snapshot is available. No inventory count is inferred.',
    'access review',
    'observed',
  ];
  for (const phrase of phrases) {
    const translated = translateKnownText(phrase);
    assert.notEqual(translated, phrase, phrase);
    assert.ok(hasPersian(translated), `${phrase} did not produce Persian text`);
  }
  setLanguage('en', { persist: false, notify: false });
});

test('controlled dynamic sentence frames translate while preserving technical values', () => {
  setLanguage('fa', { persist: false, notify: false });
  const cases = [
    ['7 rows · 3 days', ['7', '3']],
    ['42.5 ms average RTT', ['42.5', 'RTT', 'ms']],
    ['12 / 18 RIS peers', ['12', '18', 'RIS']],
    ['Radar HTTP series · AS58224 · 1h · confidence L2', ['AS58224', '1h', 'L2']],
    ['reach 12 · customers 3 · degree 9', ['12', '3', '9']],
    ['Dashboard query failed: fixture failure', ['fixture failure']],
    ['Generated 10 Sep 2026, 11:25 UTC. RIR inventory is country-scope metadata; routed is a country-level RIPE RIS count, not an ASN-by-ASN routed classification.', ['10 Sep 2026, 11:25 UTC', 'RIR', 'RIPE RIS', 'ASN']],
  ];
  for (const [input, preserved] of cases) {
    const translated = translateRuntimeText(input);
    assert.notEqual(translated, input, input);
    assert.ok(hasPersian(translated), `${input} did not produce Persian framing`);
    for (const token of preserved) assert.ok(translated.includes(token), `${input} lost ${token}`);
  }
  setLanguage('en', { persist: false, notify: false });
});

test('arbitrary external content is never generically translated', () => {
  setLanguage('fa', { persist: false, notify: false });
  const external = 'External incident title from a source should remain verbatim';
  assert.equal(translateKnownText(external), external);
  assert.equal(translateRuntimeText(external), external);
  setLanguage('en', { persist: false, notify: false });
});
