import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Owner's rule: a Farsi text must not begin with a Latin word, or the reading order breaks.
// Pure names without Persian letters (e.g. "Cloudflare Radar", "ASN") are labels, not sentences.
test('Farsi texts that contain Persian never start with a Latin word', async () => {
  const bad = [];
  for (const name of ['fa', 'fa-extra', 'fa-runtime', 'fa-context', 'fa-v19']) {
    const source = await readFile(new URL(`../public/locales/${name}.js`, import.meta.url), 'utf8');
    for (const [, key, value] of source.matchAll(/^ {2}'([^']+)': '((?:[^'\\]|\\.)*)',$/gm)) {
      const text = value.replace(/^[⁦-⁩‎‏«( ]+/, '');
      if (/[؀-ۿ]/.test(text) && /^[A-Za-z]/.test(text)) bad.push(`${name}: ${key} = ${value.slice(0, 50)}`);
    }
  }
  assert.deepEqual(bad, []);
});

const FA_LAYERS = ['fa', 'fa-extra', 'fa-runtime', 'fa-context', 'fa-v19'];
const EN_LAYERS = ['en', 'en-extra', 'en-runtime', 'en-context', 'en-v19'];

async function layers(names) {
  const entries = new Map();
  for (const name of names) {
    const source = await readFile(new URL(`../public/locales/${name}.js`, import.meta.url), 'utf8');
    for (const [, key, value] of source.matchAll(/^ {2}'([^']+)': '((?:[^'\\]|\\.)*)',$/gm)) {
      entries.set(key, { layer: name, value: value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))) });
    }
  }
  return entries;
}

// The same rule for what fills a placeholder: service names, domains, servers and source names
// are often Latin ("ChatGPT", "instagram.com", "RIPE Atlas"), so a sentence must not open with
// one. Counts, dates and percentages may open a Persian phrase ("۳ سرویس").
const LATIN_CAPABLE = new Set(['services', 'service', 'domain', 'host', 'hosts', 'source', 'target', 'name', 'names']);
// Parts that are never shown on their own but inserted after a Persian opening, each with where.
const FRAGMENTS = new Map([
  ['board.appServers.more', 'fills {hosts} of board.appServers.*, after "سرورهای اپ …"'],
]);

test('no Farsi text opens with a placeholder that can hold a Latin name', async () => {
  const bad = [];
  for (const [key, { layer, value }] of await layers(FA_LAYERS)) {
    const first = /^[⁦-⁩‎‏«( ]*\{(\w+)\}/.exec(value)?.[1];
    if (first && LATIN_CAPABLE.has(first) && !FRAGMENTS.has(key)) bad.push(`${layer}: ${key} = ${value.slice(0, 50)}`);
  }
  assert.deepEqual(bad, []);
});

test('every Farsi text keeps the placeholders of its English original', async () => {
  const en = await layers(EN_LAYERS);
  const placeholders = (text) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
  const bad = [];
  for (const [key, { layer, value }] of await layers(FA_LAYERS)) {
    const original = en.get(key);
    if (!original) continue;
    const want = placeholders(original.value);
    const got = placeholders(value);
    if (want.join() !== got.join()) bad.push(`${layer}: ${key} has {${got.join('}, {')}} instead of {${want.join('}, {')}}`);
  }
  assert.deepEqual(bad, []);
});

test('Farsi texts use Persian letters, composed Unicode and no direction overrides', async () => {
  const bad = [];
  for (const [key, { layer, value }] of await layers(FA_LAYERS)) {
    // Arabic yeh and kaf instead of the Persian ی and ک.
    if (/[يك]/.test(value)) bad.push(`${layer}: ${key} uses Arabic ي or ك`);
    if (value.normalize('NFC') !== value) bad.push(`${layer}: ${key} is not NFC`);
    // Embeddings and overrides can reorder the text around them; isolates (U+2066–U+2069) and the
    // left-to-right mark before a Latin handle ("‎@RoyalLionSun") are the intended tools.
    if (/[‪-‮]/.test(value)) bad.push(`${layer}: ${key} uses a direction embedding or override`);
    for (const match of value.matchAll(/‎/g)) {
      if (!/^[A-Za-z@]/.test(value.slice(match.index + 1))) bad.push(`${layer}: ${key} has a left-to-right mark that is not before a Latin name`);
    }
  }
  assert.deepEqual(bad, []);
});
