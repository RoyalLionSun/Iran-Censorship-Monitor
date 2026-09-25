import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import test from 'node:test';

// Every module the page imports is preloaded from index.html, so a slow connection fetches them
// in one round instead of one round per import level.
test('index.html preloads every module in the import graph of app.js', async () => {
  const root = new URL('../public/', import.meta.url).pathname;
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="\/([^"]+)"/g)].map((match) => match[1]));
  const seen = new Set();
  const queue = ['app.js'];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await readFile(join(root, file), 'utf8');
    for (const [, path] of source.matchAll(/^import (?:[^'\n]*from )?'\.\/([^']+)'/gm)) queue.push(normalize(join(dirname(file), path)));
  }
  for (const file of seen) assert.ok(preloaded.has(file), `index.html should preload /${file}`);
  for (const file of preloaded) assert.ok(seen.has(file), `/${file} is preloaded but no longer imported`);
});
