import { mapLimit, fetchJson, normalizeAsn } from './common.mjs';

const NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Operator names for the networks a reader is shown. Curated profiles answer first; the rest
// come from RIPEstat, cached for a week because registrations rarely change.
export async function getAsnNames(asns, curated = []) {
  const known = new Map(curated.map((item) => [normalizeAsn(item.asn), item.name]));
  const wanted = [...new Set(asns.map((asn) => normalizeAsn(asn)).filter(Boolean))];
  const names = {};
  await mapLimit(wanted, 4, async (asn) => {
    if (known.has(asn)) { names[asn] = known.get(asn); return; }
    try {
      const payload = await fetchJson(`https://stat.ripe.net/data/as-overview/data.json?resource=${asn}&sourceapp=iran-censorship-monitor`, { cacheTtlMs: NAME_TTL_MS, timeoutMs: 8_000 });
      const holder = payload?.data?.holder;
      if (typeof holder === 'string' && holder.trim()) names[asn] = holder.trim();
    } catch { /* A missing name leaves the ASN on its own. */ }
  });
  return names;
}
