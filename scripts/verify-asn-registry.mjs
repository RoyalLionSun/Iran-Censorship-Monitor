import { readFile } from 'node:fs/promises';
import { getAsnRegistryIdentity, compareAsnIdentity } from '../lib/asn-registry.mjs';

const profiles = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));

if (profiles.some((profile) => profile.asn === 'AS35718')) {
  throw new Error('AS35718 must not be present in the curated Iran ASN profile: current RIPE identity is Russian NAUNET-AS / 2domains.ru LLC.');
}

const hardFailures = [];
for (const profile of profiles) {
  let identity;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      identity = await getAsnRegistryIdentity(profile.asn, { timeoutMs: 10_000 });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  if (!identity) {
    hardFailures.push(`${profile.asn}: ${lastError?.message || 'registry request failed'}`);
    console.error(`REGISTRY ERROR · ${profile.asn} · ${lastError?.message || 'request failed'}`);
    continue;
  }
  const comparison = compareAsnIdentity(profile, identity);
  if (!comparison.ok) {
    hardFailures.push(`${profile.asn}: ${comparison.mismatches.join(', ')}`);
    console.error(`REGISTRY DRIFT · ${profile.asn} · ${comparison.mismatches.join(' · ')}`);
    continue;
  }
  // CI logs are public: a network held by a private person is listed by number only.
  console.log(profile.privateRegistrant ? `REGISTRY PASS · ${profile.asn} · private registrant`
    : `REGISTRY PASS · ${profile.asn} · ${identity.asName} · ${identity.orgId} · ${identity.registryName || 'org-name unavailable'}`);
}

if (hardFailures.length) {
  throw new Error(`ASN registry acceptance failed for ${hardFailures.length} profile(s): ${hardFailures.join(' | ')}`);
}

const families = new Map();
for (const profile of profiles) {
  if (!profile.operatorFamily) throw new Error(`${profile.asn} is missing operatorFamily.`);
  if (profile.independentCensorshipVote !== false) throw new Error(`${profile.asn} must remain independentCensorshipVote:false.`);
  const list = families.get(profile.operatorFamily) || [];
  list.push(profile.asn);
  families.set(profile.operatorFamily, list);
}

console.log(`ASN REGISTRY ACCEPTANCE PASS · ${profiles.length} profiles · ${families.size} operator families · zero censorship votes`);
