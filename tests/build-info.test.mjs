import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readCommit } from '../lib/build-info.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

test('the running commit comes from BUILD.txt, else the checkout\'s branch, loose or packed, else nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'icm-build-'));
  try {
    assert.equal(await readCommit(dir), null);
    await mkdir(join(dir, '.git/refs/heads'), { recursive: true });
    await writeFile(join(dir, '.git/HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(dir, '.git/packed-refs'), `# pack-refs with: peeled\n${OTHER} refs/heads/main\n`);
    assert.equal(await readCommit(dir), OTHER);
    await writeFile(join(dir, '.git/refs/heads/main'), `${SHA}\n`);
    assert.equal(await readCommit(dir), SHA);
    await writeFile(join(dir, '.git/HEAD'), 'ref: refs/../../etc/passwd\n');
    assert.equal(await readCommit(dir), null, 'a ref outside the checkout is not followed');
    await writeFile(join(dir, 'BUILD.txt'), `Version: 1.0.0\nCommit: ${OTHER}\nBuilt 2026-09-28T00:00:00.000Z\n`);
    assert.equal(await readCommit(dir), OTHER);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
