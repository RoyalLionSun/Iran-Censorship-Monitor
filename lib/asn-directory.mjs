import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAsn } from './common.mjs';

// Name and kind of every network registered in Iran, so a reader can see who a network is
// (mobile operator, hosting company, public body, international organisation …). Written by
// the operator inventory command; context only, never a censorship vote.
export const ASN_DIRECTORY_PATH = fileURLToPath(new URL('../var/asn-directory/latest.json', import.meta.url));

export function buildAsnDirectory(inventory, secondaryEntries = [], curated = []) {
  const secondary = new Map(secondaryEntries.map((entry) => [normalizeAsn(entry.asn), entry]));
  const reviewed = new Map(curated.map((item) => [normalizeAsn(item.asn), item]));
  const entries = {};
  for (const raw of inventory?.asns ?? []) {
    const asn = normalizeAsn(String(raw));
    if (!asn) continue;
    const profile = reviewed.get(asn);
    const meta = secondary.get(asn);
    entries[asn] = {
      name: profile?.name ?? meta?.description ?? meta?.handle ?? null,
      // A reviewed profile type outranks the secondary category.
      kind: profile?.type ?? meta?.category ?? null,
      reviewed: Boolean(profile),
    };
  }
  return { generatedAt: new Date().toISOString(), count: Object.keys(entries).length, entries, independentCensorshipVote: false };
}

export async function writeAsnDirectory(directory, path = ASN_DIRECTORY_PATH) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(directory));
  await rename(`${path}.tmp`, path);
}

let cached = null;

export async function readAsnDirectory(path = ASN_DIRECTORY_PATH) {
  try {
    const info = await stat(path);
    if (cached?.path === path && cached.mtimeMs === info.mtimeMs) return cached.value;
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!value || typeof value.entries !== 'object') return null;
    cached = { path, mtimeMs: info.mtimeMs, value };
    return value;
  } catch {
    return null;
  }
}
