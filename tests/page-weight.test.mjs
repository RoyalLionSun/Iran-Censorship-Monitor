import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compressBody } from '../lib/common.mjs';

// The dashboard's text and code, compressed as the server sends them, stay under a fixed budget,
// so the page does not grow unnoticed. Readers on slow or throttled connections (a VPN from inside
// Iran) pay for every kilobyte. Raise the budget only as a decision, recorded in the changelog.
const BUDGET_KB = 220;
const publicDir = new URL('../public/', import.meta.url);
const read = (path) => readFileSync(new URL(path, publicDir));

function pageFiles() {
  const files = new Set();
  const html = read('index.html').toString();
  const pending = [...html.matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css|webmanifest))"/g)].map((match) => match[1]);
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    if (!file.endsWith('.js')) continue;
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    for (const [, from, bare] of read(file).toString().matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      pending.push(new URL(from ?? bare, new URL(base, 'https://x/')).pathname.slice(1));
    }
  }
  return [...files];
}

test(`the page's text and code stay under ${BUDGET_KB} KB compressed`, () => {
  const files = pageFiles();
  assert.ok(files.length > 20, 'the page files were found');
  const sizes = files.map((file) => [file, compressBody(read(file), 'br').length]);
  const total = sizes.reduce((sum, [, size]) => sum + size, compressBody(read('index.html'), 'br').length);
  const largest = sizes.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([file, size]) => `${file} ${(size / 1024).toFixed(1)} KB`).join(', ');
  assert.ok(total <= BUDGET_KB * 1024, `${(total / 1024).toFixed(1)} KB compressed, budget ${BUDGET_KB} KB; largest: ${largest}`);
});
