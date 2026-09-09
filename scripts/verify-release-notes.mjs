import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const STABLE_VERSION = /^\d+\.\d+\.\d+$/;
const PRERELEASE_VERSION = /^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

export function releaseTagForVersion(version) {
  const value = String(version ?? '').trim();
  if (STABLE_VERSION.test(value)) return `v${value}`;
  if (PRERELEASE_VERSION.test(value)) return null;
  throw new Error(`Unsupported package version: ${value || '<empty>'}`);
}

export function validateReleaseTag(tag) {
  const value = String(tag ?? '').trim();
  if (!RELEASE_TAG.test(value)) throw new Error(`Invalid stable release tag: ${value || '<empty>'}`);
  return value;
}

export function validateReleaseNotes(tag, body) {
  const stableTag = validateReleaseTag(tag);
  const text = String(body ?? '').trim();
  if (text.length < 200) throw new Error(`Release notes for ${stableTag} are missing or too short.`);
  const requiredHeading = `## Iran Censorship Monitor ${stableTag}`;
  if (!text.includes(requiredHeading)) throw new Error(`Release notes for ${stableTag} must contain: ${requiredHeading}`);
  for (const heading of ['### Verification', '### Deployment boundary']) {
    if (!text.includes(heading)) throw new Error(`Release notes for ${stableTag} must contain: ${heading}`);
  }
  if (/\b(?:TODO|TBD|TO_BE_FILLED)\b/i.test(text)) throw new Error(`Release notes for ${stableTag} contain a placeholder.`);
  return text;
}

export async function verifyReleaseNotesFile({ version, root = new URL('../', import.meta.url) } = {}) {
  const tag = releaseTagForVersion(version);
  if (!tag) return { required: false, tag: null, path: null };
  const path = new URL(`release-notes/${tag}.md`, root);
  let body;
  try {
    body = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Stable version ${version} requires release-notes/${tag}.md.`);
    throw error;
  }
  validateReleaseNotes(tag, body);
  return { required: true, tag, path: `release-notes/${tag}.md` };
}

async function main() {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const result = await verifyReleaseNotesFile({ version: packageJson.version });
  if (!result.required) {
    console.log(`RELEASE NOTES SKIP · ${packageJson.version} is a prerelease development version`);
    return;
  }
  console.log(`RELEASE NOTES PASS · ${result.tag} · ${result.path}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
