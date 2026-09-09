# Iran ASN Inventory Method

## Purpose

`data/asns.json` is a curated monitoring and topology catalogue. It is intentionally not a claim that every ASN associated with Iran is represented there.

The complete base inventory is obtained on demand from RIPEstat `country-resource-list` with `resource=IR`. RIPEstat documents that endpoint as country-associated Internet number resources based on RIR Statistics files. This is the canonical base population used by the project for completeness checks.

A second on-demand RIPEstat request to `country-asns` adds the country-level distinction between **registered** and **routed** ASN counts. RIPE documents registered ASNs as based on public Regional Internet Registry information and routed ASNs as based on RIPE RIS observations. These are separate dimensions and are retained separately in project output.

A third on-demand download from `ipverse/as-metadata` enriches only the ASNs already selected by the RIPE/RIR Iran inventory. ipverse is secondary review metadata, not a country-membership authority. Its CC0 dataset is checked daily for source changes and provides registry labels plus topology-derived fields such as category, network role, prefix counts, providers/customers/peers, degree, reach and `lastAnnounced`.

## Separation of dimensions

The project keeps these questions separate:

1. **RIR-associated** — is the ASN associated with country `IR` in the RIR Statistics based country resource list?
2. **Registered/routed country counts** — how many ASNs RIPEstat reports as registered for Iran and how many are seen in RIPE RIS at the selected RIS dump time?
3. **ASN-specific current routing** — is a particular ASN actually observed in current routing data? This requires ASN-level routing evidence and is not inferred from the country-level count.
4. **Secondary topology enrichment** — what classification/topology metadata does ipverse currently publish for an ASN that is already in the RIR-associated inventory?
5. **Curated for monitoring** — has the ASN been reviewed and added to `data/asns.json` with identity, aliases, operator family and roles?
6. **Censorship evidence** — does an independent technical observation provide evidence about filtering, interference or reachability?

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
- rejects missing, blank, boolean, negative or non-integer country-ASN counts instead of coercing them to zero;
- retains RIPEstat `query_time` / `latest_time` so the RIS snapshot time is visible;
- labels routed counts as RIPE RIS control-plane visibility, not end-user reachability.

`lib/ipverse-as-metadata.mjs`:

- downloads the public CC0 `as.json` dataset with an 80 MiB safety ceiling;
- calculates SHA-256 over the exact downloaded bytes for reproducibility;
- filters the world dataset to the RIPE/RIR Iran inventory before validating detailed secondary fields;
- fails closed if a selected Iran ASN has malformed metadata, while malformed irrelevant world entries do not block the filtered run;
- preserves ipverse country/origin fields as secondary quality signals and surfaces disagreements with the RIPE scope instead of overriding it;
- keeps prefix **counts** as counts and never converts them into invented address totals;
- produces transparent review classes rather than an opaque numerical score;
- never contributes an independent censorship vote.

`scripts/fetch-iran-asn-inventory.mjs` performs the operator-triggered run using three public downloads:

1. RIPEstat Country Resource List;
2. RIPEstat Country ASNs (`lod=0`);
3. ipverse `as.json`.

It emits the complete RIR-associated inventory, country-level routing summary, curated-coverage delta, SHA-256-anchored secondary metadata provenance, enrichment records and a bounded analyst candidate queue.

## Candidate review queue

The queue exists to decide **which uncurated RIR-associated ASN should be reviewed next**. It does not score censorship likelihood, political importance or country membership.

Review classes are evaluated in this order:

| Order | Review class | Trigger |
|---:|---|---|
| 1 | `transit_core_review` | ipverse network role `tier1_transit`, `major_transit` or `midsize_transit` |
| 2 | `access_review` | network role `access_provider` or category `isp` |
| 3 | `strategic_service_review` | network role `content_network` or category `hosting` / `government_admin` |
| 4 | `topology_observed_review` | other secondary metadata with `lastAnnounced`, prefixes, customers, degree or reach |
| 5 | `long_tail_review` | no qualifying topology signal or missing secondary metadata |

Already curated profiles are excluded from the candidate queue.

Within the same class, ordering is deterministic: newest `lastAnnounced`, then higher `reach`, customer count, degree, total IPv4+IPv6 prefix count, then lowest ASN number. These are review-priority hints only. No weighted score is invented.

`lastAnnounced` is deliberately not renamed to “currently routed”. It is a dated secondary observation and may be historical.

## Why `country-asns` uses `lod=0`

RIPEstat documents `lod=0` as the least-detailed output and states that the default response returns the number of registered and routed ASNs. That response shape is stable enough to validate directly (`countries[].stats.registered` and `countries[].stats.routed`).

RIPE also documents `lod=1` as the most detailed output, but the current endpoint documentation does not define the detailed ASN-list fields. The project therefore does **not** guess or hard-code an undocumented list schema. ASN-by-ASN current routing classification remains a separate future step using a payload whose structure has first been observed and validated, or using existing per-AS RIPE RIS/RIPEstat routing evidence.

This distinction is intentional: `registeredCount - routedCount` is a count delta, not a list of ASNs known to be inactive.

## Time semantics

RIPEstat `country-asns` aligns observations to RIPE RIS dump times (00:00, 08:00 and 16:00 UTC). The command therefore surfaces the returned query/latest timestamps instead of calling the result simply “now”.

`country-resource-list` is RIR-statistics inventory data and follows its own source/update semantics. ipverse has its own update/change timestamps (`metadata.lastModified`, `stats.prefixesLastModified`, `lastAnnounced`). These timestamps must not be conflated.

## Actions budget boundary

The complete country inventory, routing summary and ipverse world-dataset enrichment are not refreshed at high frequency in GitHub Actions. They remain intentionally operator/on-demand work. Deterministic parsers, prioritization semantics and coverage rules run in normal CI without downloading the dataset. Live registry identity checks remain bounded to curated profiles in the existing live-source acceptance workflow.

This prevents source churn, a large public metadata download and a country-wide external-data refresh from consuming GitHub Actions minutes on every code change.

## Fanap Telecom / ZiTEL

The curated catalogue includes both reviewed Fanap-family ASNs separately:

- `AS206065` — current RPSL `as-name: FDI`, organisation `ORG-PNEV1-RIPE`; ZiTEL is retained as an operational/business alias;
- `AS24631` — current RPSL `as-name: FANAPTELECOM-FCP`, same organisation `ORG-PNEV1-RIPE`.

Both are grouped under `operatorFamily: fanap-telecom`. They remain separate ASNs for routing analysis but must not be counted as independent operators or independent censorship evidence merely because two ASN numbers exist.

## Evidence rule

Country association, registry identity, ASN count, address count, routing visibility, customer-cone size, network-role classification and commercial traffic/rank estimates are different metrics. Every derived value must retain its source and observation time.

ipverse `category` and `networkRole` are useful classification hints but are not treated as authoritative facts about operator function; the source itself describes these classifications as multi-signal/opinionated and potentially imperfect.

Inventory and topology metadata always use `independentCensorshipVote:false`. RIPE RIS routing visibility is control-plane evidence only. None of these fields establishes current end-user Internet availability, filtering mechanism, censorship intent, national shutdown state, NIN status, province status or SIM-class behavior.
