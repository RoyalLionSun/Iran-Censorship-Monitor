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
