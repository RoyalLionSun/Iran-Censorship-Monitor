import { mapLimit, fetchJson, normalizeAsn } from './common.mjs';

const NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A registry name is shown only when it names an organisation. Some Iranian networks are
// registered to a private person; they are shown by number, never by the person's name. A name
// that is not recognised stays a number too: leaving out a company's name costs little, showing a
// person's name could endanger them.
const ORGANISATION = /\b(co|company|corp|corporation|inc|ltd|llc|jsc|pjs|pjsc|psj|p\.j\.s\.?c?|plc|joint stock|group|holding|net|network|networks|online|communication|communications|telecom|telecommunication|data|information|technology|technologies|service|services|solutions|institute|university|univesity|college|school|academy|research|science|sciences|medical|hospital|foundation|authority|administration|municipality|ministry|office|organi[sz]ation|sazman|sanjesh|agency|chamber|commerce|bank|insurance|financial|securities|depository|exchange|bourse|railways?|airport|airlines?|electric|energy|distribution|oil|gas|petro\w*|steel|mining|industries|industrial|broadcasting|news|center|centre|infrastructure|system|systems|hosting|cloud|cdn|iaas|internet|web|pardaz|pardazesh|pardakht|ertebat|ertebatat|fanavari|mizban|gostar|sazan|arvan|abrarvan|afranet|pishgaman|datak|isiran|guilanet|irna|irib|ipm|engineering|gateway|tic|tci|mci|dci|itco|irancell|rightel|asiatech|shatel|respina|mobinnet|fanap|fanava)\b/i;

export function publicNetworkName(asn, name, catalog = []) {
  // The reviewed catalogue names operators; a network it marks as held by a private person has
  // no name.
  const entry = catalog.find((item) => normalizeAsn(item.asn) === normalizeAsn(asn));
  if (entry?.privateRegistrant) return null;
  if (entry?.name) return entry.name;
  const text = typeof name === 'string' ? name.trim() : '';
  return text && ORGANISATION.test(text) ? text : null;
}

// Operator names for the networks a reader is shown: the reviewed catalogue first, then the
// Iranian network directory, then RIPEstat (cached for a week because registrations rarely
// change). Names from the directory and RIPEstat pass publicNetworkName; the rest stay numbers.
export async function getAsnNames(asns, catalog = [], directory = null) {
  const wanted = [...new Set(asns.map((asn) => normalizeAsn(asn)).filter(Boolean))];
  const names = {};
  await mapLimit(wanted, 4, async (asn) => {
    const known = publicNetworkName(asn, directory?.entries?.[asn]?.name, catalog);
    if (known) { names[asn] = known; return; }
    if (directory?.entries?.[asn]?.name) return;
    try {
      const payload = await fetchJson(`https://stat.ripe.net/data/as-overview/data.json?resource=${asn}&sourceapp=iran-censorship-monitor`, { cacheTtlMs: NAME_TTL_MS, timeoutMs: 8_000 });
      const holder = publicNetworkName(asn, payload?.data?.holder);
      if (holder) names[asn] = holder;
    } catch { /* A missing name leaves the ASN on its own. */ }
  });
  return names;
}
