# Data Sources

Last reviewed: **2026-09-10**  
Release source set: **v1.6.0**

Presence in the runtime does not make a source an independent censorship sensor. Measurement, data-plane, performance/protocol, routing/control-plane, topology, circumvention, inventory and curated/OSINT context remain separate evidence dimensions.

| Source | Access | Runtime role | Assessment role |
|---|---|---|---|
| OONI | Public API | censorship/application measurements | eligible technical signal |
| Censored Planet | Public GraphQL | remote interference + CenAlert | investigation/technical context |
| RIPE Atlas | Public API | active-probe RTT/loss | eligible data-plane signal with sufficient coverage |
| IODA | Public API | connectivity/outage signals | eligible data-plane signal |
| Cloudflare Radar | Radar Read token | traffic/outages/anomalies/BGP/protocol mix | only where explicitly permitted |
| RIPEstat / RIPE RIS / RPKI | Public API | BGP visibility/prefix/neighbour/update + route-origin authorization | control-plane / route-integrity context |
| RIPE RIS Live | Public stream | passive announcements/withdrawals | control-plane context only |
| Route Views via CAIDA BGPStream | Public broker + `bgpreader` | second passive routing collector | control-plane context only |
| CAIDA ASRank | Public API | rank/customer cone/degree/AS relationships | topology context only |
| ipverse/as-metadata | Public CC0 dataset | on-demand ASN enrichment/review prioritization | secondary context only |
| M-Lab NDT | Public aggregate | throughput/minimum RTT | performance context only |
| APNIC Labs IPv6 | Public measurement | IPv6 capability/preference | protocol/deployment context only |
| Tor Metrics / BridgeDB | Public data | Iran Tor estimate bounds + global demand context | circumvention context only |
| Ookla Open Data | Public quarterly objects | reviewed object contract; Iran aggregate not admitted | context only |
| Globalping | Public API / optional token | passive inventory; protected active tests | probe presence is not a vote |
| PeeringDB | Public API | operator-maintained topology | context only |
| IHR AS Hegemony | Public API | dependency/chokepoints | context only |
| Citizen Lab Test Lists | Public CSV | Iran target inventory | inventory only |
| Internet Society Pulse | Token API | current curated Iran shutdown context | context only; no technical vote |
| Access Now #KeepItOn STOP | Public dataset | curated shutdown incidents, currently published through 2025 | context only; lineage preserved |
| GDELT DOC 2.0 | Public API | professional-source discovery | OSINT context only |

## Core semantics

### OONI / Censored Planet

An anomaly, failed control or remote interference signal is an investigation input, not automatic proof of censorship. Website reachability is not reinterpreted as WireGuard/OpenVPN/V2Ray/Outline transport evidence.

### RIPE Atlas / IODA / Radar

RIPE Atlas preserves per-probe coverage; partial coverage remains visible and is not promoted to national confirmation. IODA and Radar provide connectivity/traffic context without establishing political intent. Radar credentials remain server-side.

### RIPE / routing / RPKI

BGP visibility, prefixes, neighbours, announcements, withdrawals and RPKI states are control-plane/route-integrity evidence. They do not prove working end-user Internet or censorship intent. BGPStream is an access/normalization framework, not itself another sensor; Route Views and RIPE observations keep their root provenance.

### ASN identity / inventory — included from v1.5 development

`data/asns.json` is a reviewed monitoring/topology catalogue, not the complete Iran ASN universe. RIPEstat `country-resource-list` establishes the RIR-statistics country population; `country-asns` supplies separate country-level registered/routed counts. The project does not invent an ASN-by-ASN routed set from aggregate counts.

Optional `ipverse/as-metadata` enrichment runs only after RIR scope is established. Exact downloaded bytes are SHA-256 anchored and byte bounded. Secondary country/category/network-role data cannot override canonical RIR country scope and cannot create censorship evidence.

### M-Lab / APNIC / Ookla

M-Lab and APNIC preserve sample/coverage context. Performance or protocol variation is not automatic censorship or throttling attribution. Ookla remains behind the reviewed spatial-country aggregation gate; no bounding-box shortcut is published as Iran data.

### Tor / BridgeDB

Iran Tor transport observations remain published lower/upper estimate bounds; exact users are not invented. Directional change is supported only where paired intervals do not overlap. BridgeDB demand is global and explicitly not Iran-specific. These sources remain context only.

### STOP ↔ Pulse — v1.6

Access Now STOP is retained as a historical curated incident corpus currently published through 2025. Internet Society Pulse supplies token-gated current shutdown context for the selected Iran window and preserves verification level, type, cause and affected regions.

Pulse accepts only explicit Iran identifiers, validates required timestamps and selected-window overlap, preserves open-ended events and fails closed on malformed Iran records or invalid intervals. Missing credentials remain `token_required`; they are never interpreted as zero incidents.

`lib/shutdown-context.mjs` keeps STOP and Pulse as separate provenance records. A `possibleSameIncident` candidate exists only when date intervals overlap **and** both records normalize to the same broad scope (`national`, `regional` or `service`). Every candidate remains `automaticMerge:false` and `independentTechnicalVote:false`. Correlation does not establish identity, causality, filtering mechanism or censorship intent.

The dashboard and context CSV preserve these semantics. CSV exports token-required Pulse coverage as `matched=not_inferred`, not zero.

### GDELT / Citizen Lab

GDELT is discovery context, not a technical measurement source. Citizen Lab supplies target inventory, not current blocking evidence.

## Source admission rule

A continuous source must have identifiable root provenance, stable supported machine-readable access, Iran-relevant scope, explicit sample/coverage semantics, explicit no-data/failure behavior, an interpretable relationship to the claimed dimension and an independence/overlap review. Unsupported scraping or duplicate provenance stays absent/contextual rather than being promoted to a sensor.

## Failure behavior

`observed`, `partial`, `no_data`, `token_required`, rate-limited and hard `error` remain distinct. Upstream failure is never converted into zero measurement, zero incidents or successful national status.

Owned-probe laboratory material remains non-production-authorized. `deploymentAuthorized:false` is unchanged.
