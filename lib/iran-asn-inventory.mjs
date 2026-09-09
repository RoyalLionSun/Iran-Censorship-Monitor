const RIPESTAT_COUNTRY_RESOURCE_LIST = 'https://stat.ripe.net/data/country-resource-list/data.json';
const SOURCE_APP = 'iran-censorship-monitor';

function normalizeInventoryAsn(value) {
  const text = String(value ?? '').trim().toUpperCase();
  const numeric = text.startsWith('AS') ? text.slice(2) : text;
  if (!/^\d+$/.test(numeric)) throw new Error(`Invalid ASN in RIPEstat country resource list: ${value}`);
  const number = Number(numeric);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 4_294_967_295) throw new Error(`ASN outside supported 32-bit range: ${value}`);
  return `AS${number}`;
}

function asnNumber(asn) { return Number(String(asn).slice(2)); }

export function buildIranAsnInventoryUrl({ time = null } = {}) {
  const url = new URL(RIPESTAT_COUNTRY_RESOURCE_LIST);
  url.searchParams.set('resource', 'IR');
  url.searchParams.set('sourceapp', SOURCE_APP);
  if (time) url.searchParams.set('time', String(time));
  return url.toString();
}

export function parseIranAsnInventory(payload) {
  const data = payload?.data;
  if (!data || String(data.resource ?? '').trim().toUpperCase() !== 'IR') throw new Error('RIPEstat country resource response is not scoped to IR.');
  const rawAsns = data?.resources?.asn;
  if (!Array.isArray(rawAsns)) throw new Error('RIPEstat country resource response is missing resources.asn.');
  const asns = [...new Set(rawAsns.map(normalizeInventoryAsn))].sort((a, b) => asnNumber(a) - asnNumber(b));
  return { country: 'IR', queryTime: data.query_time || null, total: asns.length, asns, source: 'RIPEstat Country Resource List', sourceBasis: 'RIR Statistics files', evidenceRole: 'scope-inventory', independentCensorshipVote: false };
}

export function compareCuratedAsnCoverage(inventory, curatedProfiles) {
  const inventoryAsns = new Set(Array.isArray(inventory?.asns) ? inventory.asns : []);
  const curatedAsns = new Set((Array.isArray(curatedProfiles) ? curatedProfiles : []).map((profile) => normalizeInventoryAsn(profile?.asn)));
  const curatedOutsideInventory = [...curatedAsns].filter((asn) => !inventoryAsns.has(asn)).sort((a, b) => asnNumber(a) - asnNumber(b));
  const uncuratedAsns = [...inventoryAsns].filter((asn) => !curatedAsns.has(asn)).sort((a, b) => asnNumber(a) - asnNumber(b));
  return { inventoryCount: inventoryAsns.size, curatedCount: curatedAsns.size, curatedInInventoryCount: curatedAsns.size - curatedOutsideInventory.length, curatedOutsideInventory, uncuratedCount: uncuratedAsns.length, uncuratedAsns };
}

export async function getIranAsnInventory({ fetchImpl = fetch, timeoutMs = 10_000, time = null } = {}) {
  const sourceUrl = buildIranAsnInventoryUrl({ time });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(sourceUrl, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`RIPEstat Country Resource List returned HTTP ${response.status}.`);
    const inventory = parseIranAsnInventory(await response.json());
    return { ok: true, status: 'observed', sourceUrl, fetchedAt: new Date().toISOString(), ...inventory, note: 'RIR country association is inventory/scope metadata only. It does not prove current routing, end-user traffic, operator role, filtering, censorship behavior or intent.' };
  } finally { clearTimeout(timer); }
}
