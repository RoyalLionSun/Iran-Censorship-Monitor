# Data Sources

Last reviewed: **2026-09-26**

**Direction rule:** only measurements taken inside networks registered in Iran (RIPEstat country resource list) may support a claim about what people in Iran can reach. Outside-in and routing sources describe whether Iran is connected, never access. Usage figures describe use, never access.

Presence in the runtime does not make a source an independent censorship sensor. Measurement, data-plane, performance/protocol, routing/control-plane, topology, circumvention, inventory and curated/OSINT context remain separate evidence dimensions.

| Source | Access | Runtime role | Assessment role |
|---|---|---|---|
| OONI | Public API | website, app, circumvention and encrypted-DNS tests run by volunteers inside Iranian networks | access and interference claims; source-native confirmation remains measurement-scoped; tests from foreign networks filed under Iran are excluded |
| Censored Planet | Public GraphQL | remote measurements from abroad towards servers in Iran + CenAlert | outside-in context only; never supports or covers an access claim |
| RIPE Atlas | Public API (+ key and credits for own measurements) | ping RTT/loss from probes in Iran; optional DNS/TLS checks towards allowed services | quality context; the optional checks are an independent access answer where OONI has none, labelled |
| IODA | Public API | connectivity/outage signals | connectivity claim; event count is not severity |
| Cloudflare Radar | Radar Read token | traffic/outages/anomalies/BGP/protocol mix | eligible connectivity claim only when required channels are valid; source-native scope may describe impact |
| RIPEstat / RIPE RIS / RPKI | Public API | BGP visibility/prefix/neighbour/update + route-origin authorization | control-plane / route-integrity context |
| RIPE RIS Live | Public stream | passive announcements/withdrawals | control-plane context only |
| Route Views via CAIDA BGPStream | Public broker + `bgpreader` | second passive routing collector | control-plane context only |
| CAIDA ASRank | Public API | rank/customer cone/degree/AS relationships | topology context only |
| ipverse/as-metadata | Public CC0 dataset | on-demand ASN enrichment/review prioritization | secondary context only |
| M-Lab NDT | Public aggregate | throughput/minimum RTT | performance context only |
| APNIC Labs | Public measurement | IPv6 capability/preference; share of samples via Cloudflare WARP (AS13335) | protocol context; WARP share is circumvention usage context |
| Tor Metrics / BridgeDB | Public data | Tor users from Iran, directly and per bridge type; global bridge demand | circumvention usage context only |
| Psiphon Conduit statistics | Public JSON (`stats.psianalytics.live`) | daily Conduit connections from clients in Iran, Conduit stations in Iran | circumvention usage context only |
| Ookla Open Data | Public quarterly objects | reviewed object contract; Iran aggregate not admitted | context only |
| Globalping | Public API / optional token | probe inventory; optional DNS/HTTPS checks from probes on Iranian networks | as RIPE Atlas's optional checks; probe presence is not a vote |
| PeeringDB | Public API | operator-maintained topology | context only |
| IHR AS Hegemony | Public API | dependency/chokepoints | context only |
| Citizen Lab Test Lists | Public CSV | Iran target inventory | inventory only |
| Internet Society Pulse | Token API | current curated Iran shutdown context | context only; no technical vote |
| Filterwatch | Public WordPress API (English and Persian sites) | expert reports on Iran's network and censorship policy published in a report's period, linked in the weekly and monthly reports in the reader's language | context only; analysis, not a measurement |
| Access Now #KeepItOn STOP | Public dataset | curated shutdown incidents, currently published through 2025 | context only; lineage preserved |
| GDELT DOC 2.0 | Public API | professional-source discovery | OSINT context only |
| Dated primary sources | `public/context-items.js` | who decides what is blocked, privileged access | documented context, each entry dated and sourced; never a measurement |

## Core semantics

### OONI / Censored Planet

An anomaly or failed control is an investigation input, not automatic proof of censorship. OONI `confirmed` can confirm blocking only for the measured target/test/network scope. A service is judged by majority of its tests. Censored Planet measures from abroad and stays visible as outside-in context; it never supports an access claim. Website reachability is not reinterpreted as WireGuard/OpenVPN/V2Ray/Outline transport evidence.

