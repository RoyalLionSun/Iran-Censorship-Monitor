# Iran ASN Inventory Method

## Purpose

`data/asns.json` is a curated monitoring and topology catalogue. It is intentionally not a claim that every ASN associated with Iran is represented there.

The complete base inventory is obtained on demand from RIPEstat `country-resource-list` with `resource=IR`. RIPEstat documents that endpoint as country-associated Internet number resources based on RIR Statistics files. This is the canonical base population used by the project for completeness checks.

A second on-demand RIPEstat request to `country-asns` adds the country-level distinction between **registered** and **routed** ASN counts. RIPE documents registered ASNs as based on public Regional Internet Registry information and routed ASNs as based on RIPE RIS observations. These are separate dimensions and are retained separately in project output.

## Separation of dimensions

The project keeps these questions separate:

1. **RIR-associated** — is the ASN associated with country `IR` in the RIR Statistics based country resource list?
2. **Registered/routed country counts** — how many ASNs RIPEstat reports as registered for Iran and how many are seen in RIPE RIS at the selected RIS dump time?
3. **ASN-specific current routing** — is a particular ASN actually observed in current routing data? This requires ASN-level routing evidence and is not inferred from the country-level count.
4. **Curated for monitoring** — has the ASN been reviewed and added to `data/asns.json` with identity, aliases, operator family and roles?
5. **Censorship evidence** — does an independent technical observation provide evidence about filtering, interference or reachability?

A positive answer to one does not imply a positive answer to another.

## Implementation

`lib/iran-asn-inventory.mjs`:

- builds explicitly IR-scoped RIPEstat requests;
- validates that responses are actually scoped to Iran;
- normalizes bare numeric ASNs and `AS...` notation;
- rejects malformed or out-of-range ASN values;
- deduplicates and numerically sorts the RIR-associated country ASN inventory;
- compares the complete inventory with the curated profiles;
- exposes curated ASNs that have drifted outside the current country inventory;
- exposes uncurated ASNs without pretending that every uncurated ASN is censorship-relevant;
- parses documented `country-asns` level-of-detail 0 counts as `registeredCount` and `routedCount`;
- retains RIPEstat `query_time` / `latest_time` so the RIS snapshot time is visible;
- labels routed counts as RIPE RIS control-plane visibility, not end-user reachability.

`scripts/fetch-iran-asn-inventory.mjs` performs the live, operator-triggered fetch and emits JSON containing:

- the complete RIR-associated ASN inventory;
- the registered/routed country-level summary;
- the curated-coverage delta;
- explicit methodology/evidence boundaries.

## Why `country-asns` uses `lod=0`

RIPEstat documents `lod=0` as the least-detailed output and states that the default response returns the number of registered and routed ASNs. That response shape is stable enough to validate directly (`countries[].stats.registered` and `countries[].stats.routed`).

RIPE also documents `lod=1` as the most detailed output, but the current endpoint documentation does not define the detailed ASN-list fields. The project therefore does **not** guess or hard-code an undocumented list schema. ASN-by-ASN current routing classification remains a separate future step using a payload whose structure has first been observed and validated, or using existing per-AS RIPE RIS/RIPEstat routing evidence.

This distinction is intentional: `registeredCount - routedCount` is a count delta, not a list of ASNs known to be inactive.

## Time semantics

RIPEstat `country-asns` aligns observations to RIPE RIS dump times (00:00, 08:00 and 16:00 UTC). The command therefore surfaces the returned query/latest timestamps instead of calling the result simply “now”.

`country-resource-list` is RIR-statistics inventory data and follows its own source/update semantics. The two timestamps must not be conflated.

## Actions budget boundary

The complete country inventory and routing summary are not refreshed at high frequency in GitHub Actions. They remain intentionally operator/on-demand work. Deterministic parsers and coverage semantics run in normal CI without network access. Live registry identity checks remain bounded to curated profiles in the existing live-source acceptance workflow.

This prevents source churn and a country-wide external-data refresh from consuming GitHub Actions minutes on every code change.

## Fanap Telecom / ZiTEL

The curated catalogue includes both reviewed Fanap-family ASNs separately:

- `AS206065` — current RPSL `as-name: FDI`, organisation `ORG-PNEV1-RIPE`; ZiTEL is retained as an operational/business alias;
- `AS24631` — current RPSL `as-name: FANAPTELECOM-FCP`, same organisation `ORG-PNEV1-RIPE`.

Both are grouped under `operatorFamily: fanap-telecom`. They remain separate ASNs for routing analysis but must not be counted as independent operators or independent censorship evidence merely because two ASN numbers exist.

## Evidence rule

Country association, registry identity, ASN count, address count, routing visibility, customer-cone size and commercial traffic/rank estimates are different metrics. Every derived value must retain its source and observation time.

Inventory and topology metadata always use `independentCensorshipVote:false`. RIPE RIS routing visibility is control-plane evidence only. None of these fields establishes current end-user Internet availability, filtering mechanism, censorship intent, national shutdown state, NIN status, province status or SIM-class behavior.
