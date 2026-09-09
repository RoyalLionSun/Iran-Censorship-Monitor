# ASN Identity and Operator-Family Method

## Purpose

The Iran ASN catalogue is a **scope and topology registry**, not a censorship sensor. ASN labels change, company names change, operators use multiple ASNs, and third-party mirrors can retain stale business names. A single display label must therefore never be treated as the canonical identity of a network.

Every curated entry in `data/asns.json` separates:

- `asn` — the stable autonomous-system number;
- `asName` — current RPSL `as-name` expected from the authoritative registry path;
- `orgId` — current RPSL organisation handle associated with the aut-num object;
- `registryName` — current legal/organisation name returned by registry data;
- `name` — concise dashboard display name;
- `aliases` — operational, business or historical names that remain useful for research;
- `operatorFamily` — project grouping for ASNs that belong to the same operator or reviewed operational family;
- `roles` — reviewed topology/access roles, which are not registry assertions;
- `providerComparison` — explicit bounded selection for the OONI/RIPE provider-comparison table;
- `identityConfidence` — how strongly the static profile is supported;
- `independentCensorshipVote:false` — mandatory for all ASN identity metadata.

## Authority hierarchy

Identity validation uses this order:

1. authoritative RIR/Routing Registry data;
2. RIPEstat Whois, which exposes records from the relevant RIR/Routing Registry through a documented machine-readable API;
3. current routing/topology observations for *network role* only;
4. mirrors such as bgp.tools / bgp.he.net for research cross-checks;
5. business names, operator comments and historical aliases.

A mirror or business alias must not override a conflicting current registry identity. Conversely, a changed legal `org-name` does not automatically invalidate a long-lived operational alias when `aut-num`, `as-name` and organisation lineage remain consistent.

## Corrections that motivated this method

The previous static list contained three material scope errors:

- `AS31549 = Asiatech` was wrong; RIPE identifies `AS31549 / RASANA / ORG-ART1-RIPE` as Aria Shatel PJSC.
- `AS43754 = Sabanet` was wrong; RIPE identifies `AS43754 / ASIATECH / ORG-AI34-RIPE` as Asiatech Data Transmission company.
- `AS35718 = Shatel` was wrong and unsafe for Iran scoping; its current RIPE identity is `NAUNET-AS`, organisation 2domains.ru LLC, country RU. It is excluded from the Iran catalogue.

The former `AS12880 = TIC` label was also ambiguous. The current RIPE aut-num is `DCI-AS`, organisation `ORG-TCoI1-RIPE / Iran Information Technology Company PJSC`. Telecommunication Infrastructure Company (TIC/Zirsakht) is represented separately by `AS49666 / TIC-GW-AS` and `AS48159 / TIC-AS`, both under `ORG-TIC4-RIPE`.

Another naming collision is explicit: `AS58224` has RIPE `as-name: TCI`, but belongs to **Iran Telecommunication Company PJS**, not Telecommunication Infrastructure Company.

## Operator-family grouping

`operatorFamily` prevents multiple ASNs from being mistaken for independent evidence. Examples:

- `AS49666` + `AS48159` → `tic-zirsakht`;
- `AS31549` + `AS34369` → `shatel`;
- `AS43754` + `AS41689` + reviewed Asiatech-associated `AS60077` → `asiatech`.

The grouping is descriptive. It does not mean all ASNs share identical routing policy, customer population, infrastructure or legal entity. `AS60077`, for example, retains its distinct RIPE organisation while being grouped operationally with Asiatech because its registry sponsorship and routing relationship support that relationship.

## Gateway-role boundary

`international-gateway` is **routing/topology context**, not a field provided by the registry. Gateway roles can change over time and must be supported by current routing research/observations.

A gateway role never proves:

- that user traffic is currently functional;
- that filtering occurs at that ASN;
- that DPI is located there;
- censorship intent;
- national blocking status.

AS12880, AS49666, AS48159 and AS6736 are retained because current/historical topology research makes them important to Iran international-connectivity analysis, but the dashboard must continue to evaluate actual data-plane and interference evidence separately.

## Live registry drift gate

`scripts/verify-asn-registry.mjs` queries the documented RIPEstat Whois API for every curated profile. It verifies the hard identity keys:

- ASN;
- `as-name`;
- organisation handle;
- country when the registry response supplies it.

The legal `org-name` is surfaced for review but is not a hard failure by itself because corporate naming can change without ASN reassignment. Hard-key drift fails the live acceptance workflow and requires analyst review before static labels are updated.

The runtime endpoint `/api/asn-registry?asn=AS...` exposes the same selected-ASN identity with provenance and an explicit context-only evidence role.

## Provider comparison

The provider table must never depend on array position (`slice(0, 10)`). Only profiles with `providerComparison:true` enter that bounded, expensive OONI + RIPE Atlas comparison. Gateway-only, research and hosting/CDN profiles remain selectable elsewhere without silently becoming consumer-ISP rows.

## Evidence rule

ASN registry metadata contributes **zero independent censorship votes**. Multiple ASNs in one operator family also do not create independent censorship evidence merely because they are separate AS numbers.

No province, SIM class, NIN status, VPN/protocol availability, filtering mechanism or political attribution may be inferred from ASN identity alone.