### RIPE Atlas / IODA / Radar

RIPE Atlas preserves per-probe coverage; zero samples remain unknown and partial coverage is not promoted to national confirmation. IODA and Radar provide connectivity observations without establishing filtering, political intent or actor. Counts of IODA/Radar events never determine severity. Radar source-native national/regional/network scope may determine impact only when its outage/anomaly channels satisfy the eligibility contract. Radar credentials remain server-side.

### RIPE / routing / RPKI

BGP visibility, prefixes, neighbours, announcements, withdrawals and RPKI states are control-plane/route-integrity evidence. Historical routing status is requested for the selected time window; unknown time alignment limits confidence and cannot produce control-/data-plane divergence. Visibility does not prove working end-user Internet or censorship intent. BGPStream is an access/normalization framework, not itself another sensor; Route Views and RIPE observations keep their root provenance.

### ASN identity / inventory

`data/asns.json` is a reviewed monitoring/topology catalogue, not the complete Iran ASN universe. RIPEstat `country-resource-list` establishes the RIR-statistics country population; `country-asns` supplies separate country-level registered/routed counts. The project does not invent an ASN-by-ASN routed set from aggregate counts.

Optional `ipverse/as-metadata` enrichment runs only after RIR scope is established. Exact downloaded bytes are SHA-256 anchored and byte bounded. Secondary country/category/network-role data cannot override canonical RIR country scope and cannot create censorship evidence.

### M-Lab / APNIC / Ookla

M-Lab and APNIC preserve sample/coverage context. Performance or protocol variation is not automatic censorship or throttling attribution. Ookla remains behind the reviewed spatial-country aggregation gate; no bounding-box shortcut is published as Iran data.

### Tor / BridgeDB

Iran Tor transport observations remain published lower/upper estimate bounds; exact users are not invented. Directional change is supported only where paired intervals do not overlap. BridgeDB demand is global and explicitly not Iran-specific. These sources remain context only and are never rendered as an Internet-health status.

### STOP ↔ Pulse

Access Now STOP is retained as a historical curated incident corpus currently published through 2025. Internet Society Pulse supplies token-gated current shutdown context for the selected Iran window and preserves verification level, type, cause and affected regions.

Pulse accepts only explicit Iran identifiers, validates required timestamps and selected-window overlap, preserves open-ended events and fails closed on malformed Iran records or invalid intervals. Missing credentials remain `token_required`; they are never interpreted as zero incidents.

`lib/shutdown-context.mjs` keeps STOP and Pulse as separate provenance records. A `possibleSameIncident` candidate exists only when date intervals overlap **and** both records normalize to the same broad scope (`national`, `regional` or `service`). Every candidate remains `automaticMerge:false` and `independentTechnicalVote:false`. Correlation does not establish identity, causality, filtering mechanism or censorship intent.

The dashboard and context CSV preserve these semantics. CSV exports token-required Pulse coverage as `matched=not_inferred`, not zero.

### GDELT / Citizen Lab

GDELT is discovery context, not a technical measurement source. Citizen Lab supplies target inventory, not current blocking evidence.

## Source admission rule

A continuous source must have identifiable root provenance, stable supported machine-readable access, Iran-relevant scope, explicit sample/coverage semantics, explicit no-data/failure behavior, an interpretable relationship to the claimed dimension and an independence/overlap review. Unsupported scraping or duplicate provenance stays absent/contextual rather than being promoted to a sensor.

Independent roots may improve confidence only when they support the same claim over compatible scope and time. They never raise severity merely by being counted. A quiet or unavailable source does not corroborate a positive claim. See [INTERPRETATION.md](INTERPRETATION.md).

## Failure behavior

`observed`, `partial`, `no_data`, `token_required`, rate-limited and hard `error` remain distinct. Upstream failure is never converted into zero measurement, zero incidents or successful national status.

Owned-probe laboratory material (`docs/design-records/MEASUREMENT_FLEET.md`, `FLEET_STAGE*`) remains a design record and is not deployed; `deploymentAuthorized:false` is unchanged.
