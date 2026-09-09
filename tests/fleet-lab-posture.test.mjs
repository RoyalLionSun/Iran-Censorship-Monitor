import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Stage 0 probe lab adapter module contains client primitives only', () => {
  const source = readFileSync(new URL('../lib/fleet-lab-adapters.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bcreateServer\b/);
  assert.doesNotMatch(source, /\.listen\s*\(/);
  assert.doesNotMatch(source, /node:child_process|\bspawn(?:Sync)?\s*\(|\bexec(?:File|Sync)?\s*\(/);
  assert.doesNotMatch(source, /node:http\b/);
  assert.match(source, /node:dns\/promises/);
  assert.match(source, /node:net/);
  assert.match(source, /node:tls/);
  assert.match(source, /node:https/);
});
