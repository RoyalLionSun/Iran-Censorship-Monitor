import { normalizeAsn } from './common.mjs';

const RIPESTAT_WHOIS = 'https://stat.ripe.net/data/whois/data.json';
const SOURCE_APP = 'iran-censorship-monitor';

function recordObject(record) {
  const out = {};
  for (const entry of Array.isArray(record) ? record : []) {
    const key = String(entry?.key ?? '').trim();
    if (!key || out[key] !== undefined) continue;
    out[key] = String(entry?.value ?? '').trim();
  }
  return out;
}

function equalRpsl(a, b) {
  return String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();
}

export function buildRipeStatWhoisUrl(asn) {
  const normalized = normalizeAsn(asn);
  const url = new URL(RIPESTAT_WHOIS);
  url.searchParams.set('resource', normalized);
  url.searchParams.set('sourceapp', SOURCE_APP);
  return url.toString();
}

export function parseRipeStatWhois(payload, requestedAsn = '') {
  const records = Array.isArray(payload?.data?.records) ? payload.data.records.map(recordObject) : [];
  const wanted = requestedAsn ? normalizeAsn(requestedAsn) : null;
  const autNum = records.find((row) => row['aut-num'] && (!wanted || equalRpsl(row['aut-num'], wanted))) || null;
  if (!autNum) {
    return {
      asn: wanted,
      asName: null,
      orgId: null,
      registryName: null,
      country: null,
      authority: Array.isArray(payload?.data?.authorities) ? payload.data.authorities.join(',') : null,
      source: null,
      found: false,
    };
  }

  const orgId = autNum.org || null;
  const organisation = records.find((row) => orgId && equalRpsl(row.organisation, orgId))
    || records.find((row) => row['org-name'])
    || null;

  return {
    asn: autNum['aut-num'] || wanted,
    asName: autNum['as-name'] || null,
    orgId,
    registryName: organisation?.['org-name'] || null,
    country: organisation?.country || autNum.country || null,
    authority: Array.isArray(payload?.data?.authorities) ? payload.data.authorities.join(',') : null,
    source: autNum.source || organisation?.source || null,
    found: true,
  };
}

export function compareAsnIdentity(profile, identity) {
  const mismatches = [];
  if (!profile || !profile.asn) return { ok: false, mismatches: ['profile_missing'] };
  if (!identity?.found) return { ok: false, mismatches: ['registry_record_missing'] };
  if (!equalRpsl(profile.asn, identity.asn)) mismatches.push(`asn:${identity.asn || 'missing'}!=${profile.asn}`);
  if (profile.asName && !equalRpsl(profile.asName, identity.asName)) mismatches.push(`as-name:${identity.asName || 'missing'}!=${profile.asName}`);
  if (profile.orgId && !equalRpsl(profile.orgId, identity.orgId)) mismatches.push(`org:${identity.orgId || 'missing'}!=${profile.orgId}`);
  if (profile.country && identity.country && !equalRpsl(profile.country, identity.country)) mismatches.push(`country:${identity.country}!=${profile.country}`);
  return { ok: mismatches.length === 0, mismatches };
}

export async function getAsnRegistryIdentity(asn, { fetchImpl = fetch, timeoutMs = 8_000 } = {}) {
  const normalized = normalizeAsn(asn);
  const sourceUrl = buildRipeStatWhoisUrl(normalized);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(sourceUrl, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`RIPEstat Whois returned HTTP ${response.status}.`);
    const payload = await response.json();
    const identity = parseRipeStatWhois(payload, normalized);
    if (!identity.found) throw new Error(`RIPEstat Whois returned no aut-num record for ${normalized}.`);
    return {
      ok: true,
      status: 'observed',
      source: 'RIPEstat Whois',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      ...identity,
      evidenceRole: 'scope-topology-context',
      independentCensorshipVote: false,
      note: 'Registry identity is scope/topology context. It does not establish network function, reachability, filtering, censorship behavior or intent.',
    };
  } finally {
    clearTimeout(timer);
  }
}
