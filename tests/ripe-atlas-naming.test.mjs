import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderSourcesPage } from '../lib/report.mjs';

// RIPE NCC does not see censorship monitoring as a use of RIPE Atlas. Public texts name it for
// connection quality only; the independent checks of services appear without a probe network's
// name, which also keeps attention away from the probe hosts in Iran.
const LAYERS = ['en', 'en-extra', 'en-runtime', 'en-context', 'en-v19', 'fa', 'fa-extra', 'fa-runtime', 'fa-context', 'fa-v19'];

test('no reader-facing text ties RIPE Atlas to blocking or to the service checks', async () => {
  const bad = [];
  for (const name of LAYERS) {
    const source = await readFile(new URL(`../public/locales/${name}.js`, import.meta.url), 'utf8');
    for (const [, key, value] of source.matchAll(/^ {2}'([^']+)': '((?:[^'\\]|\\.)*)',$/gm)) {
      if (/RIPE Atlas/.test(value) && /\bblock|allowed services|مسدود|فیلتر|سرویس‌های مجاز/i.test(value)) bad.push(`${name}: ${key}`);
      if (/^board\.(independent|more\.independent)/.test(key) && /\{sources\}|RIPE Atlas|Globalping/.test(value)) bad.push(`${name}: ${key} names the probe network`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the sources page lists RIPE Atlas under connection quality, not as evidence of access', () => {
  const sources = [{ id: 'ooni', name: 'OONI' }, { id: 'ripe', name: 'RIPE Atlas' }, { id: 'globalping', name: 'Globalping' }, { id: 'radar', name: 'Cloudflare Radar' }];
  const html = renderSourcesPage({ lang: 'en', sources });
  const access = html.slice(html.indexOf('Evidence of access'), html.indexOf('Traffic, outages and connection quality'));
  assert.ok(access.length > 0);
  assert.doesNotMatch(access, /RIPE Atlas/);
  assert.match(html.slice(html.indexOf('Traffic, outages and connection quality')), /RIPE Atlas/);
});
