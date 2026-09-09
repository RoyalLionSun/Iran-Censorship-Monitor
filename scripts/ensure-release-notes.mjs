import { readFile } from 'node:fs/promises';
import { validateReleaseNotes, validateReleaseTag } from './verify-release-notes.mjs';

function requiredEnv(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const tag = validateReleaseTag(requiredEnv('RELEASE_TAG'));
const releaseId = requiredEnv('RELEASE_ID');
if (!/^\d+$/.test(releaseId)) throw new Error('RELEASE_ID must be numeric.');

const repository = requiredEnv('GITHUB_REPOSITORY');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GITHUB_REPOSITORY.');

const existingBody = String(process.env.RELEASE_BODY ?? '');
if (existingBody.trim()) {
  console.log(`RELEASE NOTES PRESENT · ${tag} · existing operator notes preserved`);
  process.exit(0);
}

const token = requiredEnv('GH_TOKEN');
let notes;
try {
  notes = await readFile(new URL(`../release-notes/${tag}.md`, import.meta.url), 'utf8');
} catch (error) {
  if (error?.code === 'ENOENT') throw new Error(`Canonical release notes are missing: release-notes/${tag}.md`);
  throw error;
}
notes = validateReleaseNotes(tag, notes);

const response = await fetch(`https://api.github.com/repos/${repository}/releases/${releaseId}`, {
  method: 'PATCH',
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'iran-censorship-monitor-release-notes',
  },
  body: JSON.stringify({ body: notes }),
});

if (!response.ok) throw new Error(`GitHub release-note update failed with HTTP ${response.status}.`);
console.log(`RELEASE NOTES POPULATED · ${tag} · canonical repository notes applied`);
