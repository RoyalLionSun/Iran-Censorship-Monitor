import { normalizeAsn } from './common.mjs';

const RIPE_DATABASE_AUT_NUM = 'https://rest.db.ripe.net/ripe/aut-num/';

function equalRpsl(a, b) {
  return String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();
}

function attributeObject(object) {
  const out = {};
  for (const attribute of Array.isArray(object?.attributes?.attribute) ? object.attributes.attribute : []) {
    const name = String(attribute?.name ?? '').trim().toLowerCase();
    if (!name || out[name] !== undefined) continue;
    out[name] = String(attribute?.value ?? '').trim();
  }
  return out;
}

function primaryKeyValue(object, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  const attributes = Array.isArray(object?.['primary-key']?.attribute) ? object['primary-key'].attribute : [];
  const match = attributes.find((attribute) => String(attribute?.name ?? '').trim().toLowerCase() === wanted);
  return match ? String(match.value ?? '').trim() : null;
}

export function buildRipeDatabaseAutNumUrl(asn) {
  const normalized = normalizeAsn(asn);
  return new URL(`${encodeURIComponent(normalized)}.json`, RIPE_DATABASE_AUT_NUM).toString();
}

export function parseRipeDatabaseAutNum(payload, requestedAsn = '') {
  const wanted = requestedAsn ? normalizeAsn(requestedAsn) : null;
  const objects = Array.isArray(payload?.objects?.object) ? payload.objects.object : [];
  const candidates = objects.filter((object) => String(object?.type ?? '').trim().toLowerCase() === 'aut-num');
  const selected = candidates.find((object) => {
    const attributes = attributeObject(object);
    const asn = attributes['aut-num'] || primaryKeyValue(object, 'aut-num');
    return asn && (!wanted || equalRpsl(asn, wanted));
  }) || null;

  if (!selected) {
    return {
      asn: wanted,
      asName: null,
      orgId: null,
      registryName: null,
      country: null,
      authority: null,
      registrySource: null,
      recordScope: null,
      registryStatus: null,
      created: null,
      lastModified: null,
      found: false,
    };
  }

  const attributes = attributeObject(selected);
  return {
    asn: attributes['aut-num'] || primaryKeyValue(selected, 'aut-num') || wanted,
    asName: attributes['as-name'] || null,
    orgId: attributes.org || null,
    registryName: null,
    country: null,
    authority: selected?.source?.id || null,
    registrySource: attributes.source || selected?.source?.id || null,
    recordScope: 'ripe-database-aut-num',
    registryStatus: attributes.status || null,
    created: attributes.created || null,
    lastModified: attributes['last-modified'] || null,
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
  const registryStatus = String(identity.registryStatus ?? '').trim().toUpperCase();
  if (!registryStatus) mismatches.push('registry-status:missing');
  else if (!['ASSIGNED', 'LEGACY'].includes(registryStatus)) mismatches.push(`registry-status:${registryStatus}`);
  return { ok: mismatches.length === 0, mismatches };
}

export async function getAsnRegistryIdentity(asn, { fetchImpl = fetch, timeoutMs = 8_000 } = {}) {
  const normalized = normalizeAsn(asn);
  const sourceUrl = buildRipeDatabaseAutNumUrl(normalized);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(sourceUrl, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`RIPE Database REST returned HTTP ${response.status}.`);
    const identity = parseRipeDatabaseAutNum(await response.json(), normalized);
    if (!identity.found) throw new Error(`RIPE Database REST returned no aut-num object for ${normalized}.`);
    return {
      ok: true,
      status: 'observed',
      ...identity,
      source: 'RIPE Database REST',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      evidenceRole: 'scope-topology-context',
      independentCensorshipVote: false,
      note: 'The direct RIPE Database aut-num object validates hard registry identity keys. Registry identity does not establish network function, reachability, filtering, censorship behavior or intent.',
    };
  } finally {
    clearTimeout(timer);
  }
}
