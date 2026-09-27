import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The documents must say what is true now. These checks run with every `npm run check` (and so
// before every commit with the project's hook, and in CI).
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const markdown = tracked.filter((file) => file.endsWith('.md'));

test('the version is the same everywhere it is shown, with release notes and a changelog entry', () => {
  const version = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, version, 'package-lock.json');
  assert.equal(lock.packages?.['']?.version, version, 'package-lock.json packages[""]');
  assert.match(read('public/app.js'), new RegExp(`footerVersion\\.textContent = 'v${version.replaceAll('.', '\\.')}'`), 'footer version in public/app.js');
  assert.match(read('public/index.html'), new RegExp(`<span id="footer-version">v${version.replaceAll('.', '\\.')}</span>`), 'footer version in public/index.html');
  assert.ok(existsSync(join(root, `release-notes/v${version}.md`)), `release-notes/v${version}.md`);
  assert.match(read('CHANGELOG.md'), new RegExp(`^## ${version.replaceAll('.', '\\.')} — \\d{4}-\\d{2}-\\d{2}`, 'm'), 'CHANGELOG heading for the version');
});

test('the latest verification record states the current number of tests; no other current document hard-codes it', () => {
  const count = readdirSync(join(root, 'tests')).filter((file) => file.endsWith('.test.mjs'))
    .reduce((sum, file) => sum + (read(`tests/${file}`).match(/^test\(/gm) ?? []).length, 0);
  const verification = read('docs/VERIFICATION.md');
  const latest = verification.slice(0, verification.indexOf('The sections below are the dated records'));
  assert.match(latest, new RegExp(`\\*\\*${count}/${count}\\*\\*`), `docs/VERIFICATION.md latest record should say ${count}/${count}`);
  for (const file of ['README.md', 'CURRENT_STATE.md', 'GO_LIVE.md', 'CONTRIBUTING.md', 'docs/PRODUCTION.md', 'docs/ARCHITECTURE.md', 'docs/API.md', 'docs/DATA_SOURCES.md']) {
    assert.doesNotMatch(read(file), /\b\d{3}(\/\d{3})? (deterministic )?tests\b/, `${file} hard-codes a test count`);
  }
});

test('every link between the documents points to a file that exists', () => {
  const broken = [];
  for (const file of markdown) {
    for (const [, target] of read(file).matchAll(/\]\(([^)#\s]+\.md)(#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      if (!existsSync(join(root, dirname(file), target))) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('files talk about the project only and carry no private e-mail address', () => {
  const text = tracked.filter((file) => /\.(md|mjs|js|json|yml|html|css|example)$/.test(file) && !file.startsWith('tests/'));
  const offending = [];
  for (const file of text) {
    const content = read(file);
    if (/\bmanus\b|claude code|co-authored-by|noreply@anthropic/i.test(content)) offending.push(`${file}: tool attribution`);
    if (/[A-Za-z0-9._%+-]+@gmail\.com/i.test(content)) offending.push(`${file}: private e-mail address`);
  }
  assert.deepEqual(offending, []);
});

// Nothing may describe the maintainer's own machine or working setup: operating system layers,
// shells, user home directories. The patterns are generic on purpose; a check must never name
// anything real.
test('files describe no personal machine, shell or home directory', () => {
  const text = tracked.filter((file) => /\.(md|mjs|js|json|yml|html|css|example|service|sh)$/.test(file) && file !== 'tests/docs-consistency.test.mjs');
  const offending = [];
  for (const file of text) {
    const content = read(file);
    if (/\bWSL\b|PowerShell/i.test(content)) offending.push(`${file}: local setup`);
    if (/\/home\/[a-z_][a-z0-9_-]*\/|\/Users\/[A-Za-z][\w.-]*\/|[A-Z]:\\{1,2}Users\\{1,2}/.test(content)) offending.push(`${file}: home directory`);
    if (/scratch copy|the user's (Windows|machine|computer)/i.test(content)) offending.push(`${file}: working-copy details`);
  }
  assert.deepEqual(offending, []);
});
