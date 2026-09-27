import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../.githooks/commit-msg', import.meta.url));
const accepts = (message) => {
  const file = join(mkdtempSync(join(tmpdir(), 'msg-')), 'MSG');
  writeFileSync(file, `${message}\n`);
  try { execFileSync('sh', [hook, file], { stdio: 'pipe' }); return true; } catch { return false; }
};

test('commit messages carry no foreign co-author addresses and no session links', () => {
  assert.equal(accepts('fix: a plain message'), true);
  assert.equal(accepts('fix: x\n\nCo-Authored-By: Friend <1+friend@users.noreply.github.com>'), true, 'an anonymous GitHub address is fine');
  assert.equal(accepts('fix: x\n\nCo-Authored-By: Someone <someone@example.com>'), false);
  assert.equal(accepts('fix: x\n\nTool-Session: https://example.com/s'), false);
  assert.equal(accepts('fix: x\n\nGenerated with some tool'), false);
});
