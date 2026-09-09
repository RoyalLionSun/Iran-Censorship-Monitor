# Iran ASN Inventory Method

## Purpose

`data/asns.json` is a curated monitoring and topology catalogue. It is intentionally not a claim that every ASN associated with Iran is represented there.

The complete base inventory is obtained on demand from RIPEstat `country-resource-list` with `resource=IR`. RIPEstat documents that endpoint as country-associated Internet number resources based on RIR Statistics files. This is the canonical base population used by the project for completeness checks.

## Separation of dimensions

The project keeps these questions separate:

1. **RIR-associated** — is the ASN associated with country `IR` in the RIR Statistics based country resource list?
2. **Currently routed** — is the ASN observed in routing data such as RIPE RIS?
3. **Curated for monitoring** — has the ASN been reviewed and added to `data/asns.json` with identity, aliases, operator family and roles?
4. **Censorship evidence** — does an independent technical observation provide evidence about filtering, interference or reachability?

A positive answer to one does not imply a positive answer to another.

## Implementation

`lib/iran-asn-inventory.mjs`:

- builds an explicitly IR-scoped RIPEstat request;
- validates that the response is actually scoped to Iran;
- normalizes bare numeric ASNs and `AS...` notation;
- rejects malformed or out-of-range ASN values;
- deduplicates and numerically sorts the country ASN inventory;
- compares the complete inventory with the curated profiles;
- exposes curated ASNs that have drifted outside the current country inventory;
- exposes uncurated ASNs without pretending that every uncurated ASN is censorship-relevant.

`scripts/fetch-iran-asn-inventory.mjs` performs the live, operator-triggered fetch and emits JSON including the complete inventory and curated-coverage delta.

## Actions budget boundary

The complete country inventory is not refreshed at high frequency in GitHub Actions. It is intentionally operator/on-demand work. Deterministic parsers and coverage semantics run in normal CI without network access. Live registry identity checks remain bounded to curated profiles in the existing live-source acceptance workflow.

This prevents source churn and a country-wide external-data refresh from consuming GitHub Actions minutes on every code change.

## Fanap Telecom / ZiTEL

The curated catalogue includes both reviewed Fanap-family ASNs separately:

- `AS206065` — current RPSL `as-name: FDI`, organisation `ORG-PNEV1-RIPE`; ZiTEL is retained as an operational/business alias;
- `AS24631` — current RPSL `as-name: FANAPTELECOM-FCP`, same organisation `ORG-PNEV1-RIPE`.

Both are grouped under `operatorFamily: fanap-telecom`. They remain separate ASNs for routing analysis but must not be counted as independent operators or independent censorship evidence merely because two ASN numbers exist.

## Evidence rule

Country association, registry identity, ASN count, address count, routing visibility, customer-cone size and commercial traffic/rank estimates are different metrics. Every derived value must retain its source and observation time.

Inventory and topology metadata always use `independentCensorshipVote:false`. They do not establish current Internet availability, filtering mechanism, censorship intent, national shutdown state, NIN status, province status or SIM-class behavior.
